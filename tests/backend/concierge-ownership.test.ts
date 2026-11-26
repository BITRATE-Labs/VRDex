import assert from "node:assert/strict";
import { test } from "node:test";
import { convexTest } from "convex-test";

import { api } from "../../convex/_generated/api";
import schemaModule from "../../convex/schema";
import { newClerkUserId } from "./_clerkTestIdentity";

const schema = (schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule;
const modules = {
  "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"),
  "../../convex/conciergeOwnership.ts": () => import("../../convex/conciergeOwnership"),
};
const lookup = { slug: "test-club", email: "recipient@example.com" };

async function fixture() {
  const t = convexTest({ schema, modules });
  const now = Date.now();
  const identity = {
    subject: newClerkUserId(),
    email: "operator@example.com",
    emailVerified: true,
  };
  const ids = await t.run(async ({ db }) => {
    const operatorId = await db.insert("users", { clerkUserId: identity.subject, email: identity.email, emailVerificationTime: now });
    const userId = await db.insert("users", { clerkUserId: newClerkUserId(), email: lookup.email, emailVerificationTime: now });
    const profileId = await db.insert("profiles", {
      slug: lookup.slug, displayName: "Test Club", sortName: "test club", profileType: "community",
      community: { categoryTags: [] }, aliases: [], tags: [], claimState: "unclaimed", creationSource: "community",
      publicationState: "published", publicSurfacingState: "public", updatedAt: now,
    });
    const grantId = await db.insert("accountFeatureGrants", {
      feature: "super_admin", state: "active", userId: operatorId,
      grantedBy: { subject: "fixture", issuer: "fixture", tokenIdentifier: "fixture" },
      grantedAt: now, updatedAt: now,
    });
    return { operatorId, userId, profileId, grantId };
  });
  const args = { ...lookup, expectedProfileId: ids.profileId, expectedUserId: ids.userId, reason: "Requested by the organizer" };
  return { t, actor: t.withIdentity(identity), ids, args };
}

test("concierge assignment records one owner and audits the actual operator and recipient", async () => {
  const { t, actor, ids, args } = await fixture();
  const preview = await actor.query(api.conciergeOwnership.previewAssignment, lookup);
  assert.equal(preview.userId, ids.userId);
  await actor.mutation(api.conciergeOwnership.assignProfile, args);
  await assert.rejects(actor.mutation(api.conciergeOwnership.assignProfile, args), /Profile already claimed/);
  await t.run(async ({ db }) => {
    assert.equal((await db.get(ids.profileId))?.claimState, "claimed_unverified");
    const owners = await db.query("profileOwners").collect();
    assert.deepEqual(owners.map(({ userId, state }) => ({ userId, state })), [{ userId: ids.userId, state: "active" }]);
    const audit = await db.query("profileAuditEvents").unique();
    assert.equal(audit?.action, "profile_owner_assigned_by_super_admin");
    assert.equal(audit?.targetUserId, ids.userId);
    assert.equal(audit?.note, args.reason);
    assert.ok(audit?.actor?.subject);
  });
});

test("concierge assignment rechecks privilege, exact account and verification after preview", async () => {
  const { t, actor, ids, args } = await fixture();
  await assert.rejects(t.query(api.conciergeOwnership.previewAssignment, lookup), /SIGN_IN_REQUIRED/);
  await assert.rejects(actor.mutation(api.conciergeOwnership.assignProfile, {
    ...args, expectedUserId: ids.operatorId,
  }), /account changed/);
  await t.run(({ db }) => db.patch(ids.userId, { emailVerificationTime: undefined }));
  await assert.rejects(actor.mutation(api.conciergeOwnership.assignProfile, args), /No unique verified account/);
  await t.run(({ db }) => db.patch(ids.grantId, { state: "revoked" }));
  await assert.rejects(actor.query(api.conciergeOwnership.previewAssignment, lookup), /Super admin access required/);
  await assert.rejects(actor.mutation(api.conciergeOwnership.assignProfile, args), /Super admin access required/);
});
