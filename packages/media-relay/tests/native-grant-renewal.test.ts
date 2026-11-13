import assert from "node:assert/strict";
import { test } from "node:test";
import { createControlRpc, gatewayAuthorization } from "../src/providers/convex-control";

test("native playlist traffic renews a near-expiry capability through existing public refresh, without gateway credentials in that call", async () => {
  const now = 42_000_000;
  let expiresAt = now + 1000;
  const calls: Array<{ path: string; args: Record<string, unknown> }> = [];
  const rpc = createControlRpc({ url: "https://control.invalid", credential: "gateway-only",
    fetcher: async (_url, init) => {
      const call = JSON.parse(String(init?.body));
      calls.push(call);
      if (call.path === "mediaRelayPlayback:refreshPlayback") {
        expiresAt = now + 43_200_000;
        return Response.json({ status: "success", value: { kind: "preparing", grantId: "capability", retryAfterMs: 1000 } });
      }
      return Response.json({ status: "success", value: { kind: "active", grant: {
        id: "capability", streamKey: "vrcdn/Alpha/1", context: { kind: "profile", profileId: "profile", linkId: "Alpha" },
        contextRevision: 1, issuedAt: 1, expiresAt, renditions: ["video", "audio"] },
        state: "recovering", epoch: 1, leaseExpiresAt: now + 30000, snapshot: null } });
    } });
  const authorize = gatewayAuthorization(rpc, () => now);
  const result = await authorize({ grantId: "capability", rendition: "audio", signal: new AbortController().signal });
  assert.equal(result.kind, "active");
  if (result.kind === "active") assert.equal(result.grant.expiresAt, now + 43_200_000);
  assert.deepEqual(calls.map(call => call.path), ["mediaRelayWorker:readGateway", "mediaRelayPlayback:refreshPlayback", "mediaRelayWorker:readGateway"]);
  assert.deepEqual(calls[1]?.args, { grantId: "capability" });
  assert.equal(calls[0]?.args.credential, "gateway-only");
  calls.length = 0;
  await authorize({ grantId: "capability", rendition: "audio", signal: new AbortController().signal });
  assert.deepEqual(calls.map(call => call.path), ["mediaRelayWorker:readGateway"]);
});

test("revoked native capability never attempts renewal", async () => {
  let calls = 0;
  const rpc = createControlRpc({ url: "https://control.invalid", credential: "gateway-only",
    fetcher: async () => { calls++; return Response.json({ status: "success", value: { kind: "denied" } }); } });
  assert.deepEqual(await gatewayAuthorization(rpc)({ grantId: "capability", rendition: "audio", signal: new AbortController().signal }), { kind: "denied" });
  assert.equal(calls, 1);
});
