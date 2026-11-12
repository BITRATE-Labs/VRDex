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
  assert.deepEqual(result.get(id), { displayName: "Mira", observedAt: now, vrchatUrl: `https://vrchat.com/home/user/${id}`, vrdexUrl: "/mira", profileDisplayName: "Different VRDex name" });
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

it("never selects a second profile when another eligible profile has unresolved proof overflow", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const proof = await ctx.db.get(f.proofId); assert.ok(proof);
    const { _id: proofId, _creationTime: proofCreation, ...proofData } = proof;
    for (let n = 0; n < 20; n++) await ctx.db.insert("externalControlProofs", proofData);
    const otherUserId = await ctx.db.insert("users", { clerkUserId: newClerkUserId() });
    const profile = await ctx.db.get(f.profileId); assert.ok(profile);
    const { _id, _creationTime, ...profileData } = profile;
    const profileId = await ctx.db.insert("profiles", { ...profileData, slug: "second-mira" });
    await ctx.db.insert("profileOwners", { profileId, userId: otherUserId, roleKey: "owner", state: "active", grantedAt: now, updatedAt: now });
    const otherProofId = await ctx.db.insert("externalControlProofs", { ...proofData, userId: otherUserId });
    await ctx.db.insert("profileExternalLinks", { profileId, assetType: "vrchat_user", assetExternalId: id, linkRole: "primary", state: "active", verifiedByProofId: otherProofId, createdAt: now, updatedAt: now });
  });
  assert.equal((await f.read()).get(id)?.vrdexUrl, undefined);
});

it("deduplicates local lookups and stops optional profile work at the page budget", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.delete(f.linkId));
  const queryCount = await f.t.run(async ctx => {
    let count = 0;
    const db = new Proxy(ctx.db, { get(target, key) {
      if (key === "query") return (table: Parameters<typeof target.query>[0]) => { count++; return target.query(table); };
      return Reflect.get(target, key);
    } });
    await membershipActivityIdentities({ ...ctx, db }, Array(200).fill(id));
    return count;
  });
  assert.equal(queryCount, 2);
  const ids = await f.t.run(async ctx => {
    const source = await ctx.db.get(f.profileId); assert.ok(source);
    const { _id, _creationTime, ...data } = source;
    const ids: string[] = [];
    for (let n = 1; n <= 6; n++) {
      const userId = `usr_00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      ids.push(userId);
      const profileId = await ctx.db.insert("profiles", { ...data, slug: `budget-${n}` });
      await ctx.db.insert("profileOwners", { profileId, userId: f.userId, roleKey: "owner", state: "active", grantedAt: now, updatedAt: now });
      const proofId = await ctx.db.insert("externalControlProofs", { userId: f.userId, assetType: "vrchat_user", assetExternalId: userId, controlLevel: "self", state: "active", evidenceSource: "vrchat_api", verifiedAt: now, revalidateAfter: now, createdAt: now, updatedAt: now });
      for (let link = 0; link < 20; link++) await ctx.db.insert("profileExternalLinks", { profileId, assetType: "vrchat_user", assetExternalId: userId, linkRole: "primary", state: "active", verifiedByProofId: proofId, createdAt: now, updatedAt: now });
    }
    return ids;
  });
  const entries = await f.t.run(async ctx => [...await membershipActivityIdentities(ctx, ids)]);
  assert.equal(entries.filter(([, identity]) => identity.vrdexUrl).length, 5);
  assert.equal(entries[5][1].vrdexUrl, undefined);
  assert.ok(entries[5][1].vrchatUrl);
});

it("bounds all optional identity lookups when a pinned page expands", async () => {
  const f = await fixture();
  await f.t.run(async ctx => { await ctx.db.delete(f.linkId); await ctx.db.delete(f.cacheId); });
  const ids = Array.from({ length: 1000 }, (_, index) => `usr_00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  const result = await f.t.run(async ctx => {
    let queries = 0;
    const db = new Proxy(ctx.db, { get(target, key) {
      if (key === "query") return (table: Parameters<typeof target.query>[0]) => { queries++; return target.query(table); };
      return Reflect.get(target, key);
    } });
    const identities = await membershipActivityIdentities({ ...ctx, db }, ids);
    return { queries, identities: [...identities] };
  });
  assert.equal(result.queries, 400);
  const identities = new Map(result.identities);
  assert.equal(identities.size, 1000);
  assert.deepEqual(identities.get(ids[999]), { vrchatUrl: `https://vrchat.com/home/user/${ids[999]}` });
});
