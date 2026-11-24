import type { EventIntakeCandidate } from "../../api-contracts/src/event-intake";

export function discordTimestampFacts(source: string) {
  return [...new Set([...source.matchAll(/<t:(\d{1,12})(?::[tTdDfFR])?>/g)].map(match => match[0]))]
    .flatMap(token => {
      const epoch = /^<t:(\d+)/.exec(token)![1];
      const instant = new Date(Number(epoch) * 1000);
      return Number.isFinite(instant.getTime()) && instant.getUTCFullYear() >= 1970 && instant.getUTCFullYear() <= 9999
        ? [{ token, epoch, utc: instant.toISOString() }] : [];
    });
}

export const temporalFieldPath = (value: string) => value.replace(/\[(\d+)\]/g, ".$1");
const calendarWord = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|night|week|month|year)";
const temporalRelation = new RegExp(String.raw`\b(?:after|before|later|earlier)\s+(?:<t:\d|\d{1,2}(?::\d{2})?|noon\b|midnight\b|${calendarWord}\b)|\b(?:\d+|[a-z]+)\s+(?:minutes?|mins?|hours?|hrs?|days?|weeks?)\s+(?:after|before|later|earlier)\b`, "i");
export const relativeTimePhrase = (text: string) => /\b(?:today|tonight|tomorrow|yesterday|in\s+\d+\s+(?:minutes?|hours?|days?))\b/i.test(text)
  || new RegExp(String.raw`\b(?:next|last)\s+${calendarWord}\b`, "i").test(text) || temporalRelation.test(text);
export const timestampTransformPhrase = (text: string) => temporalRelation.test(text) || /\b(?:shift|move|ignore|wrong|instead)\b/i.test(text);
export function hasAuthoredEventDate(candidate: EventIntakeCandidate, source: string) {
  return candidate.evidence.some(item => item.fieldPath === "event.eventDate" && item.assessment === "explicit" && item.excerpt
    && !relativeTimePhrase(item.excerpt) && !/^<t:\d+(?::[tTdDfFR])?>$/.test(item.excerpt.trim())
    && (item.origin === "poster" || item.origin === "text" && source.includes(item.excerpt)));
}
/** Keep deterministic facts and conflicts within the existing evidence contract. */
export function replaceTimeEvidence(candidate: EventIntakeCandidate, paths: Set<string>, rows: EventIntakeCandidate["evidence"]) {
  const rest = candidate.evidence.filter(item => !paths.has(temporalFieldPath(item.fieldPath)));
  const conflicts = rest.filter(item => item.assessment === "conflicting");
  if (conflicts.length + rows.length > 40) return false;
  candidate.evidence = [...rows, ...conflicts, ...rest.filter(item => item.assessment !== "conflicting")].slice(0, 40);
  return true;
}
export function projectInstant(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const get = (key: string) => parts.find(part => part.type === key)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** A narrow direct-reference guard. Transformations must go through the time tools. */
function directSourceLine(line: string, token: string, label?: string) {
  if (/^\s*(?:>|`)/.test(line) || timestampTransformPhrase(line)) return false;
  let rest = line.replace(/<t:\d+(?::[tTdDfFR])?>/g, "");
  if (label) {
    if (!rest.toLowerCase().includes(label.toLowerCase())) return false;
    const at = rest.toLowerCase().indexOf(label.toLowerCase());
    rest = rest.slice(0, at) + rest.slice(at + label.length);
  }
  return line.includes(token) && !rest.replace(/\b(?:doors?|starts?|begins?|ends?|opens?|at|on|time)\b/gi, "").replace(/[\s#*_:()\-.,]/g, "");
}

/** Normalize only clocks tied to their own direct source clause, preserving authored context. */
export function normalizeDiscordTimestampTimes(candidate: EventIntakeCandidate, source: string) {
  const facts = discordTimestampFacts(source);
  if (!facts.length) return candidate;
  const clocks = [["event", candidate.event], ...candidate.lineup.map((row, index) => [`lineup.${index}`, row] as const)] as const;
  const reviewUncorrectedClocks = () => {
    for (const [prefix, row] of clocks) {
      for (const field of ["start", "end"] as const) {
        if (!row[field]) continue;
        const fieldPath = `${prefix}.${field}`;
        const evidence = candidate.evidence.filter(item => temporalFieldPath(item.fieldPath) === fieldPath);
        const matches = facts.filter(fact => evidence.some(item => item.excerpt?.includes(fact.token)));
        if (!matches.length) continue;
        let mismatch = new Set(matches.map(fact => fact.epoch)).size !== 1;
        try {
          const expected = projectInstant(matches[0].utc, candidate.event.timezone ?? "UTC");
          const date = row[`${field}Date`] ?? candidate.event.eventDate;
          mismatch ||= row[field] !== expected.time || Boolean(date && date !== expected.date);
        } catch { mismatch = true; }
        if (mismatch && !candidate.questions.some(item => temporalFieldPath(item.fieldPath) === fieldPath && item.reason === "time_resolution_required")) {
          if (candidate.questions.length === 100) candidate.questions.pop();
          candidate.questions.push({ fieldPath, reason: "time_resolution_required", alternatives: [] });
        }
      }
    }
    return candidate;
  };
  if (candidate.evidence.some(item => item.assessment === "conflicting" && /^(event\.(?:start|end|eventDate|timezone)|lineup)/.test(temporalFieldPath(item.fieldPath)))) return reviewUncorrectedClocks();
  const resolved = [];
  for (const [prefix, row] of clocks) {
    for (const field of ["start", "end"] as const) {
      if (!row[field]) continue;
      const evidence = candidate.evidence.filter(item => temporalFieldPath(item.fieldPath) === `${prefix}.${field}`);
      if (evidence.some(item => relativeTimePhrase(item.excerpt ?? ""))) return reviewUncorrectedClocks();
      const matches = facts.filter(fact => evidence.some(item => item.excerpt?.includes(fact.token)));
      if (new Set(matches.map(fact => fact.epoch)).size !== 1) return reviewUncorrectedClocks();
      const label = "performerLabel" in row ? row.performerLabel ?? undefined : undefined;
      const fact = matches.find(fact => source.split("\n").some(line => directSourceLine(line, fact.token, label)));
      if (!fact) return reviewUncorrectedClocks();
      // Repeated references in other clauses may express corrections or relative shifts.
      if (source.split("\n").some(line => line.includes(fact.token) && !directSourceLine(line, fact.token)
        && !candidate.lineup.some(row => row.performerLabel && directSourceLine(line, fact.token, row.performerLabel)))) return reviewUncorrectedClocks();
      resolved.push({ row, field, fieldPath: `${prefix}.${field}`, fact,
        assessment: evidence.some(item => item.assessment === "explicit") ? "explicit" as const : "inferred" as const });
    }
  }
  if (!resolved.length) return candidate;
  const timezone = candidate.event.timezone ?? "UTC";
  let values;
  try { values = resolved.map(item => ({ ...item, local: projectInstant(item.fact.utc, timezone) })); }
  catch { return reviewUncorrectedClocks(); }
  const start = values.find(item => item.fieldPath === "event.start");
  const date = start?.local.date ?? values.filter(item => item.field === "start").map(item => item.local.date).sort()[0];
  const authoredDate = hasAuthoredEventDate(candidate, source);
  const establishesDate = !authoredDate && date !== undefined && (candidate.decision.kind !== "update" || start !== undefined || !candidate.event.eventDate);
  const corrected = new Set(["event.timezone", ...(establishesDate ? ["event.eventDate"] : []), ...resolved.map(item => item.fieldPath)]);
  const context = start ?? values[0];
  const evidence = [...resolved.map(item => ({ fieldPath: item.fieldPath, origin: "text" as const, excerpt: item.fact.token, assessment: item.assessment })),
    ...["event.timezone", ...(establishesDate ? ["event.eventDate"] : [])].map(fieldPath => ({ fieldPath, origin: "text" as const, excerpt: context.fact.token, assessment: context.assessment }))];
  if (!replaceTimeEvidence(candidate, corrected, evidence)) {
    for (const item of resolved) item.row[item.field] = null;
    if (candidate.questions.length < 100) candidate.questions.push({ fieldPath: "event.start", reason: "time_evidence_limit", alternatives: [] });
    return candidate;
  }
  for (const { row, field, local } of values) { row[field] = local.time; row[`${field}Date`] = local.date; }
  candidate.event.timezone = timezone;
  if (establishesDate) candidate.event.eventDate = date;
  candidate.questions = candidate.questions.filter(item => !corrected.has(temporalFieldPath(item.fieldPath)));
  return candidate;
}
