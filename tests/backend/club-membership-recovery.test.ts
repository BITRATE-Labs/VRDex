import assert from "node:assert/strict";
import { test } from "node:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schemaModule from "../../convex/schema";
import { recoverMembershipPage } from "../../workers/group-telemetry/membership-recovery.mjs";
import { RequestBudget } from "../../workers/group-telemetry/runtime.mjs";
import { VrchatProviderError } from "../../workers/group-telemetry/vrchat-client.mjs";
import { ClubProvider } from "../../workers/group-telemetry/club-provider.mjs";
import { normalizeMembershipAuditPage } from "../../workers/group-telemetry/membership-audit.mjs";
const schema = (schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule;
const modules = {
  "../../convex/clubMembershipRecovery.ts": () => import("../../convex/clubMembershipRecovery"),
  "../../convex/clubMembership.ts": () => import("../../convex/clubMembership"),
  "../../convex/clubConnection.ts": () => import("../../convex/clubConnection"),
  "../../convex/clubPeople.ts": () => import("../../convex/clubPeople"),
  "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"),
};
const mutation = (name: string) => makeFunctionReference<"mutation">(`clubMembershipRecovery:${name}`);
const status = makeFunctionReference<"query">("clubMembershipRecovery:getRecoveryStatus");
const activity = makeFunctionReference<"query">("clubMembership:listActivity");
const backfill = makeFunctionReference<"mutation">("clubMembership:backfillTargetIdentities");
const authority = makeFunctionReference<"mutation">("clubConnection:recordAuthority");
const A = "usr_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", B = "usr_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const R = "grol_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
async function setup(enabled = true) {
  process.env.CLERK_JWT_ISSUER_DOMAIN = "https://test.clerk.accounts.dev";
  if (enabled) process.env.VRDEX_MEMBERSHIP_RECOVERY_ENABLED = "true";
  else delete process.env.VRDEX_MEMBERSHIP_RECOVERY_ENABLED;
  const t = convexTest({ schema, modules }), now = Date.now(), epochStartedAt = now - 40 * 86400_000;
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { clerkUserId: "owner" });
    const communityProfileId = await ctx.db.insert("profiles", { slug: "recovery-club", displayName: "Club", sortName: "club", aliases: [], tags: [], claimState: "claimed_verified", publicationState: "published", publicSurfacingState: "public", creationSource: "self", updatedAt: now, profileType: "community", community: { categoryTags: [] } });
    await ctx.db.insert("profileOwners", { profileId: communityProfileId, userId, roleKey: "owner", state: "active", grantedAt: now, updatedAt: now });
    const collectorAccountId = await ctx.db.insert("collectorAccounts", { vrchatUserId: A, accountAlias: "bot", state: "ready", capacity: 20, reservedHeadroom: 0, assignedGroupCount: 1, requestsPerMinute: 30, secretRef: "test", workerKeyHash: "key", credentialGeneration: 1, killSwitchEnabled: false, createdAt: now, updatedAt: now });
    const integrationId = await ctx.db.insert("communityVrchatIntegrations", { communityProfileId, vrchatGroupId: "grp_test", groupVisibility: "public", joinPolicy: "free", state: "active", killSwitchEnabled: false, enabledFeatures: ["analytics"], assignedCollectorAccountId: collectorAccountId, requestsPerMinute: 30, leaseGeneration: 1, publicMetrics: { currentPopulation: false, populationHistory: false, groupMemberCount: false, groupMemberGrowth: false, eventRecaps: false }, consecutiveFailures: 0, telemetryEpochStartedAt: epochStartedAt, createdAt: epochStartedAt, updatedAt: now,
      providerAuthority: { collectorAccountId, credentialGeneration: 1, epochStartedAt, receivedAt: now, authority: { groupId: "grp_test", userId: A, membershipStatus: "member", permissions: ["group-audit-view"], observedAt: now } } });
    const leaseId = await ctx.db.insert("collectorAccountLeases", { integrationId, collectorAccountId, workerId: "worker", fencingToken: 1, state: "active", claimedAt: now, expiresAt: now + 3600_000, updatedAt: now });
    return { integrationId, communityProfileId, collectorAccountId, leaseId };
  });
  const owner = t.withIdentity({ subject: "owner", issuer: "https://test.clerk.accounts.dev", tokenIdentifier: "https://test.clerk.accounts.dev|owner" });
  const worker = { ...ids, integrationId: ids.integrationId, collectorAccountId: ids.collectorAccountId, groupId: "grp_test", epochStartedAt, workerId: "worker", workerKeyHash: "key", fencingToken: 1 };
  const { communityProfileId: _community, leaseId: _lease, ...workerArgs } = worker;
  const request = () => owner.mutation(mutation("requestRecovery"), { communityProfileId: ids.communityProfileId });
  const claim = () => t.mutation(mutation("claim"), workerArgs);
  const insertEvent = (fields = {}) => t.run(ctx => ctx.db.insert("communityMembershipEvents", { integrationId: ids.integrationId, epochStartedAt, groupId: "grp_test", auditId: "audit1", eventType: "group.member.role.assign", occurredAt: now - 1000, targetUserId: B, receivedAt: now, verified: true, ...fields }));
  return { t, owner, worker: workerArgs, ...ids, now, epochStartedAt, request, claim, insertEvent };
}
const page = (s: Awaited<ReturnType<typeof setup>>, job: { recoveryId: string; revision: number; nextOffset: number }, events: unknown[], exhausted = true) => s.t.mutation(mutation("recordPage"), { ...s.worker, recoveryId: job.recoveryId, expectedRevision: job.revision, offset: job.nextOffset, events, sourceCount: events.length, rawAuditIds: events.map(e => (e as { auditId: string }).auditId), exhausted });
test("owner gate, idempotent start, stop and explicit resume preserve the approved fixed window", async () => {
  const s = await setup(false);
  await assert.rejects(s.t.mutation(mutation("requestRecovery"), { communityProfileId: s.communityProfileId }), /owner/);
  await assert.rejects(s.request(), /disabled/);
  assert.equal((await s.owner.query(status, { communityProfileId: s.communityProfileId })).state, "disabled");
  assert.equal(await s.claim(), null);
  process.env.VRDEX_MEMBERSHIP_RECOVERY_ENABLED = "true";
  const recoveryId = await s.request();
  assert.equal(await s.request(), recoveryId);
  const first = await s.claim();
  assert.equal(first.endAt - first.startAt, 30 * 86400_000);
  await s.owner.mutation(mutation("stopRecovery"), { recoveryId, expectedRevision: first.revision });
  assert.equal((await page(s, first, [])).accepted, false);
  assert.equal(await s.claim(), null);
  assert.equal(await s.request(), recoveryId);
  assert.equal(await s.claim(), null);
  await assert.rejects(s.owner.mutation(mutation("requestRecovery"), { communityProfileId: s.communityProfileId, resume: true, expectedRevision: first.revision }), /changed/);
  await s.owner.mutation(mutation("requestRecovery"), { communityProfileId: s.communityProfileId, resume: true });
  const resumed = await s.claim();
  assert.equal(resumed.startAt, first.startAt); assert.equal(resumed.endAt, first.endAt);
  assert.ok(resumed.revision > first.revision);
  assert.equal((await page(s, first, [])).accepted, false);
  assert.equal((await page(s, resumed, [])).accepted, true);
  assert.equal((await s.owner.query(status, { communityProfileId: s.communityProfileId })).state, "complete");
});
test("recovery supplements exact verified evidence without rewriting original or conflicting records", async () => {
  const s = await setup();
  const eventId = await s.insertEvent({ targetUserId: B.toUpperCase() });
  await s.request(); const job = await s.claim();
  const core = { auditId: "audit1", eventType: "group.member.role.assign", occurredAt: s.now - 1000, targetUserId: B };
  assert.equal((await page(s, job, [{ ...core, roleId: R, roleName: "Old role", actorUserId: A, actorDisplayName: "Recovered actor" }])).accepted, true);
  assert.equal((await s.t.run(ctx => ctx.db.get(eventId)))?.roleId, undefined);
  const rows = await s.owner.query(activity, { communitySlug: "recovery-club", startAt: s.now - 2000, endAt: s.now, paginationOpts: { numItems: 10, cursor: null } });
  assert.equal(rows.page[0].roleId, R); assert.equal(rows.page[0].roleName, "Old role"); assert.equal(rows.page[0].roleNameSource, "recovered");
  assert.equal(rows.page[0].actorUserId, A); assert.ok(rows.page[0].evidenceRecoveredAt);
  assert.equal(rows.page[0].actorNameSource, "recovered");
  assert.equal((await page(s, job, [{ ...core, roleName: "Different" }])).accepted, false);
});
test("immutable conflicts, absent and unverified rows never gain recovered evidence", async () => {
  const s = await setup();
  await s.insertEvent(); await s.insertEvent({ auditId: "unverified", verified: false });
  await s.request(); const job = await s.claim();
  const core = { eventType: "group.member.role.assign", occurredAt: s.now - 1000, targetUserId: B, roleId: R };
  await page(s, job, [{ ...core, auditId: "audit1", targetUserId: A }, { ...core, auditId: "deleted" }, { ...core, auditId: "unverified" }]);
  const result = await s.owner.query(status, { communityProfileId: s.communityProfileId });
  assert.equal(result.job.conflicts, 1); assert.equal(result.job.unmatched, 2); assert.equal(result.job.recovered, 0);
  assert.deepEqual(await s.t.run(ctx => ctx.db.query("communityMembershipEvidence").take(1)), []);
});
test("stale leases, replaced epochs, lost authority and kill switches fence every recovery page", async () => {
  for (const reason of ["lease", "epoch", "credentials", "authority", "integration", "account", "named", "gate"]) {
    const s = await setup(); await s.request(); const job = await s.claim();
    await s.t.run(async ctx => {
      if (reason === "lease") await ctx.db.patch(s.leaseId, { fencingToken: 2 });
      if (reason === "epoch") await ctx.db.patch(s.integrationId, { telemetryEpochStartedAt: s.now });
      if (reason === "credentials") await ctx.db.patch(s.collectorAccountId, { credentialGeneration: 2 });
      if (reason === "authority") await ctx.db.patch(s.integrationId, { providerAuthority: undefined });
      if (reason === "integration") await ctx.db.patch(s.integrationId, { killSwitchEnabled: true });
      if (reason === "account") await ctx.db.patch(s.collectorAccountId, { killSwitchEnabled: true });
      if (reason === "named") await ctx.db.patch(s.integrationId, { namedMembershipCollectionEnabled: false });
    });
    if (reason === "gate") {
      delete process.env.VRDEX_MEMBERSHIP_RECOVERY_ENABLED;
      assert.equal((await page(s, job, [])).accepted, false);
      assert.equal((await s.owner.query(status, { communityProfileId: s.communityProfileId })).state, "disabled");
    } else await assert.rejects(page(s, job, []), undefined, reason);
  }
});
test("page caps and errors retain durable progress, while out-of-window and invented entries fail", async () => {
  const s = await setup(); const recoveryId = await s.request(); let job = await s.claim();
  for (const occurredAt of [job.startAt - 1, job.endAt, s.now + 1000]) await assert.rejects(page(s, job, [{ auditId: "bad", eventType: "group.member.join", occurredAt }]));
  await assert.rejects(s.t.mutation(mutation("recordPage"), { ...s.worker, recoveryId, expectedRevision: job.revision, offset: 0, events: [{ auditId: "invented", eventType: "group.member.join", occurredAt: s.now - 1000 }], sourceCount: 1, rawAuditIds: ["actual"], exhausted: false }));
  await s.t.run(ctx => ctx.db.patch(recoveryId, { nextOffset: 9999, pages: 99 }));
  job = await s.claim();
  await page(s, job, [{ auditId: "last", eventType: "group.member.join", occurredAt: s.now - 1000 }], false);
  const result = await s.owner.query(status, { communityProfileId: s.communityProfileId });
  assert.equal(result.state, "partial"); assert.equal(result.job.nextOffset, 10000); assert.equal(result.job.pages, 100);
  await s.owner.mutation(mutation("requestRecovery"), { communityProfileId: s.communityProfileId, resume: true });
  assert.equal(await s.claim(), null);
});
test("activity filters apply before pagination to legacy rows in the exact authorized epoch", async () => {
  const s = await setup();
  await s.t.run(async ctx => {
    for (let i = 0; i < 160; i++) await ctx.db.insert("communityMembershipEvents", { integrationId: s.integrationId, epochStartedAt: s.epochStartedAt, groupId: "grp_test", auditId: `row${i}`, eventType: i % 3 === 0 ? "group.member.leave" : "group.member.join", occurredAt: s.now - 1000 - i, targetUserId: i % 2 === 0 ? A : B, receivedAt: s.now, verified: true });
  });
  await s.insertEvent({ auditId: "foreign", epochStartedAt: s.epochStartedAt - 1, targetUserId: A, eventType: "group.member.leave" });
  const args = { communitySlug: "recovery-club", startAt: s.now - 2000, endAt: s.now, targetUserId: A, eventType: "group.member.leave" };
  const scope = { integrationId: s.integrationId, epochStartedAt: s.epochStartedAt, groupId: "grp_test" };
  await assert.rejects(s.owner.query(activity, { ...args, paginationOpts: { numItems: 7, cursor: null } }), /MEMBERSHIP_ACTIVITY_INDEX_PENDING/);
  assert.deepEqual(await s.t.mutation(backfill, scope), { updated: 100, complete: false });
  await assert.rejects(s.owner.query(activity, { ...args, paginationOpts: { numItems: 7, cursor: null } }), /MEMBERSHIP_ACTIVITY_INDEX_PENDING/);
  assert.deepEqual(await s.t.mutation(backfill, scope), { updated: 60, complete: true });
  assert.deepEqual(await s.t.mutation(backfill, scope), { updated: 0, complete: true });
  await assert.rejects(s.t.query(activity, { ...args, paginationOpts: { numItems: 7, cursor: null } }));
  let cursor: string | null = null; const ids = [];
  for (;;) {
    const result = await s.owner.query(activity, { ...args, paginationOpts: { numItems: 7, cursor } });
    assert.ok(result.page.every(row => row.targetUserId === A && row.eventType === "group.member.leave"));
    ids.push(...result.page.map(row => row.auditId));
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  assert.equal(ids.length, 27); assert.equal(new Set(ids).size, 27); assert.equal(ids.includes("foreign"), false);
});

test("canonical filters include every parser-accepted legacy spelling before combined pagination", async () => {
  const s = await setup();
  const spellings = [A, A.toUpperCase(), A.replaceAll("a", "A")];
  for (let i = 0; i < 42; i++) {
    const [parsed] = normalizeMembershipAuditPage([{ id: `mixed${i}`, groupId: "grp_test", eventType: i % 2 ? "group.member.join" : "group.member.leave", targetId: spellings[i % 3], created_at: new Date(s.now - 1000 - i).toISOString() }], { groupId: "grp_test", startAt: s.now - 2000, endAt: s.now });
    assert.equal(parsed.targetUserId, spellings[i % 3]);
    await s.insertEvent(parsed);
  }
  const args = { communitySlug: "recovery-club", startAt: s.now - 2000, endAt: s.now, targetUserId: A, eventType: "group.member.leave" };
  const unfiltered = await s.owner.query(activity, { communitySlug: args.communitySlug, startAt: args.startAt, endAt: args.endAt, paginationOpts: { numItems: 100, cursor: null } });
  assert.equal(unfiltered.page.length, 42);
  await assert.rejects(s.owner.query(activity, { ...args, paginationOpts: { numItems: 4, cursor: null } }), /MEMBERSHIP_ACTIVITY_INDEX_PENDING/);
  await s.t.mutation(backfill, { integrationId: s.integrationId, epochStartedAt: s.epochStartedAt, groupId: "grp_test" });
  let cursor: string | null = null; const ids: string[] = [];
  do {
    const result = await s.owner.query(activity, { ...args, paginationOpts: { numItems: 4, cursor } });
    assert.ok(result.page.every(row => row.targetUserId.toLowerCase() === A && row.eventType === args.eventType));
    ids.push(...result.page.map(row => row.auditId));
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  assert.equal(ids.length, 21); assert.equal(new Set(ids).size, 21);
  const personOnly = await s.owner.query(activity, { ...args, targetUserId: A.toUpperCase(), eventType: undefined, paginationOpts: { numItems: 100, cursor: null } });
  assert.equal(personOnly.page.length, 42);
  assert.deepEqual((await s.t.run(ctx => ctx.db.query("communityMembershipEvents").collect())).map(row => row.targetUserId), Array.from({ length: 42 }, (_, i) => spellings[i % 3]));
});

test("target projection backfill is scope fenced and does not alter immutable evidence", async () => {
  const s = await setup();
  const scope = { integrationId: s.integrationId, epochStartedAt: s.epochStartedAt, groupId: "grp_test" };
  const id = await s.insertEvent({ targetUserId: A.toUpperCase(), verified: false });
  const absent = await s.insertEvent({ auditId: "no-person", targetUserId: undefined });
  const invalid = await s.insertEvent({ auditId: "non-person", targetUserId: "grp_test" });
  const old = await s.insertEvent({ auditId: "old-epoch", epochStartedAt: s.epochStartedAt - 1 });
  const original = await s.t.run(ctx => ctx.db.get(id));
  await assert.rejects(s.t.mutation(backfill, { ...scope, epochStartedAt: s.epochStartedAt - 1 }), /Inactive/);
  await assert.rejects(s.t.mutation(backfill, { ...scope, groupId: "grp_foreign" }), /Inactive/);
  assert.deepEqual(await s.t.mutation(backfill, scope), { updated: 3, complete: true });
  const { canonicalTargetUserId, ...unchanged } = (await s.t.run(ctx => ctx.db.get(id)))!;
  assert.equal(canonicalTargetUserId, A); assert.deepEqual(unchanged, original);
  for (const id of [absent, invalid]) assert.equal((await s.t.run(ctx => ctx.db.get(id)))?.canonicalTargetUserId, "");
  assert.equal((await s.t.run(ctx => ctx.db.get(old)))?.canonicalTargetUserId, undefined);
  await s.t.run(ctx => ctx.db.patch(s.integrationId, { telemetryEpochStartedAt: s.now }));
  await assert.rejects(s.t.mutation(backfill, scope), /Inactive/);
});
test("role observations update changed names immediately, throttle unchanged labels and retain deleted roles", async () => {
  const s = await setup(); await s.insertEvent({ roleId: R });
  await s.t.run(ctx => ctx.db.patch(s.integrationId, { providerAuthority: undefined }));
  const { groupId, ...worker } = s.worker;
  const observe = (name: string, observedAt: number, roles = [{ roleId: R, name }]) => s.t.mutation(authority, { ...worker, authority: { groupId, userId: A, membershipStatus: "member", permissions: ["group-audit-view"], observedAt }, roles });
  await observe("First", s.now - 1000);
  const read = () => s.t.run(ctx => ctx.db.query("communityMembershipRoles").take(2));
  assert.equal((await read())[0].name, "First");
  await observe("First", s.now - 500); assert.equal((await read())[0].observedAt, s.now - 1000);
  await observe("Renamed", s.now - 100); assert.equal((await read())[0].name, "Renamed");
  await observe("", s.now, []); assert.equal((await read())[0].name, "Renamed");
  const result = await s.owner.query(activity, { communitySlug: "recovery-club", startAt: s.now - 2000, endAt: s.now, paginationOpts: { numItems: 10, cursor: null } });
  assert.equal(result.page[0].roleName, "Renamed"); assert.equal(result.page[0].roleNameSource, "role_observation");
  assert.equal(result.page[0].roleNameObservedAt, s.now - 100);
});
test("failure resumes from cumulative offsets and disabling the gate preserves checkpoints", async () => {
  const s = await setup(); const recoveryId = await s.request(); let job = await s.claim();
  await page(s, job, [{ auditId: "first", eventType: "group.member.join", occurredAt: s.now - 1000 }], false);
  job = await s.claim();
  await s.t.mutation(mutation("recordFailure"), { ...s.worker, recoveryId, expectedRevision: job.revision });
  assert.equal((await s.owner.query(status, { communityProfileId: s.communityProfileId })).state, "partial");
  delete process.env.VRDEX_MEMBERSHIP_RECOVERY_ENABLED;
  const disabled = await s.owner.query(status, { communityProfileId: s.communityProfileId });
  assert.equal(disabled.state, "disabled"); assert.equal(disabled.job.nextOffset, 1);
  assert.equal(await s.claim(), null);
  process.env.VRDEX_MEMBERSHIP_RECOVERY_ENABLED = "true";
  await s.owner.mutation(mutation("requestRecovery"), { communityProfileId: s.communityProfileId, resume: true });
  const resumed = await s.claim();
  assert.equal(resumed.nextOffset, 1); assert.equal(resumed.pages, 1); assert.equal(resumed.startAt, job.startAt); assert.equal(resumed.endAt, job.endAt);
});
test("a new epoch or community owner cannot use a foreign recovery identifier", async () => {
  const s = await setup(); const recoveryId = await s.request(); const job = await s.claim();
  const foreign = s.t.withIdentity({ subject: "other", issuer: "https://test.clerk.accounts.dev", tokenIdentifier: "https://test.clerk.accounts.dev|other" });
  await assert.rejects(foreign.mutation(mutation("stopRecovery"), { recoveryId }), /owner/);
  await assert.rejects(foreign.query(status, { communityProfileId: s.communityProfileId }), /owner/);
  await assert.rejects(s.t.mutation(mutation("check"), { ...s.worker, epochStartedAt: s.epochStartedAt - 1, recoveryId, expectedRevision: job.revision }));
});
test("in-flight429 extends shared cooldown by MAX while cooldown blocks new recovery work", async () => {
  const s = await setup(); const recoveryId = await s.request(); const job = await s.claim();
  await s.t.run(ctx => ctx.db.patch(s.collectorAccountId, { cooldownUntil: s.now + 60_000 }));
  assert.equal(await s.claim(), null);
  assert.equal((await s.t.mutation(mutation("check"), { ...s.worker, recoveryId, expectedRevision: job.revision })).current, false);
  await s.t.mutation(mutation("recordFailure"), { ...s.worker, recoveryId, expectedRevision: job.revision, rateLimited: true, retryAfterMs: 120_000 });
  const cooldown = await s.t.run(ctx => ctx.db.get(s.collectorAccountId).then(account => account?.cooldownUntil));
  assert.ok(cooldown! >= s.now + 120_000);
  assert.equal((await s.owner.query(status, { communityProfileId: s.communityProfileId })).state, "partial");
});
test("invalid raw rows still exhaust the cumulative entry cap", async () => {
  const s = await setup(); const recoveryId = await s.request(); const job = await s.claim();
  await s.t.run(ctx => ctx.db.patch(recoveryId, { nextOffset: 9998, pages: 99 }));
  await s.t.mutation(mutation("recordPage"), { ...s.worker, recoveryId, expectedRevision: job.revision, offset: 9998, sourceCount: 2, rawAuditIds: [], events: [], exhausted: false });
  const result = await s.owner.query(status, { communityProfileId: s.communityProfileId });
  assert.equal(result.state, "partial"); assert.equal(result.job.nextOffset, 10000); assert.equal(result.job.unmatched, 2);
});
for (const malformed of [null, 17, "invalid", false, []]) test(`non-object recovery row ${JSON.stringify(malformed)} consumes the final raw allowance`, async () => {
  const s = await setup(), groupId = "grp_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  await s.t.run(async ctx => {
    const integration = await ctx.db.get(s.integrationId);
    assert.ok(integration?.providerAuthority);
    await ctx.db.patch(s.integrationId, { vrchatGroupId: groupId, providerAuthority: { ...integration.providerAuthority, authority: { ...integration.providerAuthority.authority, groupId } } });
  });
  const recoveryId = await s.request();
  await s.t.run(ctx => ctx.db.patch(recoveryId, { nextOffset: 9999, pages: 99 }));
  const requests: string[] = [];
  const provider = { request: async (path: string) => { requests.push(path); return { results: [malformed], hasNext: true }; } };
  const args = {
    assignment: { integrationId: s.integrationId, fencingToken: 1, epochStartedAt: s.epochStartedAt, vrchatGroupId: groupId, enabledFeatures: ["analytics"] },
    authority: { groupId, userId: A, observedAt: s.now, membershipStatus: "member", permissions: ["group-audit-view"] },
    expectedUserId: A, clock: () => s.now, accountBudget: new RequestBudget(30), integrationBudget: new RequestBudget(30), provider,
    control: { send: async (operation: string, body: Record<string, unknown>) => {
      if (operation === "budget") return { granted: true };
      const endpoint = ({ membership_recovery_claim: "claim", membership_recovery_check: "check", membership_recovery_page: "recordPage", membership_recovery_failure: "recordFailure" } as Record<string, string>)[operation];
      assert.ok(endpoint);
      return s.t.mutation(mutation(endpoint), { ...s.worker, ...body });
    } },
  };
  assert.deepEqual(await recoverMembershipPage(args), { recovered: true });
  const result = await s.owner.query(status, { communityProfileId: s.communityProfileId });
  assert.equal(result.state, "partial"); assert.equal(result.job.nextOffset, 10000); assert.equal(result.job.pages, 100); assert.equal(result.job.unmatched, 1);
  assert.equal(result.job.recovered, 0);
  await s.owner.mutation(mutation("requestRecovery"), { communityProfileId: s.communityProfileId, resume: true, expectedRevision: result.job.revision });
  assert.deepEqual(await recoverMembershipPage(args), { recovered: false });
  assert.equal(requests.length, 1); assert.match(requests[0], /n=1&offset=9999/);
  await assert.rejects(new ClubProvider({ client: provider, groupId, expectedUserId: A }).readPage("audit"), (error: { category?: string }) => error.category === "schema_drift");
});
test("recovery raw-page reader keeps foreign group validation fail-closed", async () => {
  const provider = new ClubProvider({
    client: { request: async () => ({ results: [null, { groupId: "grp_foreign" }], hasNext: false }) },
    groupId: "grp_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", expectedUserId: A,
  });
  await assert.rejects(provider.readPage("audit_recovery"), (error: { category?: string }) => error.category === "provider_scope");
});
test("worker429 transport preserves maximum Retry-After and rejects a superseded lease", async () => {
  for (const [existingDelay, stale] of [[60_000, false], [240_000, false], [60_000, true]] as const) {
    const s = await setup(); await s.request();
    const groupId = "grp_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await s.t.run(async ctx => {
      const integration = await ctx.db.get(s.integrationId);
      assert.ok(integration?.providerAuthority);
      await ctx.db.patch(s.integrationId, { vrchatGroupId: groupId, providerAuthority: { ...integration.providerAuthority, authority: { ...integration.providerAuthority.authority, groupId } } });
      const job = await ctx.db.query("communityMembershipRecoveries").first();
      assert.ok(job); await ctx.db.patch(job._id, { groupId });
    });
    const operations: string[] = [];
    const error = new VrchatProviderError("limited", { status: 429, category: "rate_limit", retryAfterMs: 120_000 });
    await assert.rejects(recoverMembershipPage({
      assignment: { integrationId: s.integrationId, fencingToken: 1, epochStartedAt: s.epochStartedAt, vrchatGroupId: groupId, enabledFeatures: ["analytics"] },
      authority: { groupId, userId: A, observedAt: s.now, membershipStatus: "member", permissions: ["group-audit-view"] },
      expectedUserId: A, clock: () => s.now, accountBudget: new RequestBudget(30), integrationBudget: new RequestBudget(30),
      provider: { request: async () => {
        await s.t.run(async ctx => {
          await ctx.db.patch(s.collectorAccountId, { cooldownUntil: s.now + existingDelay });
          if (stale) await ctx.db.patch(s.leaseId, { fencingToken: 2 });
        });
        throw error;
      } },
      control: { send: async (operation: string, body: Record<string, unknown>) => {
        operations.push(operation);
        if (operation === "budget") return { granted: true };
        const endpoint = ({ membership_recovery_claim: "claim", membership_recovery_check: "check", membership_recovery_failure: "recordFailure" } as Record<string, string>)[operation];
        assert.ok(endpoint);
        return s.t.mutation(mutation(endpoint), { ...s.worker, ...body });
      } },
    }), e => e === error);
    assert.equal(operations.at(-1), "membership_recovery_failure");
    const account = await s.t.run(ctx => ctx.db.get(s.collectorAccountId));
    if (stale || existingDelay === 240_000) assert.equal(account?.cooldownUntil, s.now + existingDelay);
    else assert.ok(account?.cooldownUntil && account.cooldownUntil >= s.now + 120_000);
  }
});
test("credential rotation fences an in-flight claim even after fresh authority is renewed on the same lease", async () => {
  const s = await setup(); const recoveryId = await s.request(); const job = await s.claim();
  await s.t.run(async ctx => {
    const integration = await ctx.db.get(s.integrationId);
    assert.ok(integration?.providerAuthority);
    await ctx.db.patch(s.collectorAccountId, { credentialGeneration: 2 });
    await ctx.db.patch(s.integrationId, { providerAuthority: { ...integration.providerAuthority, credentialGeneration: 2 } });
  });
  const oldClaim = { ...s.worker, recoveryId, expectedRevision: job.revision };
  assert.equal((await s.t.mutation(mutation("check"), oldClaim)).current, false);
  assert.equal((await page(s, job, [])).accepted, false);
  await s.t.mutation(mutation("recordFailure"), { ...oldClaim, rateLimited: true, retryAfterMs: 120_000 });
  assert.equal((await s.t.run(ctx => ctx.db.get(s.collectorAccountId)))?.cooldownUntil, undefined);
  const renewed = await s.claim();
  assert.ok(renewed.revision > job.revision);
  assert.equal((await page(s, renewed, [])).accepted, true);
});
test("bounded cleanup deletes replaced-scope recovery data while retaining original audit events", async () => {
  const s = await setup(); const eventId = await s.insertEvent(); const recoveryId = await s.request(); const job = await s.claim();
  await page(s, job, [{ auditId: "audit1", eventType: "group.member.role.assign", occurredAt: s.now - 1000, targetUserId: B, roleId: R }]);
  await s.t.run(async ctx => {
    await ctx.db.patch(s.integrationId, { telemetryEpochStartedAt: s.now });
    await ctx.db.patch(recoveryId, { checkAt: 0 });
    for (const row of await ctx.db.query("communityMembershipEvidence").take(10)) await ctx.db.patch(row._id, { checkAt: 0 });
  });
  await s.t.mutation(mutation("sweep"), {});
  assert.equal(await s.t.run(ctx => ctx.db.get(recoveryId)), null);
  assert.deepEqual(await s.t.run(ctx => ctx.db.query("communityMembershipEvidence").take(1)), []);
  assert.ok(await s.t.run(ctx => ctx.db.get(eventId)));
});
