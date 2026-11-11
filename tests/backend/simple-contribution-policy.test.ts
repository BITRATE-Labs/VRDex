import assert from "node:assert/strict";
import { it } from "node:test";
import { convexTest } from "convex-test";
import { schema, modules, seed } from "./_mediaReviewFixture";
import { internal } from "../../convex/_generated/api";
import { effectiveContributionPolicy } from "../../convex/_contributionCapacity";
import { getAccountFeatureAccess } from "../../convex/_accountFeatures";

for (const feature of ["trusted_contributor", "media_reviewer", "trusted_publisher"] as const) {
  it(`${feature} receives standing trusted capacity without changing publication authority`, async () => {
    const t = convexTest({ schema, modules });
    const s = await seed(t);
    const grant = await t.run(ctx => ctx.db.insert("accountFeatureGrants", {
      userId: s.contributorUserId, feature, state: "active",
      grantedBy: { tokenIdentifier: "test:operator", issuer: "test", subject: "operator" },
      grantedAt: Date.now(), updatedAt: Date.now(),
    }));
    const policy = await t.run(ctx => effectiveContributionPolicy(ctx.db, s.contributorUserId));
    assert.equal(policy.tier, "trusted");
    assert.equal(policy.limits.dailyActor, 1000);
    assert.equal(policy.limits.openActor, 1000);
    assert.equal(policy.limits.dailyTarget, 100);
    assert.equal(policy.limits.openTarget, 20);
    assert.equal(policy.limits.burst, 12);
    assert.equal(policy.limits.actorBytes, 20 * 1024 ** 3);
    const access = await t.run(ctx => getAccountFeatureAccess(ctx.db, s.contributorUserId));
    assert.equal(access.canPublishMedia, feature === "trusted_publisher");
    await t.run(ctx => ctx.db.patch(grant, { expiresAt: Date.now() - 1 }));
    assert.equal((await t.run(ctx => effectiveContributionPolicy(ctx.db, s.contributorUserId))).tier, "ordinary");
    await t.run(ctx => ctx.db.patch(grant, { expiresAt: undefined, state: "revoked" }));
    assert.equal((await t.run(ctx => effectiveContributionPolicy(ctx.db, s.contributorUserId))).tier, "ordinary");
  });
}
it("superadmins have no contributor quotas while shared deployment guards remain", async () => {
  const t = convexTest({ schema, modules });
  const s = await seed(t);
  const policy = await t.run(ctx => effectiveContributionPolicy(ctx.db, s.moderatorUserId));
  assert.equal(policy.tier, "superadmin");
  for (const key of ["dailyActor", "dailyTarget", "openActor", "openTarget", "burst", "actorBytes", "actorProcessing"] as const)
    assert.equal(policy.limits[key], null, key);
  assert.equal(policy.deploymentProcessing, 16);
  assert.equal(policy.limits.targetProcessing, 2);
});

it("authenticated superadmin discovery skips unlimited submission history and reports shared safety limits", async () => {
  const t = convexTest({ schema, modules: { ...modules,
    "../../convex/contributionCapacity.ts": () => import("../../convex/contributionCapacity") },
    transactionLimits: { bytesRead: 32000 } });
  const s = await seed(t);
  await t.run(async ctx => {
    await ctx.db.insert("oauthAccessTokens", {
      tokenId: "admin-capacity", clientId: "client", subjectType: "user", userId: s.moderatorUserId,
      resource: "https://example.test/mcp", scopes: ["mcp:read", "assets:contribute"],
      status: "active", issuedAt: Date.now(), expiresAt: Date.now() + 3600000,
    });
    for (let i = 0; i < 100; i++) await ctx.db.insert("profileMediaSubmissions", {
      profileId: s.profileId, targetProfileSlug: "community-dj", targetProfileDisplayName: "Community DJ", submitterUserId: s.moderatorUserId,
      submitter: { issuer: "test", subject: "admin", tokenIdentifier: "test:admin" },
      requestedPlacement: "gallery", credit: "Artist", status: "submitted",
      targetProfileUpdatedAt: Date.now(), expiresAt: Date.now() + 3600000,
      createdAt: Date.now(), updatedAt: Date.now(), sourceDescription: "x".repeat(1000),
    });
  });
  const capacity = await t.query(internal.contributionCapacity.get, {
    actorUserId: s.moderatorUserId, oauthClientId: "client", oauthTokenId: "admin-capacity",
    emailVerified: true, emailVerificationAttestedAt: Date.now(),
  });
  assert.equal(capacity.tier, "superadmin");
  assert.equal(capacity.remaining.creations24h, null);
  assert.equal(capacity.remaining.open, null);
  assert.equal(capacity.remaining.bytes, null);
  assert.equal(capacity.usage.creations24h, null);
  assert.equal(capacity.retryAt, null);
  assert.equal(capacity.deployment.concurrency, 16);
  await t.run(async ctx => {
    await ctx.db.insert("contributionCapacity", { scope: "deployment", bytes: 100, processing: 2,
      byteLimit: 1000, processingLimit: 3 });
    await ctx.db.insert("contributionCapacity", { scope: "published", bytes: 200, processing: 0 });
  });
  const shared = await t.query(internal.contributionCapacity.get, {
    actorUserId: s.moderatorUserId, oauthClientId: "client", oauthTokenId: "admin-capacity",
    emailVerified: true, emailVerificationAttestedAt: Date.now(),
  });
  assert.equal(shared.deployment.bytes, 1000);
  assert.equal(shared.deployment.concurrency, 3);
  assert.equal(shared.deployment.remaining.bytes, 700);
  assert.equal(shared.deployment.remaining.concurrency, 1);
});
