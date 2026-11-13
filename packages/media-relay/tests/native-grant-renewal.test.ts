import assert from "node:assert/strict";
import { test } from "node:test";
import { createControlRpc, gatewayAuthorization } from "../src/providers/convex-control";

test("native playlist traffic reads existing authority without renewing the twelve-hour viewer grant", async () => {
  const calls: Array<{ method: string; path: string; args: Record<string, unknown> }> = [];
  const rpc = createControlRpc({ url: "https://control.invalid", credential: "gateway-only",
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ method: "POST", path: body.path, args: body.args });
      return Response.json({ status: "success", value: { kind: "denied" } });
    },
  });
  assert.deepEqual(await gatewayAuthorization(rpc)({ grantId: "grant", rendition: "audio", signal: new AbortController().signal }), { kind: "denied" });
  assert.deepEqual(calls, [{ method: "POST", path: "mediaRelayWorker:readGateway", args: { grantId: "grant", rendition: "audio", credential: "gateway-only" } }]);
});
