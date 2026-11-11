import assert from "node:assert/strict";
import { test } from "node:test";
import { VrchatClient } from "./vrchat-client.mjs";

const now = Date.parse("2026-10-31T20:00:00Z");
const groupId = "grp_example";
const userId = "usr_collector";
const instance = { instanceId: "123~group(grp_example)", worldId: "wrld_example", location: "wrld_example:123~group(grp_example)", ownerId: groupId, type: "group", active: true, closedAt: null, n_users: 4, memberCount: 2, users: [{ id: "usr_private" }] };
function setup(records = [instance], fetchedAt = now) {
  const paths = [];
  const provider = new VrchatClient({ userId, authCookie: "test-cookie", userAgent: "VRDex/test", clock: () => now,
    fetcher: async url => {
      paths.push(new URL(url).pathname);
      return Response.json(paths.length === 1
        ? { id: groupId, memberCount: 50, membershipStatus: "member", privacy: "default", joinState: "open" }
        : { fetchedAt: new Date(fetchedAt).toISOString(), instances: records });
    },
  });
  return { provider, paths };
}
test("group population uses full occupant count and never returns a roster", async () => {
  const { provider, paths } = setup();
  const snapshot = await provider.readAggregateSnapshot(groupId);
  assert.equal(snapshot.instances[0].population, 4);
  assert.deepEqual(paths, ["/api/1/groups/grp_example", "/api/1/users/usr_collector/instances/groups/grp_example"]);
  assert.equal(JSON.stringify(snapshot).includes("usr_private"), false);
});
test("provider closure is retained even while occupants remain visible", async () => {
  const { provider } = setup([{ ...instance, closedAt: new Date(now - 60_000).toISOString() }]);
  const snapshot = await provider.readAggregateSnapshot(groupId);
  assert.equal(snapshot.instances[0].closedAt, now - 60_000);
  assert.equal(snapshot.instances[0].population, 4);
});
test("provider snapshot time prevents cached data from renewing liveness", async () => {
  const { provider } = setup([instance], now - 120_000);
  assert.equal((await provider.readAggregateSnapshot(groupId)).observedAt, now - 120_000);
  await assert.rejects(setup([instance], now - 360_001).provider.readAggregateSnapshot(groupId), /stale|timestamp/i);
});
test("foreign, malformed and negative counts fail the entire snapshot", async () => {
  for (const changed of [{ ownerId: "grp_other" }, { n_users: -1 }, { location: "wrld_other:123" }, { closedAt: "invalid" }]) {
    await assert.rejects(setup([{ ...instance, ...changed }]).provider.readAggregateSnapshot(groupId));
  }
});
test("every provider request honors the existing policy and request budget", async () => {
  const { provider, paths } = setup();
  const operations = [];
  assert.equal(await provider.readAggregateSnapshot(groupId, { authorizeRequest: async operation => { operations.push(operation); return operation !== "instances"; } }), null);
  assert.deepEqual(operations, ["metadata", "instances"]);
  assert.equal(paths.length, 1);
});


test("independent diagnostics retain disagreements, large counts and measured zero", async () => {
  const diagnostics = { userCount: 95, queueSize: 120, platforms: { standalonewindows: 82, android: 0, future_platform: 3 } };
  const { provider, paths } = setup([{ ...instance, ...diagnostics }]);
  const snapshot = await provider.readAggregateSnapshot(groupId);
  assert.deepEqual(snapshot.instances[0], { providerInstanceId: instance.instanceId, providerLocation: instance.location, vrchatWorldId: instance.worldId, population: 4, ...diagnostics });
  assert.equal(paths.length, 2);
  const zero = (await setup([{ ...instance, userCount: 0, queueSize: 0, platforms: {} }]).provider.readAggregateSnapshot(groupId)).instances[0];
  assert.equal(zero.userCount, 0);
  assert.equal(zero.queueSize, 0);
  assert.deepEqual(zero.platforms, {});
});

test("missing and null diagnostics remain absent", async () => {
  for (const diagnostics of [{}, { userCount: null, queueSize: null, platforms: null }]) {
    const row = (await setup([{ ...instance, ...diagnostics }]).provider.readAggregateSnapshot(groupId)).instances[0];
    for (const key of ["userCount", "queueSize", "platforms"]) assert.equal(Object.hasOwn(row, key), false);
  }
});

test("malformed optional diagnostics reject the snapshot", async () => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "3", false, {}, []]) {
    for (const key of ["userCount", "queueSize"]) await assert.rejects(setup([{ ...instance, [key]: value }]).provider.readAggregateSnapshot(groupId));
  }
  for (const platforms of [[], 4, "windows", { windows: -1 }, { windows: 1.5 }, { windows: "2" }, { windows: Number.MAX_SAFE_INTEGER + 1 }, { "": 0 }, { ["a".repeat(65)]: 0 }, { "usr_private": 1 }, { "USR_private": 1 }, { "bad key": 1 }, Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`platform${i}`, 0]))]) {
    await assert.rejects(setup([{ ...instance, platforms }]).provider.readAggregateSnapshot(groupId));
  }
});
