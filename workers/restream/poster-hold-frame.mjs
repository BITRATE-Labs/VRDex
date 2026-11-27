import { spawn } from "node:child_process";
import { buffer } from "node:stream/consumers";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";

const MAX_POSTER_BYTES = 12 * 1024 * 1024;
const MAX_POSTER_PIXELS = 16_000_000;
const discordHosts = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const vrdexHosts = new Set(["vrdex.net", "sandbox.vrdex.net", "staging.vrdex.net"]);
const demuxers = new Map([
  ["image/png", "png_pipe"],
  ["image/jpeg", "jpeg_pipe"],
  ["image/webp", "webp_pipe"],
]);

function posterUrl(value) {
  const url = URL.parse(value);
  if (!url || url.protocol !== "https:" || url.port || url.username || url.password) return;
  if (discordHosts.has(url.hostname) && /^\/attachments\/\d+\/\d+\/[^/]+$/.test(url.pathname)) return url;
  if (vrdexHosts.has(url.hostname) && !url.search &&
      /^\/api\/v0\/events\/[a-z0-9]+\/artwork\/[a-z0-9]+$/.test(url.pathname)) return url;
}

async function downloadPoster(url, fetchPoster, signal) {
  const response = await fetchPoster(url, { redirect: "error", signal });
  const demuxer = demuxers.get(response.headers.get("content-type")?.split(";")[0].trim());
  if (!response.ok || !demuxer || !response.body ||
      Number(response.headers.get("content-length")) > MAX_POSTER_BYTES) {
    await response.body?.cancel();
    return;
  }
  const chunks = [];
  let bytes = 0;
  await pipeline(response.body, new Writable({
    write(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > MAX_POSTER_BYTES) return done(new Error("Poster exceeds size limit"));
      chunks.push(chunk);
      done();
    },
  }), { signal });
  return { image: Buffer.concat(chunks, bytes), demuxer };
}

export async function loadPosterHoldFrame(value, { ffmpeg, profile, signal, fetchPoster = fetch }) {
  const url = posterUrl(value);
  if (!url) return;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  const poster = await downloadPoster(url, fetchPoster, deadline);
  if (!poster) return;
  const { width, height } = profile;
  const frameBytes = width * height * 3 / 2;
  const child = spawn(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-protocol_whitelist", "pipe", "-f", poster.demuxer, "-threads", "1",
    "-max_pixels", String(MAX_POSTER_PIXELS), "-i", "pipe:0",
    "-filter_threads", "1", "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
    "-frames:v", "1", "-threads", "1", "-f", "rawvideo", "pipe:1",
  ], { stdio: ["pipe", "pipe", "ignore"], signal: deadline, killSignal: "SIGKILL" });
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  child.stdin.on("error", () => {});
  child.stdin.end(poster.image);
  const [code, frame] = await Promise.all([exit, buffer(child.stdout)]);
  if (code === 0 && frame?.length === frameBytes) return frame;
}
