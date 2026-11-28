import assert from "node:assert/strict";
import { it } from "node:test";
import { authoredEventSchedule, isInScheduledWatchWindow, publicScheduleStatus, timedEventRuntimeEndAt } from "../../convex/_eventRuntime";

it("uses the same inclusive unknown-end window for the live status and watch control", () => {
  const startAt = 1_800_000_000_000;
  const closesAt = startAt + 6 * 3_600_000;
  for (const endAt of [undefined, null]) assert.equal(timedEventRuntimeEndAt({ startAt, endAt }), closesAt);
  const event = { startAt };
  assert.equal(publicScheduleStatus(event, startAt - 3 * 3_600_000), "later");
  assert.equal(publicScheduleStatus(event, startAt - 1), "soon");
  assert.equal(isInScheduledWatchWindow({ ...event, now: startAt - 1 }), false);
  for (const now of [startAt, startAt + 1, closesAt]) {
    assert.equal(publicScheduleStatus(event, now), "now");
    assert.equal(isInScheduledWatchWindow({ ...event, now }), true);
  }
  assert.notEqual(publicScheduleStatus(event, closesAt + 1), "now");
  assert.equal(isInScheduledWatchWindow({ ...event, now: closesAt + 1 }), false);
  assert.equal(isInScheduledWatchWindow({ ...event, now: null }), false);
});

it("preserves authored ends, doors-open watch entry and date-only status", () => {
  const event = { startAt: 100_000, endAt: 110_000, doorsOpenAt: 90_000 };
  assert.equal(isInScheduledWatchWindow({ ...event, now: 89_999 }), false);
  assert.equal(isInScheduledWatchWindow({ ...event, now: 90_000 }), true);
  assert.equal(publicScheduleStatus(event, 90_000), "soon");
  assert.equal(isInScheduledWatchWindow({ ...event, now: 110_000 }), true);
  assert.equal(publicScheduleStatus(event, 110_000), "now");
  assert.equal(isInScheduledWatchWindow({ ...event, now: 110_001 }), false);
  assert.notEqual(publicScheduleStatus(event, 110_001), "now");
  assert.equal(publicScheduleStatus({ ...event, scheduleKind: "date_only" }, 100_000), "later");
  assert.equal(publicScheduleStatus({ scheduleKind: "date_only" }, 100_000), "later");
});

it("requires a current authored timed range for a schedule label", () => {
  const event = { startAt: 100_000, endAt: 110_000, scheduleKind: "timed" as const };
  assert.deepEqual(authoredEventSchedule(event, 99_999), { scheduledNow: false, nextTransition: 100_000 });
  for (const now of [100_000, 105_000, 110_000]) {
    assert.deepEqual(authoredEventSchedule(event, now), { scheduledNow: true, nextTransition: 110_001 });
  }
  assert.deepEqual(authoredEventSchedule(event, 110_001), { scheduledNow: false });
  assert.equal(authoredEventSchedule({ startAt: 100_000, endAt: 110_000 }, 105_000).scheduledNow, true);
  for (const unconfirmed of [
    { endAt: undefined },
    { endAt: 100_000 },
    { endAt: 99_999 },
    { endAt: Number.POSITIVE_INFINITY },
    { startAt: Number.NEGATIVE_INFINITY },
    { scheduleKind: "date_only" as const },
    { status: "cancelled" as const },
  ]) {
    assert.deepEqual(authoredEventSchedule({ ...event, ...unconfirmed }, 105_000), { scheduledNow: false });
  }
});
