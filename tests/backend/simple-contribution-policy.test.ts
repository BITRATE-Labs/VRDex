import assert from "node:assert/strict";
import { it } from "node:test";
import { convexTest } from "convex-test";
import { schema, modules, seed } from "./_mediaReviewFixture";
import { internal } from "../../convex/_generated/api";
import { contributionChargeRefusal, effectiveContributionPolicy, insertMediaSubmission } from "../../convex/_contributionCapacity";
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

it("capacity discovery keeps shared usage admin-only and honors explicit admin operational caps", async () => {
  const t = convexTest({ schema, modules: { ...modules,
    "../../convex/contributionCapacity.ts": () => import("../../convex/contributionCapacity") } });
  const s = await seed(t);
  await t.run(async ctx => {
    await ctx.db.insert("contributionCapacity", { scope: `actor:${s.moderatorUserId}`, bytes: 12, processing: 1, byteLimit: 20, processingLimit: 1 });
    await ctx.db.insert("contributionCapacity", { scope: "deployment", bytes: 100, processing: 2 });
    for (const userId of [s.contributorUserId, s.moderatorUserId]) await ctx.db.insert("oauthAccessTokens", {
      tokenId: String(userId), clientId: "client", subjectType: "user", userId,
      resource: "https://example.test/mcp", scopes: ["mcp:read", "assets:contribute"],
      status: "active", issuedAt: Date.now(), expiresAt: Date.now() + 3600000,
    });
  });
  for (const userId of [s.contributorUserId, s.moderatorUserId]) {
    const result = await t.query(internal.contributionCapacity.get, { actorUserId: userId,
      oauthClientId: "client", oauthTokenId: String(userId), emailVerified: true, emailVerificationAttestedAt: Date.now() });
    if (userId === s.contributorUserId) {
      assert.equal(result.deployment.usage, undefined);
      assert.equal(result.deployment.remaining, undefined);
    } else {
      assert.equal(result.limits.actorBytes, 20);
      assert.equal(result.remaining.bytes, 8);
      assert.equal(result.remaining.concurrency, 0);
      assert.equal(result.deployment.usage.bytes, 100);
    }
  }
  const reservation = { actorUserId: s.moderatorUserId, profileId: s.profileId };
  assert.equal(await t.run(ctx => contributionChargeRefusal(ctx.db, reservation, 9, 0)), "CONTRIBUTION_ACTOR_BYTES");
  assert.equal(await t.run(ctx => contributionChargeRefusal(ctx.db, reservation, 0, 1)), "CONTRIBUTION_ACTOR_CONCURRENCY");
});

it("trusted ceiling discovery and admission stay within Convex transaction read limits with large source metadata", async () => {
  const env = { ...process.env };
  Object.assign(process.env, { VRDEX_CONTRIBUTION_UPLOADS_ENABLED: "true", VRDEX_PROFILE_MEDIA_KIT_ENABLED: "true",
    VRDEX_PROFILE_MEDIA_SUBMISSIONS_ENABLED: "true", VRDEX_MEDIA_UPLOAD_CLEANUP_READY: "true",
    VRDEX_MEDIA_CLEANUP_URL: "https://example.test/api/internal/media-cleanup", VRDEX_MEDIA_CLEANUP_TOKEN: "test" });
  try {
  const t = convexTest({ schema, modules: { ...modules,
    "../../convex/contributionCapacity.ts": () => import("../../convex/contributionCapacity"),
    "../../convex/contributionUploads.ts": () => import("../../convex/contributionUploads") }, transactionLimits: { bytesRead: 8 * 1024 * 1024 } });
  const s = await seed(t);
  const now = Date.now();
  await t.run(async ctx => {
    await ctx.db.insert("accountFeatureGrants", { userId: s.contributorUserId, feature: "trusted_contributor", state: "active",
      grantedBy: { tokenIdentifier: "test:operator", issuer: "test", subject: "operator" }, grantedAt: now, updatedAt: now });
    await ctx.db.insert("oauthAccessTokens", { tokenId: "trusted-budget", clientId: "client", subjectType: "user", userId: s.contributorUserId,
      resource: "https://example.test/mcp", scopes: ["mcp:read", "mcp:write", "assets:contribute"], status: "active", issuedAt: now, expiresAt: now + 3600000 });
  });
  for (let offset = 0; offset < 1000; offset += 100) await t.run(async ctx => {
    for (let i = offset; i < offset + 100; i++) await ctx.db.insert("profileMediaSubmissions", {
      profileId: s.profileId, targetProfileSlug: "community-dj", targetProfileDisplayName: "Community DJ", submitterUserId: s.contributorUserId,
      submitter: { issuer: "test", subject: "contributor", tokenIdentifier: "test:contributor" },
      requestedPlacement: "gallery", credit: "Artist", status: "submitted", sourceUrl: "https://example.test/" + "x".repeat(4075),
      sourceDescription: "x".repeat(1000), privateReason: "x".repeat(1000),
      targetProfileUpdatedAt: now, expiresAt: now + 3600000, createdAt: now - 120000, updatedAt: now,
    });
  });
  for (let offset = 0; offset < 10000; offset += 250) await t.run(async ctx => {
    for (let i = offset; i < offset + 250; i++) await ctx.db.insert("contributionBatches", {
      actorUserId: s.contributorUserId, idempotencyKey: `envelope-${i}`, label: "x".repeat(120),
      archived: true, rowCount: 0, createdAt: i, payloadCleanupCursor: "x".repeat(800),
    });
  });
  const authority = { actorUserId: s.contributorUserId, oauthClientId: "client", oauthTokenId: "trusted-budget", emailVerified: true, emailVerificationAttestedAt: now };
  const capacity = await t.query(internal.contributionCapacity.get, authority);
  assert.equal(capacity.usage.open, 1000);
  assert.equal(capacity.remaining.open, 0);
  assert.equal(capacity.usage.creations24hIsLowerBound, true);
  assert.equal(capacity.remaining.creations24h, null);
  assert.equal(capacity.usage.retainedBatchesIsLowerBound, true);
  const refusal = await t.mutation(internal.contributionUploads.begin, { ...authority, mode: "contributor", profileId: s.profileId,
    expectedUpdatedAt: Date.parse("2026-08-26T12:00:00Z"), placement: "profile_image", contentType: "image/png", byteLength: 512,
    sha256: "a".repeat(64), credit: "Artist", sourceDescription: "Budget regression", idempotencyKey: "trusted-over-ceiling" });
  assert.equal(refusal.receipt?.code, "CONTRIBUTION_ACTOR_OPEN_LIMIT");
  } finally { for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env); }
});

it("admits below both trusted quotas with disjoint large pending and decided histories", async () => {
  const env = { ...process.env };
  Object.assign(process.env, { VRDEX_CONTRIBUTION_UPLOADS_ENABLED: "true", VRDEX_PROFILE_MEDIA_KIT_ENABLED: "true",
    VRDEX_PROFILE_MEDIA_SUBMISSIONS_ENABLED: "true", VRDEX_MEDIA_UPLOAD_CLEANUP_READY: "true",
    VRDEX_MEDIA_CLEANUP_URL: "https://example.test/api/internal/media-cleanup", VRDEX_MEDIA_CLEANUP_TOKEN: "test" });
  try {
    const t = convexTest({ schema, modules: { ...modules,
      "../../convex/contributionUploads.ts": () => import("../../convex/contributionUploads"),
      "../../convex/contributionCapacity.ts": () => import("../../convex/contributionCapacity") }, transactionLimits: true });
    const s = await seed(t), now = Date.now();
    const profileId = await t.run(async ctx => {
      await ctx.db.insert("accountFeatureGrants", { userId: s.contributorUserId, feature: "trusted_contributor", state: "active",
        grantedBy: { tokenIdentifier: "test:operator", issuer: "test", subject: "operator" }, grantedAt: now, updatedAt: now });
      await ctx.db.insert("oauthAccessTokens", { tokenId: "trusted-admit", clientId: "client", subjectType: "user", userId: s.contributorUserId,
        resource: "https://example.test/mcp", scopes: ["mcp:read", "mcp:write", "assets:contribute"], status: "active", issuedAt: now, expiresAt: now + 3600000 });
      const { _id, _creationTime, ...profile } = (await ctx.db.get(s.profileId))!;
      return ctx.db.insert("profiles", { ...profile, slug: "fresh-target" });
    });
    for (const status of ["submitted", "rejected"] as const) {
      for (let offset = 0; offset < 999; offset += 50) await t.run(async ctx => {
        for (let i = offset; i < Math.min(offset + 50, 999); i++) await insertMediaSubmission(ctx.db, {
          profileId: s.profileId, targetProfileSlug: "community-dj", targetProfileDisplayName: "Community DJ", submitterUserId: s.contributorUserId,
          submitter: { issuer: "test", subject: "contributor", tokenIdentifier: "test:contributor" },
          requestedPlacement: "gallery", credit: "x".repeat(120), status, sourceUrl: "https://example.test/" + "x".repeat(4075),
          creditUrl: "https://example.test/" + "x".repeat(2027), sourceDescription: "x".repeat(1000), contributorNote: "x".repeat(500),
          originalFileName: "x".repeat(180), label: "x".repeat(80), altText: "x".repeat(180), privateReason: status === "rejected" ? "x".repeat(1000) : undefined,
          targetProfileUpdatedAt: now, expiresAt: now + 3600000, createdAt: now - (status === "submitted" ? 2 * 86400000 : 120000), updatedAt: now,
        });
      });
    }
    const result = await t.mutation(internal.contributionUploads.begin, { actorUserId: s.contributorUserId, oauthClientId: "client", oauthTokenId: "trusted-admit",
      emailVerified: true, emailVerificationAttestedAt: now, mode: "contributor", profileId,
      expectedUpdatedAt: Date.parse("2026-08-26T12:00:00Z"), placement: "profile_image", contentType: "image/png", byteLength: 512,
      sha256: "a".repeat(64), credit: "Artist", sourceDescription: "Budget regression", idempotencyKey: "trusted-below-ceilings" });
    assert.ok("intentId" in result, JSON.stringify(result));
    const capacity = await t.query(internal.contributionCapacity.get, { actorUserId: s.contributorUserId,
      oauthClientId: "client", oauthTokenId: "trusted-admit", emailVerified: true, emailVerificationAttestedAt: now });
    assert.equal(capacity.usage.creations24h, 1000);
    assert.equal(capacity.remaining.creations24h, 0);
    assert.equal(capacity.retryAt, now - 120000 + 86400000);
  } finally { for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env); }
});
