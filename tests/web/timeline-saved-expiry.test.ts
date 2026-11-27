import assert from "node:assert/strict";
import { it } from "node:test";
import type { SavedResolution, TimelineSchedule } from "../../convex/_eventTimelineTypes";
import { isPastSaved, nextSavedStart } from "../../apps/web/src/lib/timeline/plan-actions";
import { PLAN_LIMIT, reducePreferences, type TimelinePreferences } from "../../apps/web/src/lib/timeline/preferences";

const now = Date.UTC(2026, 10, 17, 12);
const hour = 3_600_000;
function saved(schedule: TimelineSchedule): SavedResolution {
  return { kind: "available", reference: { kind: "event", eventId: "event" }, status: "scheduled",
    event: { id: "event", slug: "event", title: "Event", status: "scheduled", schedule } };
}

it("expires ended events at the boundary but retains an ongoing event and saved references", () => {
  const ended = saved({ kind: "timed", startAt: now - 72 * hour, endAt: now - 71 * hour });
  const ongoing = saved({ kind: "timed", startAt: now - hour, endAt: now + hour });
  const plan = [ended, ongoing];
  const before = JSON.stringify(plan);
  assert.equal(isPastSaved(ended, now), true);
  assert.equal(isPastSaved(ongoing, now), false);
  assert.equal(isPastSaved(ongoing, now + hour), true);
  assert.equal(nextSavedStart(plan, now + 12 * hour, now), now - hour);
  assert.equal(JSON.stringify(plan), before);
});

it("Next saved skips expired and cancelled entries when wrapping or looking ahead", () => {
  const expired = saved({ kind: "timed", startAt: now - 72 * hour, endAt: now - 71 * hour });
  const future = saved({ kind: "timed", startAt: now + 24 * hour, endAt: now + 25 * hour });
  const cancelled = { ...saved({ kind: "timed", startAt: now + hour, endAt: now + 2 * hour }), status: "cancelled" } as SavedResolution;
  const unavailable: SavedResolution = { kind: "unavailable", reference: { kind: "event", eventId: "private" } };
  assert.equal(nextSavedStart([expired, cancelled, unavailable, future], now, now), now + 24 * hour);
  assert.equal(nextSavedStart([expired, future], now + 48 * hour, now), now + 24 * hour);
  assert.equal(nextSavedStart([expired, cancelled, unavailable], now, now), undefined);
  assert.equal(isPastSaved(unavailable, now), false, "keep removal available when dates cannot be resolved");
});

it("open-ended selections use the shared six-hour runtime limit", () => {
  const open = saved({ kind: "open_end", startAt: now - 5 * hour });
  assert.equal(isPastSaved(open, now), false);
  assert.equal(isPastSaved(open, now + hour), true);
  assert.equal(nextSavedStart([open], now, now + hour), undefined);
});

it("date-only selections keep the backend global grace without inventing a start", () => {
  const day = saved({ kind: "date_only", eventDate: "2026-11-16" });
  const midnightUTC = Date.UTC(2026, 10, 17, 1);
  assert.equal(isPastSaved(day, midnightUTC), false);
  assert.equal(isPastSaved(day, midnightUTC), false);
  const globalEnd = Date.UTC(2026, 10, 17, 12);
  assert.equal(isPastSaved(day, globalEnd - 1), false);
  assert.equal(isPastSaved(day, globalEnd), true);
  assert.equal(nextSavedStart([day], midnightUTC, midnightUTC), undefined);
});

it("selected sets expire at their own end while the parent event remains ongoing", () => {
  const parent = saved({ kind: "timed", startAt: now - 2 * hour, endAt: now + 2 * hour });
  if (parent.kind !== "available") throw Error("Expected available event");
  const set: SavedResolution = { ...parent, reference: { kind: "set", eventId: "event", slotId: "slot" },
    slot: { id: "slot", eventId: "event", displayLabel: "DJ", schedule: { kind: "timed", startAt: now - hour, endAt: now } } };
  assert.equal(isPastSaved(parent, now), false);
  assert.equal(isPastSaved(set, now), true);
  assert.equal(nextSavedStart([set], now, now), undefined);
});

it("clearing selected past references frees a full plan without removing other saves", () => {
  const past = { kind: "set", eventId: "event", slotId: "past" } as const;
  const upcoming = { kind: "set", eventId: "event", slotId: "upcoming" } as const;
  const other = Array.from({ length: PLAN_LIMIT - 2 }, (_, index) => ({ kind: "event" as const, eventId: String(index) }));
  const full: TimelinePreferences = { version: 1, plan: [past, upcoming, ...other], favoriteProfileIds: ["favorite"] };
  const add = { type: "add-plan", reference: { kind: "event", eventId: "new" } } as const;
  assert.equal(reducePreferences(full, add).outcome, "limit");
  const cleared = reducePreferences(full, { type: "remove-plans", references: [past] });
  assert.equal(cleared.outcome, "changed");
  assert.deepEqual(cleared.state.plan, [upcoming, ...other]);
  assert.deepEqual(cleared.state.favoriteProfileIds, full.favoriteProfileIds);
  assert.equal(reducePreferences(cleared.state, add).outcome, "changed");
});
