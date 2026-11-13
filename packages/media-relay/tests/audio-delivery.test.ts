import assert from "node:assert/strict";
import { test } from "node:test";
import { createAudioDelivery } from "../src/gateway/audio-delivery";

test("each copied URL reserves before delivery, including repeat requests, and authorization is never cached", async () => {
  let allowed = true, checks = 0;
  const handler = createAudioDelivery({ capability: "test-capability-12345678901234567890", expiresAt: 10000,
    clock: () => 1000, maxRequests: 4, maxPayloadBytes: 12,
    authorize: async () => { checks++; return allowed; },
    read: name => name === "audio-0.ts" ? Buffer.alloc(5) : undefined });
  const request = () => new Request("https://audio.test/p/test-capability-12345678901234567890/audio/audio-0.ts");
  const results = await Promise.all([handler(request()), handler(request())]);
  results.push(await handler(request()));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 429]);
  assert.equal(results.reduce((sum, r) => sum + Number(r.headers.get("Content-Length") ?? 0), 0), 10);
  allowed = false;
  assert.equal((await handler(request())).status, 403);
  assert.equal(checks, 4);
  assert.equal((await handler(request())).status, 429);
});

test("native playlist requests recheck source authority without page timers; finite session and forbidden methods fail closed", async () => {
  let now = 1000, current = true;
  const handler = createAudioDelivery({ capability: "test-capability-12345678901234567890", expiresAt: 5000,
    clock: () => now, maxRequests: 12, maxPayloadBytes: 1000,
    authorize: async () => current, read: () => Buffer.from("#EXTM3U\n") });
  const url = "https://audio.test/p/test-capability-12345678901234567890/audio/index.m3u8";
  assert.equal((await handler(new Request(url))).status, 200);
  now = 3000;
  assert.equal((await handler(new Request(url))).status, 200);
  current = false;
  assert.equal((await handler(new Request(url))).status, 403);
  current = true;
  assert.equal((await handler(new Request(url, { headers: { range: "bytes=0-1" } }))).status, 405);
  assert.equal((await handler(new Request(url, { method: "HEAD" }))).status, 405);
  now = 5000;
  assert.equal((await handler(new Request(url))).status, 410);
});
