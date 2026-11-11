import { VrchatProviderError } from "./vrchat-client.mjs";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const userId = new RegExp(`^usr_${uuid}$`, "i");
const roleId = new RegExp(`^grol_${uuid}$`, "i");
const name = value => typeof value === "string" && value.trim() && value.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value) ? value.trim() : undefined;
// vrchatapi/specification@088c09ecc9f6d61334693e667fd4f1d458b03e14, GroupAuditLogDataGroupMemberRole.
export function normalizeMembershipAuditPage(items, { groupId, startAt, endAt }) {
  const invalid = () => { throw new VrchatProviderError("Malformed membership audit page.", { category: "schema_drift" }); };
  if (!Array.isArray(items) || items.length > 100 || !Number.isSafeInteger(startAt) || !Number.isSafeInteger(endAt) || endAt <= startAt) invalid();
  return items.flatMap(item => {
    if (!item || item.groupId !== groupId || typeof item.id !== "string" || !item.id || item.id.length > 200 ||
        typeof item.eventType !== "string" || !item.eventType || item.eventType.length > 200 || typeof item.created_at !== "string") invalid();
    const occurredAt = Date.parse(item.created_at);
    if (!Number.isSafeInteger(occurredAt)) invalid();
    if (occurredAt < startAt || occurredAt >= endAt) return [];
    const event = { auditId: item.id, eventType: item.eventType, occurredAt };
    if (typeof item.targetId === "string" && userId.test(item.targetId)) event.targetUserId = item.targetId.toLowerCase();
    if (typeof item.actorId === "string" && userId.test(item.actorId)) {
      event.actorUserId = item.actorId.toLowerCase();
      const actorName = name(item.actorDisplayName);
      if (actorName) event.actorDisplayName = actorName;
    }
    if (["group.member.role.assign", "group.member.role.unassign"].includes(item.eventType)) {
      const data = item.data;
      if (data && typeof data === "object" && typeof data.roleId === "string" && roleId.test(data.roleId)) {
        event.roleId = data.roleId.toLowerCase();
        const roleName = name(data.roleName);
        if (roleName) event.roleName = roleName;
      }
    }
    return [event];
  });
}
