import { v, type Infer } from "convex/values";
import { mutation, query, internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveClubActor } from "./_clubAccess";
import { readManagedIntegration } from "./_groupObservationPolicy";
import { currentClubAuthority } from "./_clubConnection";
import { active, authorizeWorker, scope, workerScope, event } from "./clubMembership";
import { admitVerifiedAudit } from "./clubPeople";
import { recoveryEnabled, recoveryState, recoveryWindow, recoveryProgress, recoverEvidence, RECOVERY_MAX_ENTRIES, RECOVERY_MAX_PAGES } from "./_clubMembershipRecovery";

type Ctx = QueryCtx | MutationCtx;
const workerArgs = v.object({ ...scope, ...workerScope });
type WorkerArgs = Infer<typeof workerArgs>;
const epoch = (integration: Doc<"communityVrchatIntegrations">) => integration.telemetryEpochStartedAt ?? integration.createdAt;
const jobProjection = v.object({
  recoveryId: v.id("communityMembershipRecoveries"), revision: v.number(), state: recoveryState,
  startAt: v.number(), endAt: v.number(), nextOffset: v.number(), pages: v.number(),
  recovered: v.number(), conflicts: v.number(), unmatched: v.number(),
});
function project(job: Doc<"communityMembershipRecoveries">) {
  return { recoveryId: job._id, revision: job.revision, state: job.state, startAt: job.startAt, endAt: job.endAt,
    nextOffset: job.nextOffset, pages: job.pages, recovered: job.recovered, conflicts: job.conflicts, unmatched: job.unmatched };
}
async function requireOwner(ctx: Ctx, communityProfileId: Id<"profiles">) {
  if ((await resolveClubActor(ctx, communityProfileId)).kind !== "owner") throw new Error("Only the owner can recover membership history.");
}
async function currentAuditAuthority(ctx: Ctx, integration: Doc<"communityVrchatIntegrations">) {
  const account = integration.assignedCollectorAccountId ? await ctx.db.get(integration.assignedCollectorAccountId) : null;
  const fleet = await ctx.db.query("collectorFleetSettings").withIndex("by_key", q => q.eq("key", "global")).unique();
  const authority = currentClubAuthority(integration, account, Date.now());
  if (!account || account.state !== "ready" || account.killSwitchEnabled || fleet?.killSwitchEnabled ||
      !authority || authority.membershipStatus !== "member" || !authority.permissions.some(p => p === "*" || p === "group-audit-view")) throw new Error("Membership recovery authority unavailable.");
}
async function currentOwnerScope(ctx: Ctx, communityProfileId: Id<"profiles">) {
  const integration = await readManagedIntegration(ctx.db, communityProfileId);
  if (!integration) throw new Error("Membership recovery unavailable.");
  await active(ctx, { integrationId: integration._id, epochStartedAt: epoch(integration), groupId: integration.vrchatGroupId });
  await currentAuditAuthority(ctx, integration);
  return integration;
}
const findJob = (ctx: Ctx, integrationId: Id<"communityVrchatIntegrations">, epochStartedAt: number) =>
  ctx.db.query("communityMembershipRecoveries").withIndex("by_scope", q => q.eq("integrationId", integrationId).eq("epochStartedAt", epochStartedAt)).unique();

export const getRecoveryStatus = query({
  args: { communityProfileId: v.id("profiles") },
  returns: v.object({ enabled: v.boolean(), available: v.boolean(), state: v.union(recoveryState, v.literal("disabled"), v.literal("unavailable"), v.literal("idle")), job: v.union(jobProjection, v.null()) }),
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.communityProfileId);
    const integration = await readManagedIntegration(ctx.db, args.communityProfileId);
    const job = integration ? await findJob(ctx, integration._id, epoch(integration)) : null;
    if (!recoveryEnabled()) return { enabled: false, available: false, state: "disabled" as const, job: job ? project(job) : null };
    try { await currentOwnerScope(ctx, args.communityProfileId); }
    catch { return { enabled: true, available: false, state: "unavailable" as const, job: job ? project(job) : null }; }
    return { enabled: true, available: true, state: job?.state ?? ("idle" as const), job: job ? project(job) : null };
  },
});
export const requestRecovery = mutation({
  args: { communityProfileId: v.id("profiles"), resume: v.optional(v.boolean()), expectedRevision: v.optional(v.number()) },
  returns: v.id("communityMembershipRecoveries"),
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.communityProfileId);
    if (!recoveryEnabled()) throw new Error("Membership recovery disabled.");
    const integration = await currentOwnerScope(ctx, args.communityProfileId);
    const previous = await findJob(ctx, integration._id, epoch(integration));
    if (previous) {
      if (previous.communityProfileId !== args.communityProfileId || previous.groupId !== integration.vrchatGroupId) throw new Error("Membership recovery scope changed.");
      if (args.resume && ["stopped", "partial"].includes(previous.state) && previous.nextOffset < RECOVERY_MAX_ENTRIES && previous.pages < RECOVERY_MAX_PAGES) {
        if (args.expectedRevision !== undefined && args.expectedRevision !== previous.revision) throw new Error("Membership recovery changed.");
        // Resume the fixed owner-approved window, never reset its cumulative cap.
        await ctx.db.patch(previous._id, { state: "pending", revision: previous.revision + 1, workerId: undefined, fencingToken: undefined, credentialGeneration: undefined, updatedAt: Date.now() });
      }
      return previous._id;
    }
    if (args.resume) throw new Error("No membership recovery to resume.");
    const now = Date.now();
    return ctx.db.insert("communityMembershipRecoveries", {
      integrationId: integration._id, epochStartedAt: epoch(integration), communityProfileId: args.communityProfileId, groupId: integration.vrchatGroupId,
      ...recoveryWindow(epoch(integration), now), state: "pending", revision: 0, nextOffset: 0, pages: 0,
      recovered: 0, conflicts: 0, unmatched: 0, createdAt: now, updatedAt: now, checkAt: now + 86400_000,
    });
  },
});
export const stopRecovery = mutation({
  args: { recoveryId: v.id("communityMembershipRecoveries"), expectedRevision: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.recoveryId);
    if (!job) throw new Error("Unknown membership recovery.");
    await requireOwner(ctx, job.communityProfileId);
    if (job.state === "stopped" || job.state === "complete") return null;
    if (args.expectedRevision !== undefined && args.expectedRevision !== job.revision) throw new Error("Membership recovery changed.");
    await ctx.db.patch(job._id, { state: "stopped", revision: job.revision + 1, workerId: undefined, fencingToken: undefined, credentialGeneration: undefined, updatedAt: Date.now() });
    return null;
  },
});
async function authorize(ctx: MutationCtx, args: WorkerArgs) {
  await authorizeWorker(ctx, args);
  const integration = await active(ctx, args);
  await currentAuditAuthority(ctx, integration);
  return integration;
}
export const claim = internalMutation({
  args: workerArgs.fields,
  returns: v.union(jobProjection, v.null()),
  handler: async (ctx, args) => {
    if (!recoveryEnabled()) return null;
    const integration = await authorize(ctx, args);
    const account = await ctx.db.get(args.collectorAccountId);
    if (!account || (account.cooldownUntil ?? 0) > Date.now()) return null;
    const job = await findJob(ctx, args.integrationId, args.epochStartedAt);
    if (!job || job.communityProfileId !== integration.communityProfileId || job.groupId !== args.groupId || !["pending", "running"].includes(job.state) || job.startAt < args.epochStartedAt || job.endAt > Date.now()) return null;
    if (job.workerId !== args.workerId || job.fencingToken !== args.fencingToken || job.credentialGeneration !== account.credentialGeneration || job.state !== "running") {
      const changes = { state: "running" as const, revision: job.revision + 1, workerId: args.workerId, fencingToken: args.fencingToken, credentialGeneration: account.credentialGeneration, updatedAt: Date.now() };
      await ctx.db.patch(job._id, changes);
      return project({ ...job, ...changes });
    }
    return project(job);
  },
});
const leasedArgs = { ...workerArgs.fields, recoveryId: v.id("communityMembershipRecoveries"), expectedRevision: v.number() };
async function currentJob(ctx: MutationCtx, args: WorkerArgs & { recoveryId: Id<"communityMembershipRecoveries">; expectedRevision: number }) {
  if (!recoveryEnabled()) return null;
  const integration = await authorize(ctx, args);
  const job = await ctx.db.get(args.recoveryId);
  const account = await ctx.db.get(args.collectorAccountId);
  return job && job.integrationId === args.integrationId && job.communityProfileId === integration.communityProfileId && job.epochStartedAt === args.epochStartedAt && job.groupId === args.groupId &&
    job.state === "running" && job.revision === args.expectedRevision && job.workerId === args.workerId && job.fencingToken === args.fencingToken && job.credentialGeneration === account?.credentialGeneration &&
    job.startAt >= args.epochStartedAt && job.endAt <= Date.now() ? job : null;
}
export const check = internalMutation({
  args: leasedArgs, returns: v.object({ current: v.boolean() }),
  handler: async (ctx, args) => {
    const job = await currentJob(ctx, args);
    const account = await ctx.db.get(args.collectorAccountId);
    return { current: !!job && (account?.cooldownUntil ?? 0) <= Date.now() };
  },
});
export const recordPage = internalMutation({
  args: { ...leasedArgs, offset: v.number(), events: v.array(event), rawAuditIds: v.array(v.string()), sourceCount: v.number(), exhausted: v.boolean() },
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx, args) => {
    const job = await currentJob(ctx, args);
    if (!job || args.offset !== job.nextOffset) return { accepted: false };
    const progress = recoveryProgress(job, args.sourceCount, args.exhausted);
    const ids = new Set(args.rawAuditIds);
    if (args.rawAuditIds.length > args.sourceCount || ids.size !== args.rawAuditIds.length || args.rawAuditIds.some(id => !id || id.length > 200) ||
        args.events.length > args.sourceCount || new Set(args.events.map(e => e.auditId)).size !== args.events.length || args.events.some(e => !ids.has(e.auditId))) throw new Error("Invalid recovery source page.");
    let recovered = 0, conflicts = 0, unmatched = args.sourceCount - args.events.length;
    const now = Date.now();
    for (const replay of args.events) {
      if (!Number.isSafeInteger(replay.occurredAt) || replay.occurredAt < job.startAt || replay.occurredAt >= job.endAt || !replay.eventType || replay.eventType.length > 200) throw new Error("Recovery event outside approved window.");
      const original = await ctx.db.query("communityMembershipEvents").withIndex("by_audit", q => q.eq("integrationId", job.integrationId).eq("epochStartedAt", job.epochStartedAt).eq("auditId", replay.auditId)).unique();
      if (!original?.verified) { unmatched++; continue; }
      const prior = await ctx.db.query("communityMembershipEvidence").withIndex("by_audit", q => q.eq("integrationId", job.integrationId).eq("epochStartedAt", job.epochStartedAt).eq("auditId", replay.auditId)).unique();
      const evidence = recoverEvidence(original, replay, prior ?? {});
      if (!evidence) { conflicts++; continue; }
      if (!(["actorUserId", "actorDisplayName", "roleId", "roleName"] as const).some(key => evidence[key] !== prior?.[key])) continue;
      if (prior) await ctx.db.patch(prior._id, { ...evidence, recoveredAt: now });
      else await ctx.db.insert("communityMembershipEvidence", { integrationId: job.integrationId, epochStartedAt: job.epochStartedAt, auditId: replay.auditId, ...evidence, source: "audit_recovery", recoveredAt: now, checkAt: now + 86400_000 });
      recovered++;
      const integration = await ctx.db.get(job.integrationId);
      if (integration) await admitVerifiedAudit(ctx, integration, original._id);
    }
    await ctx.db.patch(job._id, { ...progress, revision: job.revision + 1, recovered: job.recovered + recovered, conflicts: job.conflicts + conflicts, unmatched: job.unmatched + unmatched, updatedAt: now });
    return { accepted: true };
  },
});
export const recordFailure = internalMutation({
  args: { ...leasedArgs, rateLimited: v.optional(v.boolean()), retryAfterMs: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await currentJob(ctx, args);
    if (job) {
      const now = Date.now();
      if (args.rateLimited) {
        const retryAfterMs = args.retryAfterMs ?? 60_000;
        if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0 || !Number.isSafeInteger(Math.ceil(now + retryAfterMs))) throw new Error("Invalid retry interval.");
        const account = await ctx.db.get(args.collectorAccountId);
        if (account) await ctx.db.patch(account._id, { cooldownUntil: Math.max(account.cooldownUntil ?? 0, now + Math.max(retryAfterMs, 1000)), updatedAt: now });
      }
      await ctx.db.patch(job._id, { state: "partial", revision: job.revision + 1, updatedAt: now });
    }
    return null;
  },
});
export const sweep = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const now = Date.now();
    let more = false;
    for (const table of ["communityMembershipRecoveries", "communityMembershipEvidence", "communityMembershipRoles"] as const) {
      const rows = await ctx.db.query(table).withIndex("by_checkAt", q => q.lte("checkAt", now)).take(25);
      more ||= rows.length === 25;
      for (const row of rows) {
        const integration = await ctx.db.get(row.integrationId);
        let retained = !!integration && epoch(integration) === row.epochStartedAt && !!integration.communityProfileId && !!(await ctx.db.get(integration.communityProfileId));
        if (retained && table === "communityMembershipEvidence" && "auditId" in row) {
          const event = await ctx.db.query("communityMembershipEvents").withIndex("by_audit", q => q.eq("integrationId", row.integrationId).eq("epochStartedAt", row.epochStartedAt).eq("auditId", row.auditId)).unique();
          retained = !!event?.verified;
        }
        if (retained) await ctx.db.patch(row._id, { checkAt: now + 86400_000 });
        else await ctx.db.delete(row._id);
      }
    }
    if (more) await ctx.scheduler.runAfter(0, internal.clubMembershipRecovery.sweep, {});
    return null;
  },
});
