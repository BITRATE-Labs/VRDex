import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, until, source } from "./packager-fixture";
import { startAudioPackager } from "../src/worker/audio-packager";
import { createAudioDelivery } from "../src/gateway/audio-delivery";

test("real bounded audio-only packaging publishes native HLS without a video rendition or scratch output", { timeout: 30000 }, async () => {
  const f = await fixture();
  let stop: (() => Promise<void>) | undefined;
  try {
    const failures: string[] = [];
    const packager = await startAudioPackager({ source, epoch: 1, createRelay: f.createRelay,
      lifetimeMs: 20000, upstreamByteLimit: 4 * 1024 * 1024,
      signal: new AbortController().signal, onFailure: reason => failures.push(reason) });
    stop = packager.stop;
    await until(() => !!packager.buffer.get("audio.m3u8"));
    const capability = "fixture-audio-capability-1234567890";
    const delivery = createAudioDelivery({ capability, expiresAt: Date.now() + 20000, clock: Date.now,
      maxRequests: 20, maxPayloadBytes: 1024 * 1024, authorize: async () => true,
      read: name => packager.buffer.get(name) });
    const read = (name: string) => delivery(new Request(`https://audio.invalid/p/${capability}/audio/${name}`));
    const playlist = await read("index.m3u8");
    assert.equal(playlist.status, 200);
    const text = await playlist.text();
    const name = text.split(/\r?\n/).find(line => /^audio-\d+\.ts$/.test(line));
    assert(name);
    const delivered = await read(name);
    assert.equal(delivered.status, 200);
    const segment = Buffer.from(await delivered.arrayBuffer());
    const path = join(f.directory, "probe-audio.ts");
    await writeFile(path, segment);
    const { stdout } = await promisify(execFile)("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type", "-of", "json", path]);
    const probe = JSON.parse(stdout);
    assert(probe.streams.length > 0);
    assert(probe.streams.every((stream: { codec_name: string; codec_type: string }) => stream.codec_type === "audio" && stream.codec_name === "aac"));
    assert.equal(packager.buffer.get("video.m3u8"), undefined);
    assert.equal((await read("video-0.ts")).status, 404);
    assert(packager.buffer.bytes() <= 1024 * 1024);
    assert.equal(f.counts().maximum, 1);
    assert.deepEqual(failures, []);
    await packager.stop();
    assert.equal(packager.buffer.bytes(), 0);
    assert.equal(f.counts().active, 0);
  } finally { await stop?.(); await f.close(); }
});

test("upstream byte exhaustion stops the owned audio child and guarded provider acquisition", { timeout: 15000 }, async () => {
  const f = await fixture();
  let stop: (() => Promise<void>) | undefined;
  try {
    const failures: string[] = [];
    const packager = await startAudioPackager({ source, epoch: 1, createRelay: f.createRelay,
      lifetimeMs: 10000, upstreamByteLimit: 8192, signal: new AbortController().signal,
      onFailure: reason => failures.push(reason) });
    stop = packager.stop;
    await until(() => failures.length > 0);
    await packager.stop();
    assert.deepEqual(failures, ["audio_source_limit_or_unavailable"]);
    assert(packager.upstreamBytes() <= 8192);
    assert.equal(f.counts().active, 0);
    assert.equal(packager.buffer.bytes(), 0);
  } finally { await stop?.(); await f.close(); }
});
