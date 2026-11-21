import type { EventIntakeCandidate } from "../../api-contracts/src/event-intake";

export function discordTimestampFacts(source: string) {
  return [...new Set([...source.matchAll(/<t:(\d{1,12})(?::[tTdDfFR])?>/g)].map(match => match[1]))]
    .flatMap(epoch => {
      const instant = new Date(Number(epoch) * 1000);
      return Number.isFinite(instant.getTime()) && instant.getUTCFullYear() >= 1970 && instant.getUTCFullYear() <= 9999
        ? [{ epoch, utc: instant.toISOString() }] : [];
    });
}

/** Use source-backed epochs, never model arithmetic, for timestamp-only schedules. */
export function normalizeDiscordTimestampTimes(candidate: EventIntakeCandidate, source: string) {
  const facts = discordTimestampFacts(source);
  if (!facts.length) return candidate;
  const path = (value: string) => value.replace(/\[(\d+)\]/g, ".$1");
  const clocks = [["event", candidate.event], ...candidate.lineup.map((row, index) => [`lineup.${index}`, row] as const)] as const;
  const resolved = [];
  for (const [prefix, row] of clocks) {
    for (const field of ["start", "end"] as const) {
      if (!row[field]) continue;
      const evidence = candidate.evidence.filter(item => path(item.fieldPath) === `${prefix}.${field}`);
      const matches = facts.filter(fact => evidence.some(item => new RegExp(`(?<!\\d)${fact.epoch}(?!\\d)`).test(item.excerpt ?? "")));
      // Mixed wall-clock schedules still need their authored timezone and date review.
      if (matches.length !== 1) return candidate;
      resolved.push({ row, field, fieldPath: `${prefix}.${field}`, fact: matches[0],
        assessment: evidence.some(item => item.assessment === "explicit") ? "explicit" as const : "inferred" as const });
    }
  }
  if (!resolved.length) return candidate;
  for (const { row, field, fact } of resolved) {
    row[field] = fact.utc.slice(11, 16);
    row[`${field}Date`] = fact.utc.slice(0, 10);
  }
  candidate.event.timezone = "UTC";
  candidate.event.eventDate = candidate.event.startDate ?? resolved.map(item => item.fact.utc.slice(0, 10)).sort()[0];
  const corrected = new Set(["event.timezone", "event.eventDate", ...resolved.map(item => item.fieldPath)]);
  candidate.questions = candidate.questions.filter(item => !corrected.has(path(item.fieldPath)));
  candidate.evidence = candidate.evidence.filter(item => !corrected.has(path(item.fieldPath)));
  candidate.evidence.push(...resolved.map(item => ({ fieldPath: item.fieldPath, origin: "text" as const,
    excerpt: `<t:${item.fact.epoch}>`, assessment: item.assessment })));
  return candidate;
}
