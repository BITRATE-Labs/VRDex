import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventPlaybackAdapter } from "../../apps/web/src/lib/event-playback-adapters";
import type { PlaybackRequest } from "../../apps/web/src/lib/event-playback-owner";
class Video extends EventTarget {
  muted = true; volume = 1; paused = true; src = ""; title = ""; controls = false;
  playsInline = false; className = ""; removed = false;
  canPlayType() { return ""; }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
  removeAttribute() { this.src = ""; }
  load() {}
  remove() { this.removed = true; }
}
const request: PlaybackRequest = { kind: "direct_media", eventId: "event", eventSlug: "show", href: "/show", title: "Clip", startAt: 0, sourceId: "clip", src: "https://media.example.org/clip.mp4", transport: "video" };
function fixture() {
  const original = globalThis.document;
  const video = new Video();
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => video } });
  return { video, mount: { append() {} } as unknown as HTMLElement, restore() { Object.defineProperty(globalThis, "document", { configurable: true, value: original }); } };
}
test("direct native preview controls acquire foreground before unmute and handle queued events once", async () => {
  const f = fixture(); let adapter: ReturnType<typeof createEventPlaybackAdapter> | undefined;
  try {
    let allowed = false, calls = 0;
    adapter = createEventPlaybackAdapter(request, f.mount, () => {});
    assert.equal(adapter.media, f.video);
    adapter.enableControls?.(() => { calls++; assert.equal(f.video.muted, true); return allowed; });
    assert.equal(f.video.controls, true); assert.equal(await adapter.play(), true); assert.equal(f.video.src, request.src);
    f.video.muted = false; f.video.dispatchEvent(new Event("volumechange")); assert.equal(f.video.muted, true); assert.equal(calls, 1);
    allowed = true; f.video.muted = false; f.video.dispatchEvent(new Event("volumechange")); assert.equal(f.video.muted, false);
    f.video.dispatchEvent(new Event("volumechange")); f.video.dispatchEvent(new Event("volumechange")); assert.equal(calls, 2);
    adapter.setMuted(true); f.video.muted = false; f.video.dispatchEvent(new Event("volumechange")); assert.equal(calls, 3);
    adapter.dispose(); f.video.muted = false; f.video.dispatchEvent(new Event("volumechange")); assert.equal(calls, 3); assert.equal(f.video.removed, true);
  } finally { adapter?.dispose(); f.restore(); }
});
test("direct HLS preview uses bounded MSE player and disposes its ownership", async () => {
  const f = fixture(); const calls: unknown[] = []; let destroyed = 0;
  class Hls {
    static Events = { ERROR: "error" }; static isSupported() { return true; }
    constructor(options: unknown) { calls.push(options); }
    on() {}
    loadSource(src: string) { calls.push(src); }
    attachMedia(video: unknown) { assert.equal(video, f.video); }
    destroy() { destroyed++; }
  }
  const adapter = createEventPlaybackAdapter({ ...request, transport: "hls", src: "https://media.example.org/live.m3u8" }, f.mount, () => {}, undefined, async () => ({ default: Hls }) as any);
  try { assert.equal(await adapter.play(), true); assert.deepEqual(calls, [{ enableWorker: true, maxBufferLength: 15, maxMaxBufferLength: 30 }, "https://media.example.org/live.m3u8"]); } finally { adapter.dispose(); f.restore(); }
  assert.equal(destroyed, 1);
});
