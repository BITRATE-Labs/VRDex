import { z } from "zod";
import type { Candidate } from "../../temporal-runtime/src/types";
import type { EventIntakeCandidate, EventIntakeFields } from "../../api-contracts/src/event-intake";
import { discordTimestampFacts, hasAuthoredEventDate, projectInstant, relativeTimePhrase, replaceTimeEvidence, temporalFieldPath, timestampTransformPhrase } from "./discord-timestamps";

export type IntakeTimeSource = { id: string; text: string; referenceInstant: string };
const field = z.string().regex(/^(event\.(start|end|eventDate)|lineup\.\d+\.(start|end))$/);
const performerLabel = z.string().max(120).nullable().describe("Exact source performer label for lineup fields; null for event fields.");
const absoluteDateMarker = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{1,2}-\d{1,2}-\d{2,4}\b/i;
const clockPhrases = /\b(?:\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?)(?!\w)/gi;
const resolve = z.strictObject({ fieldPath: field, performerLabel, text: z.string().max(500), sourceMessageId: z.string().nullable(), timezone: z.string().max(64).nullable() });
const shift = z.strictObject({ fieldPath: field, performerLabel, candidateId: z.string(), days: z.number().int().min(-7).max(90), hours: z.number().int().min(-168).max(2160), minutes: z.number().int().min(-1440).max(1440) });
const clock = z.strictObject({ fieldPath: field, performerLabel, candidateId: z.string(), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) });
// Keep wire schemas conservative; safeParse below enforces the complete bounds.
function wireSchema(schema: z.ZodType) {
  return JSON.parse(JSON.stringify(z.toJSONSchema(schema), (key, value) => ["pattern", "maxLength", "minimum", "maximum"].includes(key) ? undefined : value));
}
export const intakeTimeTools = [
  { type: "function", name: "resolve_event_time", description: "Resolve an exact source phrase using its original message reference. For a Discord timestamp use only the token; use shift_event_time for offsets. Binds a single validated result to fieldPath. Date-only results never become a start time.", strict: true, parameters: wireSchema(resolve) },
  { type: "function", name: "shift_event_time", description: "Shift a returned time candidate. Days are calendar days; hours/minutes are elapsed time. Binds the result to fieldPath. Never invent candidate IDs.", strict: true, parameters: wireSchema(shift) },
  { type: "function", name: "set_event_clock", description: "Set a returned candidate's local clock. Rejects nonexistent/ambiguous DST times. Binds the result to fieldPath.", strict: true, parameters: wireSchema(clock) },
];

async function loadTimeRuntime() {
  const { createDeterministicTemporalToolImplementations } = await import("../../temporal-runtime/src/tools");
  const { parseCalendarContext } = await import("../../temporal-runtime/src/deterministic");
  return { tools: createDeterministicTemporalToolImplementations(), parseCalendarContext };
}

export function createIntakeTimeTools(sourceText: string, sources: IntakeTimeSource[], loadRuntime = loadTimeRuntime) {
  const candidates = new Map<string, { value: Candidate; source: IntakeTimeSource; excerpt: string; calendarZoneKnown: boolean; performerLabel: string | null }>();
  const bindings = new Map<string, string>();
  const failures = new Map<string, string>();
  const holds = new Map<string, string>();
  let runtimeFailed = false;
  function remember(fieldPath: string, value: Candidate, source: IntakeTimeSource, excerpt: string, calendarZoneKnown: boolean, performerLabel: string | null) {
    const id = `time-${candidates.size + 1}`;
    candidates.set(id, { value, source, excerpt, calendarZoneKnown, performerLabel });
    bindings.set(fieldPath, id); failures.delete(fieldPath); holds.delete(fieldPath);
    const local = projectInstant(value.isoInstant, value.timeZone);
    return { candidateId: id, instant: value.precision === "date" ? null : value.isoInstant, date: local.date,
      time: value.precision === "date" ? null : local.time, timezone: value.timeZone, precision: value.precision, assumptions: value.assumptions };
  }
  return {
    async call(name: string, input: unknown): Promise<unknown> {
      const normalized = input && typeof input === "object" && !Array.isArray(input) ? { ...input } as Record<string, unknown> : input;
      if (normalized && typeof normalized === "object" && "fieldPath" in normalized && typeof normalized.fieldPath === "string") normalized.fieldPath = temporalFieldPath(normalized.fieldPath);
      const parsed = (name === "resolve_event_time" ? resolve : name === "shift_event_time" ? shift : clock).safeParse(normalized);
      if (!parsed.success) {
        const path = field.safeParse(normalized && typeof normalized === "object" && "fieldPath" in normalized ? normalized.fieldPath : undefined);
        if (path.success) { bindings.delete(path.data); holds.delete(path.data); failures.set(path.data, "time_resolution_required"); }
        return { candidates: [], reason: "invalid_time_arguments" };
      }
      const args = parsed.data;
      if (name === "resolve_event_time" && !sourceText.trim() && !sources.some(source => source.text.trim())) return { candidates: [], reason: "text_time_tool_unavailable" };
      let runtime: Awaited<ReturnType<typeof loadTimeRuntime>>;
      try { runtime = await loadRuntime(); }
      catch { runtimeFailed = true; return { candidates: [], reason: "temporal_runtime_unavailable" }; }
      try {
        const { tools, parseCalendarContext } = runtime;
        if (name === "resolve_event_time") {
          const args = resolve.parse(normalized);
          const source = args.sourceMessageId ? sources.find(source => source.id === args.sourceMessageId) : sources.length === 1 ? sources[0] : undefined;
          if (sources.length && !source) throw new Error("source_message_required");
          const text = source?.text ?? sourceText;
          if (args.fieldPath.startsWith("lineup.") && (!args.performerLabel || !text.toLowerCase().includes(args.performerLabel.toLowerCase()))) throw new Error("performer_source_required");
          if (!args.text.trim()) throw new Error("empty_time_phrase");
          if (!text.includes(args.text)) return { candidates: [], reason: "phrase_not_in_text_source" };
          const token = /^<t:\d{1,12}(?::[tTdDfFR])?>$/.test(args.text);
          if (args.text.includes("<t:") && !token) throw new Error("resolve_anchor_then_shift");
          const clauses = token ? text.split("\n").filter(line => line.includes(args.text)).join("\n") : args.text;
          if (/\b(?:ignore|wrong|instead|cancelled|outdated)\b/i.test(clauses)) throw new Error("conflicting_timestamp_reference");
          const reference = source ?? { id: "source", text, referenceInstant: "1970-01-01T00:00:00Z" };
          const provisional = parseCalendarContext("UTC", reference.referenceInstant);
          // A local relative phrase needs a zone actually written in that message.
          const clause = text.split(/[\n;,|]|(?<=[.!?])\s+/).find(part => part.includes(args.text)) ?? args.text;
          const zone = await tools.resolveTimeZone({ text: clause, calendarContext: provisional });
          const matchedZone = zone.candidates[0];
          if (zone.status === "resolved" && matchedZone?.kind === "iana"
            && /^[a-z]{2,5}$/i.test(matchedZone.matchedText) && !/^(UTC|GMT)$/i.test(matchedZone.matchedText)) throw new Error("source_timezone_required");
          const absoluteIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(args.text);
          if (!token && !absoluteIso && (args.text.match(clockPhrases)?.length ?? 0) > 1) throw new Error("ambiguous_or_unresolved_time");
          const elapsed = /^(?:in\s+\d+\s+(?:minutes?|hours?)|\d+\s+(?:minutes?|hours?)\s+(?:from now|ago))$/i.test(args.text);
          const timezone = zone.status === "resolved" ? zone.candidates[0]?.timeZone : (token || absoluteIso || elapsed) && (!args.timezone || args.timezone === "UTC") ? "UTC" : undefined;
          if (!timezone || args.timezone && args.timezone !== timezone) throw new Error("source_timezone_required");
          const dateSignal = absoluteDateMarker.test(args.text) || /\b(?:today|tonight|tomorrow|yesterday|(?:next|last|this)\s+(?:day|night|week|month|year)|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b|\b\d{1,2}-\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)\b|^\d{10}(?:\d{3})?$/i.test(args.text);
          if (!token && !absoluteIso && !elapsed && !dateSignal) throw new Error("source_reference_time_required");
          const context = parseCalendarContext(timezone, reference.referenceInstant);
          const result = await tools.resolveCalendarQuery({ query: args.text, calendarContext: context });
          if (result.candidates.length !== 1) throw new Error("ambiguous_or_unresolved_time");
          const value = result.candidates[0];
          if (!source && !token) {
            // An absolute expression must resolve identically under unrelated reference dates.
            const alternate = await tools.resolveCalendarQuery({ query: args.text, calendarContext: parseCalendarContext(timezone, "2100-01-01T00:00:00Z") });
            if (alternate.candidates.length !== 1 || alternate.candidates[0].isoInstant !== value.isoInstant || alternate.candidates[0].precision !== value.precision) throw new Error("source_reference_time_required");
          }
          if (!token && !absoluteIso) {
            const validation = await tools.validateCandidate({ originalText: args.text, candidate: value, calendarContext: context });
            if (!validation.passed || validation.ambiguity.length) throw new Error("ambiguous_or_invalid_time");
          }
          const remembered = remember(args.fieldPath, value, reference, args.text, zone.status === "resolved", args.performerLabel);
          if (token && timestampTransformPhrase(clauses)) {
            bindings.delete(args.fieldPath); failures.set(args.fieldPath, "relative_shift_required");
            return { ...remembered, requiresShift: true };
          }
          return remembered;
        }
        const base = candidates.get("candidateId" in args ? args.candidateId : "");
        if (!base) throw new Error("unknown_time_candidate");
        const label = args.performerLabel ?? base.performerLabel;
        if (args.fieldPath.startsWith("lineup.") && (!label || !base.source.text.toLowerCase().includes(label.toLowerCase()) || base.performerLabel && label.toLowerCase() !== base.performerLabel.toLowerCase())) throw new Error("performer_source_required");
        const context = parseCalendarContext(base.value.timeZone, base.source.referenceInstant);
        let value: Candidate;
        if (name === "shift_event_time") {
          const args = shift.parse(normalized);
          if (args.days && !base.calendarZoneKnown) throw new Error("calendar_timezone_required");
          value = base.value;
          if (args.days) {
            const [hour, minute] = projectInstant(base.value.isoInstant, base.value.timeZone).time.split(":").map(Number);
            value = await tools.shiftDateTime({ base: { zonedDateTime: value.zonedDateTime }, delta: { days: args.days }, time: { hour, minute }, calendarContext: context });
          }
          if (args.hours || args.minutes) value = await tools.shiftDateTime({ base: { zonedDateTime: value.zonedDateTime }, delta: { hours: args.hours, minutes: args.minutes }, calendarContext: context });
          if (base.value.precision === "date") {
            if (args.hours || args.minutes) throw new Error("date_only_requires_clock");
            value.precision = "date";
          }
        } else {
          const args = clock.parse(normalized);
          if (!base.calendarZoneKnown) throw new Error("clock_timezone_required");
          const matchesClock = (base.source.text.match(clockPhrases) ?? []).some(text => {
            const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])?/i.exec(text);
            if (!match) return false;
            const hour = match[3] ? Number(match[1]) % 12 + (match[3].toLowerCase() === "p" ? 12 : 0) : Number(match[1]);
            return hour === args.hour && Number(match[2] ?? 0) === args.minute;
          });
          if (!matchesClock) throw new Error("clock_not_in_source");
          value = await tools.setClockTime({ base: { zonedDateTime: base.value.zonedDateTime }, time: { hour: args.hour, minute: args.minute }, calendarContext: context });
        }
        return remember(args.fieldPath, value, base.source, base.excerpt, base.calendarZoneKnown, label);
      } catch (error) {
        let code = error instanceof Error ? error.message : "time_resolution_required";
        if (code === "ambiguous_or_unresolved_time" && !sources.length && "text" in args && !/\b\d{4}\b/.test(args.text)) code = "source_reference_time_required";
        if (code === "source_timezone_required" || code === "source_reference_time_required") {
          bindings.delete(args.fieldPath); holds.set(args.fieldPath, code);
          return { candidates: [], reason: code };
        }
        bindings.delete(args.fieldPath); failures.set(args.fieldPath, "time_resolution_required");
        return { candidates: [], reason: "time_resolution_required" };
      }
    },
    apply(candidate: EventIntakeCandidate, existing: Pick<EventIntakeFields, "eventDate" | "timezone"> = {}) {
      if (runtimeFailed) throw new Error("temporal_runtime_unavailable");
      const authoredDate = hasAuthoredEventDate(candidate, sourceText) ? candidate.event.eventDate : null;
      const knownDate = authoredDate ?? existing.eventDate;
      const knownZone = existing.timezone || candidate.evidence.some(item => item.fieldPath === "event.timezone" && item.assessment === "explicit"
        && item.excerpt && !/^<t:\d+(?::[tTdDfFR])?>$/.test(item.excerpt.trim())
        && (item.origin === "poster" || item.origin === "text" && sourceText.includes(item.excerpt)));
      let establishedDate = false, establishedZone = false;
      const conflictingContext = candidate.evidence.some(item => ["event.eventDate", "event.timezone"].includes(item.fieldPath) && item.assessment === "conflicting");
      const unboundLocalClocks = [];
      if (!knownZone && bindings.size) {
        const facts = discordTimestampFacts(sourceText);
        const bindingZones = new Set([...bindings.values()].map(id => candidates.get(id)!.value.timeZone));
        const exactZone = candidate.event.timezone ?? (bindingZones.size === 1 ? [...bindingZones][0] : undefined);
        for (const [prefix, row] of [["event", candidate.event], ...candidate.lineup.map((row, index) => [`lineup.${index}`, row] as const)] as const) {
          for (const field of ["start", "end"] as const) {
            const path = `${prefix}.${field}`;
            if (!row[field] || bindings.has(path)) continue;
            const evidence = candidate.evidence.filter(item => temporalFieldPath(item.fieldPath) === path);
            const matches = facts.filter(fact => evidence.some(item => item.excerpt?.includes(fact.token)));
            let exact = false;
            if (new Set(matches.map(fact => fact.epoch)).size === 1 && exactZone && (exactZone === "UTC" || exactZone.includes("/"))) {
              try {
                const local = projectInstant(matches[0].utc, exactZone);
                exact = row[field] === local.time && row[`${field}Date`] === local.date;
              } catch { /* An invalid model zone cannot establish an unbound clock. */ }
            }
            if (!exact) { unboundLocalClocks.push(path); holds.set(path, "source_timezone_required"); }
          }
        }
      }
      if (unboundLocalClocks.length) candidate.event.timezone = null;
      // A model that skips the shift tool must not publish the bare timestamp or its own arithmetic.
      for (const evidence of candidate.evidence) {
        const path = temporalFieldPath(evidence.fieldPath);
        if (!/^(event\.(?:eventDate|start|end)|lineup\.\d+\.(?:start|end))$/.test(path) || bindings.has(path)) continue;
        const absolutePart = absoluteDateMarker.test(evidence.excerpt ?? "");
        const weekdayOnly = /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b|\bthis\s+(?:day|night|week|month|year)\b/i.test(evidence.excerpt ?? "");
        const exactToken = discordTimestampFacts(evidence.excerpt ?? "").some(fact => sourceText.includes(fact.token));
        if ((path === "event.eventDate" || path === "event.start") && weekdayOnly && !absolutePart && !exactToken) holds.set(path, "source_reference_time_required");
        if (relativeTimePhrase(evidence.excerpt ?? "")) {
          if (absolutePart || evidence.origin === "poster" || (evidence.excerpt?.match(clockPhrases)?.length ?? 0) > 0 || ![sourceText, ...sources.map(source => source.text)].some(text => evidence.excerpt && text.includes(evidence.excerpt))) holds.set(path, "source_reference_time_required");
          else failures.set(path, "relative_time_tool_required");
        }
        if (discordTimestampFacts(sourceText).some(fact => evidence.excerpt?.includes(fact.epoch)
          && sourceText.split("\n").some(line => line.includes(fact.token) && timestampTransformPhrase(line)))) failures.set(path, "relative_time_tool_required");
      }
      const bindingOrder = (path: string) => path === "event.eventDate" ? 0 : path === "event.start" ? 1 : path.endsWith(".start") ? 2 : 3;
      const orderedBindings = [...bindings].sort(([left, leftId], [right, rightId]) => bindingOrder(left) - bindingOrder(right)
        || candidates.get(leftId)!.value.isoInstant.localeCompare(candidates.get(rightId)!.value.isoInstant));
      for (const [fieldPath, id] of orderedBindings) {
        const binding = candidates.get(id)!;
        const [, index, lineupField] = /^lineup\.(\d+)\.(start|end)$/.exec(fieldPath) ?? [];
        const row = index === undefined ? candidate.event : candidate.lineup[Number(index)];
        if (!row) continue;
        const field = index === undefined ? fieldPath.slice(6) : lineupField;
        if (index !== undefined && (!binding.performerLabel || candidate.lineup[Number(index)].performerLabel?.toLowerCase() !== binding.performerLabel.toLowerCase())) { failures.set(fieldPath, "time_performer_changed"); continue; }
        if (conflictingContext) { failures.set(fieldPath, "event_time_context_conflict"); continue; }
        if (candidate.evidence.some(item => temporalFieldPath(item.fieldPath) === fieldPath && item.assessment === "conflicting")) continue;
        const value = binding.value;
        if (value.precision === "date" && field !== "eventDate") { failures.set(fieldPath, "clock_time_required"); continue; }
        let zone = candidate.event.timezone ?? value.timeZone;
        if (zone !== "UTC" && !zone.includes("/")) zone = value.timeZone;
        let local;
        try { local = projectInstant(value.isoInstant, zone); }
        catch { zone = value.timeZone; local = projectInstant(value.isoInstant, zone); }
        // Date-only noon is a parser placeholder, not an instant that can change the authored day.
        if (value.precision === "date" && local.date !== projectInstant(value.isoInstant, value.timeZone).date) {
          failures.set(fieldPath, "time_date_zone_conflict"); continue;
        }
        if ((fieldPath === "event.start" || fieldPath === "event.eventDate") && authoredDate && authoredDate !== local.date) {
          failures.set(fieldPath, "authored_date_conflict"); continue;
        }
        const establishesDate = field === "eventDate" || fieldPath === "event.start" || !candidate.event.eventDate && field === "start";
        const paths = new Set([fieldPath, ...(!unboundLocalClocks.length ? ["event.timezone"] : []), ...(establishesDate ? ["event.eventDate"] : [])]);
        if (!replaceTimeEvidence(candidate, paths, [...paths].map(fieldPath => ({ fieldPath, origin: "text" as const, excerpt: binding.excerpt, assessment: "explicit" as const })))) {
          failures.set(fieldPath, "time_evidence_limit"); continue;
        }
        if (!unboundLocalClocks.length) { candidate.event.timezone = zone; establishedZone = true; }
        if (field === "eventDate") candidate.event.eventDate = local.date;
        else {
          const key = field as "start" | "end";
          row[key] = local.time; row[`${key}Date`] = local.date;
          if (establishesDate) candidate.event.eventDate = local.date;
        }
        if (establishesDate) {
          failures.delete("event.eventDate");
          holds.delete("event.eventDate");
        }
        establishedDate ||= establishesDate;
        candidate.questions = candidate.questions.filter(item => !paths.has(temporalFieldPath(item.fieldPath)));
      }
      for (const [fieldPath, reason] of failures) {
        const match = /^lineup\.(\d+)\.(start|end)$/.exec(fieldPath);
        const row = match ? candidate.lineup[Number(match[1])] : candidate.event;
        const field = match?.[2] ?? fieldPath.slice(6);
        if (field === "eventDate") candidate.event.eventDate = null;
        else if (row) row[field as "start" | "end"] = null;
        if (candidate.questions.length === 100) candidate.questions.pop();
        candidate.questions.push({ fieldPath, reason, alternatives: [] });
      }
      for (const [fieldPath, reason] of holds) {
        const match = /^lineup\.(\d+)\.(start|end)$/.exec(fieldPath);
        const row = match ? candidate.lineup[Number(match[1])] : candidate.event;
        const field = match?.[2] ?? fieldPath.slice(6);
        if (!knownDate && !establishedDate && (fieldPath === "event.eventDate" || fieldPath === "event.start" && reason === "source_reference_time_required")) candidate.event.eventDate = null;
        if (!knownZone && !establishedZone && fieldPath === "event.start" && reason === "source_timezone_required") candidate.event.timezone = null;
        if (row && field !== "eventDate" && (reason === "source_reference_time_required" || !authoredDate)) row[`${field as "start" | "end"}Date`] = null;
        if (candidate.questions.length === 100) candidate.questions.pop();
        candidate.questions.push({ fieldPath, reason, alternatives: [] });
      }
      return candidate;
    },
  };
}
