import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createFixture, capacityReplayArguments, probeFixture } from "../../scripts/event-capacity-media.mjs";

const execute = promisify(execFile);
const ffmpegAvailable = !spawnSync("ffmpeg", ["-version"], { windowsHide: true, stdio: "ignore" }).error;
const owner = {
  async run(command, args, options = {}) {
    const { stdout } = await execute(command, args, {
      encoding: "buffer", windowsHide: true,
      timeout: options.timeoutMs ?? 180000, maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  },
};

// The fixture's normal noise floor is above this diagnostic threshold.
// Check the complete interior, including every loop seam, not selected good windows.
function longestQuietRunMs(pcm) {
  const frames = Math.floor(pcm.length / 2 / 48);
  let run = 0, longest = 0;
  for (let frame = 200; frame < frames - 200; frame++) {
    let energy = 0;
    for (let sample = 0; sample < 48; sample++) {
      const value = pcm.readInt16LE((frame * 48 + sample) * 2) / 32768;
      energy += value * value;
    }
    run = Math.sqrt(energy / 48) < 0.02 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}
async function decodedAudio(file) {
  return owner.run("ffmpeg", ["-v", "error", "-i", file, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1"]);
}

test("capacity replay preserves audio across encoded fixture loop seams", {
  skip: !ffmpegAvailable, timeout: 180000,
}, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "vrdex-capacity-replay-"));
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + "vrdex-capacity-replay-"));
    await rm(directory, { recursive: true, force: true });
  });
  const legacy = path.join(directory, "legacy.ts");
  await createFixture(owner, legacy, "a");
  const copied = path.join(directory, "copied.ts");
  await owner.run("ffmpeg", ["-v", "error", "-stream_loop", "2", "-i", legacy, "-c", "copy", "-t", "25", "-f", "mpegts", copied]);
  const legacyQuiet = longestQuietRunMs(await decodedAudio(copied));
  assert.ok(legacyQuiet >= 10, "old AAC packet replay must reproduce the silent seam");

  const intermediate = path.join(directory, "continuous.nut");
  await createFixture(owner, intermediate, "a", { replayIntermediate: true });
  const args = capacityReplayArguments(intermediate, directory);
  args.splice(args.indexOf("-re"), 1);
  args[args.indexOf("-hls_list_size") + 1] = "0";
  args[args.indexOf("-hls_flags") + 1] = "temp_file";
  args.splice(args.length - 1, 0, "-t", "25");
  await owner.run("ffmpeg", args);
  const playlist = path.join(directory, "index.m3u8");
  const facts = await probeFixture(owner, playlist);
  assert.equal(facts.videoCodec, "h264");
  assert.equal(facts.fps, 60);
  assert.equal(facts.audioCodec, "aac");
  assert.equal(facts.sampleRate, 48000);
  const video = JSON.parse(await owner.run("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_frames",
    "-show_entries", "frame=best_effort_timestamp", "-of", "json", playlist,
  ]));
  const videoTimes = video.frames.map(frame => Number(frame.best_effort_timestamp));
  assert.ok(videoTimes.length >= 25 * 60 - 1);
  for (let i = 1; i < videoTimes.length; i++) {
    assert.equal(videoTimes[i] - videoTimes[i - 1], 1500, "60fps video stays continuous across loop boundaries");
  }
  const audio = JSON.parse(await owner.run("ffprobe", [
    "-v", "error", "-select_streams", "a:0", "-show_packets",
    "-show_entries", "packet=pts,duration", "-of", "json", playlist,
  ]));
  for (let i = 1; i < audio.packets.length; i++) {
    assert.equal(Number(audio.packets[i].pts),
      Number(audio.packets[i - 1].pts) + Number(audio.packets[i - 1].duration),
      "AAC packets stay continuous across loop boundaries");
  }
  const continuousQuiet = longestQuietRunMs(await decodedAudio(playlist));
  t.diagnostic(JSON.stringify({ legacyQuietMs: legacyQuiet, continuousQuietMs: continuousQuiet }));
  assert.ok(continuousQuiet < 4, "continuous AAC encoder must not repeat startup/padding silence");
});

