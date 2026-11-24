import assert from "node:assert/strict";
import { test } from "node:test";
import { ForegroundPlayback } from "../../apps/web/src/lib/foreground-playback";
test("foreground handoff stops predecessor synchronously and stale release cannot clear successor", () => {
  const foreground = new ForegroundPlayback(); const a = {}, b = {}, c = {}; const stopped: string[] = [];
  foreground.acquire(a, () => { stopped.push("a"); foreground.release(a); });
  foreground.acquire(b, () => stopped.push("b")); assert.deepEqual(stopped, ["a"]);
  foreground.acquire(b, () => stopped.push("duplicate")); assert.deepEqual(stopped, ["a"]);
  foreground.acquire(c, () => {}); assert.deepEqual(stopped, ["a", "b"]);
  foreground.release(c); foreground.acquire(a, () => {}); assert.deepEqual(stopped, ["a", "b"]);
});

test("music audio-session ownership survives handoff and restores only its own setting", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const session = { type: "auto" };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { audioSession: session } });
  const foreground = new ForegroundPlayback(), a = {}, b = {};
  try {
    foreground.acquire(a, () => foreground.release(a)); assert.equal(session.type, "playback");
    foreground.acquire(b, () => {}); foreground.release(a); assert.equal(session.type, "playback");
    foreground.release(b); assert.equal(session.type, "auto");
    foreground.acquire(a, () => {}); session.type = "play-and-record";
    foreground.release(a); assert.equal(session.type, "play-and-record", "another audio use must not be overwritten");
  } finally { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else Reflect.deleteProperty(globalThis, "navigator"); }
});

test("audio-session API rejection does not prevent playback handoff", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { audioSession: { get type() { return "auto"; }, set type(_value: string) { throw Error("Unavailable"); } } } });
  try {
    const foreground = new ForegroundPlayback(), a = {}, b = {}; let stopped = false;
    foreground.acquire(a, () => { stopped = true; }); foreground.acquire(b, () => {});
    assert.equal(stopped, true); foreground.release(b);
  } finally { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else Reflect.deleteProperty(globalThis, "navigator"); }
});
