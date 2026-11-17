import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createNativeTrialSource } from "../src/trial/source";
import { source } from "./packager-fixture";

test("finite source guard stops before forwarding beyond its byte allowance and refuses a second acquisition", async () => {
  const server = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "video/mp4" }); res.end(Buffer.alloc(8192)); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address !== "string");
  let limited = 0, disposed = 0;
  const guard = createNativeTrialSource({ source, maxBytes: 1024, onLimit: () => limited++, createRelay: async () => ({
    createInput: () => ({ transportReady: Promise.resolve({ url: `http://127.0.0.1:${address.port}/input` }), dispose: async () => { disposed++; } }),
    resolveSource: () => "", retainSources() {}, stop() {},
  }) });
  const relay = await guard.create();
  const input = relay.createInput({ source: { id: source.streamKey, type: "vrcdn_link", publicUrl: `https://stream.vrcdn.live/live/${source.streamId}.live.mp4` } });
  try {
    const { url } = await input.transportReady;
    await assert.rejects(async () => { const response = await fetch(url); await response.arrayBuffer(); });
    assert.equal(limited, 1); assert(guard.upstreamBytes() <= 1024); assert.equal(guard.acquisitions(), 1);
    assert.equal((await fetch(url)).status, 403);
    assert.throws(() => relay.createInput({ source: { id: "other", type: "vrcdn_link", publicUrl: "https://stream.vrcdn.live/live/Other.live.mp4" } }), /acquisition/);
  } finally { await input.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  assert.equal(disposed, 1);
});
