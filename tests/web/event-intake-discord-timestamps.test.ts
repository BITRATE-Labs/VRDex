import assert from "node:assert/strict";
import { it } from "node:test";
import { discordTimestampFacts, normalizeDiscordTimestampTimes } from "../../packages/event-intake-agent/src/discord-timestamps";
import { extractEventIntake } from "../../packages/event-intake-agent/src/index";
import { sanitizeRunEvidence } from "../../convex/_discordIntake";
import { explicitUpdateKeys } from "../../convex/_eventCandidateApply";
import { candidatePatch } from "../../apps/web/src/lib/event-intake-source";
import { acceptIntakeSuggestion } from "../../apps/web/src/lib/calendar/event-intake-suggestions";
import type { EventIntakeCandidate } from "../../packages/api-contracts/src/event-intake";

const epochs = [1795217400, 1795220100, 1795222800, 1795225500];
const source = epochs.map((epoch, index) => `## <t:${epoch}:t> DJ ${index}`).join("\n");
function candidate(): EventIntakeCandidate {
  return {
    event: { title: "ABSORB", communitySlug: null, eventDate: "2026-11-21", start: null, end: null,
      startDate: null, endDate: null, timezone: null, venueLabel: null, summary: null, sourceUrl: null },
    lineup: epochs.map((_, index) => ({ performerLabel: `DJ ${index}`, personSlug: null, roleLabel: null,
      start: "00:50", end: null, startDate: "2026-11-21", endDate: null })),
    evidence: epochs.map((epoch, index) => ({ fieldPath: `lineup[${index}].start`, origin: "calculation",
      excerpt: `<t:${epoch}:t>`, assessment: "explicit" })),
    questions: [{ fieldPath: "event.timezone", reason: "Local timezone missing", alternatives: [] }],
    decision: { kind: "new" },
  };
}

it("converts Discord epochs exactly, across UTC midnight, and unlocks the imported lineup", () => {
  const result = normalizeDiscordTimestampTimes(candidate(), source);
  assert.equal(result.event.timezone, "UTC");
  assert.equal(result.event.eventDate, "2026-11-20");
  assert.deepEqual(result.lineup.map(row => [row.startDate, row.start]), [
    ["2026-11-20", "23:30"], ["2026-11-21", "00:15"], ["2026-11-21", "01:00"], ["2026-11-21", "01:45"],
  ]);
  assert.deepEqual(result.questions, []);
  const patch = candidatePatch(result);
  assert.deepEqual(patch.tentative?.lineup?.map(row => row.start?.dayOffset), [0, 1, 1, 1]);
  assert.deepEqual(patch.questions, []);
  const accepted = acceptIntakeSuggestion({ fields: { ...patch, eventDate: "2026-11-20", timezone: "UTC" }, acceptance: { key: "lineup", proposalDate: "2026-11-20" } });
  assert.equal(accepted?.lineup?.length, 4);
  assert.equal(accepted?.lineup?.[0].performerLabel, "DJ 0");
});

it("leaves mixed wall-clock schedules and ambiguous or invented timestamp evidence for review", () => {
  for (const change of [
    (value: EventIntakeCandidate) => { value.evidence.pop(); },
    (value: EventIntakeCandidate) => { value.evidence[0].excerpt += ` or <t:${epochs[1]}:t>`; },
    (value: EventIntakeCandidate) => { value.evidence[0].excerpt = "<t:1795217401:t>"; },
  ]) {
    const value = candidate(); change(value);
    const before = structuredClone(value);
    assert.deepEqual(normalizeDiscordTimestampTimes(value, source), before);
  }
});

it("accepts Discord display formats, deduplicates epochs, and rejects invalid dates", () => {
  assert.deepEqual(discordTimestampFacts("<t:1795217400> <t:1795217400> <t:999999999999:R>"),
    [{ token: "<t:1795217400>", epoch: "1795217400", utc: "2026-11-20T23:30:00.000Z" }]);
});

it("preserves authored local context and the exact formatted token as connector evidence", () => {
  const value = candidate();
  value.event.timezone = "America/New_York";
  value.event.eventDate = "2026-11-20";
  value.evidence.push({ fieldPath: "event.eventDate", origin: "text", excerpt: "November 20", assessment: "explicit" });
  const result = normalizeDiscordTimestampTimes(value, source);
  assert.equal(result.event.timezone, "America/New_York");
  assert.equal(result.event.eventDate, "2026-11-20");
  assert.equal(result.lineup[0].start, "18:30");
  for (const entry of result.evidence.filter(item => item.fieldPath === "event.timezone" || /lineup\.\d+\.start/.test(item.fieldPath))) assert.ok(source.includes(entry.excerpt!));
});

it("does not trust stale startDate without a start, or discard conflicting source evidence", () => {
  const value = candidate(); value.event.startDate = "2026-11-22";
  assert.equal(normalizeDiscordTimestampTimes(value, source).event.eventDate, "2026-11-20");
  const conflict = candidate(); conflict.evidence[0].assessment = "conflicting";
  const before = structuredClone(conflict);
  assert.deepEqual(normalizeDiscordTimestampTimes(conflict, source), before);
});

it("does not assign one source token to other performers or ignore relative meaning", () => {
  for (const text of [`Starts <t:${epochs[0]}:t>\nDJ 0 23:00\nDJ 1 00:00`, `DJ 0 30 minutes after <t:${epochs[0]}:t>`]) {
    const value = candidate(); value.lineup = value.lineup.slice(0, text.includes("after") ? 1 : 2);
    value.evidence = value.lineup.map((_, index) => ({ fieldPath: `lineup.${index}.start`, origin: "text", excerpt: `<t:${epochs[0]}:t>`, assessment: "explicit" }));
    const before = structuredClone(value);
    assert.deepEqual(normalizeDiscordTimestampTimes(value, text), before);
  }
});

it("corrects model arithmetic through the shared extraction path before date validation", async () => {
  const result = await extractEventIntake({ draftId: "fixture", sourceText: source }, {
    authorize: async () => ({ actorUserId: "fixture", version: 1 }),
    search_people: async () => [], search_communities: async () => [], enabled: true, apiKey: "fixture",
    fetchImplementation: async (_url, options) => {
      const request = JSON.parse(String(options?.body));
      assert.match(JSON.stringify(request.input), /2026-11-20T23:30:00.000Z/);
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(candidate()) }] }] });
    },
  });
  assert.equal(result.event.timezone, "UTC");
  assert.equal(result.event.eventDate, "2026-11-20");
  assert.equal(result.lineup[0].start, "23:30");
  assert.deepEqual(result.questions, []);
});

it("retains explicit formatted-token and temporal context evidence through connector update selection", () => {
  const value = candidate();
  value.event.start = "00:50";
  value.evidence.push({ fieldPath: "event.start", origin: "text", excerpt: `<t:${epochs[0]}:t>`, assessment: "explicit" });
  const text = `Starts <t:${epochs[0]}:t>\n${source}`;
  // The same instant may label the event start and its first performer explicitly.
  const normalized = normalizeDiscordTimestampTimes(value, text);
  const sanitized = sanitizeRunEvidence(normalized, [{ content: text }] as never, false);
  const keys = explicitUpdateKeys(sanitized.evidence, "discord_announcements");
  for (const key of ["start", "eventDate", "timezone", "lineup"]) assert.ok(keys.includes(key as never), key);
  assert.equal(sanitized.event.start, "23:30");
});
