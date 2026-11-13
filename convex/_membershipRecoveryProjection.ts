import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { roleObservation, ROLE_REFRESH_MS, validRoleId, validEvidenceName } from "./_clubMembershipRecovery";

export const recoveryProvenance = {
  actorNameSource: v.optional(v.union(v.literal("recorded"), v.literal("recovered"))),
  roleNameSource: v.optional(v.union(v.literal("recorded"), v.literal("recovered"), v.literal("role_observation"))),
  roleNameObservedAt: v.optional(v.number()), evidenceRecoveredAt: v.optional(v.number()),
};
export async function recordRoleObservations(ctx: MutationCtx, integration: Doc<"communityVrchatIntegrations">, roles: Infer<typeof roleObservation>[], observedAt: number) {
  if (integration.namedMembershipCollectionEnabled === false || (integration.enabledFeatures && !integration.enabledFeatures.includes("analytics"))) return;
  if (roles.length > 100 || roles.some(r => !validRoleId(r.roleId) || !validEvidenceName(r.name)) || new Set(roles.map(r => r.roleId.toLowerCase())).size !== roles.length) return;
  const epochStartedAt = integration.telemetryEpochStartedAt ?? integration.createdAt;
  const relevant = await Promise.all(["group.member.role.assign", "group.member.role.unassign"].map(eventType =>
    ctx.db.query("communityMembershipEvents").withIndex("by_verified_type_time", q => q.eq("integrationId", integration._id).eq("epochStartedAt", epochStartedAt).eq("verified", true).eq("eventType", eventType)).first()));
  if (!relevant.some(Boolean)) return;
  for (const role of roles) {
    const roleId = role.roleId.toLowerCase(), name = role.name.trim();
    const prior = await ctx.db.query("communityMembershipRoles").withIndex("by_role", q => q.eq("integrationId", integration._id).eq("epochStartedAt", epochStartedAt).eq("roleId", roleId)).unique();
    if (prior) {
      if (observedAt > prior.observedAt && (name !== prior.name || observedAt - prior.observedAt >= ROLE_REFRESH_MS)) await ctx.db.patch(prior._id, { name, observedAt });
    } else await ctx.db.insert("communityMembershipRoles", { integrationId: integration._id, epochStartedAt, roleId, name, observedAt, checkAt: Date.now() + 86400_000 });
  }
}
export async function membershipRecoveryProjection(ctx: QueryCtx, row: Doc<"communityMembershipEvents">) {
  const supplemental = await ctx.db.query("communityMembershipEvidence").withIndex("by_audit", q => q.eq("integrationId", row.integrationId).eq("epochStartedAt", row.epochStartedAt).eq("auditId", row.auditId)).unique();
  const roleId = row.roleId ?? supplemental?.roleId;
  const observed = roleId && !row.roleName && !supplemental?.roleName
    ? await ctx.db.query("communityMembershipRoles").withIndex("by_role", q => q.eq("integrationId", row.integrationId).eq("epochStartedAt", row.epochStartedAt).eq("roleId", roleId.toLowerCase())).unique() : null;
  const roleName = row.roleName ?? supplemental?.roleName ?? observed?.name;
  const actorNameSource = row.actorDisplayName ? "recorded" as const : supplemental?.actorDisplayName ? "recovered" as const : undefined;
  return {
    ...row,
    ...(supplemental?.actorUserId && !row.actorUserId ? { actorUserId: supplemental.actorUserId } : {}),
    ...(supplemental?.actorDisplayName && !row.actorDisplayName ? { actorDisplayName: supplemental.actorDisplayName } : {}),
    ...(actorNameSource ? { actorNameSource } : {}),
    ...(roleId ? { roleId } : {}), ...(roleName ? { roleName } : {}),
    ...(roleName ? { roleNameSource: row.roleName ? "recorded" as const : supplemental?.roleName ? "recovered" as const : "role_observation" as const } : {}),
    ...(observed ? { roleNameObservedAt: observed.observedAt } : {}),
    ...(supplemental ? { evidenceRecoveredAt: supplemental.recoveredAt } : {}),
  };
}
