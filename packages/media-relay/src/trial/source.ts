import { createServer, request } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { createSourceRelay, type SourceRelay } from "../../../../workers/restream/source-relay.mjs";
import type { SourceDescriptor } from "../contracts";

/** Meter the original guarded loopback transport; no event-authored URL reaches FFmpeg. */
export function createNativeTrialSource({ source, maxBytes, onLimit, createRelay = createSourceRelay }: {
  source: SourceDescriptor; maxBytes: number; onLimit: () => void; createRelay?: typeof createSourceRelay;
}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 1024 ** 3) throw Error("Invalid trial upstream limit");
  let connections = 0, bytes = 0, inputs = 0;
  const create = async (): Promise<SourceRelay> => {
    const relay = await createRelay({ inputFormat: "vrcdn_fmp4" });
    const token = randomUUID();
    let input: ReturnType<SourceRelay["createInput"]> | undefined, internal: URL | undefined, stopped = false;
    const server = createServer((req, res) => {
      if (stopped || !internal || req.method !== "GET" || req.url !== `/${token}` || ++connections > 1) {
        res.writeHead(403).end(); return;
      }
      const upstream = request(internal, { agent: false }, response => {
        if (response.statusCode !== 200) { response.destroy(); res.writeHead(502).end(); return; }
        const guard = new Transform({ transform(chunk: Buffer, _encoding, done) {
          if (!Buffer.isBuffer(chunk) || bytes + chunk.length > maxBytes) {
            onLimit(); done(Error("Trial upstream byte limit")); return;
          }
          bytes += chunk.length; done(null, chunk);
        } });
        res.writeHead(200, { "Content-Type": "video/mp4" });
        guard.once("error", () => { response.destroy(); upstream.destroy(); res.destroy(); });
        response.once("error", () => res.destroy());
        res.once("close", () => { guard.destroy(); response.destroy(); upstream.destroy(); });
        response.pipe(guard).pipe(res);
      });
      upstream.once("error", () => res.destroy());
      upstream.setTimeout(3000, () => upstream.destroy());
      res.once("close", () => upstream.destroy());
      upstream.end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") { relay.stop(); throw Error("Cannot bind trial input guard"); }
    let closing: Promise<void> | undefined;
    const close = () => closing ??= (async () => {
      stopped = true; server.closeAllConnections();
      await Promise.all([input?.dispose(), new Promise<void>(resolve => server.close(() => resolve()))]);
      relay.stop();
    })();
    return { ...relay, createInput(args) {
      if (++inputs > 1 || args.source.publicUrl !== `https://stream.vrcdn.live/live/${source.streamId}.live.mp4`)
        throw Error("Trial source acquisition denied");
      input = relay.createInput(args);
      const transportReady = input.transportReady.then(({ url }) => {
        const value = new URL(url);
        if (value.protocol !== "http:" || value.hostname !== "127.0.0.1" || value.username || value.password || value.search || value.hash)
          throw Error("Unexpected guarded input transport");
        internal = value;
        if (stopped || args.signal?.aborted) throw Error("Trial input stopped");
        return { url: `http://127.0.0.1:${address.port}/${token}` };
      });
      return { transportReady, dispose: close };
    }, stop() { void close(); } };
  };
  return { create, upstreamBytes: () => bytes, acquisitions: () => connections };
}
