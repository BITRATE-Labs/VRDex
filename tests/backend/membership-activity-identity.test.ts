import assert from "node:assert/strict";
import { it } from "node:test";
import { convexTest } from "convex-test";
import schemaModule from "../../convex/schema";
import { membershipActivityIdentities } from "../../convex/_membershipActivityIdentity";
import { newClerkUserId } from "./_clerkTestIdentity";
const schema = (schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule;
const id = "usr_00000000-0000-4000-8000-000000000001";
const now = Date.now() - 1000;
async function fixture() {
  const t = convexTest({ schema, modules: { "../../convex/_generated/api.ts": () => import("../../convex/_generated/api") } });
  const rows = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { clerkUserId: newClerkUserId() });
    const profileId = await ctx.db.insert("profiles", { profileType: "person", person: { roleTags: [] }, slug: "mira", displayName: "Different VRDex name", sortName: "mira", aliases: [], tags: [], claimState: "claimed_verified", publicationState: "published", publicSurfacingState: "public", creationSource: "self", updatedAt: now });
    await ctx.db.insert("profileOwners", { profileId, userId, roleKey: "owner", state: "active", grantedAt: now, updatedAt: now });
    const proofId = await ctx.db.insert("externalControlProofs", { userId, assetType: "vrchat_user", assetExternalId: id, controlLevel: "self", state: "stale", evidenceSource: "vrchat_api", verifiedAt: now, revalidateAfter: now, createdAt: now, updatedAt: now });
    const linkId = await ctx.db.insert("profileExternalLinks", { profileId, assetType: "vrchat_user", assetExternalId: id, linkRole: "primary", state: "active", provenance: "control_association", verifiedByProofId: proofId, createdAt: now, updatedAt: now });
    const cacheId = await ctx.db.insert("profileLinkDestinations", { key: `vrchat_user:${id}`, kind: "vrchat_user", locator: id, provider: "vrchat", status: "resolved", entityId: id, name: "Mira", observedAt: now });
    return { profileId, proofId, linkId, cacheId, userId };
  });
  const read = async () => new Map(await t.run(async ctx => [...await membershipActivityIdentities(ctx, [id, id.toUpperCase(), "invalid"])]));
  return { t, ...rows, read };
}
it("deduplicates normalized identities and uses cache names rather than VRDex display-name guesses", async () => {
  const f = await fixture();
  const result = await f.read();
  assert.equal(result.size, 1);
  assert.deepEqual(result.get(id), { displayName: "Mira", observedAt: now, vrchatUrl: `https://vrchat.com/home/user/${id}`, vrdexUrl: "/mira" });
  await f.t.run(ctx => ctx.db.patch(f.cacheId, { status: "unavailable" }));
  assert.equal((await f.read()).get(id)?.displayName, undefined);
});
it("omits hidden, directory-only, unverified and revoked VRDex matches", async () => {
  for (const invalid of ["hidden", "private links", "directory", "removed", "revoked", "wrong proof target", "proof overflow"]) {
    const f = await fixture();
    await f.t.run(async ctx => {
      if (invalid === "hidden") await ctx.db.patch(f.profileId, { publicSurfacingState: "suppressed" });
      if (invalid === "private links") await ctx.db.patch(f.profileId, { fieldVisibility: { outboundLinks: "private" } });
      if (invalid === "directory") await ctx.db.patch(f.linkId, { provenance: "directory_reference" });
      if (invalid === "removed") await ctx.db.patch(f.linkId, { state: "removed" });
      if (invalid === "revoked") await ctx.db.patch(f.proofId, { state: "revoked" });
      if (invalid === "wrong proof target") await ctx.db.patch(f.proofId, { assetExternalId: "usr_other" });
      if (invalid === "proof overflow") {
        const proof = await ctx.db.get(f.proofId); assert.ok(proof);
        const { _id, _creationTime, ...data } = proof;
        for (let n = 0; n < 20; n++) await ctx.db.insert("externalControlProofs", data);
      }
    });
    assert.equal((await f.read()).get(id)?.vrdexUrl, undefined, invalid);
  }
});
it("omits ambiguous and overflowed profile matches without hiding the VRChat link", async () => {
  for (const count of [1, 20]) {
    const f = await fixture();
    await f.t.run(async ctx => {
      const profile = await ctx.db.get(f.profileId); assert.ok(profile);
      const { _id, _creationTime, ...data } = profile;
      for (let n = 0; n < count; n++) {
        const profileId = await ctx.db.insert("profiles", { ...data, slug: `mira-${n}` });
        await ctx.db.insert("profileOwners", { profileId, userId: f.userId, roleKey: "owner", state: "active", grantedAt: now, updatedAt: now });
        await ctx.db.insert("profileExternalLinks", { profileId, assetType: "vrchat_user", assetExternalId: id, linkRole: "primary", state: "active", verifiedByProofId: f.proofId, createdAt: now, updatedAt: now });
      }
    });
    const result = (await f.read()).get(id);
    assert.equal(result?.vrdexUrl, undefined);
    assert.ok(result?.vrchatUrl);
  }
});
