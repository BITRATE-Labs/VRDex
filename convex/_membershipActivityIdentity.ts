import { v, type Infer } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { normalizeVrchatTargetId } from "./_vrchatIdentity";
import { getActiveProfileOwner } from "./_profileOwnership";
import { canReadProfile } from "./_profilePermissions";
import { isProfileFieldVisible } from "./_profileFieldVisibility";
import { getProfileConnectionVerifications } from "./_profileConnectionVerification";

export const membershipIdentity = v.object({
  vrchatUrl: v.string(),
  displayName: v.optional(v.string()),
  observedAt: v.optional(v.number()),
  vrdexUrl: v.optional(v.string()),
  profileDisplayName: v.optional(v.string()),
});

export async function membershipActivityIdentities(ctx: QueryCtx, ids: readonly string[]) {
  const result = new Map<string, Infer<typeof membershipIdentity>>();
  let verificationBudget = 100;
  for (const raw of new Set(ids)) {
    const id = normalizeVrchatTargetId(raw, "vrchat_user");
    if (!id || result.has(id)) continue;
    const identity: Infer<typeof membershipIdentity> = { vrchatUrl: `https://vrchat.com/home/user/${id}` };
    // Pinned windows can grow beyond the requested page size.
    if (result.size >= 200) { result.set(id, identity); continue; }
    const cached = await ctx.db.query("profileLinkDestinations").withIndex("by_key", q => q.eq("key", `vrchat_user:${id}`)).unique();
    if (cached?.status === "resolved" && cached.entityId?.toLowerCase() === id && cached.name?.trim() && cached.observedAt !== undefined && Number.isFinite(cached.observedAt) && cached.observedAt <= Date.now()) {
      identity.displayName = cached.name;
      identity.observedAt = cached.observedAt;
    }
    const links = await ctx.db.query("profileExternalLinks")
      .withIndex("by_assetType_assetExternalId_state", q => q.eq("assetType", "vrchat_user").eq("assetExternalId", id).eq("state", "active")).take(21);
    if (links.length <= 20 && links.length <= verificationBudget) {
      verificationBudget -= links.length;
      const profiles = new Map<string, { slug: string; displayName: string }>();
      let unresolved = false;
      for (const link of links) {
        const profile = await ctx.db.get(link.profileId);
        if (!profile || profile.profileType !== "person" || !canReadProfile("public", profile) || !isProfileFieldVisible(profile, "outboundLinks", "discovery")) continue;
        const owner = await getActiveProfileOwner(ctx.db, profile._id);
        if (!owner) continue;
        const proofs = await ctx.db.query("externalControlProofs")
          .withIndex("by_userId_assetType_assetExternalId", q => q.eq("userId", owner.userId).eq("assetType", "vrchat_user").eq("assetExternalId", id)).take(21);
        // An unevaluated candidate cannot establish that another match is unique.
        if (proofs.length > 20) { unresolved = true; break; }
        const verified = await getProfileConnectionVerifications(ctx.db, profile._id, [link]);
        if (verified.has(link._id)) profiles.set(profile._id, { slug: profile.slug, displayName: profile.displayName });
      }
      if (!unresolved && profiles.size === 1) {
        const profile = [...profiles.values()][0];
        identity.vrdexUrl = `/${encodeURIComponent(profile.slug)}`;
        identity.profileDisplayName = profile.displayName;
      }
    }
    result.set(id, identity);
  }
  return result;
}
