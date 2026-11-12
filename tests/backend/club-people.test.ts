import assert from "node:assert/strict";
import { it } from "node:test";
import { convexTest } from "convex-test";
import schemaModule from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { PeopleSource } from "../../convex/_clubPeople";
import { admitVerifiedAudit } from "../../convex/clubPeople";
const schema = (schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule;
const modules = {
  "../../convex/clubPeople.ts": () => import("../../convex/clubPeople"),
  "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"),
};
const A = "usr_11111111-1111-1111-1111-111111111111";
const B = "usr_22222222-2222-2222-2222-222222222222";
const review = (targetUserIds = [A]) => ({ kind: "invitation_review" as const, targetUserIds, destination: { kind: "group" as const } });
it("review admission is private, bounded, replaces the old grant and expires", async (test) => {
  test.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  const s = await setup();
  const args = { communityProfileId: s.communityProfileId, source: review() };
  await assert.rejects(s.t.mutation(api.clubPeople.requestView, args));
  const first = await s.owner.mutation(api.clubPeople.requestView, args);
  const second = await s.owner.mutation(api.clubPeople.requestView, { ...args, source: review([B]) });
  await assert.rejects(s.owner.query(api.clubPeople.readView, { viewId: first.viewId }));
  assert.deepEqual((await s.owner.query(api.clubPeople.readView, { viewId: second.viewId })).people.map(p => p.userId), [B]);
  assert.equal(await s.t.run(ctx => ctx.db.query("clubPeopleViews").collect().then(rows => rows.length)), 1);
  test.mock.timers.tick(15 * 60000);
  await assert.rejects(s.owner.query(api.clubPeople.readView, { viewId: second.viewId }));
});
async function setup() {
  delete process.env.VRDEX_PEOPLE_RESOLUTION_ENABLED;
  process.env.CLERK_JWT_ISSUER_DOMAIN = "https://test.clerk.accounts.dev";
  const t = convexTest({ schema, modules });
  const now = Date.now();
  const identity = {
    subject: "owner",
    issuer: "https://test.clerk.accounts.dev",
    tokenIdentifier: "https://test.clerk.accounts.dev|owner",
  };
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", { clerkUserId: "owner" });
    const communityProfileId = await ctx.db.insert("profiles", {
      slug: "connection-club",
      displayName: "Club",
      sortName: "club",
      aliases: [],
      tags: [],
      claimState: "claimed_verified",
      publicationState: "published",
      publicSurfacingState: "public",
      creationSource: "self",
      updatedAt: now,
      profileType: "community",
      community: { categoryTags: [] },
    });
    await ctx.db.insert("profileOwners", {
      profileId: communityProfileId,
      userId: user,
      roleKey: "owner",
      state: "active",
      grantedAt: now,
      updatedAt: now,
    });
    const collectorAccountId = await ctx.db.insert("collectorAccounts", {
      vrchatUserId: "usr_bot",
      accountAlias: "bot",
      state: "ready",
      capacity: 10,
      reservedHeadroom: 0,
      assignedGroupCount: 1,
      requestsPerMinute: 30,
      secretRef: "secret",
      workerKeyHash: "hash",
      credentialGeneration: 1,
      killSwitchEnabled: false,
      createdAt: now,
      updatedAt: now,
    });
    const integrationId = await ctx.db.insert("communityVrchatIntegrations", {
      communityProfileId,
      vrchatGroupId: "grp_test",
      groupVisibility: "public",
      joinPolicy: "free",
      state: "active",
      assignedCollectorAccountId: collectorAccountId,
      enabledFeatures: ["membership_management", "posts"],
      killSwitchEnabled: false,
      requestsPerMinute: 10,
      leaseGeneration: 1,
      publicMetrics: {
        currentPopulation: false,
        populationHistory: false,
        groupMemberCount: false,
        groupMemberGrowth: false,
        eventRecaps: false,
      },
      consecutiveFailures: 0,
      telemetryEpochStartedAt: now - 1000,
      createdAt: now - 1000,
      updatedAt: now,
    });
    const leaseId = await ctx.db.insert("collectorAccountLeases", {
      integrationId,
      collectorAccountId,
      workerId: "worker",
      fencingToken: 1,
      state: "active",
      claimedAt: now,
      expiresAt: now + 60000,
      updatedAt: now,
    });
    const roleId = await ctx.db.insert("communityRoles", {
      communityProfileId,
      key: "staff",
      label: "Staff",
      permissions: ["manage_integrations"],
      assignableRoleIds: [],
      state: "active",
      createdAt: now,
      updatedAt: now,
    });
    return {
      communityProfileId,
      collectorAccountId,
      integrationId,
      leaseId,
      roleId,
    };
  });
  return {
    t,
    owner: t.withIdentity(identity),
    ...ids,
    snapshot: {
      collectorAccountId: ids.collectorAccountId,
      integrationId: ids.integrationId,
      workerKeyHash: "hash",
      workerId: "worker",
      fencingToken: 1,
      epochStartedAt: now - 1000,
      authority: {
        groupId: "grp_test",
        userId: "usr_bot",
        membershipStatus: "member",
        permissions: ["group-members-manage", "group-members-viewall", "group-invites-manage", "group-audit-view"],
        observedAt: now,
      },
    },
  };
}

async function ready(s: Awaited<ReturnType<typeof setup>>) {
  process.env.VRDEX_PEOPLE_RESOLUTION_ENABLED = "true";
  await s.t.run(async ctx => {
    await ctx.db.patch(s.leaseId, { state: "released" });
    await ctx.db.patch(s.integrationId, { providerAuthority: {
      authority: s.snapshot.authority, collectorAccountId: s.collectorAccountId,
      credentialGeneration: 1, epochStartedAt: s.snapshot.epochStartedAt, receivedAt: Date.now(),
    } });
  });
  return { collectorAccountId: s.collectorAccountId, workerKeyHash: "hash", workerId: "worker" };
}

async function sources(s: Awaited<ReturnType<typeof setup>>) {
  return s.t.run(async ctx => {
    await ctx.db.patch(s.integrationId, { enabledFeatures: ["analytics", "membership_management", "instances"] });
    const eventId = await ctx.db.insert("communityMembershipEvents", { integrationId: s.integrationId, epochStartedAt: s.snapshot.epochStartedAt, groupId: "grp_test", auditId: "audit", eventType: "group.member.join", targetUserId: A, actorUserId: B, targetDisplayName: "Recorded Mira", occurredAt: Date.now() - 100, receivedAt: Date.now(), verified: true });
    const subject = { subject: "owner", issuer: "https://test.clerk.accounts.dev", tokenIdentifier: "https://test.clerk.accounts.dev|owner" };
    const operationId = await ctx.db.insert("clubOperations", {
      communityProfileId: s.communityProfileId, integrationId: s.integrationId, epochStartedAt: s.snapshot.epochStartedAt,
      readyAt: Date.now() + 3600000, requestId: "op", batchId: "batch", payload: { kind: "invite_member", targetUserId: A },
      schedule: { kind: "fixed", dueAt: Date.now() + 3600000 }, dueAt: Date.now() + 3600000,
      actor: subject, createdBy: subject, revision: 1, state: "pending", createdAt: Date.now(), updatedAt: Date.now(),
    });
    const batchId = await ctx.db.insert("clubInvitationBatches", { communityProfileId: s.communityProfileId, requestId: "batch", recipients: [B], operationIds: [operationId], createdAt: Date.now() });
    const requestId = await ctx.db.insert("clubProviderReadRequests", {
      communityProfileId: s.communityProfileId, integrationId: s.integrationId, epochStartedAt: s.snapshot.epochStartedAt,
      subject, params: { kind: "members", n: 2, offset: 0 }, requestKey: "read", state: "succeeded", createdAt: Date.now(), expiresAt: Date.now() + 15 * 60000,
      collectorAccountId: s.collectorAccountId, credentialGeneration: 1, result: { items: [{ id: "membership-row", userId: A, displayName: "Read Mira" }, { id: "not-a-user", displayName: "Not a person" }], nextOffset: null, observedAt: Date.now() },
    });
    return { eventId, operationId, batchId, requestId };
  });
}

it("every source derives only its exact authorized targets and rejects stale, foreign or missing records", async () => {
  const s = await setup(), ids = await sources(s);
  const cases: { source: PeopleSource; expected: string[] }[] = [
    { source: { kind: "activity", auditIds: ["audit"] }, expected: [A, B] },
    { source: { kind: "invitation_batch", batchId: ids.batchId }, expected: [A, B] },
    { source: { kind: "scheduled_operations", operationIds: [ids.operationId] }, expected: [A] },
    { source: { kind: "provider_read", requestId: ids.requestId }, expected: [A] },
  ];
  for (const { source, expected } of cases) {
    const { viewId } = await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source });
    assert.deepEqual((await s.owner.query(api.clubPeople.readView, { viewId })).people.map(p => p.userId).sort(), expected);
    await assert.rejects(s.t.query(api.clubPeople.readView, { viewId }));
  }
  await assert.rejects(s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: { kind: "activity", auditIds: ["arbitrary-id"] } }));
  await s.t.run(ctx => ctx.db.patch(ids.eventId, { verified: false }));
  await assert.rejects(s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: cases[0].source }));
  await s.t.run(ctx => ctx.db.patch(s.integrationId, { telemetryEpochStartedAt: Date.now() + 1 }));
  for (const { source } of cases) await assert.rejects(s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source }));
});

it("review requires destination permission, exact destination scope and bounded IDs", async () => {
  const s = await setup();
  const staffIdentity = { subject: "staff", issuer: "https://test.clerk.accounts.dev", tokenIdentifier: "https://test.clerk.accounts.dev|staff" };
  await s.t.run(async ctx => {
    await ctx.db.insert("users", { clerkUserId: "staff" });
    await ctx.db.patch(s.roleId, { permissions: ["view_members"] });
    await ctx.db.insert("communityAuthorities", { communityProfileId: s.communityProfileId, subject: staffIdentity, subjectTokenIdentifier: staffIdentity.tokenIdentifier, roleId: s.roleId, roleKey: "staff", roleLabel: "Staff", state: "active", grantedAt: Date.now(), updatedAt: Date.now() });
  });
  await assert.rejects(s.t.withIdentity(staffIdentity).mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() }));
  for (const targetUserIds of [[], ["invalid"], Array.from({ length: 101 }, () => A)]) await assert.rejects(s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review(targetUserIds) }));
  await s.t.run(ctx => ctx.db.patch(s.integrationId, { enabledFeatures: ["instances"] }));
  await assert.rejects(s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: { kind: "invitation_review", targetUserIds: [A], destination: { kind: "instance", worldId: "wrld_11111111-1111-1111-1111-111111111111", instanceId: "123~group(grp_other)" } } }));
});

it("gate false never reports pending work and never reserves provider requests", async () => {
  const s = await setup();
  const view = await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() });
  const result = await s.owner.query(api.clubPeople.readView, { viewId: view.viewId });
  assert.equal(result.pendingCount, 0);
  assert.equal(result.people[0].status, "unavailable");
  assert.deepEqual(await s.t.mutation(internal.clubPeople.claim, { collectorAccountId: s.collectorAccountId, workerKeyHash: "hash", workerId: "worker" }), { jobs: [] });
  assert.equal((await s.t.run(ctx => ctx.db.query("collectorRequestBudgetCounters").collect())).length, 0);
});

it("claims are deduplicated and enforce two shared GETs per account minute, total budgets and higher priority", async () => {
  const s = await setup(), worker = await ready(s);
  const args = { communityProfileId: s.communityProfileId, source: review([A, B, "usr_33333333-3333-3333-3333-333333333333"]) };
  await s.owner.mutation(api.clubPeople.requestView, args);
  await s.owner.mutation(api.clubPeople.requestView, args);
  assert.equal((await s.t.run(ctx => ctx.db.query("clubPeople").collect())).length, 3);
  const first = await s.t.mutation(internal.clubPeople.claim, worker);
  const second = await s.t.mutation(internal.clubPeople.claim, { ...worker, workerId: "replica" });
  assert.equal(first.jobs.length, 1); assert.equal(second.jobs.length, 1);
  assert.notEqual(first.jobs[0].personId, second.jobs[0].personId);
  assert.deepEqual(await s.t.mutation(internal.clubPeople.claim, { ...worker, workerId: "restart" }), { jobs: [] });
  const budgets = await s.t.run(ctx => ctx.db.query("collectorRequestBudgetCounters").collect());
  assert.deepEqual(budgets.map(row => row.requestCount), [2, 2, 2]);
  const other = await setup(), otherWorker = await ready(other), ids = await sources(other);
  await other.owner.mutation(api.clubPeople.requestView, { communityProfileId: other.communityProfileId, source: review() });
  await other.t.run(ctx => ctx.db.patch(ids.operationId, { readyAt: Date.now() }));
  assert.deepEqual(await other.t.mutation(internal.clubPeople.claim, otherWorker), { jobs: [] });
  await other.t.run(async ctx => {
    await ctx.db.patch(ids.operationId, { state: "succeeded" });
    await ctx.db.insert("collectorRequestBudgetCounters", { scopeKey: "global", windowStartedAt: Math.floor(Date.now() / 60000) * 60000, requestCount: 30, updatedAt: Date.now() });
  });
  assert.deepEqual(await other.t.mutation(internal.clubPeople.claim, otherWorker), { jobs: [] });
});

it("exact result IDs, current credential, epoch and role ownership fence writes", async () => {
  for (const changed of ["mismatch", "rotation", "epoch", "generation", "owner", "grant"] as const) {
    const s = await setup(), worker = await ready(s);
    await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() });
    const { jobs } = await s.t.mutation(internal.clubPeople.claim, worker);
    assert.equal(jobs.length, 1);
    await s.t.run(async ctx => {
      if (changed === "rotation") await ctx.db.patch(s.collectorAccountId, { credentialGeneration: 2 });
      if (changed === "epoch") await ctx.db.patch(s.integrationId, { telemetryEpochStartedAt: Date.now() + 1 });
      if (changed === "generation") await ctx.db.patch(s.integrationId, { leaseGeneration: 2 });
      if (changed === "owner") {
        const ownership = await ctx.db.query("profileOwners").first();
        await ctx.db.patch(ownership!._id, { state: "revoked" });
      }
    });
    if (changed === "grant") await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review([B]) });
    const { personId, leaseToken } = jobs[0];
    assert.deepEqual(await s.t.mutation(internal.clubPeople.recordResult, { ...worker, personId, leaseToken, result: { status: "resolved", userId: changed === "mismatch" ? B : A, displayName: "Mira" } }), { accepted: false });
  }
});

it("negative cache and retry deadlines survive repeated admission; stale names survive transient failures", async (test) => {
  test.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  const s = await setup(), worker = await ready(s);
  const args = { communityProfileId: s.communityProfileId, source: review() };
  const view = await s.owner.mutation(api.clubPeople.requestView, args);
  let job = (await s.t.mutation(internal.clubPeople.claim, worker)).jobs[0];
  assert.deepEqual(await s.t.mutation(internal.clubPeople.recordResult, { ...worker, personId: job.personId, leaseToken: job.leaseToken, result: { status: "resolved", userId: A, displayName: "Mira" } }), { accepted: true });
  await s.t.run(ctx => ctx.db.patch(job.personId, { retryAt: Date.now(), dueAt: Date.now() }));
  job = (await s.t.mutation(internal.clubPeople.claim, worker)).jobs[0];
  await s.t.mutation(internal.clubPeople.recordResult, { ...worker, personId: job.personId, leaseToken: job.leaseToken, result: { status: "transient", retryAfterMs: 180000 } });
  const afterFailure = await s.owner.query(api.clubPeople.readView, { viewId: view.viewId });
  assert.equal(afterFailure.people[0].displayName, "Mira");
  assert.equal(afterFailure.people[0].status, "retry"); assert.equal(afterFailure.pendingCount, 0);
  const retryAt = (await s.t.run(ctx => ctx.db.get(job.personId)))!.retryAt;
  await s.owner.mutation(api.clubPeople.requestView, args);
  assert.equal((await s.t.run(ctx => ctx.db.get(job.personId)))!.retryAt, retryAt);
  const negative = await setup(), negativeWorker = await ready(negative);
  const negativeArgs = { communityProfileId: negative.communityProfileId, source: review() };
  await negative.owner.mutation(api.clubPeople.requestView, negativeArgs);
  const negativeJob = (await negative.t.mutation(internal.clubPeople.claim, negativeWorker)).jobs[0];
  await negative.t.mutation(internal.clubPeople.recordResult, { ...negativeWorker, personId: negativeJob.personId, leaseToken: negativeJob.leaseToken, result: { status: "unavailable" } });
  await negative.owner.mutation(api.clubPeople.requestView, negativeArgs);
  const row = await negative.t.run(ctx => ctx.db.get(negativeJob.personId));
  assert.equal(row!.retryAt, Date.now() + 24 * 3600000); assert.equal(row!.dueAt, undefined);
});

it("retention follows references, cancellation stops requests and abandoned grants are swept", async (test) => {
  test.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  const s = await setup(), worker = await ready(s), ids = await sources(s);
  const reviewView = await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() });
  await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: { kind: "scheduled_operations", operationIds: [ids.operationId] } });
  test.mock.timers.tick(16 * 60000);
  await s.t.mutation(internal.clubPeople.sweep, {});
  assert.equal(await s.t.run(ctx => ctx.db.get(reviewView.viewId)), null);
  assert.equal((await s.t.run(ctx => ctx.db.query("clubPeople").collect())).length, 1);
  await s.t.run(ctx => ctx.db.patch(ids.operationId, { state: "cancelled", completedAt: Date.now() }));
  assert.deepEqual(await s.t.mutation(internal.clubPeople.claim, worker), { jobs: [] });
  test.mock.timers.tick(31 * 24 * 3600000);
  await s.t.mutation(internal.clubPeople.sweep, {});
  assert.equal((await s.t.run(ctx => ctx.db.query("clubPeople").collect())).length, 0);
});

it("verified new audit events admit private bounded work automatically", async () => {
  const s = await setup(), ids = await sources(s);
  await s.t.run(async ctx => {
    const integration = await ctx.db.get(s.integrationId);
    await admitVerifiedAudit(ctx, integration!, ids.eventId);
    await admitVerifiedAudit(ctx, integration!, ids.eventId);
  });
  assert.equal((await s.t.run(ctx => ctx.db.query("clubPeople").collect())).length, 2);
  assert.equal((await s.t.run(ctx => ctx.db.query("clubPeopleReferences").collect())).length, 2);
  assert.equal((await s.t.run(ctx => ctx.db.query("profileLinkDestinationReferences").collect())).length, 0);
});

it("a viewed person outranks a historical audit backlog without resetting cache cooldowns", async () => {
  const s = await setup(), worker = await ready(s);
  await sources(s);
  await s.t.run(async ctx => {
    const integration = (await ctx.db.get(s.integrationId))!;
    for (let n = 0; n < 20; n++) {
      const eventId = await ctx.db.insert("communityMembershipEvents", { integrationId: s.integrationId, epochStartedAt: s.snapshot.epochStartedAt, groupId: "grp_test", auditId: `backlog${n}`, eventType: "group.member.join", targetUserId: `usr_${String(n).padStart(8, "0")}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, occurredAt: Date.now() - 100, receivedAt: Date.now(), verified: true });
      await admitVerifiedAudit(ctx, integration, eventId);
    }
  });
  await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() });
  assert.equal((await s.t.mutation(internal.clubPeople.claim, worker)).jobs[0].userId, A);
});

it("fresh public observations avoid private GETs and newer private names win without public writes", async () => {
  const s = await setup(), worker = await ready(s);
  const cacheId = await s.t.run(ctx => ctx.db.insert("profileLinkDestinations", { key: `vrchat_user:${A}`, kind: "vrchat_user", locator: A, provider: "vrchat", status: "resolved", entityId: A, name: "Public Mira", observedAt: Date.now() - 1000 }));
  const { viewId } = await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() });
  assert.deepEqual(await s.t.mutation(internal.clubPeople.claim, worker), { jobs: [] });
  assert.equal((await s.owner.query(api.clubPeople.readView, { viewId })).people[0].source, "vrchat_public_cache");
  await s.t.run(async ctx => {
    const person = (await ctx.db.query("clubPeople").first())!;
    await ctx.db.patch(person._id, { displayName: "Private Mira", observedAt: Date.now(), status: "resolved" });
  });
  assert.equal((await s.owner.query(api.clubPeople.readView, { viewId })).people[0].source, "vrchat_private");
  assert.equal((await s.t.run(ctx => ctx.db.get(cacheId)))!.name, "Public Mira");
});

it("release never lets an old replica overwrite a new result and rate limits preserve full Retry-After", async (test) => {
  test.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  const s = await setup(), worker = await ready(s);
  await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() });
  const first = (await s.t.mutation(internal.clubPeople.claim, worker)).jobs[0];
  assert.deepEqual(await s.t.mutation(internal.clubPeople.release, { ...worker, personId: first.personId, leaseToken: first.leaseToken }), { released: true });
  const secondWorker = { ...worker, workerId: "replacement" };
  const second = (await s.t.mutation(internal.clubPeople.claim, secondWorker)).jobs[0];
  assert.notEqual(first.leaseToken, second.leaseToken);
  assert.deepEqual(await s.t.mutation(internal.clubPeople.recordResult, { ...worker, personId: first.personId, leaseToken: first.leaseToken, result: { status: "resolved", userId: A, displayName: "Old" } }), { accepted: false });
  assert.deepEqual(await s.t.mutation(internal.clubPeople.recordResult, { ...secondWorker, personId: second.personId, leaseToken: second.leaseToken, result: { status: "transient", retryAfterMs: 3600000, rateLimited: true } }), { accepted: true, cooldownRecorded: true });
  assert.equal((await s.t.run(ctx => ctx.db.get(s.collectorAccountId)))!.cooldownUntil, Date.now() + 3600000);
  assert.deepEqual(await s.t.mutation(internal.clubPeople.claim, worker), { jobs: [] });
});

it("an expired lease cannot write and a restart can reclaim the exact job", async (test) => {
  test.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  const s = await setup(), worker = await ready(s);
  await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() });
  const first = (await s.t.mutation(internal.clubPeople.claim, worker)).jobs[0];
  test.mock.timers.tick(60000);
  assert.deepEqual(await s.t.mutation(internal.clubPeople.recordResult, { ...worker, personId: first.personId, leaseToken: first.leaseToken, result: { status: "resolved", userId: A, displayName: "Late" } }), { accepted: false });
  const second = (await s.t.mutation(internal.clubPeople.claim, { ...worker, workerId: "restart" })).jobs[0];
  assert.equal(first.personId, second.personId); assert.notEqual(first.leaseToken, second.leaseToken);
});

it("missing provider authority wakes collection and provider permission loss rejects results", async () => {
  const s = await setup(); process.env.VRDEX_PEOPLE_RESOLUTION_ENABLED = "true";
  await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() });
  assert.ok((await s.t.run(ctx => ctx.db.get(s.integrationId)))!.nextPollAt! <= Date.now());
  const worker = await ready(s);
  await s.t.run(ctx => ctx.db.patch(s.integrationId, { nextPollAt: Date.now() + 300000 }));
  const job = (await s.t.mutation(internal.clubPeople.claim, worker)).jobs[0];
  await s.t.run(async ctx => {
    const integration = (await ctx.db.get(s.integrationId))!;
    await ctx.db.patch(integration._id, { providerAuthority: { ...integration.providerAuthority!, authority: { ...integration.providerAuthority!.authority, permissions: [] } } });
  });
  assert.deepEqual(await s.t.mutation(internal.clubPeople.recordResult, { ...worker, personId: job.personId, leaseToken: job.leaseToken, result: { status: "resolved", userId: A, displayName: "Mira" } }), { accepted: false });
});

it("concurrent rate-limit results extend the shared cooldown while new claims stay blocked", async (test) => {
  test.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  for (const delays of [[60000, 3600000], [3600000, 60000]]) {
    const s = await setup(), worker = await ready(s);
    await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review([A, B]) });
    const first = (await s.t.mutation(internal.clubPeople.claim, worker)).jobs[0];
    const secondWorker = { ...worker, workerId: "replica" };
    const second = (await s.t.mutation(internal.clubPeople.claim, secondWorker)).jobs[0];
    const result = (job: typeof first, claimant: typeof worker, retryAfterMs: number) => s.t.mutation(internal.clubPeople.recordResult, {
      ...claimant, personId: job.personId, leaseToken: job.leaseToken, result: { status: "transient", retryAfterMs, rateLimited: true },
    });
    assert.deepEqual(await result(first, worker, delays[0]), { accepted: true, cooldownRecorded: true });
    assert.deepEqual(await s.t.mutation(internal.clubPeople.claim, worker), { jobs: [] });
    assert.deepEqual(await result(second, { ...secondWorker, workerKeyHash: "superseded" }, delays[1]), { accepted: false, cooldownRecorded: false });
    assert.equal((await s.t.run(ctx => ctx.db.get(s.collectorAccountId)))!.cooldownUntil, Date.now() + delays[0]);
    assert.deepEqual(await result(second, secondWorker, delays[1]), { accepted: true, cooldownRecorded: true });
    assert.equal((await s.t.run(ctx => ctx.db.get(s.collectorAccountId)))!.cooldownUntil, Date.now() + 3600000);
    assert.deepEqual(await s.t.mutation(internal.clubPeople.claim, secondWorker), { jobs: [] });
  }
});

it("a truncated reference scan preserves cached names and queued work until bounded pruning reaches the live reference", async (test) => {
  test.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  const s = await setup(), worker = await ready(s);
  const { viewId } = await s.owner.mutation(api.clubPeople.requestView, { communityProfileId: s.communityProfileId, source: review() });
  const personId = await s.t.run(async ctx => {
    await ctx.db.patch(s.integrationId, { enabledFeatures: ["analytics", "membership_management"] });
    const person = (await ctx.db.query("clubPeople").first())!;
    await ctx.db.patch(person._id, { displayName: "Retained Mira", observedAt: Date.now() - 1000, checkAt: Date.now() });
    for (let n = 0; n < 100; n++) {
      const eventId = await ctx.db.insert("communityMembershipEvents", { integrationId: s.integrationId, epochStartedAt: s.snapshot.epochStartedAt, groupId: "grp_test", auditId: `invalid${n}`, eventType: "group.member.join", targetUserId: A, occurredAt: Date.now() - 100, receivedAt: Date.now(), verified: false });
      const source = { kind: "audit" as const, eventId };
      await ctx.db.insert("clubPeopleReferences", { personId: person._id, integrationId: s.integrationId, source, sourceKey: JSON.stringify([source, null]), expiresAt: Number.MAX_SAFE_INTEGER, checkAt: Date.now() + 3600000 });
    }
    return person._id;
  });
  assert.deepEqual(await s.t.mutation(internal.clubPeople.claim, worker), { jobs: [] });
  assert.equal((await s.t.run(ctx => ctx.db.get(personId)))!.dueAt, Date.now());
  await s.t.mutation(internal.clubPeople.sweep, {});
  assert.equal((await s.t.run(ctx => ctx.db.get(personId)))?.displayName, "Retained Mira");
  assert.equal((await s.owner.query(api.clubPeople.readView, { viewId })).people[0].displayName, "Retained Mira");
  await s.t.run(async ctx => {
    const refs = await ctx.db.query("clubPeopleReferences").withIndex("by_person_key", q => q.eq("personId", personId)).collect();
    for (const ref of refs) if (ref.source.kind === "audit") await ctx.db.patch(ref._id, { checkAt: Date.now() });
  });
  await s.t.mutation(internal.clubPeople.sweep, {});
  await s.t.mutation(internal.clubPeople.sweep, {});
  assert.equal((await s.t.mutation(internal.clubPeople.claim, worker)).jobs[0].personId, personId);
  assert.equal((await s.t.run(ctx => ctx.db.get(personId)))?.displayName, "Retained Mira");
});
