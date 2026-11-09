import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { resolveManagedIntegrationSession } from "./_groupObservationPolicy";

export const MAX_RECAP_RANGE_MS = 93 * 86400_000;
const MAX_RECAP_ASSOCIATIONS = 1000;

export function validateRecapRange(startAt: number, endAt: number) {
  if (!Number.isSafeInteger(startAt) || !Number.isSafeInteger(endAt) || endAt <= startAt || endAt - startAt > MAX_RECAP_RANGE_MS)
    throw new Error("Recap window is outside the supported range.");
}

/** Resolve confirmed current-connection sessions once for jobs and readers. */
export async function resolveEventRecapWindow(db: DatabaseReader, event: Doc<"events">, integration: Doc<"communityVrchatIntegrations">, associationLimit = MAX_RECAP_ASSOCIATIONS) {
  if (!event.communityProfileId || event.startAt === undefined || event.scheduleKind === "date_only") return null;
  const associations = await db.query("eventInstanceAssociations")
    .withIndex("by_eventId_state", q => q.eq("eventId", event._id).eq("state", "confirmed"))
    .take(associationLimit + 1);
  if (associations.length > associationLimit) throw new Error("Recap associations exceed the supported range.");
  const sessions = new Map<Id<"instanceSessions">, Doc<"instanceSessions">>();
  for (const association of associations) {
    if (association.communityProfileId !== event.communityProfileId) continue;
    const session = await resolveManagedIntegrationSession(db, integration, event.communityProfileId, association.sessionId);
    if (session) sessions.set(session._id, session);
  }
  let endAt = event.endAt ?? event.startAt + 6 * 3600_000;
  if (event.recapEndAt !== undefined) endAt = event.recapEndAt;
  else for (const session of sessions.values()) {
    const last = await db.query("instancePopulationObservations")
      .withIndex("by_sessionId_observedAt", q => q.eq("sessionId", session._id)
        .gte("observedAt", Math.max(event.startAt!, integration.telemetryEpochStartedAt ?? integration.createdAt)).lte("observedAt", Number.MAX_SAFE_INTEGER))
      .order("desc").first();
    if (last?.integrationId === integration._id) endAt = Math.max(endAt, last.observedAt + 1);
  }
  validateRecapRange(event.startAt, endAt);
  const sessionIds = [...sessions.keys()].sort();
  // Include edits even when the resulting boundaries happen to be identical.
  const signature = JSON.stringify([event.startAt, event.endAt, event.recapEndAt, integration.telemetryEpochStartedAt ?? integration.createdAt,
    associations.map(a => [a._id, a.sessionId, a.updatedAt]), sessionIds]);
  return { startAt: event.startAt, endAt, sessionIds, signature, associationCount: associations.length };
}
