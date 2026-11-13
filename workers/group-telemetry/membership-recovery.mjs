import { ClubProvider } from "./club-provider.mjs";
import { normalizeMembershipAuditPage } from "./membership-audit.mjs";

/** One supplementary page, after normal collection, under its current lease. */
export async function recoverMembershipPage({ assignment, authority, provider, control, expectedUserId, accountBudget, integrationBudget, clock = Date.now, shouldStop = () => false, deadline = clock() + 240_000 }) {
  const stopped = () => shouldStop() || clock() >= deadline || !authority || clock() < authority.observedAt || clock() - authority.observedAt > 60_000;
  if (stopped() || assignment.namedMembershipCollectionEnabled === false || !assignment.enabledFeatures?.includes("analytics") ||
      authority.groupId !== assignment.vrchatGroupId || authority.userId !== expectedUserId || authority.membershipStatus !== "member" ||
      !authority.permissions.some(value => value === "*" || value === "group-audit-view")) return { recovered: false };
  const scope = { integrationId: assignment.integrationId, fencingToken: assignment.fencingToken, epochStartedAt: assignment.epochStartedAt, groupId: assignment.vrchatGroupId };
  const job = await control.send("membership_recovery_claim", scope);
  if (!job || stopped()) return { recovered: false };
  if (!Number.isSafeInteger(job.nextOffset) || job.nextOffset < 0 || job.nextOffset >= 10000 ||
      !Number.isSafeInteger(job.pages) || job.pages < 0 || job.pages >= 100) return { recovered: false };
  const claim = { ...scope, recoveryId: job.recoveryId, expectedRevision: job.revision };
  const reservedAt = clock();
  const retryAfterMs = Math.max(accountBudget.retryAfterMs(1, reservedAt), integrationBudget.retryAfterMs(1, reservedAt));
  if (retryAfterMs > 0) return { recovered: false, retryAt: reservedAt + retryAfterMs };
  const reservation = await control.send("budget", { integrationId: assignment.integrationId, fencingToken: assignment.fencingToken, requestCount: 1, now: reservedAt });
  if (stopped()) return { recovered: false };
  if (!reservation?.granted) return { recovered: false, ...(reservation?.reason === "budget_exhausted" && Number.isFinite(reservation.retryAt) && reservation.retryAt > clock() ? { retryAt: reservation.retryAt } : {}) };
  if (!(await control.send("membership_recovery_check", claim))?.current || stopped()) return { recovered: false };
  const sentAt = clock();
  if (Math.floor(sentAt / 60_000) !== Math.floor(reservedAt / 60_000) ||
      !accountBudget.tryConsume(1, sentAt) || !integrationBudget.tryConsume(1, sentAt)) return { recovered: false };
  try {
    const result = await new ClubProvider({ client: provider, groupId: scope.groupId, expectedUserId, clock }).readPage("audit_recovery", {
      n: Math.min(100, 10000 - job.nextOffset), offset: job.nextOffset, startDate: new Date(job.startAt).toISOString(), endDate: new Date(job.endAt).toISOString(),
    });
    const idCounts = new Map(), candidates = [];
    for (const item of result.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      if (typeof item.id === "string" && item.id && item.id.length <= 200) idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
      try { candidates.push(...normalizeMembershipAuditPage([item], { groupId: scope.groupId, startAt: job.startAt, endAt: job.endAt })); }
      catch (error) { if (error?.category !== "schema_drift") throw error; }
    }
    // Recovery skips ambiguous/invalid candidates but charges every returned raw entry.
    const events = candidates.filter(item => idCounts.get(item.auditId) === 1);
    const accepted = await control.send("membership_recovery_page", { ...claim, offset: job.nextOffset, events, rawAuditIds: [...idCounts.keys()], sourceCount: result.items.length, exhausted: result.nextOffset === null });
    return { recovered: accepted?.accepted === true };
  } catch (error) {
    await control.send("membership_recovery_failure", { ...claim,
      ...(error?.category === "rate_limit" ? { rateLimited: true, ...(Number.isFinite(error.retryAfterMs) ? { retryAfterMs: error.retryAfterMs } : {}) } : {}),
    }).catch(() => undefined);
    throw error;
  }
}
