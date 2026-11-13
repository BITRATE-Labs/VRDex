import { v, type Infer } from "convex/values";

export const RECOVERY_WINDOW_MS = 30 * 86400_000;
export const RECOVERY_MAX_ENTRIES = 10_000;
export const RECOVERY_MAX_PAGES = 100;
export const ROLE_REFRESH_MS = 6 * 3600_000;
export const recoveryEnabled = () => process.env.VRDEX_MEMBERSHIP_RECOVERY_ENABLED === "true";
export const recoveryState = v.union(v.literal("pending"), v.literal("running"), v.literal("stopped"), v.literal("partial"), v.literal("complete"));
export const supplementalEvidence = v.object({
  actorUserId: v.optional(v.string()), actorDisplayName: v.optional(v.string()),
  roleId: v.optional(v.string()), roleName: v.optional(v.string()),
});
export const roleObservation = v.object({ roleId: v.string(), name: v.string() });
const UUID = "[a-f\\d]{8}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{12}";
export const validRoleId = (value: string) => new RegExp(`^grol_${UUID}$`, "i").test(value);
export const validUserId = (value: string) => new RegExp(`^usr_${UUID}$`, "i").test(value);
export const validEvidenceName = (value: string) => !!value.trim() && value.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value);
type Evidence = Infer<typeof supplementalEvidence>;
type AuditCore = { auditId: string; eventType: string; occurredAt: number; targetUserId?: string };

export function recoveryWindow(epochStartedAt: number, now: number) {
  if (!Number.isSafeInteger(epochStartedAt) || epochStartedAt < 0 || !Number.isSafeInteger(now) || epochStartedAt >= now) throw new Error("Invalid recovery epoch.");
  return { startAt: Math.max(epochStartedAt, now - RECOVERY_WINDOW_MS), endAt: now };
}
export function recoveryProgress(job: { nextOffset: number; pages: number }, sourceCount: number, exhausted: boolean) {
  if (!Number.isSafeInteger(sourceCount) || sourceCount < 0 || sourceCount > 100 || (!exhausted && sourceCount === 0) ||
      job.pages >= RECOVERY_MAX_PAGES || job.nextOffset + sourceCount > RECOVERY_MAX_ENTRIES) throw new Error("Invalid recovery page.");
  const nextOffset = job.nextOffset + sourceCount, pages = job.pages + 1;
  const state = exhausted ? "complete" : nextOffset === RECOVERY_MAX_ENTRIES || pages === RECOVERY_MAX_PAGES ? "partial" : "running";
  return { nextOffset, pages, state } satisfies { nextOffset: number; pages: number; state: "complete" | "partial" | "running" };
}

/** Never replace conflicting original or previously recovered evidence. */
export function recoverEvidence(original: AuditCore & Evidence, replay: AuditCore & Evidence, prior: Evidence = {}): Evidence | null {
  if (original.auditId !== replay.auditId || original.eventType !== replay.eventType || original.occurredAt !== replay.occurredAt || original.targetUserId?.toLowerCase() !== replay.targetUserId?.toLowerCase()) return null;
  const clean: Evidence = {};
  if (replay.actorUserId && validUserId(replay.actorUserId)) {
    clean.actorUserId = replay.actorUserId.toLowerCase();
    if (replay.actorDisplayName && validEvidenceName(replay.actorDisplayName)) clean.actorDisplayName = replay.actorDisplayName.trim();
  }
  if (["group.member.role.assign", "group.member.role.unassign"].includes(replay.eventType)) {
    if (replay.roleId && validRoleId(replay.roleId)) clean.roleId = replay.roleId.toLowerCase();
    if (replay.roleName && validEvidenceName(replay.roleName)) clean.roleName = replay.roleName.trim();
  }
  for (const key of ["actorUserId", "actorDisplayName", "roleId", "roleName"] as const) {
    const originalValue = key === "roleId" || key === "actorUserId" ? original[key]?.toLowerCase() : original[key];
    const priorValue = key === "roleId" || key === "actorUserId" ? prior[key]?.toLowerCase() : prior[key];
    if (clean[key] !== undefined && ((originalValue !== undefined && originalValue !== clean[key]) || (priorValue !== undefined && priorValue !== clean[key]))) return null;
    if (original[key] !== undefined) delete clean[key];
  }
  const merged: Evidence = {};
  for (const key of ["actorUserId", "actorDisplayName", "roleId", "roleName"] as const) {
    const value = clean[key] ?? prior[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
