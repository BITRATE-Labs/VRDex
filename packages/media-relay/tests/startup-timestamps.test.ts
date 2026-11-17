import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STARTUP_VIDEO_TIMESTAMPS } from "../src/worker/packager";
const run = promisify(execFile);

test("repair the initial duplicate DTS while preserving later timestamp failures", { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "relay-startup-dts-"));
  try {
    const input = join(directory, "input.mp4");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=128x72:rate=10", "-t", "1", "-c:v", "libx264", "-bf", "0", input]);
    const remux = async (packet: number, repair: boolean, name: string) => {
      const duplicate = `setts=dts='if(eq(N,${packet}),PREV_OUTDTS,DTS)'`;
      return run("ffmpeg", ["-v", "warning", "-i", input, "-map", "0:v:0", "-c", "copy", "-bsf:v", duplicate + (repair ? `,${STARTUP_VIDEO_TIMESTAMPS}` : ""), "-f", "mpegts", join(directory, name)]);
    };
    assert.match((await remux(1, false, "duplicate.ts")).stderr, /non.monoton/i);
    assert.doesNotMatch((await remux(1, true, "repaired.ts")).stderr, /non.monoton/i);
    const packets = JSON.parse((await run("ffprobe", ["-v", "error", "-show_entries", "packet=dts", "-of", "json", join(directory, "repaired.ts")])).stdout).packets;
    assert(packets.length >= 2);
    assert(Number(packets[1].dts) > Number(packets[0].dts));
    assert.match((await remux(5, true, "later-duplicate.ts")).stderr, /non.monoton/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
