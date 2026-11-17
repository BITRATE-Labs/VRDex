import { GatewayAuthorizationSchema, type GatewayAuthorization, type PlaybackMode, type RenditionSnapshot, type StreamKey } from "../contracts";
import { createManifestHandler } from "../gateway/handler";
import { hasPlayableWindow, isSnapshotFresh } from "../policy";
import { matchesTrialContext, NATIVE_TRIAL_SEGMENT_GRACE_MS, type NativeTrialConfig } from "./policy";

type Options = {
  config: NativeTrialConfig;
  clock: () => number;
  authorize: (args: { grantId: string; rendition: PlaybackMode; signal: AbortSignal }) => Promise<unknown>;
  readSnapshot: (key: string) => RenditionSnapshot | undefined;
  readSegment: (key: string) => Uint8Array | undefined;
  recordDemand: (args: { streamKey: StreamKey; at: number }) => Promise<void>;
  onExhausted: () => void;
};
/** All capabilities, including copied URLs, debit one finite process-wide allowance. */
export function createNativeTrialGateway(options: Options) {
  const { config, clock } = options;
  const manifests = new Map<string, ReturnType<typeof createManifestHandler>>();
  const advertised = new Map<string, number>();
  let requests = 0, payloadBytes = 0, ended = false, busy = 0;
  function end() { if (!ended) { ended = true; options.onExhausted(); } }
  function active() { const now = clock(); return Number.isFinite(now) && now >= config.startsAt && now < config.expiresAt; }
  function allowed(auth: GatewayAuthorization, id: string) {
    return auth.kind === "active" && auth.grant.id === id &&
      matchesTrialContext(config, auth.grant.context, config.source.streamId) &&
      auth.grant.streamKey === config.source.streamKey &&
      auth.grant.issuedAt >= config.startsAt && auth.grant.issuedAt <= clock() &&
      auth.grant.expiresAt > clock() && auth.grant.expiresAt <= config.expiresAt;
  }
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
    const empty = (status: number) => new Response(null, { status, headers });
    if (!active()) { end(); return empty(410); }
    if (ended || ++requests > config.limits.requests) { end(); return empty(429); }
    for (const [key, until] of advertised) if (until <= clock()) advertised.delete(key);
    const origin = request.headers.get("origin");
    if (origin && !config.origins.includes(origin)) return empty(403);
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    const url = new URL(request.url);
    if (url.origin !== config.origin || url.search) return empty(404);
    const playlist = /^\/p\/([A-Za-z0-9_-]{1,128})\/(video|audio)\/index\.m3u8$/.exec(url.pathname);
    const segment = /^\/p\/([A-Za-z0-9_-]{1,128})\/objects\/([^/]+)$/.exec(url.pathname);
    if (!playlist && !segment) return empty(404);
    if (request.method === "OPTIONS") {
      headers.set("Access-Control-Allow-Methods", "GET, OPTIONS"); return empty(204);
    }
    if (request.method !== "GET") return empty(405);
    if (busy >= 4) return empty(503);
    busy++;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 1500);
    let response: Response;
    try {
      if (playlist) {
        const id = playlist[1]!;
        let manifest = manifests.get(id);
        if (!manifest) {
          const rendition = playlist[2] as PlaybackMode;
          const auth = GatewayAuthorizationSchema.parse(await options.authorize({ grantId: id, rendition, signal: abort.signal }));
          abort.signal.throwIfAborted();
          if (!allowed(auth, id)) return empty(403);
          if (manifests.size >= 2) return empty(429);
          manifest = createManifestHandler({
            authorize: async args => {
              const auth = GatewayAuthorizationSchema.parse(await options.authorize(args));
              return allowed(auth, id) ? auth : { kind: "denied" };
            },
            readSnapshot: async ({ objectKey }) => options.readSnapshot(objectKey),
            demand: { recordDemand: options.recordDemand },
            signSegment: ({ objectKey }) => {
              const key = `${id}:${objectKey}`;
              if (!advertised.has(key) && advertised.size >= 128) throw Error("Trial advertisement capacity");
              advertised.set(key, Math.min(config.expiresAt, clock() + NATIVE_TRIAL_SEGMENT_GRACE_MS));
              return `${config.origin}/p/${id}/objects/${encodeURIComponent(objectKey)}`;
            },
            clock, origins: config.origins, maxSources: 1, maxConcurrent: 2,
          });
          manifests.set(id, manifest);
        }
        response = await manifest(request);
      } else {
        const id = segment![1]!;
        let key: string;
        try { key = decodeURIComponent(segment![2]!); } catch { return empty(403); }
        const match = new RegExp(`^${config.source.streamKey}/epochs/[1-9][0-9]*/attempt-[0-9]+-[A-Za-z0-9_-]+/(video|audio)-[0-9]+\\.ts$`).exec(key);
        if (!match) return empty(403);
        const rendition = match[1] as PlaybackMode;
        const auth = GatewayAuthorizationSchema.parse(await options.authorize({ grantId: id, rendition, signal: abort.signal }));
        abort.signal.throwIfAborted();
        if (!allowed(auth, id) || auth.kind !== "active") return empty(403);
        const snapshot = auth.snapshot;
        if (auth.state !== "ready" || !snapshot || snapshot.streamKey !== config.source.streamKey || snapshot.rendition !== rendition ||
          snapshot.epoch !== auth.epoch || auth.leaseExpiresAt === null || auth.leaseExpiresAt <= clock() ||
          !isSnapshotFresh(snapshot, clock()) || !hasPlayableWindow(snapshot) ||
          !key.startsWith(`${config.source.streamKey}/epochs/${auth.epoch}/`) || (advertised.get(`${id}:${key}`) ?? 0) <= clock()) return empty(403);
        const bytes = options.readSegment(key);
        if (!bytes) return empty(404);
        headers.set("Content-Type", "video/mp2t");
        response = new Response(Buffer.from(bytes), { headers });
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      abort.signal.throwIfAborted();
      if (!active()) { end(); return empty(410); }
      if (ended || payloadBytes + bytes.byteLength > config.limits.payloadBytes) { end(); return empty(429); }
      payloadBytes += bytes.byteLength;
      return new Response(bytes, { status: response.status, headers: response.headers });
    } catch { return empty(503); }
    finally { clearTimeout(timer); busy--; }
  };
}
