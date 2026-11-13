import assert from "node:assert/strict";
import { test } from "node:test";
import { createAudioBuffer } from "../src/worker/audio-buffer";

test("audio ingest enforces aggregate bytes before retaining segments and never evicts a live playlist", () => {
  const buffer = createAudioBuffer({ maxSegmentBytes: 8, maxBytes: 24, maxSegments: 3 });
  buffer.put("audio-0.ts", Buffer.from("12345678"));
  buffer.put("audio-1.ts", Buffer.from("12345678"));
  const playlist = "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\naudio-0.ts\n#EXTINF:2,\naudio-1.ts\n";
  buffer.publish(playlist);
  assert.equal(buffer.get("audio-0.ts")?.toString(), "12345678");
  assert.throws(() => buffer.put("audio-0.ts", Buffer.from("changed")), /immutable/);
  assert.throws(() => buffer.put("audio-2.ts", Buffer.alloc(9)), /limit/);
  buffer.put("audio-2.ts", Buffer.alloc(8));
  assert.throws(() => buffer.put("audio-3.ts", Buffer.alloc(1)), /limit/);
  assert.equal(buffer.get("audio-0.ts")?.length, 8);
  buffer.publish(playlist.replace(/audio-0/g, "audio-2"));
  assert.equal(buffer.get("audio-0.ts"), undefined);
  assert.equal(buffer.bytes(), 16);
});

test("only audio segments in complete bounded playlists become visible", () => {
  const buffer = createAudioBuffer();
  buffer.put("audio-0.ts", Buffer.alloc(188));
  assert.equal(buffer.get("audio-0.ts"), undefined);
  assert.throws(() => buffer.publish("#EXTM3U\n#EXTINF:2,\nhttp://internal/audio-0.ts\n"), /playlist/);
  assert.throws(() => buffer.publish("#EXTM3U\n#EXTINF:2,\naudio-1.ts\n"), /playlist/);
  assert.throws(() => buffer.put("video-0.ts", Buffer.alloc(188)), /segment/);
  assert.throws(() => buffer.publish('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="http://internal/key"\n#EXTINF:2,\naudio-0.ts\n'), /playlist/);
  assert.throws(() => buffer.publish("#EXTM3U\n#EXTINF:2,\naudio-0.ts\n#EXTINF:2,\naudio-0.ts\n"), /playlist/);
  buffer.close();
  assert.equal(buffer.bytes(), 0);
  assert.throws(() => buffer.put("audio-1.ts", Buffer.alloc(188)), /closed/);
});

test("stalled or clock-reversed audio publication stops serving old media", () => {
  let now = 1000;
  const buffer = createAudioBuffer({ clock: () => now });
  buffer.put("audio-0.ts", Buffer.alloc(188));
  buffer.publish("#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\naudio-0.ts\n");
  assert(buffer.get("audio.m3u8"));
  now = 11000;
  assert.equal(buffer.get("audio.m3u8"), undefined);
  assert.equal(buffer.get("audio-0.ts"), undefined);
  now = 999;
  assert.equal(buffer.get("audio.m3u8"), undefined);
});
