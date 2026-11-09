import { v } from "convex/values";
import schema from "./schema";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  assertRepairable,
  assertDeployment,
  fingerprint,
  previewRepair,
  readRepairSnapshot,
} from "./_instanceSessionRepair";
const request = {
  deploymentUrl: v.string(),
  integrationId: v.id("communityVrchatIntegrations"),
  epoch: v.number(),
  sessionIds: v.array(v.id("instanceSessions")),
};
const session = v.object({
  ...schema.tables.instanceSessions.validator.fields,
  _id: v.id("instanceSessions"),
  _creationTime: v.number(),
});
const observation = v.object({
  ...schema.tables.instancePopulationObservations.validator.fields,
  _id: v.id("instancePopulationObservations"),
  _creationTime: v.number(),
});
const aggregate = v.object({
  ...schema.tables.communityPopulationObservations.validator.fields,
  _id: v.id("communityPopulationObservations"),
  _creationTime: v.number(),
});
const result = v.object({
  repairId: v.id("instanceSessionRepairs"),
  afterFingerprint: v.string(),
});
export const preview = internalQuery({
  args: request,
  returns: v.object({
    fingerprint: v.string(),
    canonicalSessionId: v.id("instanceSessions"),
    observationCount: v.number(),
    reassignedCount: v.number(),
    aliasCount: v.number(),
    snapshot: v.object({
      deploymentUrl: v.string(),
      integrationId: v.id("communityVrchatIntegrations"),
      communityProfileId: v.id("profiles"),
      epoch: v.number(),
      sessions: v.array(session),
      observations: v.array(observation),
      aggregate: v.array(aggregate),
    }),
  }),
  handler: previewRepair,
});
export const apply = internalMutation({
  args: { ...request, expectedFingerprint: v.string() },
  returns: result,
  handler: async (ctx, args) => {
    assertDeployment(args.deploymentUrl);
    if (!/^[a-f0-9]{64}$/.test(args.expectedFingerprint))
      throw Error("Invalid repair fingerprint.");
    const existing = await ctx.db
      .query("instanceSessionRepairs")
      .withIndex("by_fingerprint", (q) =>
        q.eq("fingerprint", args.expectedFingerprint),
      )
      .unique();
    if (existing) {
      if (
        existing.deploymentUrl !== args.deploymentUrl ||
        existing.integrationId !== args.integrationId ||
        existing.epoch !== args.epoch ||
        existing.sessionIds.length !== args.sessionIds.length ||
        existing.sessionIds.some((id) => !args.sessionIds.includes(id))
      )
        throw Error("Repair receipt scope changed.");
      if (existing.state === "rolled_back")
        throw Error(
          "Repair was rolled back; a new reviewed inventory is required.",
        );
      return {
        repairId: existing._id,
        afterFingerprint: existing.afterFingerprint,
      };
    }
    const before = await readRepairSnapshot(ctx, args);
    assertRepairable(before);
    if ((await fingerprint(before)) !== args.expectedFingerprint)
      throw Error("Repair inventory changed since preview.");
    const canonical = before.sessions[0]!;
    const owners = before.observations
      .filter((o) => o.sessionId !== canonical._id)
      .map((o) => ({ observationId: o._id, sessionId: o.sessionId }));
    const beforeSessions = before.sessions.map((s) => ({
      id: s._id,
      state: s.state,
      openedAt: s.openedAt,
      lastObservedAt: s.lastObservedAt,
      ...(s.closedAt === undefined ? {} : { closedAt: s.closedAt }),
      consecutiveMisses: s.consecutiveMisses,
      updatedAt: s.updatedAt,
    }));
    const receipt = {
      deploymentUrl: args.deploymentUrl,
      integrationId: args.integrationId,
      epoch: args.epoch,
      sessionIds: before.sessions.map((s) => s._id),
      canonicalSessionId: canonical._id,
      fingerprint: args.expectedFingerprint,
      state: "applied" as const,
      createdAt: Date.now(),
      beforeSessions,
      owners,
    };
    await fingerprint(receipt);
    for (const owner of owners)
      await ctx.db.patch(owner.observationId, { sessionId: canonical._id });
    await ctx.db.patch(canonical._id, {
      state: "open",
      closedAt: undefined,
      lastObservedAt: Math.max(...before.observations.map((o) => o.observedAt)),
      consecutiveMisses: 0,
      updatedAt: Date.now(),
    });
    for (const s of before.sessions.slice(1))
      await ctx.db.patch(s._id, { mergedIntoSessionId: canonical._id });
    const afterFingerprint = await fingerprint(
      await readRepairSnapshot(ctx, args),
    );
    const repairId = await ctx.db.insert("instanceSessionRepairs", {
      ...receipt,
      afterFingerprint,
    });
    return { repairId, afterFingerprint };
  },
});
export const rollback = internalMutation({
  args: {
    repairId: v.id("instanceSessionRepairs"),
    expectedAfterFingerprint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.repairId);
    if (!receipt || receipt.afterFingerprint !== args.expectedAfterFingerprint)
      throw Error("Repair rollback receipt changed.");
    assertDeployment(receipt.deploymentUrl);
    if (receipt.state === "rolled_back") return null;
    const request = {
      deploymentUrl: receipt.deploymentUrl,
      integrationId: receipt.integrationId,
      epoch: receipt.epoch,
      sessionIds: receipt.sessionIds,
    };
    if (
      (await fingerprint(await readRepairSnapshot(ctx, request))) !==
      receipt.afterFingerprint
    )
      throw Error("Repair records changed after apply; rollback needs review.");
    for (const owner of receipt.owners)
      await ctx.db.patch(owner.observationId, { sessionId: owner.sessionId });
    for (const s of receipt.beforeSessions) {
      const { id, ...fields } = s;
      await ctx.db.patch(id, {
        ...fields,
        closedAt: s.closedAt,
        mergedIntoSessionId: undefined,
      });
    }
    if (
      (await fingerprint(await readRepairSnapshot(ctx, request))) !==
      receipt.fingerprint
    )
      throw Error("Repair rollback did not restore its original inventory.");
    await ctx.db.patch(receipt._id, {
      state: "rolled_back",
      rolledBackAt: Date.now(),
    });
    return null;
  },
});
