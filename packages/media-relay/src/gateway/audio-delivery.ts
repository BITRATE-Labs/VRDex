/** One finite, single-process rehearsal. No CDN, shared-cache bypass or unlimited-session mode. */
export function createAudioDelivery(options: {
  capability: string;
  expiresAt: number;
  clock(): number;
  maxRequests: number;
  maxPayloadBytes: number;
  authorize(signal: AbortSignal): Promise<boolean>;
  read(name: string): Buffer | undefined;
  origins?: readonly string[];
}) {
  const startedAt = options.clock(), origins = new Set(options.origins ?? []);
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(options.capability) ||
      !Number.isFinite(startedAt) || !Number.isFinite(options.expiresAt) || options.expiresAt <= startedAt || options.expiresAt - startedAt > 900000 ||
      !Number.isSafeInteger(options.maxRequests) || options.maxRequests < 1 || options.maxRequests > 10000 ||
      !Number.isSafeInteger(options.maxPayloadBytes) || options.maxPayloadBytes < 1 || options.maxPayloadBytes > 1024 ** 3 ||
      [...origins].some(value => { try { const url = new URL(value); return url.protocol !== "https:" || url.origin !== value; } catch { return true; } }))
    throw Error("Invalid audio delivery bounds");
  let requests = 0, bytes = 0, inFlight = 0;
  return async function deliver(request: Request): Promise<Response> {
    const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
    const deny = (status: number) => new Response(null, { status, headers });
    const origin = request.headers.get("origin");
    if (origin && !origins.has(origin)) return deny(403);
    if (origin) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
    if (++requests > options.maxRequests) return deny(429);
    const now = options.clock();
    if (!Number.isFinite(now) || now < startedAt || now >= options.expiresAt) return deny(410);
    const url = new URL(request.url), prefix = `/p/${options.capability}/audio/`;
    if (!url.pathname.startsWith(prefix) || url.search || url.hash) return deny(404);
    const path = url.pathname.slice(prefix.length);
    if (path !== "index.m3u8" && !/^audio-[0-9]{1,12}\.ts$/.test(path)) return deny(404);
    if (request.method !== "GET" || ["range", "if-none-match", "if-modified-since"].some(name => request.headers.has(name))) return deny(405);
    if (inFlight >= 2) return deny(503);
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    inFlight++;
    const auth = Promise.resolve().then(() => options.authorize(abort.signal)).catch(() => false).finally(() => { inFlight--; });
    try {
      const allowed = await Promise.race([auth, new Promise<false>(resolve => { timer = setTimeout(() => { abort.abort(); resolve(false); }, 1500); })]);
      const current = options.clock();
      if (!allowed || abort.signal.aborted) return deny(403);
      if (!Number.isFinite(current) || current < startedAt || current >= options.expiresAt) return deny(410);
      const body = options.read(path === "index.m3u8" ? "audio.m3u8" : path);
      if (!body) return deny(503);
      if (body.length > options.maxPayloadBytes - bytes) return deny(429);
      // Synchronous reservation precedes response construction, including copied-URL replays.
      bytes += body.length;
      headers.set("Content-Type", path === "index.m3u8" ? "application/vnd.apple.mpegurl" : "video/mp2t");
      headers.set("Content-Length", String(body.length));
      return new Response(new Uint8Array(body), { status: 200, headers });
    } catch { return deny(503); }
    finally { if (timer) clearTimeout(timer); }
  };
}
