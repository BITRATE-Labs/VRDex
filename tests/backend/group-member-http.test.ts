import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { it } from "node:test";
import httpModule from "../../convex/http";
import { VrchatClient } from "../../workers/group-telemetry/vrchat-client.mjs";

it("forwards current group eligibility and creation time through the worker HTTP ingest route", async () => {
  const router = (httpModule as unknown as { default?: typeof httpModule }).default ?? httpModule;
  const [handler] = router.lookup("/telemetry/worker", "POST")!;
  const action = handler as unknown as { _handler: (ctx: unknown, request: Request) => Promise<Response> };
  const key = "worker-key-long-enough-for-this-test";
  const vrchatUserId = "usr_00000000-0000-4000-8000-000000000001";
  const authorization = {
    workerKeyHash: createHash("sha256").update(key).digest("hex"),
    vrchatUserId, enabled: true,
  };
  let providerRequests = 0;
  const client = new VrchatClient({ userId: vrchatUserId, authCookie: "test-cookie", userAgent: "VRDex/test", clock: () => 100_000,
    fetcher: async () => Response.json(++providerRequests === 1
      ? { id: "grp_example", memberCount: 42, membershipStatus: "member", privacy: "default", joinState: "open" }
      : { fetchedAt: new Date(100_000).toISOString(), instances: [{ instanceId: "one", location: "wrld_example:one", worldId: "wrld_example", ownerId: "grp_example", type: "group", active: true, n_users: 4, userCount: 95, queueSize: 120, platforms: { standalonewindows: 82, android: 0 } }] }),
  });
  const snapshot = await client.readAggregateSnapshot("grp_example");
  let ingested: Record<string, unknown> | undefined;
  const response = await action._handler({
    runQuery: async () => authorization,
    runMutation: async (_reference: unknown, args: Record<string, unknown>) => {
      ingested = args;
      return { duplicate: false };
    },
  }, new Request("https://example.test/telemetry/worker", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "x-vrdex-collector-account": "account" },
    body: JSON.stringify({
      operation: "ingest", workerId: "worker", vrchatUserId,
      integrationId: "integration", fencingToken: 1, pollId: "poll", observedAt: 100_000,
      groupVisibility: "private", joinPolicy: "invite",
      collectorVersion: "test", groupMemberCount: 42, groupCreatedAt: 1_000,
      instances: snapshot.instances, nextPollAt: 200_000,
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal(providerRequests, 2);
  assert.deepEqual(ingested?.instances, [{ providerInstanceId: "one", providerLocation: "wrld_example:one", vrchatWorldId: "wrld_example", population: 4, userCount: 95, queueSize: 120, platforms: { standalonewindows: 82, android: 0 } }]);
  assert.equal(ingested?.groupCreatedAt, 1_000);
  assert.equal(ingested?.groupVisibility, "private");
  assert.equal(ingested?.joinPolicy, "invite");
});
