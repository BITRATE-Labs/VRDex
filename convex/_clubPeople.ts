import { v, type Infer } from "convex/values";
import { invitationDestination } from "./_clubInvitations";

export const peopleSource = v.union(
  v.object({ kind: v.literal("activity"), auditIds: v.array(v.string()) }),
  v.object({ kind: v.literal("invitation_review"), targetUserIds: v.array(v.string()), destination: invitationDestination }),
  v.object({ kind: v.literal("invitation_batch"), batchId: v.id("clubInvitationBatches") }),
  v.object({ kind: v.literal("scheduled_operations"), operationIds: v.array(v.id("clubOperations")) }),
  v.object({ kind: v.literal("provider_read"), requestId: v.id("clubProviderReadRequests") }),
);
export type PeopleSource = Infer<typeof peopleSource>;
export const peopleReferenceSource = v.union(
  v.object({ kind: v.literal("audit"), eventId: v.id("communityMembershipEvents") }),
  v.object({ kind: v.literal("review"), viewId: v.id("clubPeopleViews") }),
  v.object({ kind: v.literal("operation"), operationId: v.id("clubOperations"), reviewedUserId: v.optional(v.string()), batchId: v.optional(v.id("clubInvitationBatches")) }),
  v.object({ kind: v.literal("read"), requestId: v.id("clubProviderReadRequests") }),
);
export type PeopleReferenceSource = Infer<typeof peopleReferenceSource>;
export const peopleStatus = v.union(v.literal("pending"), v.literal("resolved"), v.literal("unavailable"), v.literal("retry"));
export const peopleNameSource = v.union(v.literal("vrchat_public_cache"), v.literal("vrchat_private"), v.literal("recorded"), v.literal("vrdex_profile"));
export const personIdentity = v.object({
  userId: v.string(), vrchatUrl: v.string(), vrdexUrl: v.optional(v.string()),
  displayName: v.optional(v.string()), observedAt: v.optional(v.number()), source: v.optional(peopleNameSource), status: peopleStatus,
});
export const PEOPLE_DAY_MS = 24 * 60 * 60_000;
export const PEOPLE_VIEW_MS = 15 * 60_000;
export function validPersonName(value: string | undefined) {
  return value !== undefined && !!value.trim() && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);
}
