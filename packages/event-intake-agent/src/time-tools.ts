import { z } from "zod";
import type { Candidate } from "../../temporal-runtime/src/types";
import type { EventIntakeCandidate } from "../../api-contracts/src/event-intake";
import { discordTimestampFacts, hasAuthoredEventDate, projectInstant, relativeTimePhrase, replaceTimeEvidence, temporalFieldPath } from "./discord-timestamps";

export type IntakeTimeSource = { id: string; text: string; referenceInstant: string };
const field = z.string().regex(/^(event\.(start|end|eventDate)|lineup\.\d+\.(start|end))$/);
const performerLabel = z.string().max(120).nullable().describe("Exact source performer label for lineup fields; null for event fields.");
const clockPhrases = /\b(?:\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?)(?!\w)/gi;
const resolve = z.strictObject({ fieldPath: field, performerLabel, text: z.string().max(500), sourceMessageId: z.string().nullable(), timezone: z.string().max(64).nullable() });
const shift = z.strictObject({ fieldPath: field, performerLabel, candidateId: z.string(), days: z.number().int().min(-7).max(90), hours: z.number().int().min(-168).max(2160), minutes: z.number().int().min(-1440).max(1440) });
const clock = z.strictObject({ fieldPath: field, performerLabel, candidateId: z.string(), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) });
export const intakeTimeTools = [
  { type: "function", name: "resolve_event_time", description: "Resolve an exact source phrase using its original message reference. For a Discord timestamp use only the token; use shift_event_time for offsets. Binds a single validated result to fieldPath. Date-only results never become a start time.", strict: true, parameters: z.toJSONSchema(resolve) },
  { type: "function", name: "shift_event_time", description: "Shift a returned time candidate. Days are calendar days; hours/minutes are elapsed time. Binds the result to fieldPath. Never invent candidate IDs.", strict: true, parameters: z.toJSONSchema(shift) },
  { type: "function", name: "set_event_clock", description: "Set a returned candidate's local clock. Rejects nonexistent/ambiguous DST times. Binds the result to fieldPath.", strict: true, parameters: z.toJSONSchema(clock) },
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
      if (!parsed.success) return { candidates: [], reason: "invalid_time_arguments" };
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
          const absoluteIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(args.text);
          if (!token && !absoluteIso && (args.text.match(clockPhrases)?.length ?? 0) > 1) throw new Error("ambiguous_or_unresolved_time");
          const elapsed = /^(?:in\s+\d+\s+(?:minutes?|hours?)|\d+\s+(?:minutes?|hours?)\s+(?:from now|ago))$/i.test(args.text);
          const timezone = zone.status === "resolved" ? zone.candidates[0]?.timeZone : (token || absoluteIso || elapsed) && (!args.timezone || args.timezone === "UTC") ? "UTC" : undefined;
          if (!timezone || args.timezone && args.timezone !== timezone) throw new Error("source_timezone_required");
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
          if (token && /\b(?:after|before|later|earlier|shift|move)\b/i.test(clauses)) {
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
          value = await tools.shiftDateTime({ base: { zonedDateTime: base.value.zonedDateTime }, delta: { days: args.days, hours: args.hours, minutes: args.minutes }, calendarContext: context });
          if (base.value.precision === "date") {
            if (args.hours || args.minutes) throw new Error("date_only_requires_clock");
            value.precision = "date";
          }
        } else {
          const args = clock.parse(normalized);
          if (!base.calendarZoneKnown) throw new Error("clock_timezone_required");
          const phrases = new Set([base.source.text, ...base.source.text.match(clockPhrases) ?? []]);
          const clocks = await Promise.all([...phrases].map(text => tools.resolveClockTime({ text, calendarContext: context })));
          if (!clocks.some(result => result.candidates.some(clock => clock.hour === args.hour && clock.minute === args.minute))) throw new Error("clock_not_in_source");
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
    apply(candidate: EventIntakeCandidate) {
      if (runtimeFailed) throw new Error("temporal_runtime_unavailable");
      const authoredDate = hasAuthoredEventDate(candidate, sourceText) ? candidate.event.eventDate : null;
      const conflictingContext = candidate.evidence.some(item => ["event.eventDate", "event.timezone"].includes(item.fieldPath) && item.assessment === "conflicting");
      // A model that skips the shift tool must not publish the bare timestamp or its own arithmetic.
      for (const evidence of candidate.evidence) {
        const path = temporalFieldPath(evidence.fieldPath);
        if (!/^(event\.(?:eventDate|start|end)|lineup\.\d+\.(?:start|end))$/.test(path) || bindings.has(path)) continue;
        if (relativeTimePhrase(evidence.excerpt ?? "")) failures.set(path, "relative_time_tool_required");
        if (discordTimestampFacts(sourceText).some(fact => evidence.excerpt?.includes(fact.epoch)
          && sourceText.split("\n").some(line => line.includes(fact.token) && /\b(?:after|before|later|earlier|shift|move|ignore|wrong|instead)\b/i.test(line)))) failures.set(path, "relative_time_tool_required");
      }
      for (const [fieldPath, id] of bindings) {
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
        if ((fieldPath === "event.start" || fieldPath === "event.eventDate") && authoredDate && authoredDate !== local.date) {
          failures.set(fieldPath, "authored_date_conflict"); continue;
        }
        const establishesDate = field === "eventDate" || fieldPath === "event.start" || !candidate.event.eventDate && field === "start";
        const paths = new Set([fieldPath, "event.timezone", ...(establishesDate ? ["event.eventDate"] : [])]);
        if (!replaceTimeEvidence(candidate, paths, [...paths].map(fieldPath => ({ fieldPath, origin: "text" as const, excerpt: binding.excerpt, assessment: "explicit" as const })))) {
          failures.set(fieldPath, "time_evidence_limit"); continue;
        }
        candidate.event.timezone = zone;
        if (field === "eventDate") candidate.event.eventDate = local.date;
        else {
          const key = field as "start" | "end";
          row[key] = local.time; row[`${key}Date`] = local.date;
          if (establishesDate) candidate.event.eventDate = local.date;
        }
        if (establishesDate) failures.delete("event.eventDate");
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
        if (field === "eventDate" || reason === "source_reference_time_required") candidate.event.eventDate = null;
        if (reason === "source_timezone_required") candidate.event.timezone = null;
        if (row && field !== "eventDate" && (reason === "source_reference_time_required" || !authoredDate)) row[`${field as "start" | "end"}Date`] = null;
        if (candidate.questions.length === 100) candidate.questions.pop();
        candidate.questions.push({ fieldPath, reason, alternatives: [] });
      }
      return candidate;
    },
  };
}
