import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createSourceRelay } from "../../../../workers/restream/source-relay.mjs";
import { parseSourceDescriptor, type SourceDescriptor } from "../contracts";
import { createAudioBuffer } from "./audio-buffer";

/** Finite rehearsal producer, no public listener, files, video output or release-gate override. */
export async function startAudioPackager(options: {
  source: SourceDescriptor;
  epoch: number;
  lifetimeMs: number;
  upstreamByteLimit: number;
  signal: AbortSignal;
  onFailure(reason: string): void;
  createRelay?: typeof createSourceRelay;
  ffmpegPath?: string;
}) {
  const source = parseSourceDescriptor(options.source);
  if (!Number.isSafeInteger(options.epoch) || options.epoch < 1 ||
      !Number.isSafeInteger(options.lifetimeMs) || options.lifetimeMs < 1000 || options.lifetimeMs > 900000 ||
      !Number.isSafeInteger(options.upstreamByteLimit) || options.upstreamByteLimit < 1 || options.upstreamByteLimit > 1024 ** 3)
    throw Error("Invalid audio rehearsal bounds");
  options.signal.throwIfAborted();
  const abort = new AbortController(), buffer = createAudioBuffer(), token = randomUUID();
  let failed = false, stopping: Promise<void> | undefined, upstreamBytes = 0, busy = 0;
  let child: ReturnType<typeof spawn> | undefined, closed: Promise<void> | undefined;
  let relay: Awaited<ReturnType<typeof createSourceRelay>> | undefined;
  let input: ReturnType<Awaited<ReturnType<typeof createSourceRelay>>["createInput"]> | undefined;
  let feeding: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, initialized = false;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  function fail(reason: string) {
    if (failed || abort.signal.aborted) return;
    failed = true;
    try { options.onFailure(reason); } finally { abort.abort(); if (initialized) void stop(); }
  }
  const server = createServer(async (request, response) => {
    const match = new RegExp(`^/${token}/(audio(?:-[0-9]{1,12}\\.ts|\\.m3u8))$`).exec(request.url ?? "");
    if (request.method !== "PUT" || !match?.[1] || abort.signal.aborted || busy >= 2) {
      response.writeHead(403).end(); request.resume(); return;
    }
    busy++;
    const name = match[1], limit = name === "audio.m3u8" ? 16384 : buffer.maxSegmentBytes;
    let size = 0;
    const chunks: Buffer[] = [];
    const deadline = setTimeout(() => request.destroy(), 5000);
    try {
      for await (const chunk of request) {
        if (!Buffer.isBuffer(chunk) || size + chunk.length > limit || abort.signal.aborted)
          throw Error("Audio output exceeds limit");
        size += chunk.length;
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks, size);
      if (name === "audio.m3u8") buffer.publish(bytes.toString("utf8"));
      else buffer.put(name, bytes);
      response.writeHead(201).end();
    } catch {
      response.writeHead(413).end(); request.destroy(); fail("audio_output_limit");
    } finally { clearTimeout(deadline); busy--; }
  });
  async function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      abort.abort(); clearTimeout(timer); clearInterval(watchdog); options.signal.removeEventListener("abort", onAbort);
      child?.stdin?.destroy();
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        const kill = setTimeout(() => child?.kill("SIGKILL"), 1000);
        try { await closed; } finally { clearTimeout(kill); }
      } else await closed;
      await feeding;
      try { await input?.dispose(); } finally {
        relay?.stop();
        server.closeAllConnections();
        if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
        buffer.close();
      }
    })();
    return stopping;
  }
  const onAbort = () => { abort.abort(); if (initialized) void stop(); };
  options.signal.addEventListener("abort", onAbort, { once: true });
  timer = setTimeout(() => fail("audio_rehearsal_deadline"), options.lifetimeMs);
  const startedAt = Date.now();
  watchdog = setInterval(() => {
    if (Date.now() - (buffer.publishedAt() || startedAt) >= 10000) fail("audio_publication_stalled");
  }, 250);
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Cannot bind audio sink");
    relay = await (options.createRelay ?? (() => createSourceRelay({ inputFormat: "vrcdn_fmp4" })))();
    abort.signal.throwIfAborted();
    input = relay.createInput({ source: { id: source.streamKey, revision: options.epoch, type: "vrcdn_link",
      publicUrl: `https://stream.vrcdn.live/live/${source.streamId}.live.mp4` }, signal: abort.signal });
    const { url } = await input.transportReady;
    abort.signal.throwIfAborted();
    const response = await fetch(url, { signal: abort.signal, redirect: "error" });
    if (!response.ok || !response.body) throw Error("Audio source unavailable");
    const body = response.body;
    const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-protocol_whitelist", "pipe",
      "-f", "mp4", "-enable_drefs", "0", "-i", "pipe:0", "-map", "0:a:0", "-vn", "-sn", "-dn",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000", "-f", "hls", "-hls_time", "2",
      "-hls_list_size", "8", "-hls_segment_filename", `http://127.0.0.1:${address.port}/${token}/audio-%d.ts`,
      "-method", "PUT", `http://127.0.0.1:${address.port}/${token}/audio.m3u8`];
    child = spawn(options.ffmpegPath ?? "ffmpeg", args, { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
    closed = new Promise<void>(resolve => child?.once("close", () => { resolve(); if (!abort.signal.aborted) fail("audio_packager_closed"); }));
    child.once("error", () => fail("audio_packager_start"));
    if (!child.stdin) throw Error("Audio packager input unavailable");
    async function* boundedInput() {
      const reader = body.getReader();
      try { while (true) {
        const next = await reader.read();
        if (next.done) return;
        if (upstreamBytes + next.value.byteLength > options.upstreamByteLimit) throw Error("Audio source byte limit");
        upstreamBytes += next.value.byteLength;
        yield next.value;
      } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    feeding = pipeline(Readable.from(boundedInput()), child.stdin, { signal: abort.signal }).catch(() => {
      if (!abort.signal.aborted) fail("audio_source_limit_or_unavailable");
    });
    initialized = true;
    abort.signal.throwIfAborted();
    return { buffer, stop, upstreamBytes: () => upstreamBytes };
  } catch (error) { await stop(); throw error; }
}
