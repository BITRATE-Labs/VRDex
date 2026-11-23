import assert from "node:assert/strict";
import { it } from "node:test";
import { createIntakeTimeTools, intakeTimeTools } from "../../packages/event-intake-agent/src/time-tools";
import { EventIntakeCandidateSchema } from "../../packages/api-contracts/src/event-intake";
import { candidatePatch } from "../../apps/web/src/lib/event-intake-source";
import { sanitizeRunEvidence } from "../../convex/_discordIntake";
import { explicitUpdateKeys } from "../../convex/_eventCandidateApply";
import { extractEventIntake } from "../../packages/event-intake-agent/src/index";
import type { EventIntakeCandidate } from "../../packages/api-contracts/src/event-intake";
const blank = (): EventIntakeCandidate => ({ event: { title: null, communitySlug: null, eventDate: null, start: null, end: null, startDate: null, endDate: null, timezone: null, venueLabel: null, summary: null, sourceUrl: null }, lineup: [], evidence: [], questions: [], decision: { kind: "new" } });
const resolve = (text: string, fieldPath = "event.start", sourceMessageId: string | null = null, timezone: string | null = null, performerLabel: string | null = null) => ({ fieldPath, performerLabel, text, sourceMessageId, timezone });
const shift = (candidateId: string, delta: { days?: number; hours?: number; minutes?: number }) => ({ fieldPath: "event.start", performerLabel: null, candidateId, days: 0, hours: 0, minutes: 0, ...delta });

it("anchors tomorrow to the original message independently of retry time", async () => {
  const text = "Tomorrow at 6pm UTC";
  const sources = [{ id: "post", text, referenceInstant: "2026-11-20T23:50:00Z" }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const tools = createIntakeTimeTools(text, sources);
    const result = await tools.call("resolve_event_time", resolve(text)) as { instant: string };
    assert.equal(result.instant, "2026-11-21T18:00:00Z");
    const candidate = tools.apply(blank());
    assert.equal(candidate.event.start, "18:00");
    assert.equal(candidate.event.eventDate, "2026-11-21");
  }
});

it("requires the right message in a batch and never accepts invented phrases or anchors", async () => {
  const text = "Tomorrow at 6pm UTC";
  const tools = createIntakeTimeTools(text, [
    { id: "first", text, referenceInstant: "2026-11-20T12:00:00Z" },
    { id: "second", text, referenceInstant: "2026-11-21T12:00:00Z" },
  ]);
  assert.ok("reason" in (await tools.call("resolve_event_time", resolve(text)) as object));
  const result = await tools.call("resolve_event_time", resolve(text, "event.start", "second")) as { date: string };
  assert.equal(result.date, "2026-11-22");
  assert.ok("reason" in (await tools.call("resolve_event_time", resolve("Next month", "event.start", "second")) as object));
  assert.equal(tools.apply(blank()).event.start, "18:00");
});

it("does not silently use UTC for local-relative phrases without a source timezone", async () => {
  const text = "Tomorrow at 6pm";
  const tools = createIntakeTimeTools(text, [{ id: "post", text, referenceInstant: "2026-11-20T12:00:00Z" }]);
  const result = await tools.call("resolve_event_time", resolve(text, "event.start", null, "America/New_York"));
  assert.ok("reason" in (result as object));
  assert.ok(tools.apply(blank()).questions.length);
});

it("applies a relative shift to an epoch and refuses the bare anchor as the final result", async () => {
  const token = "<t:1795217400:t>", text = `Starts 30 minutes after ${token}`;
  const tools = createIntakeTimeTools(text, []);
  const base = await tools.call("resolve_event_time", resolve(token)) as { candidateId: string; requiresShift: boolean };
  assert.equal(base.requiresShift, true);
  assert.equal(tools.apply(blank()).event.start, null);
  const moved = await tools.call("shift_event_time", shift(base.candidateId, { minutes: 30 })) as { instant: string };
  assert.equal(moved.instant, "2026-11-21T00:00:00Z");
  const candidate = tools.apply(blank());
  assert.equal(candidate.event.start, "00:00");
  assert.equal(candidate.event.eventDate, "2026-11-21");
});

it("keeps date-only precision until an explicit clock is supplied", async () => {
  const text = "Tomorrow UTC. Start at 18:30.", tools = createIntakeTimeTools(text, [{ id: "post", text, referenceInstant: "2026-11-20T12:00:00Z" }]);
  const date = await tools.call("resolve_event_time", resolve("Tomorrow", "event.start")) as { candidateId: string; time: null };
  assert.equal(date.time, null);
  assert.equal(tools.apply(blank()).event.start, null);
  const timed = await tools.call("set_event_clock", { fieldPath: "event.start", performerLabel: null, candidateId: date.candidateId, hour: 18, minute: 30 }) as { instant: string };
  assert.equal(timed.instant, "2026-11-21T18:30:00Z");
  assert.equal(tools.apply(blank()).event.start, "18:30");
});

it("distinguishes a calendar day from 24 hours across DST and rejects a nonexistent clock", async () => {
  const epoch = Math.floor(Date.parse("2026-03-07T17:00:00Z") / 1000);
  const token = `<t:${epoch}>`, text = `${token} America/New_York. Clock 02:30.`;
  const tools = createIntakeTimeTools(text, []);
  const base = await tools.call("resolve_event_time", resolve(token, "event.start", null, "America/New_York")) as { candidateId: string };
  const day = await tools.call("shift_event_time", shift(base.candidateId, { days: 1 })) as { candidateId: string; instant: string };
  const hours = await tools.call("shift_event_time", shift(base.candidateId, { hours: 24 })) as { instant: string };
  assert.equal(day.instant, "2026-03-08T16:00:00Z");
  assert.equal(hours.instant, "2026-03-08T17:00:00Z");
  const gap = await tools.call("set_event_clock", { fieldPath: "event.start", performerLabel: null, candidateId: day.candidateId, hour: 2, minute: 30 });
  assert.ok("reason" in (gap as object));
});

it("rejects fabricated candidate IDs, invalid arguments and ambiguous AM/PM", async () => {
  const text = "Tomorrow at 6 UTC", tools = createIntakeTimeTools(text, [{ id: "post", text, referenceInstant: "2026-11-20T12:00:00Z" }]);
  const ambiguous = await tools.call("resolve_event_time", resolve(text));
  assert.ok("reason" in (ambiguous as object));
  assert.ok("reason" in (await tools.call("shift_event_time", shift("invented", { hours: 1 })) as object));
  assert.equal((await tools.call("shift_event_time", shift("invented", { hours: 99999 })) as { reason: string }).reason, "invalid_time_arguments");
});

it("rejects a DST fold and requires a source zone for calendar shifts of UTC-default epochs", async () => {
  const token = `<t:${Math.floor(Date.parse("2026-11-01T04:30:00Z") / 1000)}>`;
  const tools = createIntakeTimeTools(`${token} America/New_York. Clock 01:30.`, []);
  const base = await tools.call("resolve_event_time", resolve(token)) as { candidateId: string };
  assert.ok("reason" in (await tools.call("set_event_clock", { fieldPath: "event.start", performerLabel: null, candidateId: base.candidateId, hour: 1, minute: 30 }) as object));
  const unknown = createIntakeTimeTools(token, []);
  const utc = await unknown.call("resolve_event_time", resolve(token)) as { candidateId: string };
  assert.ok("reason" in (await unknown.call("shift_event_time", shift(utc.candidateId, { days: 1 })) as object));
});

it("runs the real agent tool loop and prevents final model arithmetic from replacing its result", async () => {
  const token = "<t:1795217400:t>", text = `Starts 30 minutes after ${token}`;
  let turn = 0;
  const result = await extractEventIntake({ draftId: "fixture", sourceText: text }, {
    authorize: async () => ({ actorUserId: "fixture", version: 1 }), search_people: async () => [], search_communities: async () => [], enabled: true, apiKey: "fixture",
    fetchImplementation: async () => {
      const tool = (name: string, args: unknown) => Response.json({ status: "completed", output: [{ type: "function_call", name, call_id: String(turn), arguments: JSON.stringify(args) }] });
      if (++turn === 1) return tool("resolve_event_time", resolve(token));
      if (turn === 2) return tool("shift_event_time", shift("time-1", { minutes: 30 }));
      const value = blank(); value.event.start = "00:50"; value.event.startDate = "2026-11-22";
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
    },
  });
  assert.equal(turn, 3);
  assert.equal(result.event.start, "00:00");
  assert.equal(result.event.eventDate, "2026-11-21");
  assert.deepEqual(result.questions, []);
});

it("holds a relative timestamp field for review when the model skips the time tools", () => {
  const text = "Starts 30 minutes after <t:1795217400:t>";
  const value = blank(); value.event.start = "23:30";
  value.evidence = [{ fieldPath: "event.start", origin: "text", excerpt: "<t:1795217400:t>", assessment: "explicit" }];
  const result = createIntakeTimeTools(text, []).apply(value);
  assert.equal(result.event.start, null);
  assert.equal(result.questions[0].reason, "relative_time_tool_required");
});

it("does not let a lineup binding erase conflicting event context or manufacture an authored date", async () => {
  const token = "<t:1795217400:t>", tools = createIntakeTimeTools(`DJ ${token}`, []);
  assert.ok("candidateId" in (await tools.call("resolve_event_time", resolve(token, "lineup.0.start", null, null, "DJ")) as object));
  const value = blank(); value.event.eventDate = "2026-11-22";
  value.lineup = [{ performerLabel: "DJ", personSlug: null, roleLabel: null, start: "23:30", end: null, startDate: null, endDate: null }];
  value.evidence = [{ fieldPath: "event.eventDate", origin: "text", excerpt: "Two contradictory dates", assessment: "conflicting" }];
  value.questions = [{ fieldPath: "event.eventDate", reason: "Which date?", alternatives: [] }];
  const result = tools.apply(value);
  assert.equal(result.evidence[0].assessment, "conflicting");
  assert.equal(result.questions[0].reason, "Which date?");
  assert.equal(result.event.eventDate, "2026-11-22");
  assert.equal(result.lineup[0].start, null);
});

it("resolves fully specified web dates without inventing an anchor, but holds relative dates", async () => {
  for (const text of ["November 21, 2026 at 18:00 UTC", "2026-11-21T18:00:00Z"]) {
    const tools = createIntakeTimeTools(text, []);
    const result = await tools.call("resolve_event_time", resolve(text)) as { instant: string };
    assert.equal(result.instant, "2026-11-21T18:00:00Z");
  }
  const text = "Tomorrow at 6pm UTC", tools = createIntakeTimeTools(text, []);
  assert.ok("reason" in (await tools.call("resolve_event_time", resolve(text)) as object));
});

it("invalidates a guessed date when its tool resolution fails and supports zoneless elapsed offsets", async () => {
  const text = "Tomorrow", tools = createIntakeTimeTools(text, [{ id: "post", text, referenceInstant: "2026-11-20T12:00:00Z" }]);
  await tools.call("resolve_event_time", resolve(text, "event.eventDate"));
  const guessed = blank(); guessed.event.eventDate = "2026-11-25";
  guessed.evidence = [{ fieldPath: "event.eventDate", origin: "text", excerpt: text, assessment: "explicit" }];
  assert.equal(tools.apply(guessed).event.eventDate, null);
  const elapsed = "in 30 minutes", clock = createIntakeTimeTools(elapsed, [{ id: "post", text: elapsed, referenceInstant: "2026-11-20T23:50:00Z" }]);
  const result = await clock.call("resolve_event_time", resolve(elapsed)) as { instant: string };
  assert.equal(result.instant, "2026-11-21T00:20:00Z");
});

it("uses verified time context when the model emits an invalid timezone without discarding other facts", async () => {
  const token = "<t:1795217400:t>";
  for (const timezone of ["Mars/Base", "NotAZone", "PST"]) {
    const tools = createIntakeTimeTools(token, []);
    await tools.call("resolve_event_time", resolve(token));
    const value = blank(); value.event.title = "Keep this title"; value.event.timezone = timezone;
    const result = tools.apply(value);
    assert.equal(result.event.title, "Keep this title");
    assert.equal(result.event.timezone, "UTC");
    assert.equal(result.event.start, "23:30");
  }
});

it("accepts an explicit UTC tool argument for exact instants without treating it as an authored local zone", async () => {
  const token = "<t:1795217400:t>", tools = createIntakeTimeTools(token, []);
  const result = await tools.call("resolve_event_time", resolve(token, "event.start", null, "UTC")) as { instant: string };
  assert.equal(result.instant, "2026-11-20T23:30:00Z");
});

it("bounds generated evidence while retaining conflicts and the applied time context", async () => {
  const token = "<t:1795217400:t>", tools = createIntakeTimeTools(token, []);
  await tools.call("resolve_event_time", resolve(token));
  const value = blank(); value.evidence = Array.from({ length: 40 }, (_, index) => ({ fieldPath: `other.${index}`, origin: "text", excerpt: "Keep facts", assessment: index === 39 ? "conflicting" : "explicit" }));
  const result = tools.apply(value);
  assert.equal(result.evidence.length, 40);
  assert.ok(result.evidence.some(item => item.assessment === "conflicting"));
  for (const path of ["event.start", "event.timezone", "event.eventDate"]) assert.ok(result.evidence.some(item => item.fieldPath === path));
  assert.ok(EventIntakeCandidateSchema.safeParse(result).success);
});

it("reports runtime loading failures distinctly and leaves poster-only values alone when text tools are unavailable", async () => {
  const token = "<t:1795217400:t>", tools = createIntakeTimeTools(token, [], async () => { throw new Error("fixture import failure"); });
  assert.equal((await tools.call("resolve_event_time", resolve(token)) as { reason: string }).reason, "temporal_runtime_unavailable");
  assert.throws(() => tools.apply(blank()), /temporal_runtime_unavailable/);
  const poster = createIntakeTimeTools("", []), value = blank(); value.event.start = "18:00";
  assert.equal((await poster.call("resolve_event_time", resolve("November 21 at 18:00 UTC")) as { reason: string }).reason, "text_time_tool_unavailable");
  assert.equal(poster.apply(value).event.start, "18:00");
  for (const tool of intakeTimeTools) assert.doesNotMatch(JSON.stringify(tool.parameters), /"(?:minLength|oneOf|const|default|pattern|maxLength|minimum|maximum)":/);
});

it("holds the clock rather than discard conflicts when the evidence budget cannot fit both", async () => {
  const token = "<t:1795217400:t>", tools = createIntakeTimeTools(token, []);
  await tools.call("resolve_event_time", resolve(token));
  const value = blank(); value.evidence = Array.from({ length: 40 }, (_, index) => ({ fieldPath: `other.${index}`, origin: "text", excerpt: "Conflict", assessment: "conflicting" }));
  const result = tools.apply(value);
  assert.equal(result.event.start, null);
  assert.equal(result.evidence.length, 40);
  assert.ok(result.evidence.every(item => item.assessment === "conflicting"));
  assert.ok(result.questions.some(item => item.reason === "time_evidence_limit"));
});

it("retains an existing event's server-read timezone when an update model drops that context", async () => {
  const token = "<t:1795217400:t>", text = `Starts ${token}`;
  let turn = 0;
  const result = await extractEventIntake({ draftId: "fixture", sourceText: text, context: { trigger: "discord", communitySlug: "club" } }, {
    authorize: async () => ({ actorUserId: "fixture", version: 1 }), search_people: async () => [], search_communities: async () => [], enabled: true, apiKey: "fixture",
    list_events: async () => [{ slug: "event", title: "Event", eventDate: "2026-11-20", start: "19:00", lineupSummary: "" }],
    get_event: async () => ({ eventDate: "2026-11-20", timezone: "America/New_York", start: { time: "19:00" } }),
    fetchImplementation: async () => {
      const tool = (name: string, args: unknown) => Response.json({ status: "completed", output: [{ type: "function_call", name, call_id: String(turn), arguments: JSON.stringify(args) }] });
      if (++turn === 1) return tool("list_events", { limit: 1 });
      if (turn === 2) return tool("get_event", { slug: "event" });
      const value = blank(); Object.assign(value.event, { start: "00:50", startDate: "2026-11-21", eventDate: "2026-11-21", timezone: "UTC" });
      value.decision = { kind: "update", slug: "event" };
      value.evidence = [{ fieldPath: "event.start", origin: "text", excerpt: token, assessment: "explicit" }];
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
    },
  });
  assert.equal(result.event.timezone, "America/New_York");
  assert.equal(result.event.eventDate, "2026-11-20");
  assert.equal(result.event.start, "18:30");
});

it("requires tools for cited relative dates and lets a proven result correct the model's guessed day", async () => {
  const text = "Tomorrow at 6pm UTC";
  const tools = createIntakeTimeTools(text, [{ id: "post", text, referenceInstant: "2026-11-20T12:00:00Z" }]);
  const value = blank(); value.event.eventDate = "2026-11-25"; value.event.start = "18:00";
  value.evidence = ["event.eventDate", "event.start"].map(fieldPath => ({ fieldPath, origin: "text", excerpt: text, assessment: "explicit" }));
  const held = tools.apply(structuredClone(value));
  assert.equal(held.event.start, null);
  assert.equal(held.event.eventDate, null);
  await tools.call("resolve_event_time", resolve(text));
  const resolved = tools.apply(structuredClone(value));
  assert.equal(resolved.event.start, "18:00");
  assert.equal(resolved.event.eventDate, "2026-11-21");
  assert.deepEqual(resolved.questions, []);
});

it("accepts complete offset ISO instants and a later clock in a multi-clock source", async () => {
  const iso = "2026-11-21T18:00:00+02:00", absolute = createIntakeTimeTools(iso, []);
  const result = await absolute.call("resolve_event_time", resolve(iso)) as { instant: string };
  assert.equal(result.instant, "2026-11-21T16:00:00Z");
  const text = "Tomorrow UTC. Doors 18:00. Starts 19:00.", tools = createIntakeTimeTools(text, [{ id: "post", text, referenceInstant: "2026-11-20T12:00:00Z" }]);
  const date = await tools.call("resolve_event_time", resolve("Tomorrow")) as { candidateId: string };
  const later = await tools.call("set_event_clock", { fieldPath: "event.start", performerLabel: null, candidateId: date.candidateId, hour: 19, minute: 0 }) as { instant: string };
  assert.equal(later.instant, "2026-11-21T19:00:00Z");
});

it("makes failed lineup timing ineligible for a whole-lineup connector replacement", async () => {
  const token = "<t:1795217400:t>", text = `DJ A 30 minutes after ${token}`;
  const result = await extractEventIntake({ draftId: "fixture", sourceText: text }, {
    authorize: async () => ({ actorUserId: "fixture", version: 1 }), search_people: async () => [], search_communities: async () => [], enabled: true, apiKey: "fixture",
    fetchImplementation: async () => {
      const value = blank(); Object.assign(value.event, { eventDate: "2026-11-20", timezone: "UTC", start: "23:00" });
      value.lineup = [{ performerLabel: "DJ A", personSlug: null, roleLabel: null, start: "23:30", end: null, startDate: "2026-11-20", endDate: null }];
      value.evidence = [
        { fieldPath: "lineup.0.performerLabel", origin: "text", excerpt: "DJ A", assessment: "explicit" },
        { fieldPath: "lineup.0.start", origin: "text", excerpt: token, assessment: "explicit" },
      ];
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
    },
  });
  assert.equal(result.lineup[0].start, null);
  const sanitized = sanitizeRunEvidence(result, [{ content: text }] as never, false);
  assert.equal(explicitUpdateKeys(sanitized.evidence, "discord_announcements").includes("lineup"), false);
});

it("keeps an existing event's day when only an after-midnight end changes", async () => {
  const token = `<t:${Math.floor(Date.parse("2026-11-21T02:00:00Z") / 1000)}:t>`, text = `Ends ${token}`;
  let turn = 0;
  const result = await extractEventIntake({ draftId: "fixture", sourceText: text, context: { trigger: "discord", communitySlug: "club" } }, {
    authorize: async () => ({ actorUserId: "fixture", version: 1 }), search_people: async () => [], search_communities: async () => [], enabled: true, apiKey: "fixture",
    list_events: async () => [{ slug: "event", title: "Event", eventDate: "2026-11-20", start: "23:00", lineupSummary: "" }],
    get_event: async () => ({ eventDate: "2026-11-20", timezone: "UTC", start: { time: "23:00" } }),
    fetchImplementation: async () => {
      const tool = (name: string, args: unknown) => Response.json({ status: "completed", output: [{ type: "function_call", name, call_id: String(turn), arguments: JSON.stringify(args) }] });
      if (++turn === 1) return tool("list_events", { limit: 1 });
      if (turn === 2) return tool("get_event", { slug: "event" });
      const value = blank(); Object.assign(value.event, { end: "03:20", endDate: "2026-11-21", eventDate: "2026-11-21" });
      value.decision = { kind: "update", slug: "event" };
      value.evidence = [{ fieldPath: "event.end", origin: "text", excerpt: token, assessment: "explicit" }];
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
    },
  });
  assert.equal(result.event.eventDate, "2026-11-20");
  assert.equal(result.event.end, "02:00");
  assert.equal(result.event.endDate, "2026-11-21");
  assert.deepEqual(candidatePatch(result).tentative?.end, { time: "02:00", dayOffset: 1 });
});

it("preserves a correctly read wall clock when an anchorless surface needs date or timezone review", async () => {
  for (const text of ["Fri Dec 5, doors 10 PM", "Fri Dec 5, doors 10 PM EST"]) {
    const tools = createIntakeTimeTools(text, []);
    await tools.call("resolve_event_time", resolve(text));
    const value = blank(); value.event.start = "22:00";
    const result = tools.apply(value);
    assert.equal(result.event.start, "22:00");
    assert.ok(result.questions.length);
  }
  const text = "November 21, 2026 at 18:00", tools = createIntakeTimeTools(text, []);
  await tools.call("resolve_event_time", resolve("18:00"));
  const value = blank(); Object.assign(value.event, { eventDate: "2026-11-21", startDate: "2026-11-21", start: "18:00" });
  value.evidence = [{ fieldPath: "event.eventDate", origin: "text", excerpt: "November 21, 2026", assessment: "explicit" }];
  assert.equal(tools.apply(value).event.startDate, "2026-11-21");
});

it("refuses to give a reordered performer another person's resolved time", async () => {
  const token = "<t:1795217400:t>", tools = createIntakeTimeTools(`DJ A ${token}`, []);
  assert.ok("candidateId" in (await tools.call("resolve_event_time", resolve(token, "lineup.0.start", null, null, "DJ A")) as object));
  const value = blank(); value.lineup = [{ performerLabel: "New opener", personSlug: null, roleLabel: null, start: "19:00", end: null, startDate: "2026-11-20", endDate: null }];
  const result = tools.apply(value);
  assert.equal(result.lineup[0].start, null);
  assert.ok(result.questions.some(item => item.reason === "time_performer_changed"));
});

it("does not borrow a timezone from an unrelated clause, and recovers bracket-form field paths", async () => {
  const text = "Doors 22:00; pre-sale opens 10 AM PST";
  const tools = createIntakeTimeTools(text, [{ id: "post", text, referenceInstant: "2026-11-20T12:00:00Z" }]);
  assert.equal((await tools.call("resolve_event_time", resolve("22:00")) as { reason: string }).reason, "source_timezone_required");
  assert.ok("reason" in (await tools.call("resolve_event_time", resolve(text)) as object));
  const token = "<t:1795217400:t>", lineup = createIntakeTimeTools(`DJ A ${token}`, []);
  const result = await lineup.call("resolve_event_time", resolve(token, "lineup[0].start", null, null, "DJ A")) as { instant: string };
  assert.equal(result.instant, "2026-11-20T23:30:00Z");
});

it("keeps established event context when one performer's source context is missing", async () => {
  for (const text of ["DJ A Tomorrow at 6pm UTC", "DJ A Tomorrow at 6pm"]) {
    const tools = createIntakeTimeTools(text, []);
    await tools.call("resolve_event_time", resolve(text.slice(5), "lineup.0.start", null, null, "DJ A"));
    const value = blank(); Object.assign(value.event, { eventDate: "2026-11-21", timezone: "Europe/Berlin", start: "19:00" });
    value.lineup = [{ performerLabel: "DJ A", personSlug: null, roleLabel: null, start: "18:00", end: null, startDate: null, endDate: null }];
    const result = tools.apply(value, { eventDate: "2026-11-21", timezone: "Europe/Berlin" });
    assert.equal(result.event.eventDate, "2026-11-21");
    assert.equal(result.event.timezone, "Europe/Berlin");
    assert.equal(result.lineup[0].start, "18:00");
    assert.ok(result.questions.length);
  }
});

it("clears a superseded date hold after a complete start resolves", async () => {
  const text = "November 21, 2026 at 18:00 UTC", tools = createIntakeTimeTools(text, []);
  await tools.call("resolve_event_time", resolve("November 21", "event.eventDate", null, "UTC"));
  await tools.call("resolve_event_time", resolve(text));
  const result = tools.apply(blank());
  assert.equal(result.event.eventDate, "2026-11-21");
  assert.equal(result.event.start, "18:00");
  assert.ok(!result.questions.some(item => item.fieldPath === "event.eventDate"));
});

it("keeps an authored clock for review when an absolute date excerpt also says next", () => {
  const text = "Next Saturday, November 22, doors 10 PM", tools = createIntakeTimeTools(text, []);
  const value = blank(); value.event.start = "22:00";
  value.evidence = [{ fieldPath: "event.start", origin: "text", excerpt: text, assessment: "explicit" }];
  const result = tools.apply(value);
  assert.equal(result.event.start, "22:00");
  assert.ok(result.questions.some(item => item.reason === "source_reference_time_required"));
});

it("rejects a calendar-day shift into a DST gap", async () => {
  const text = "March 7, 2026 at 2:30 AM America/New_York", tools = createIntakeTimeTools(text, []);
  const base = await tools.call("resolve_event_time", resolve(text)) as { candidateId: string };
  assert.ok(base.candidateId);
  assert.ok("reason" in (await tools.call("shift_event_time", shift(base.candidateId, { days: 1 })) as object));
  assert.equal(tools.apply(blank()).event.start, null);
});

it("validates full meridiem tokens without accepting their colon-clock substring", async () => {
  for (const hour of [6, 18]) {
    const text = "Tomorrow UTC. Starts 6:30 PM.", tools = createIntakeTimeTools(text, [{ id: "post", text, referenceInstant: "2026-11-20T12:00:00Z" }]);
    const base = await tools.call("resolve_event_time", resolve("Tomorrow")) as { candidateId: string };
    const result = await tools.call("set_event_clock", { fieldPath: "event.start", performerLabel: null, candidateId: base.candidateId, hour, minute: 30 }) as object;
    assert.equal("candidateId" in result, hour === 18);
  }
});
