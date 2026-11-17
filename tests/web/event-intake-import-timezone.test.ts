import assert from "node:assert/strict";
import { it } from "node:test";
import { acceptIntakeSuggestion, setImportedEventTimezone } from "../../apps/web/src/lib/calendar/event-intake-suggestions";

it("one explicit zone unlocks dated imported sets and preserves overnight offsets", () => {
  const fields = {
    eventDate: "2026-11-29",
    tentative: { lineup: [
      { clientKey: "first", position: 0, start: { time: "23:00", dayOffset: 0 } },
      { clientKey: "second", position: 1, start: { time: "00:00", dayOffset: 1 } },
    ] },
    questions: ["lineup.0.start: date_timezone_required", "lineup.1.start: date_timezone_required", "event.venueLabel: Unknown venue"],
  };
  const resolved = setImportedEventTimezone(fields, "Asia/Tokyo");
  const accepted = acceptIntakeSuggestion({ fields: resolved, acceptance: { key: "lineup", proposalDate: undefined } });
  assert.deepEqual(accepted?.lineup?.map(row => row.start?.dayOffset), [0, 1]);
  assert.deepEqual(accepted?.questions, ["event.venueLabel: Unknown venue"]);
});

it("choosing the zone preserves unknown dates and guards ambiguous clocks", () => {
  for (const [start, question] of [
    [{ time: "01:30" }, "lineup.0.start: date_timezone_required"],
    [{ time: "01:30", dayOffset: 0 }, "lineup.0.start: date_timezone_required (2026-10-08)"],
    [{ time: "01:30", dayOffset: 0 }, "lineup.0.start: start_date_required"],
    [{ time: "01:30", dayOffset: 0 }, "lineup.0.start: date_timezone_required"],
  ] as const) {
    const resolved = setImportedEventTimezone({
      eventDate: "2026-11-01",
      tentative: { lineup: [{ clientKey: "first", position: 0, start }] },
      questions: [question],
    }, "America/New_York");
    assert.equal(acceptIntakeSuggestion({ fields: resolved, acceptance: { key: "lineup", proposalDate: undefined } }), null);
  }
});
