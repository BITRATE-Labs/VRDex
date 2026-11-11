import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { deletePosthogIdentity, posthogManagementConfig } from "../../convex/analyticsDeletion";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schemaModule from "../../convex/schema";

const schema = (schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule;
const modules = {
  "../../convex/analyticsDeletion.ts": () => import("../../convex/analyticsDeletion"),
  "../../convex/analyticsGuest.ts": () => import("../../convex/analyticsGuest"),
  "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"),
};
const claim = makeFunctionReference<"mutation">("analyticsDeletion:claimNext");
const finish = makeFunctionReference<"mutation">("analyticsDeletion:finish");
const startGuest = makeFunctionReference<"mutation">("analyticsGuest:start");
const withdrawGuest = makeFunctionReference<"mutation">("analyticsGuest:withdraw");
const sweep = makeFunctionReference<"mutation">("analyticsDeletion:sweepCompleted");
const retryFailed = makeFunctionReference<"mutation">("analyticsDeletion:retryFailed");

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const config = { origin: "https://us.posthog.com", projectId: "447783", key: "server-management-test-key" };
const acknowledged = { persons_found: 1, persons_queued_for_deletion: 1, events_queued_for_deletion: true, recordings_queued_for_deletion: true, deletion_errors: [] };

function responses(values: Array<{ status?: number; body: unknown }>) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const next = values.shift();
    assert.ok(next, "unexpected provider request");
    assert.equal(init?.redirect, "error");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return requests;
}

it("requires a server management key and exact project, refusing ingestion keys and unsafe origins", () => {
  assert.equal(posthogManagementConfig({}), null);
  assert.equal(posthogManagementConfig({ POSTHOG_API_KEY: "phc_ingestion", POSTHOG_PROJECT_ID: "447783" }), null);
  assert.equal(posthogManagementConfig({ POSTHOG_API_KEY: config.key, POSTHOG_PROJECT_ID: "447783", POSTHOG_MANAGEMENT_HOST: "http://example.test" }), null);
  assert.equal(posthogManagementConfig({ POSTHOG_API_KEY: config.key, POSTHOG_PROJECT_ID: "447783", POSTHOG_MANAGEMENT_HOST: "https://user:pass@example.test" }), null);
  assert.deepEqual(posthogManagementConfig({ POSTHOG_API_KEY: config.key, POSTHOG_PROJECT_ID: "447783" }), config);
});

it("requests event and recording deletion for the exact stored identity, recording acceptance rather than completion", async () => {
  const requests = responses([{ body: { results: [{ id: 123, uuid: "person-uuid" }] } }, { status: 202, body: acknowledged }]);
  assert.deepEqual(await deletePosthogIdentity(config, { analyticsId: "opaque-consent-id" }), { kind: "accepted", personId: "person-uuid" });
  assert.match(requests[0].url, /distinct_id=opaque-consent-id/);
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { ids: ["person-uuid"], delete_events: true, delete_recordings: true });
});

it("does not treat 202 errors, missing acknowledgements or unmatched identities as success", async () => {
  for (const body of [{ ...acknowledged, deletion_errors: [{ step: "events" }] }, { ...acknowledged, recordings_queued_for_deletion: false }, { ...acknowledged, persons_found: 0 }]) {
    responses([{ body: { results: [{ id: "person-uuid" }] } }, { status: 202, body }]);
    assert.equal((await deletePosthogIdentity(config, { analyticsId: "opaque-consent-id" })).kind, "retry");
  }
  responses([{ body: { results: [] } }]);
  assert.equal((await deletePosthogIdentity(config, { analyticsId: "opaque-consent-id" })).kind, "retry");
});

it("uses exact provider status after acceptance, never resubmitting or assuming a missing status means completed", async () => {
  for (const status of ["pending", "completed", undefined]) {
    const requests = responses([{ body: { results: status ? [{ person_uuid: "person-uuid", status }] : [] } }]);
    const result = await deletePosthogIdentity(config, { analyticsId: "opaque-consent-id", personId: "person-uuid", acceptedAt: 1 });
    assert.equal(result.kind, status === "completed" ? "completed" : status === "pending" ? "accepted" : "retry");
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /person_uuid=person-uuid/);
  }
});

it("keeps authorization failures distinct from transient provider failures without leaking provider content", async () => {
  responses([{ status: 403, body: { secret: "never-store-this" } }]);
  assert.deepEqual(await deletePosthogIdentity(config, { analyticsId: "opaque-consent-id" }), { kind: "authorization" });
  globalThis.fetch = async () => { throw new Error("never-store-this"); };
  assert.deepEqual(await deletePosthogIdentity(config, { analyticsId: "opaque-consent-id" }), { kind: "retry" });
});

it("retains the provider target before submission so a lost acknowledgement can recover by exact status", async () => {
  let personId: string | undefined;
  responses([{ body: { results: [{ id: "remembered-person" }] } }, { status: 503, body: {} }]);
  await deletePosthogIdentity(config, { analyticsId: "opaque-consent-id" }, async (id) => { personId = id; });
  assert.equal(personId, "remembered-person");
  const requests = responses([{ body: { results: [{ person_uuid: personId, status: "pending" }] } }]);
  assert.deepEqual(await deletePosthogIdentity(config, { analyticsId: "opaque-consent-id", personId }), { kind: "accepted", personId });
  assert.equal(requests.length, 1);
});

it("leases each saved withdrawal once, rejects stale workers, retains accepted targets and verifies completion", async () => {
  const t = convexTest({ schema, modules });
  const requestId = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", { clerkUserId: "deletion-owner" });
    return ctx.db.insert("analyticsDeletionRequests", { ownerUserId, analyticsId: "account-period-id", requestedAt: 0, state: "blocked_authorization" });
  });
  const first = await t.mutation(claim, { now: 10 });
  assert.equal(first?._id, requestId);
  assert.equal(await t.mutation(claim, { now: 11 }), null);
  assert.equal(await t.mutation(finish, { requestId, lease: "wrong", kind: "completed", now: 12 }), false);
  await t.mutation(finish, { requestId, lease: first.lease, kind: "accepted", personId: "person-uuid", now: 12 });
  const accepted = await t.run(async (ctx) => ctx.db.get(requestId));
  assert.equal(accepted?.state, "accepted");
  assert.equal(accepted?.acceptedAt, 12);
  assert.equal(await t.mutation(claim, { now: 13 }), null);
  const poll = await t.mutation(claim, { now: 3_600_013 });
  assert.equal(poll?.personId, "person-uuid");
  await t.mutation(finish, { requestId, lease: poll.lease, kind: "completed", now: 3_600_014 });
  assert.equal((await t.run(async (ctx) => ctx.db.get(requestId)))?.state, "completed");
  assert.equal(await t.mutation(claim, { now: 8_000_000 }), null);
});

it("recovers a crashed worker's lease and bounds repeated provider failures without losing the target", async () => {
  const t = convexTest({ schema, modules });
  const requestId = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", { clerkUserId: "retry-owner" });
    return ctx.db.insert("analyticsDeletionRequests", { ownerUserId, analyticsId: "retry-period-id", requestedAt: 0, state: "blocked_authorization" });
  });
  const crashed = await t.mutation(claim, { now: 1 });
  const recovered = await t.mutation(claim, { now: 120_002 });
  assert.equal(recovered?._id, requestId);
  assert.notEqual(recovered?.lease, crashed?.lease);
  assert.equal(await t.mutation(finish, { requestId, lease: crashed.lease, kind: "completed", now: 120_003 }), false);
  let lease = recovered.lease;
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = 121_000 + attempt * 4_000_000;
    await t.mutation(finish, { requestId, lease, kind: "retry", now });
    if (attempt < 4) lease = (await t.mutation(claim, { now: now + 3_600_001 })).lease;
  }
  const row = await t.run(async (ctx) => ctx.db.get(requestId));
  assert.equal(row?.state, "failed");
  assert.equal(row?.analyticsId, "retry-period-id");
  assert.equal(await t.mutation(retryFailed, { requestId }), true);
  assert.equal(await t.mutation(retryFailed, { requestId }), false);
  assert.equal((await t.run(async (ctx) => ctx.db.get(requestId)))?.state, "pending");
});

it("authorizes guest withdrawal with a separate random receipt, stores only its hash, and queues deletion once", async () => {
  const t = convexTest({ schema, modules });
  const guest = await t.mutation(startGuest, {});
  assert.match(guest.analyticsId, /^[a-f0-9-]{36}$/);
  assert.match(guest.receipt, /^[a-f0-9]{64}$/);
  const rows = await t.run(async (ctx) => ctx.db.query("analyticsGuestReceipts").collect());
  assert.equal(JSON.stringify(rows).includes(guest.receipt), false);
  assert.equal(await t.mutation(withdrawGuest, { receipt: guest.analyticsId }), false);
  assert.equal(await t.mutation(withdrawGuest, { receipt: "0".repeat(64) }), false);
  assert.equal(await t.mutation(withdrawGuest, { receipt: guest.receipt }), true);
  assert.equal(await t.mutation(withdrawGuest, { receipt: guest.receipt }), true);
  const requests = await t.run(async (ctx) => ctx.db.query("analyticsDeletionRequests").collect());
  assert.equal(requests.length, 1);
  assert.equal(requests[0].analyticsId, guest.analyticsId);
  assert.equal(requests[0].ownerUserId, undefined);
});

it("expires only completed deletion mappings after 30 days, retaining every unresolved target", async () => {
  const t = convexTest({ schema, modules });
  const guest = await t.mutation(startGuest, {});
  await t.mutation(withdrawGuest, { receipt: guest.receipt });
  const row = await t.mutation(claim, { now: Date.now() });
  await t.mutation(finish, { requestId: row._id, lease: row.lease, kind: "completed", now: 1 });
  await t.run(async (ctx) => {
    await ctx.db.insert("analyticsDeletionRequests", { analyticsId: "pending", requestedAt: 0, state: "pending" });
    await ctx.db.insert("analyticsDeletionRequests", { analyticsId: "accepted", requestedAt: 0, state: "accepted", acceptedAt: 1 });
  });
  assert.deepEqual(await t.mutation(sweep, { now: 31 * 86_400_000 }), { deletedCount: 1 });
  assert.equal((await t.run(async (ctx) => ctx.db.query("analyticsGuestReceipts").collect())).length, 0);
  assert.deepEqual((await t.run(async (ctx) => ctx.db.query("analyticsDeletionRequests").collect())).map((r) => r.analyticsId).sort(), ["accepted", "pending"]);
});

it("does not starve an older submission behind accepted requests waiting for provider completion", async () => {
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => {
    await ctx.db.insert("analyticsDeletionRequests", { analyticsId: "poll", requestedAt: 0, state: "accepted", nextAttemptAt: 10, acceptedAt: 1 });
    await ctx.db.insert("analyticsDeletionRequests", { analyticsId: "submit", requestedAt: 0, state: "pending", nextAttemptAt: 1 });
  });
  assert.equal((await t.mutation(claim, { now: 11 }))?.analyticsId, "submit");
});

it("continues completed cleanup beyond a full batch", async () => {
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => {
    for (let i = 0; i < 101; i++) await ctx.db.insert("analyticsDeletionRequests", { analyticsId: `completed-${i}`, requestedAt: 0, state: "completed", completedAt: 1 });
  });
  await t.mutation(sweep, { now: 31 * 86_400_000 });
  const scheduled = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
  assert.equal(scheduled.length, 1);
});
