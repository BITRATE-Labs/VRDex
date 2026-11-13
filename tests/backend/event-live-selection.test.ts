import assert from "node:assert/strict";
import { test } from "node:test";
import { eventLiveSource, dueLiveSources } from "../../convex/_eventLive";

const stream = { streamId: "aurora", pcUrl: "rtspt://stream.vrcdn.live/live/aurora", questUrl: "https://stream.vrcdn.live/live/aurora.live.ts" };
const event = { status: "scheduled" as const, startAt: 100, endAt: 400, watchMode: "performer_sequence" as const, watchSurfaceEnabled: false,
  mediaLinks: [], slots: [ { position: 0, playbackKey: "a", startAt: 100, endAt: 200, stream },
    { position: 1, playbackKey: "b", startAt: 200, endAt: 300 },
    { position: 2, playbackKey: "c", startAt: 300, stream } ] };
test("live candidates use the actual current source, not another linked performer", () => {
  assert.deepEqual(eventLiveSource(event, 150), { key: "vrcdn:aurora", provider: "vrcdn", identity: "aurora", slotKey: "a", validUntil: 200 });
  assert.equal(eventLiveSource(event, 250), null);
  assert.equal(eventLiveSource(event, 99), null);
  assert.equal(eventLiveSource(event, 401), null);
  assert.equal(eventLiveSource({ ...event, status: "cancelled" }, 150), null);
  assert.equal(eventLiveSource({ ...event, scheduleKind: "date_only" }, 150), null);
});
test("enabled event stream takes precedence, including an unsupported first stream", () => {
  const explicit = { ...event, watchSurfaceEnabled: true, watchMode: "event_stream" as const,
    mediaLinks: [{ type: "watch", url: "https://twitch.tv/BasicBit" }] };
  assert.deepEqual(eventLiveSource(explicit, 250), { key: "twitch:basicbit", provider: "twitch", identity: "basicbit", validUntil: 400 });
  assert.equal(eventLiveSource({ ...explicit, mediaLinks: [{ type: "watch", url: "https://example.com/unknown" }] }, 150), null);
});
test("current selection infers ends and rejects overlapping ambiguity", () => {
  const inferred = { ...event, slots: [{ ...event.slots[0], endAt: undefined }, event.slots[1]] };
  assert.equal(eventLiveSource(inferred, 250), null);
  assert.equal(eventLiveSource({ ...event, slots: [{ ...event.slots[0], endAt: 350 }, event.slots[1]] }, 250), null);
});
test("source work is deduplicated, oldest-first, and capped fairly", () => {
  const sources = Array.from({ length: 25 }, (_, i) => ({ key: `vrcdn:${i}`, provider: "vrcdn" as const, identity: String(i) }));
  const observed = new Map(sources.map((s, i) => [s.key, i]));
  const first = dueLiveSources([...sources, sources[0]], observed);
  assert.equal(first.length, 20);
  assert.equal(new Set(first.map(s => s.key)).size, 20);
  first.forEach(s => observed.set(s.key, 100));
  assert.deepEqual(dueLiveSources(sources, observed).slice(0, 5).map(s => s.key), sources.slice(20).map(s => s.key));
});
