import { NativeTrialEvidenceSchema, readNativeTrialConfig } from "../packages/media-relay/src/trial/policy";
import { internalQuery, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { HostedMeasurementsSchema, RELEASE_BLOCKER } from "../packages/media-relay/src/worker/release-evidence";
import { WorkerBindingsSchema } from "../packages/media-relay/src/worker/deployment";
import { relayOperationState } from "./_mediaRelayOperations";
import { rejectBrowserIdentityForDeploymentOperation } from "./_browserSessionAuthority";
async function update(
  ctx: MutationCtx,
  patch: { enabled?: boolean; drainingWorkers?: string[]; evidenceId?: string },
) {
  const row = await relayOperationState(ctx.db);
  if (row) await ctx.db.patch(row._id, { ...patch, updatedAt: Date.now() });
  else
    await ctx.db.insert("mediaRelayOperations", {
      key: "global",
      enabled: false,
      drainingWorkers: [],
      ...patch,
      updatedAt: Date.now(),
    });
}
export const drainWorker = internalMutation({
  args: { workerId: v.string() },
  handler: async (ctx, args) => {
    await rejectBrowserIdentityForDeploymentOperation(ctx);
    const bindings = WorkerBindingsSchema.parse(
      JSON.parse(process.env.MEDIA_RELAY_WORKERS ?? "null"),
    );
    if (!bindings.some((b) => b.workerId === args.workerId))
      throw Error("Unknown relay worker");
    const row = await relayOperationState(ctx.db);
    const draining = new Set(row?.drainingWorkers ?? []);
    draining.add(args.workerId);
    if (draining.size > 1000) throw Error("Drain inventory full");
    await update(ctx, { drainingWorkers: [...draining] });
    return null;
  },
});
export const setRelayEnabled = internalMutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    await rejectBrowserIdentityForDeploymentOperation(ctx);
    if (!args.enabled) {
      await update(ctx, { enabled: false });
      return null;
    }
    let evidence;
    try {
      evidence = HostedMeasurementsSchema.parse(
        JSON.parse(process.env.MEDIA_RELAY_RELEASE_EVIDENCE ?? "null"),
      );
    } catch {
      throw Error("Complete reviewed hosted release measurements required");
    }
    if (process.env.MEDIA_RELAY_ENABLED !== "true")
      throw Error("Deployment release gate is off");
    if (
      evidence.deployment !== process.env.CONVEX_CLOUD_URL ||
      evidence.measuredAt > Date.now() ||
      Date.now() - evidence.measuredAt > 7 * 86400000
    )
      throw Error("Release evidence deployment or freshness mismatch");
    const bindings = WorkerBindingsSchema.parse(
      JSON.parse(process.env.MEDIA_RELAY_WORKERS ?? "null"),
    );
    const state = await relayOperationState(ctx.db);
    const available = bindings.filter(
      (binding) =>
        !binding.draining && !state?.drainingWorkers.includes(binding.workerId),
    );
    const cap = Number(process.env.MEDIA_RELAY_MAX_SOURCES);
    if (
      !Number.isSafeInteger(cap) ||
      cap < 1 ||
      cap > evidence.sourceCap ||
      available.length < 2 ||
      bindings.some(
        (b) =>
          b.allocation.evidenceId !== evidence.evidenceId ||
          evidence.memoryPeakBytes > b.allocation.memoryMiB * 1048576 * 0.7,
      ) ||
      available.reduce((n, b) => n + b.maxSources, 0) -
        Math.max(...available.map((b) => b.maxSources)) <
        cap
    )
      throw Error("Release capacity or recovery margin unverified");
    // No configuration string, PAYG acceptance or budget can lift this blocker.
    throw Error(RELEASE_BLOCKER);
  },
});


/** Finite integration authority is separate from unrestricted hosted release. */
export const setNativeTrialEnabled = internalMutation({
  args: { enabled: v.boolean(), evidence: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectBrowserIdentityForDeploymentOperation(ctx);
    const state = await relayOperationState(ctx.db);
    if (!args.enabled) {
      if (state) await ctx.db.patch(state._id, { trialEnabled: false, updatedAt: Date.now() });
      return null;
    }
    if (process.env.MEDIA_RELAY_ENABLED === "true" || state?.enabled === true)
      throw Error("Full relay must remain disabled during the finite trial");
    const now = Date.now(), trial = readNativeTrialConfig(process.env.MEDIA_RELAY_TRIAL_CONFIG, now);
    const evidence = NativeTrialEvidenceSchema.parse(args.evidence);
    if (!trial || evidence.trialId !== trial.trialId || evidence.evidenceId !== trial.worker.allocation.evidenceId ||
        evidence.measuredAt > now || now - evidence.measuredAt > 7 * 86400000 ||
        evidence.retainedPeakBytes > trial.limits.retainedBytes ||
        evidence.memoryPeakBytes > trial.worker.allocation.memoryMiB * 1048576 * 0.7)
      throw Error("Finite trial configuration/evidence mismatch");
    const bindings = WorkerBindingsSchema.parse(JSON.parse(process.env.MEDIA_RELAY_WORKERS ?? "[]"));
    if (bindings.length !== 1 || JSON.stringify(bindings[0]) !== JSON.stringify(trial.worker) ||
        state?.drainingWorkers.includes(trial.worker.workerId))
      throw Error("Finite trial worker binding mismatch");
    if (!process.env.MEDIA_RELAY_WORKER_TOKEN || !process.env.MEDIA_RELAY_GATEWAY_TOKEN ||
        process.env.MEDIA_RELAY_WORKER_TOKEN === process.env.MEDIA_RELAY_GATEWAY_TOKEN)
      throw Error("Distinct trial worker/gateway credentials required");
    if (state?.trialId === trial.trialId && state.trialConfiguration !== JSON.stringify(trial))
      throw Error("Existing trial identity cannot be rebound" );
    const patch = { trialEnabled: true, trialId: trial.trialId, trialEvidenceId: evidence.evidenceId,
      trialConfiguration: JSON.stringify(trial), trialGrantsIssued: state?.trialId === trial.trialId ? (state.trialGrantsIssued ?? 0) : 0, updatedAt: now };
    if (state) await ctx.db.patch(state._id, patch);
    else await ctx.db.insert("mediaRelayOperations", { key: "global", enabled: false, drainingWorkers: [], ...patch });
    return null;
  },
});


/** Exact indexed deployment lookup. Never browser-callable and never a user-table scan. */
export const nativeTrialOperator = internalQuery({
  args: { email: v.string() }, returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { email }) => {
    await rejectBrowserIdentityForDeploymentOperation(ctx);
    if (!email || email !== email.trim() || email.length > 320) return null;
    const users = await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).take(2);
    return users.length === 1 && Number.isFinite(users[0].emailVerificationTime) && (users[0].emailVerificationTime ?? 0) > 0 ? users[0]._id : null;
  },
});
