import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type RepairRequest = {
  deploymentUrl: string;
  integrationId: Id<"communityVrchatIntegrations">;
  epoch: number;
  sessionIds: Id<"instanceSessions">[];
};
// shortcut: one reviewed seven-fragment repair, reject larger inventories rather than partially writing them.
const MAX_OBSERVATIONS = 1000;
const MAX_SNAPSHOT_BYTES = 1_000_000;
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, stable(v)]),
    );
  return value;
}
export async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  if (bytes.length > MAX_SNAPSHOT_BYTES)
    throw Error("Repair snapshot exceeds atomic byte budget.");
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function assertDeployment(deploymentUrl: string) {
  if (!deploymentUrl || deploymentUrl !== process.env.CONVEX_CLOUD_URL)
    throw Error("Repair deployment mismatch.");
}
export async function readRepairSnapshot(
  ctx: { db: DatabaseReader },
  args: RepairRequest,
) {
  assertDeployment(args.deploymentUrl);
  if (
    args.sessionIds.length !== 7 ||
    new Set(args.sessionIds).size !== 7 ||
    !Number.isSafeInteger(args.epoch)
  )
    throw Error(
      "Repair requires seven distinct reviewed sessions and an epoch.",
    );
  const integration = await ctx.db.get(args.integrationId);
  if (
    !integration ||
    !integration.communityProfileId ||
    integration.collectionScope?.kind === "automatic" ||
    (integration.collectionScope?.kind === "managed" &&
      integration.collectionScope.communityProfileId !==
        integration.communityProfileId) ||
    (integration.telemetryEpochStartedAt ?? integration.createdAt) !==
      args.epoch
  )
    throw Error("Repair integration or epoch changed.");
  const sessions: Doc<"instanceSessions">[] = [];
  for (const id of args.sessionIds) {
    const row = await ctx.db.get(id);
    if (!row) throw Error("Repair session missing.");
    sessions.push(row);
  }
  sessions.sort(
    (a, b) => a.openedAt - b.openedAt || a._id.localeCompare(b._id),
  );
  const first = sessions[0]!;
  for (const s of sessions) {
    if (
      s.integrationId !== integration._id ||
      s.communityProfileId !== integration.communityProfileId ||
      s.openedAt < args.epoch ||
      s.providerLocation !== first.providerLocation ||
      s.providerInstanceId !== first.providerInstanceId ||
      s.vrchatWorldId !== first.vrchatWorldId ||
      s.source !== first.source
    )
      throw Error("Repair session identity or scope changed.");
    if (
      await ctx.db
        .query("eventInstanceAssociations")
        .withIndex("by_sessionId_state", (q) => q.eq("sessionId", s._id))
        .first()
    )
      throw Error("Repair association changed; review required.");
  }
  const locationRows = [];
  for (const state of ["open", "closed"] as const) {
    locationRows.push(
      ...(await ctx.db
        .query("instanceSessions")
        .withIndex("by_integrationId_providerLocation_state_openedAt", (q) =>
          q
            .eq("integrationId", integration._id)
            .eq("providerLocation", first.providerLocation)
            .eq("state", state)
            .gte("openedAt", args.epoch),
        )
        .take(8)),
    );
  }
  if (
    locationRows.length !== 7 ||
    locationRows.some((s) => !args.sessionIds.includes(s._id))
  )
    throw Error("Repair location inventory changed or was reused.");
  const events = await ctx.db
    .query("events")
    .withIndex("by_communityProfileId_startAt", (q) =>
      q.eq("communityProfileId", integration.communityProfileId!),
    )
    .take(101);
  if (events.length > 100)
    throw Error("Repair event dependency inventory exceeds budget.");
  for (const event of events) {
    const jobs = await ctx.db
      .query("communityTelemetryEventRecapJobs")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(2);
    if (
      jobs.length > 1 ||
      jobs.some(
        (j) =>
          j.integrationId === integration._id ||
          j.pendingSessions.some((id) => args.sessionIds.includes(id)),
      )
    )
      throw Error("Repair recap dependency changed or exceeds budget.");
  }
  const observations: Doc<"instancePopulationObservations">[] = [];
  for (const s of sessions) {
    const rows = await ctx.db
      .query("instancePopulationObservations")
      .withIndex("by_sessionId_observedAt", (q) => q.eq("sessionId", s._id))
      .order("asc")
      .take(MAX_OBSERVATIONS - observations.length + 1);
    observations.push(...rows);
    if (observations.length > MAX_OBSERVATIONS)
      throw Error("Repair observations exceed atomic document budget.");
  }
  if (
    !observations.length ||
    new Set(observations.map((o) => o.idempotencyKey)).size !==
      observations.length
  )
    throw Error("Repair observations missing or duplicated.");
  observations.sort(
    (a, b) => a.observedAt - b.observedAt || a._id.localeCompare(b._id),
  );
  for (const o of observations) {
    if (
      o.integrationId !== integration._id ||
      o.providerInstanceId !== first.providerInstanceId ||
      o.vrchatWorldId !== first.vrchatWorldId ||
      !Number.isSafeInteger(o.population) ||
      o.population < 0
    )
      throw Error("Repair observation identity or value changed.");
  }
  const endAt = Math.max(
    ...sessions.map((s) => s.closedAt ?? s.lastObservedAt),
  );
  const aggregate = await ctx.db
    .query("communityPopulationObservations")
    .withIndex("by_integrationId_observedAt", (q) =>
      q
        .eq("integrationId", integration._id)
        .gte("observedAt", first.openedAt)
        .lte("observedAt", endAt),
    )
    .order("asc")
    .take(2001);
  if (aggregate.length > 2000)
    throw Error("Repair aggregate inventory exceeds atomic budget.");
  const snapshot = {
    deploymentUrl: args.deploymentUrl,
    integrationId: integration._id,
    communityProfileId: integration.communityProfileId,
    epoch: args.epoch,
    sessions,
    observations,
    aggregate,
  };
  await fingerprint(snapshot);
  return snapshot;
}
export type RepairSnapshot = Awaited<ReturnType<typeof readRepairSnapshot>>;
export function assertRepairable(snapshot: RepairSnapshot) {
  for (let n = 0; n < snapshot.sessions.length; n++) {
    const s = snapshot.sessions[n]!;
    const points = snapshot.observations.filter((o) => o.sessionId === s._id);
    if (
      s.mergedIntoSessionId ||
      s.state !== "closed" ||
      s.consecutiveMisses !== 2 ||
      s.closedAt === undefined ||
      s.closedAt <= s.lastObservedAt ||
      !points.length ||
      points[0]!.observedAt !== s.openedAt ||
      points[points.length - 1]!.observedAt !== s.lastObservedAt ||
      points.some(
        (o, i) => i > 0 && points[i - 1]!.observedAt >= o.observedAt,
      ) ||
      (n > 0 && snapshot.sessions[n - 1]!.closedAt! >= s.openedAt)
    )
      throw Error(
        "Repair closure, observation bounds or fragment order needs review.",
      );
  }
}
export async function previewRepair(
  ctx: { db: DatabaseReader },
  args: RepairRequest,
) {
  const snapshot = await readRepairSnapshot(ctx, args);
  assertRepairable(snapshot);
  const canonicalSessionId = snapshot.sessions[0]!._id;
  return {
    fingerprint: await fingerprint(snapshot),
    canonicalSessionId,
    observationCount: snapshot.observations.length,
    reassignedCount: snapshot.observations.filter(
      (o) => o.sessionId !== canonicalSessionId,
    ).length,
    aliasCount: 6,
    snapshot,
  };
}
