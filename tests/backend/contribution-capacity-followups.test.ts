process.env.VRDEX_PROFILE_MEDIA_KIT_ENABLED = "true";
import assert from "node:assert/strict";
import { it } from "node:test";
import { convexTest } from "convex-test";
import { internal } from "../../convex/_generated/api";
import { modules as base, schema, seed, NOW } from "./_mediaReviewFixture";

const modules = {
  ...base,
  "../../convex/contributionCapacity.ts": () => import("../../convex/contributionCapacity"),
  "../../convex/contributionUploads.ts": () => import("../../convex/contributionUploads"),
};

async function setup() {
  Object.assign(process.env, {
    VRDEX_CONTRIBUTION_UPLOADS_ENABLED: "true",
    VRDEX_MEDIA_UPLOAD_CLEANUP_READY: "true",
    VRDEX_MEDIA_CLEANUP_URL: "https://example.test/api/internal/media-cleanup",
    VRDEX_MEDIA_CLEANUP_TOKEN: "test",
    VRDEX_PROFILE_MEDIA_SUBMISSIONS_ENABLED: "true",
  });
  const t = convexTest({ schema, modules });
  const s = await seed(t);
  await t.run(async ctx => {
    for (const clientId of ["first", "second"])
      await ctx.db.insert("oauthAccessTokens", {
        tokenId: clientId, clientId, subjectType: "user", userId: s.contributorUserId,
        resource: "https://example.test/mcp", scopes: ["mcp:read", "mcp:write", "assets:contribute"],
        status: "active", issuedAt: Date.now(), expiresAt: Date.now() + 3600000,
      });
  });
  const authority = (clientId = "first") => ({ actorUserId: s.contributorUserId,
    oauthClientId: clientId, oauthTokenId: clientId, emailVerified: true,
    emailVerificationAttestedAt: Date.now() });
  return { t, s, authority };
}

it("deletes expired source-host windows in bounded pages and leaves current counters", async () => {
  const { t } = await setup();
  const window = Math.floor(Date.now() / 60000);
  await t.run(async ctx => {
    for (let i = 0; i < 205; i++) await ctx.db.insert("contributionHostFetches", {
      host: `old-${i}.example.test`, window: window - 1, count: 1,
    });
    await ctx.db.insert("contributionHostFetches", { host: "current.example.test", window, count: 4 });
  });
  assert.equal(await t.mutation(internal.contributionCapacity.sweepExpiredHostFetches, {}), 100);
  assert.equal(await t.mutation(internal.contributionCapacity.sweepExpiredHostFetches, {}), 100);
  assert.equal(await t.mutation(internal.contributionCapacity.sweepExpiredHostFetches, {}), 5);
  const rows = await t.run(ctx => ctx.db.query("contributionHostFetches").collect());
  assert.deepEqual(rows.map(row => [row.host, row.window, row.count]), [["current.example.test", window, 4]]);
});

it("caps fresh refusal receipts across clients but preserves old replay and valid admission", async () => {
  const { t, s, authority } = await setup();
  const old = await t.run(async ctx => {
    for (let i = 0; i < 255; i++) await ctx.db.insert("contributionAdmissionRefusals", {
      actorUserId: s.contributorUserId, clientId: i % 2 ? "first" : "second",
      key: `old-${i}`, fingerprint: "historical", receipt: {
        operationId: `receipt-${i}`, operationState: "refused", code: "CONTRIBUTION_ACTOR_BYTES",
      }, createdAt: 1,
    });
    return ctx.db.insert("contributionCapacity", { scope: `actor:${s.contributorUserId}`,
      bytes: 0, processing: 0, byteLimit: 0 });
  });
  const request = (key: string, client = "first") => ({ ...authority(client), mode: "contributor" as const,
    profileId: s.profileId, expectedUpdatedAt: NOW, placement: "profile_image" as const,
    contentType: "image/png", byteLength: 512, sha256: "a".repeat(64),
    credit: "Artist", sourceDescription: "Artist supplied image", idempotencyKey: key });
  const admittedRefusal = await t.mutation(internal.contributionUploads.begin, request("boundary", "second"));
  assert.equal(admittedRefusal.receipt?.code, "CONTRIBUTION_ACTOR_BYTES");
  assert.deepEqual(await t.mutation(internal.contributionUploads.begin, request("boundary", "second")), admittedRefusal);
  await assert.rejects(t.mutation(internal.contributionUploads.begin, { ...request("boundary", "second"), credit: "Changed" }), /UPLOAD_IDEMPOTENCY_CONFLICT/);
  await assert.rejects(t.mutation(internal.contributionUploads.begin, request("overflow")), /UPLOAD_REFUSAL_RECEIPT_LIMIT/);
  assert.equal((await t.run(ctx => ctx.db.query("contributionAdmissionRefusals")
    .withIndex("by_actor_client_key", q => q.eq("actorUserId", s.contributorUserId)).collect())).length, 256);
  await t.run(ctx => ctx.db.patch(old, { byteLimit: undefined }));
  assert.ok("intentId" in await t.mutation(internal.contributionUploads.begin, request("success")));
});

it("fails closed when oversized historical refusals exhaust the bounded read", async () => {
  const { t, s, authority } = await setup();
  await t.run(async ctx => {
    for (let i = 0; i < 12; i++) await ctx.db.insert("contributionAdmissionRefusals", {
      actorUserId: s.contributorUserId, clientId: "first", key: `huge-${i}`,
      fingerprint: "x".repeat(900000), receipt: {
        operationId: `huge-${i}`, operationState: "refused", code: "CONTRIBUTION_ACTOR_BYTES",
      }, createdAt: 1,
    });
    await ctx.db.insert("contributionCapacity", { scope: `actor:${s.contributorUserId}`,
      bytes: 0, processing: 0, byteLimit: 0 });
  });
  await assert.rejects(t.mutation(internal.contributionUploads.begin, {
    ...authority(), mode: "contributor", profileId: s.profileId, expectedUpdatedAt: NOW,
    placement: "profile_image", contentType: "image/png", byteLength: 512,
    sha256: "a".repeat(64), credit: "Artist", sourceDescription: "Artist supplied image",
    idempotencyKey: "fresh",
  }), /UPLOAD_REFUSAL_RECEIPT_LIMIT/);
});
