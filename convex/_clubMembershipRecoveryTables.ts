import { defineTable } from "convex/server";
import { v } from "convex/values";
import { recoveryState, supplementalEvidence } from "./_clubMembershipRecovery";

const scope = { integrationId: v.id("communityVrchatIntegrations"), epochStartedAt: v.number(), checkAt: v.number() };
export const membershipRecoveryTables = {
  communityMembershipRecoveries: defineTable({
    ...scope, communityProfileId: v.id("profiles"), groupId: v.string(),
    state: recoveryState, revision: v.number(), startAt: v.number(), endAt: v.number(),
    nextOffset: v.number(), pages: v.number(), recovered: v.number(), conflicts: v.number(), unmatched: v.number(),
    workerId: v.optional(v.string()), fencingToken: v.optional(v.number()), credentialGeneration: v.optional(v.number()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_scope", ["integrationId", "epochStartedAt"]).index("by_checkAt", ["checkAt"]),
  communityMembershipEvidence: defineTable({
    ...scope, auditId: v.string(), ...supplementalEvidence.fields,
    source: v.literal("audit_recovery"), recoveredAt: v.number(),
  }).index("by_audit", ["integrationId", "epochStartedAt", "auditId"]).index("by_checkAt", ["checkAt"]),
  communityMembershipRoles: defineTable({
    ...scope, roleId: v.string(), name: v.string(), observedAt: v.number(),
  }).index("by_role", ["integrationId", "epochStartedAt", "roleId"]).index("by_checkAt", ["checkAt"]),
};
