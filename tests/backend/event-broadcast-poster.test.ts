import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { loadPosterHoldFrame } from "../../workers/restream/poster-hold-frame.mjs";

test("hold artwork accepts supported attachment URLs and fits the full poster", async (t) => {
  const image = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=white:s=8x16",
    "-frames:v", "1", "-threads", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1",
  ], { timeout: 5000 });
  if ((image.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
    t.skip("FFmpeg is unavailable");
    return;
  }
  assert.equal(image.status, 0, image.stderr?.toString());
  let downloads = 0;
  const options = {
    ffmpeg: "ffmpeg",
    profile: { width: 32, height: 16 },
    signal: new AbortController().signal,
    fetchPoster: async (_url: URL, request: RequestInit) => {
      downloads++;
      assert.equal(request.redirect, "error");
      return new Response(new Uint8Array(image.stdout), { headers: { "content-type": "image/png" } });
    },
  };
  assert.equal(await loadPosterHoldFrame("https://localhost/attachments/12/34/a.png", options), undefined);
  assert.equal(await loadPosterHoldFrame("https://vrdex.net/api/private", options), undefined);
  assert.equal(downloads, 0);
  const frame = await loadPosterHoldFrame("https://cdn.discordapp.com/attachments/12/34/a.png", options);
  assert.equal(downloads, 1);
  assert.equal(frame?.length, 32 * 16 * 1.5);
  assert.equal(frame?.[0], 16);
  assert.equal(frame?.[16], 235);
});
