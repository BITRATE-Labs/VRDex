import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  contributionAuthorityArgs,
  authorizeContribution,
} from "./_contributionAuth";
import { effectiveContributionPolicy, localUploadModes, retainedBatchUsage } from "./_contributionCapacity";
import { readScopedCursor, writeScopedCursor } from "./_reviewCursor";
import { resolveContributionPolicy } from "./_contributionPolicy";
import { openSubmissionCountForUser } from "./profileMediaSubmissions";
const DAY = 86400000;
export const get = internalQuery({
  args: contributionAuthorityArgs,
  returns: v.any(),
  handler: async (ctx, args) => {
    const token = await authorizeContribution(ctx, args, false);
    const policy = await effectiveContributionPolicy(ctx.db, args.actorUserId);
    const uploadModes = localUploadModes();
    const envelopes = await retainedBatchUsage(ctx.db, args.actorUserId, policy.limits.retainedBatches);
    const open = policy.limits.openActor === null ? null : await openSubmissionCountForUser(
      ctx,
      args.actorUserId,
      Date.now(),
    );
    const usage = await ctx.db
      .query("contributionCapacity")
      .withIndex("by_scope", (q) => q.eq("scope", `actor:${args.actorUserId}`))
      .unique();
    const limits = {
      ...policy.limits,
      actorBytes: policy.limits.actorBytes === null ? null : Math.min(
        policy.limits.actorBytes,
        usage?.byteLimit ?? policy.limits.actorBytes,
      ),
      actorProcessing: policy.limits.actorProcessing === null ? null : Math.min(
        policy.limits.actorProcessing,
        usage?.processingLimit ?? policy.limits.actorProcessing,
      ),
    };
    const manifest = await ctx.db
      .query("contributionManifestUsage")
      .withIndex("by_actor", (q) => q.eq("actorUserId", args.actorUserId))
      .unique();
    const active = policy.limits.dailyActor === null ? null : await ctx.db
      .query("profileMediaSubmissions")
      .withIndex("by_submitterUserId_createdAt", (q) =>
        q
          .eq("submitterUserId", args.actorUserId)
          .gt("createdAt", Date.now() - DAY),
      )
      .order("desc")
      .take(policy.limits.dailyActor + 1);
    const window = (active ?? []).filter(
      (row) => row.createdAt > Date.now() - policy.limits.burstWindowMs,
    );
    const retryAt = active !== null && policy.limits.dailyActor !== null && active.length >= policy.limits.dailyActor
      ? active[policy.limits.dailyActor - 1].createdAt + DAY
      : policy.limits.burst !== null && window.length >= policy.limits.burst
        ? window[policy.limits.burst - 1].createdAt + policy.limits.burstWindowMs : null;
    return {
      policyVersion: policy.version,
      tier: policy.tier,
      reservation: false,
      limits,
      deployment: {
        bytes: policy.deploymentBytes,
        concurrency: policy.deploymentProcessing,
        hostFetchesPerMinute: policy.hostFetchesPerMinute,
      },
      features: {
        bulk: policy.bulkEnabled,
        paused: policy.paused,
        localUploads: uploadModes.contributor,
        localUploadModes: uploadModes,
      },
      scopes: token.scopes,
      usage: {
        bytes: usage?.bytes ?? 0,
        processing: usage?.processing ?? 0,
        open,
        activeRows: manifest?.activeRows ?? 0,
        retainedBatches: envelopes.count,
        retainedBatchesIsLowerBound: envelopes.isLowerBound,
        retainedRevisions: manifest?.retainedRevisions ?? 0,
        retainedMetadataBytes: manifest?.retainedBytes ?? 0,
        creations24h: active?.length ?? null,
      },
      remaining: {
        bytes: limits.actorBytes === null ? null : Math.max(0, limits.actorBytes - (usage?.bytes ?? 0)),
        concurrency: limits.actorProcessing === null ? null : Math.max(
          0,
          limits.actorProcessing - (usage?.processing ?? 0),
        ),
        open: policy.limits.openActor === null || open === null ? null : Math.max(0, policy.limits.openActor - open),
        creations24h: policy.limits.dailyActor === null || active === null ? null : Math.max(0, policy.limits.dailyActor - active.length),
      },
      retryAt,
    };
  },
});
export const status = internalQuery({
  args: {
    ...contributionAuthorityArgs,
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
    state: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("committed"),
        v.literal("failed"),
      ),
    ),
    batchId: v.optional(v.id("contributionBatches")),
    operationId: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await authorizeContribution(ctx, args, false);
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 40)
      throw new Error("CAPACITY_PAGE_INVALID");
    if (args.operationId) {
      const id = ctx.db.normalizeId(
        "profileAssetUploadIntents",
        args.operationId,
      );
      const row = id
        ? await ctx.db
            .query("contributionUploadReservations")
            .withIndex("by_intentId", (q) => q.eq("intentId", id))
            .unique()
        : null;
      if (!row || row.actorUserId !== args.actorUserId) {
        const refusal = await ctx.db
          .query("contributionAdmissionRefusals")
          .withIndex("by_actor_operation", (q) =>
            q
              .eq("actorUserId", args.actorUserId)
              .eq("receipt.operationId", args.operationId!),
          )
          .unique();
        if (!refusal) throw new Error("UPLOAD_UNAVAILABLE");
        return { receipt: refusal.receipt };
      }
      return {
        receipt: row.receipt ?? {
          operationId: String(row.intentId),
          operationState: "in_progress",
        },
      };
    }
    const binding = `status:${args.actorUserId}:${args.state ?? ""}:${args.batchId ?? ""}`;
    const page = await ctx.db
      .query("contributionUploadReservations")
      .withIndex("by_actor_createdAt", (q) =>
        q.eq("actorUserId", args.actorUserId),
      )
      .order("desc")
      .paginate({
        cursor: readScopedCursor(args.cursor, binding),
        numItems: args.limit,
      });
    const rows = [];
    for (const row of page.page) {
      if (args.state && row.state !== args.state) continue;
      if (
        args.batchId &&
        (!row.batchRevisionId ||
          (await ctx.db.get(row.batchRevisionId))?.batchId !== args.batchId)
      )
        continue;
      rows.push({
        operationId: String(row.intentId),
        state: row.state,
        expiresAt: row.expiresAt,
        bytes: row.chargedBytes,
        receipt: row.receipt ?? {
          operationId: String(row.intentId),
          operationState: "in_progress",
        },
      });
    }
    return {
      ...page,
      page: rows,
      continueCursor: writeScopedCursor(page.continueCursor, binding),
    };
  },
});
export const claimSourceFetch = internalMutation({
  args: { intentId: v.id("profileAssetUploadIntents") },
  returns: v.object({ allowed: v.boolean(), retryAt: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (
      !intent?.sourceUrl ||
      intent.state !== "pending" ||
      intent.expiresAt <= Date.now()
    )
      throw new Error("UPLOAD_UNAVAILABLE");
    const policy = resolveContributionPolicy();
    if (policy.paused) return { allowed: false };
    const host = new URL(intent.sourceUrl).hostname.toLowerCase(),
      window = Math.floor(Date.now() / 60000);
    const old = await ctx.db
      .query("contributionHostFetches")
      .withIndex("by_host_window", (q) =>
        q.eq("host", host).eq("window", window),
      )
      .unique();
    if ((old?.count ?? 0) >= policy.hostFetchesPerMinute)
      return { allowed: false, retryAt: (window + 1) * 60000 };
    if (old) await ctx.db.patch(old._id, { count: old.count + 1 });
    else
      await ctx.db.insert("contributionHostFetches", {
        host,
        window,
        count: 1,
      });
    return { allowed: true };
  },
});
// Source-host minute counters are disposable. Continue bounded pages until the
// expired backlog is gone, even when one cron pass finds more than a page.
export const sweepExpiredHostFetches = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const expired = await ctx.db.query("contributionHostFetches")
      .withIndex("by_window", q => q.lt("window", Math.floor(Date.now() / 60000)))
      .take(100);
    for (const row of expired) await ctx.db.delete(row._id);
    if (expired.length === 100)
      await ctx.scheduler.runAfter(0, internal.contributionCapacity.sweepExpiredHostFetches, {});
    return expired.length;
  },
});
