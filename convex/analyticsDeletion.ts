type ManagementConfig = { origin: string; projectId: string; key: string };
type DeletionTarget = { analyticsId: string; personId?: string; acceptedAt?: number };
type DeletionResult = { kind: "accepted" | "completed" | "retry" | "authorization"; personId?: string };

export function posthogManagementConfig(env: Record<string, string | undefined>): ManagementConfig | null {
  const key = env.POSTHOG_API_KEY?.trim();
  const projectId = env.POSTHOG_PROJECT_ID?.trim();
  if (!key || key.startsWith("phc_") || !projectId || !/^[1-9]\d*$/.test(projectId)) return null;
  try {
    const host = new URL(env.POSTHOG_MANAGEMENT_HOST?.trim() || "https://us.posthog.com");
    if (host.protocol !== "https:" || host.username || host.password || host.pathname !== "/" || host.search || host.hash) return null;
    return { origin: host.origin, projectId, key };
  } catch { return null; }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function deletePosthogIdentity(config: ManagementConfig, target: DeletionTarget, rememberPerson?: (personId: string) => Promise<void>): Promise<DeletionResult> {
  const base = `${config.origin}/api/projects/${config.projectId}/persons/`;
  const request = async (url: string, body?: unknown) => {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    const data: unknown = response.ok ? await response.json() : null;
    return { status: response.status, data };
  };
  try {
    if (target.personId) {
      const { status, data } = await request(`${base}deletion_status/?person_uuid=${encodeURIComponent(target.personId)}&limit=1`);
      if (status === 401 || status === 403) return { kind: "authorization" };
      if (!record(data) || !Array.isArray(data.results)) return { kind: "retry" };
      const entry = data.results.find((row: unknown) => record(row) && row.person_uuid === target.personId);
      if (record(entry)) {
        if (entry.status === "completed") return { kind: "completed", personId: target.personId };
        return entry.status === "pending" ? { kind: "accepted", personId: target.personId } : { kind: "retry" };
      }
      if (target.acceptedAt !== undefined) return { kind: "retry" };
    }
    const lookup = await request(`${base}?distinct_id=${encodeURIComponent(target.analyticsId)}&limit=2`);
    if (lookup.status === 401 || lookup.status === 403) return { kind: "authorization" };
    if (!record(lookup.data) || !Array.isArray(lookup.data.results) || lookup.data.results.length !== 1) return { kind: "retry" };
    const person: unknown = lookup.data.results[0];
    if (!record(person)) return { kind: "retry" };
    const personId = typeof person.uuid === "string" ? person.uuid : person.id;
    if (typeof personId !== "string" || !personId || (target.personId && target.personId !== personId)) return { kind: "retry" };
    await rememberPerson?.(personId);
    const deletion = await request(`${base}bulk_delete/`, { ids: [personId], delete_events: true, delete_recordings: true });
    if (deletion.status === 401 || deletion.status === 403) return { kind: "authorization" };
    const data = deletion.data;
    if (deletion.status !== 202 || !record(data) || data.persons_found !== 1 || data.persons_queued_for_deletion !== 1
      || data.events_queued_for_deletion !== true || data.recordings_queued_for_deletion !== true
      || !Array.isArray(data.deletion_errors) || data.deletion_errors.length !== 0) return { kind: "retry" };
    return { kind: "accepted", personId };
  } catch { return { kind: "retry" }; }
}
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";


export const claimNext = internalMutation({
  args: { now: v.number() },
  returns: v.union(v.null(), v.object({ _id: v.id("analyticsDeletionRequests"), analyticsId: v.string(), lease: v.string(), personId: v.optional(v.string()), acceptedAt: v.optional(v.number()) })),
  handler: async (ctx, { now }) => {
    const candidates = await Promise.all((["delivering", "accepted", "pending", "blocked_authorization"] as const).map((state) =>
      ctx.db.query("analyticsDeletionRequests").withIndex("by_state_nextAttemptAt", (q) => q.eq("state", state).lte("nextAttemptAt", now)).first()));
    const row = candidates.filter((candidate) => candidate !== null)
      .sort((a, b) => (a.nextAttemptAt ?? a.requestedAt) - (b.nextAttemptAt ?? b.requestedAt))[0];
    if (!row) return null;
    const lease = crypto.randomUUID();
    await ctx.db.patch(row._id, { state: "delivering", lease, nextAttemptAt: now + 120_000 });
    return { _id: row._id, analyticsId: row.analyticsId, lease, personId: row.personId, acceptedAt: row.acceptedAt };
  },
});

export const finish = internalMutation({
  args: {
    requestId: v.id("analyticsDeletionRequests"), lease: v.string(), now: v.number(),
    kind: v.union(v.literal("resolved"), v.literal("accepted"), v.literal("completed"), v.literal("retry"), v.literal("authorization")),
    personId: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.requestId);
    if (!row || row.state !== "delivering" || row.lease !== args.lease) return false;
    if (args.kind === "resolved") {
      if (!args.personId) return false;
      await ctx.db.patch(row._id, { personId: args.personId });
      return true;
    }
    const failureCount = args.kind === "retry" ? (row.failureCount ?? 0) + 1 : 0;
    const state = args.kind === "retry" ? failureCount >= 5 ? "failed" : "pending"
      : args.kind === "authorization" ? "blocked_authorization" : args.kind;
    await ctx.db.patch(row._id, {
      state, lease: undefined, failureCount, nextAttemptAt: args.now + 3_600_000,
      personId: args.personId ?? row.personId,
      acceptedAt: args.kind === "accepted" ? row.acceptedAt ?? args.now : row.acceptedAt,
      completedAt: args.kind === "completed" ? args.now : row.completedAt,
    });
    return true;
  },
});

export const deliverPending = internalAction({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    if (process.env.POSTHOG_WITHDRAWAL_ENABLED !== "true") return null;
    const config = posthogManagementConfig(process.env);
    if (!config) return null;
    const row = await ctx.runMutation(internal.analyticsDeletion.claimNext, { now: Date.now() });
    if (!row) return null;
    const result = await deletePosthogIdentity(config, row, async (personId) => {
      const retained = await ctx.runMutation(internal.analyticsDeletion.finish, {
        requestId: row._id, lease: row.lease, now: Date.now(), kind: "resolved", personId,
      });
      if (!retained) throw new Error("Withdrawal lease expired");
    });
    await ctx.runMutation(internal.analyticsDeletion.finish, { requestId: row._id, lease: row.lease, now: Date.now(), ...result });
    await ctx.scheduler.runAfter(0, internal.analyticsDeletion.deliverPending, {});
    return null;
  },
});

export const sweepCompleted = internalMutation({
  args: { now: v.optional(v.number()) }, returns: v.object({ deletedCount: v.number() }),
  handler: async (ctx, { now = Date.now() }) => {
    const rows = await ctx.db.query("analyticsDeletionRequests")
      .withIndex("by_state_completedAt", (q) => q.eq("state", "completed").lte("completedAt", now - 30 * 86_400_000)).take(100);
    for (const row of rows) {
      const guest = await ctx.db.query("analyticsGuestReceipts").withIndex("by_analyticsId", (q) => q.eq("analyticsId", row.analyticsId)).unique();
      if (guest?.withdrawnAt !== undefined) await ctx.db.delete(guest._id);
      await ctx.db.delete(row._id);
    }
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.analyticsDeletion.sweepCompleted, {});
    return { deletedCount: rows.length };
  },
});

export const retryFailed = internalMutation({
  args: { requestId: v.id("analyticsDeletionRequests") }, returns: v.boolean(),
  handler: async (ctx, { requestId }) => {
    const row = await ctx.db.get(requestId);
    if (row?.state !== "failed") return false;
    await ctx.db.patch(row._id, { state: "pending", failureCount: 0, nextAttemptAt: Date.now() });
    return true;
  },
});
