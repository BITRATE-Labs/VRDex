import { useState } from "react";
import { ConvexProvider, ConvexReactClient, type Watch, type WatchQueryOptions } from "convex/react";
import { getFunctionName, type FunctionReference, type FunctionReturnType, type ArgsAndOptions } from "convex/server";
import { ConvexError } from "convex/values";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  MembershipMovementView,
  MembershipActivityView,
  ClubMembershipActivity,
} from "@/app/account/communities/[slug]/club-membership";

const start = Date.UTC(2026, 7, 1);
function Preview() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-5">
      <MembershipMovementView
        points={Array.from({ length: 14 }, (_, i) => ({
          at: start + i * 86400000,
          label: `Aug ${i + 1}`,
          joins: i === 4 ? null : [12, 8, 3, 21, 0, 5, 7][i % 7]!,
          departures: i === 4 ? null : [2, 0, 1, 3, 0, 2, 1][i % 7]!,
        }))}
        onSelect={() => {}}
      />
      <MembershipActivityView
        events={[
          {
            auditId: "a",
            eventType: "group.member.join",
            occurredAt: start + 3600000,
            targetDisplayName: "Nightbird",
            targetUserId: "usr_example_nightbird",
          },
          {
            auditId: "b",
            eventType: "group.member.leave",
            occurredAt: start,
            targetUserId: "usr_example_aurora",
          },
          {
            auditId: "c",
            eventType: "group.member.remove",
            occurredAt: start - 3600000,
            targetDisplayName: "Echo",
            targetUserId: "usr_example_echo",
          },
        ]}
        canLoadMore
        onLoadMore={() => {}}
      />
    </div>
  );
}
const meta = {
  title: "Clubs/Membership",
  component: Preview,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Preview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MovementAndActivity: Story = {};
export const Unknown: Story = {
  render: () => (
    <div className="p-5">
      <MembershipMovementView
        points={[{ at: start, label: "Aug 1", joins: null, departures: null }]}
      />
    </div>
  ),
};

export const RoleActivity: Story = {
  render: () => <div className="mx-auto max-w-5xl p-5"><MembershipActivityView events={[
    { auditId: "role-assign", eventType: "group.member.role.assign", occurredAt: start, targetUserId: "usr_00000000-0000-4000-8000-000000000001", targetDisplayName: "Mira Moon", targetIdentity: { displayName: "Mira", observedAt: start + 1000, vrchatUrl: "https://vrchat.com/home/user/usr_00000000-0000-4000-8000-000000000001", vrdexUrl: "/mira" }, actorUserId: "usr_00000000-0000-4000-8000-000000000002", actorDisplayName: "Old Sol", actorIdentity: { displayName: "Sol", vrdexUrl: "/sol", observedAt: start + 1000, vrchatUrl: "https://vrchat.com/home/user/usr_00000000-0000-4000-8000-000000000002" }, roleId: "grol_00000000-0000-4000-8000-000000000003", roleName: "DJ" },
    { auditId: "role-remove", eventType: "group.member.role.unassign", occurredAt: start - 1000, targetDisplayName: "Nightbird", roleName: "Deputy", roleId: "grol_00000000-0000-4000-8000-000000000004" },
    { auditId: "role-missing", eventType: "group.member.role.assign", occurredAt: start - 2000, targetDisplayName: "Echo" },
    { auditId: "long-name", eventType: "group.member.role.unassign", occurredAt: start - 2500, targetDisplayName: "A very long display name ".repeat(7), roleName: "A very long role name ".repeat(7) },
    { auditId: "unknown", eventType: "future.event", occurredAt: start - 3000 },
    { auditId: "long-actor", eventType: "group.member.join", occurredAt: start - 3500, targetDisplayName: "Actor wrapping", actorUserId: "usr_00000000-0000-4000-8000-000000000004", actorIdentity: { displayName: "W".repeat(15), vrchatUrl: "https://vrchat.com/home/user/usr_00000000-0000-4000-8000-000000000004" } },
  ]} /></div>,
};

// Only the transport is synthetic; pagination, restoration and error handling use the real hooks.
class MembershipFixtureClient extends ConvexReactClient {
  failed = false;
  failAll = false;
  newest = false;
  invalidCursor = false;
  invalidCursorId = 0;
  currentCursorId = 0;
  cursorErrorShape: "wrapped" | "system" | "message" = "wrapped";
  invalidateNativeCursor(shape: "system" | "message") { this.cursorErrorShape = shape; this.invalidateCursor(); }
  persistentCursorFailure = false;
  queryCount = 0;
  pinnedPageIsDone = false;
  unavailableAt: number | null = null;
  emptyFirstWindow = false;
  emptyFirstPage() { this.emptyFirstWindow = true; this.fixtureListeners.forEach(listener => listener()); }
  setUnavailable(offset: number) { this.unavailableAt = offset; this.fixtureListeners.forEach(listener => listener()); }
  completePinnedPages() { this.pinnedPageIsDone = true; this.fixtureListeners.forEach(listener => listener()); }
  rejectCursors(shape: "wrapped" | "system" | "message" = "wrapped") { this.cursorErrorShape = shape; this.invalidCursor = true; this.persistentCursorFailure = true; this.queryCount = 0; document.documentElement.dataset.membershipFixtureQueries = "0"; this.fixtureListeners.forEach(listener => listener()); }
  failLoaded() { this.failAll = true; this.fixtureListeners.forEach(listener => listener()); }
  insertNewest() { this.newest = true; this.fixtureListeners.forEach(listener => listener()); }
  invalidateCursor() { this.invalidCursor = true; this.invalidCursorId = this.currentCursorId; this.fixtureListeners.forEach(listener => listener()); }
  paused = false;
  setFailed(value: boolean) { this.failed = value; this.fixtureListeners.forEach(listener => listener()); }
  setPaused(value: boolean) { this.paused = value; this.fixtureListeners.forEach(listener => listener()); }
  denied = false;
  private fixtureListeners = new Set<() => void>();
  constructor() { super("https://fixture.invalid"); }
  setDenied(value: boolean) { this.denied = value; this.fixtureListeners.forEach(listener => listener()); }
  override watchQuery<Query extends FunctionReference<"query">>(query: Query, ...args: ArgsAndOptions<Query, WatchQueryOptions>): Watch<FunctionReturnType<Query>> {
    document.documentElement.dataset.membershipFixtureQueries = String(++this.queryCount);
    if (getFunctionName(query) !== "clubMembership:listActivity") throw new Error("Unexpected query");
    const input: unknown = args[0];
    if (!input || typeof input !== "object" || !("paginationOpts" in input)) throw new Error("Missing pagination");
    const pagination = input.paginationOpts;
    if (!pagination || typeof pagination !== "object" || !("numItems" in pagination) || typeof pagination.numItems !== "number" || !("cursor" in pagination)) throw new Error("Missing pagination");
    const offset = Number(pagination.cursor ?? 0);
    const pageSize = pagination.numItems;
    if (pageSize !== 25) throw new Error("Restoration must preserve 25-row page boundaries");
    let observedNewest: boolean | undefined;
    let observedPinnedDone: boolean | undefined;
    let value: FunctionReturnType<typeof import("@convex-generated-api").api.clubMembership.listActivity> | undefined;
    const emptyWindow = { page: [], isDone: true, continueCursor: "" };
    const unavailable = { ...emptyWindow, scopeUnavailable: true as const };
    return {
      onUpdate: callback => { this.fixtureListeners.add(callback); return () => this.fixtureListeners.delete(callback); },
      localQueryResult: () => {
        if (offset >= 25 && "id" in pagination && typeof pagination.id === "number") this.currentCursorId = pagination.id;
        if (this.denied) throw new Error("You do not have access to this category.");
        if (this.unavailableAt !== null) return offset === this.unavailableAt || ("id" in pagination && typeof pagination.id === "number" && pagination.id > 0) ? unavailable as FunctionReturnType<Query> : undefined;
        if (this.emptyFirstWindow && offset === 0) return emptyWindow as FunctionReturnType<Query>;
        if ((this.failAll || (this.failed && offset >= 25)) && (!("id" in pagination) || pagination.id === 0)) throw new ConvexError({ code: "MEMBERSHIP_ACTIVITY_PAGE_FAILED" });
        if (this.invalidCursor && offset >= 25 && (this.persistentCursorFailure || !("id" in pagination) || pagination.id === this.invalidCursorId)) {
          if (this.cursorErrorShape === "system") throw new ConvexError({ isConvexSystemError: true, paginationError: "InvalidCursor" });
          if (this.cursorErrorShape === "message") throw new Error("InvalidCursor: query shape changed");
          throw new ConvexError({ code: "MEMBERSHIP_ACTIVITY_CURSOR_INVALID" });
        }
        if (this.paused && offset >= 75) return undefined;
        if (observedNewest !== this.newest || observedPinnedDone !== this.pinnedPageIsDone) {
          observedNewest = this.newest;
          observedPinnedDone = this.pinnedPageIsDone;
          const end = "endCursor" in pagination && typeof pagination.endCursor === "string" ? Number(pagination.endCursor) : Math.min(300, offset + pageSize - (this.newest && offset === 0 ? 1 : 0));
          const first = offset === 0 && this.newest ? -1 : offset;
          value = { page: Array.from({ length: end - first }, (_, index) => ({ auditId: `fixture-${first + index}`, eventType: "group.member.join", occurredAt: start, targetDisplayName: `Fixture member ${first + index}` })), isDone: end === 300 || (this.pinnedPageIsDone && "endCursor" in pagination), continueCursor: String(end) };
        }
        return value as FunctionReturnType<Query>;
      },
      journal: () => undefined,
    };
  }
}
function PaginationPreview({ initialFailure = false }: { initialFailure?: boolean }) {
  const [client] = useState(() => { const client = new MembershipFixtureClient(); client.failAll = initialFailure; return client; });
  const [mounted, setMounted] = useState(true);
  return <ConvexProvider client={client}>
    <div className="flex flex-wrap gap-3 p-5">
      <button onClick={() => setMounted(value => !value)}>{mounted ? "Leave fixture" : "Return to fixture"}</button>
      <button onClick={() => client.setDenied(true)}>Revoke fixture access</button>
      <button onClick={() => client.setDenied(false)}>Restore fixture access</button>
      <button onClick={() => client.setFailed(true)}>Fail next fixture page</button>
      <button onClick={() => client.setFailed(false)}>Recover fixture pages</button>
      <button onClick={() => client.setPaused(true)}>Pause fixture restoration</button>
      <button onClick={() => client.setPaused(false)}>Resume fixture restoration</button>
      <button onClick={() => client.failLoaded()}>Fail loaded fixture pages</button>
      <button onClick={() => client.insertNewest()}>Insert newest fixture event</button>
      <button onClick={() => client.invalidateCursor()}>Invalidate fixture cursors</button>
      <button onClick={() => client.rejectCursors()}>Reject fixture cursors persistently</button>
      <button onClick={() => client.invalidateNativeCursor("system")}>Invalidate native system cursor</button>
      <button onClick={() => client.invalidateNativeCursor("message")}>Invalidate native message cursor</button>
      <button onClick={() => client.rejectCursors("system")}>Reject native system cursors persistently</button>
      <button onClick={() => client.rejectCursors("message")}>Reject native message cursors persistently</button>
      <button onClick={() => client.completePinnedPages()}>Complete pinned fixture pages</button>
      <button onClick={() => client.setUnavailable(0)}>Make first fixture scope unavailable</button>
      <button onClick={() => client.setUnavailable(25)}>Make later fixture scope unavailable</button>
      <button onClick={() => client.emptyFirstPage()}>Empty first fixture window</button>
    </div>
    {mounted ? <ClubMembershipActivity communitySlug="membership-fixture" startAt={start} endAt={start + 86400000} /> : null}
  </ConvexProvider>;
}
export const PaginationAndAccess: Story = { render: () => <PaginationPreview /> };
export const InitialActivityFailure: Story = { render: () => <PaginationPreview initialFailure /> };
export const BidirectionalNames: Story = { render: () => <MembershipActivityView events={[{
  auditId: "bidi-names", eventType: "group.member.role.assign", occurredAt: start,
  targetIdentity: { displayName: "\u202EMira", vrchatUrl: "https://vrchat.com/home/user/usr_00000000-0000-4000-8000-000000000001", vrdexUrl: "/mira" },
  actorUserId: "usr_00000000-0000-4000-8000-000000000002",
  actorIdentity: { displayName: "\u202ESol", vrchatUrl: "https://vrchat.com/home/user/usr_00000000-0000-4000-8000-000000000002", vrdexUrl: "/sol" },
  roleName: "\u202EDJ",
}]} /> };


export const NonPersonActivity: Story = {
  render: () => <MembershipActivityView events={[
    { auditId: "settings", eventType: "group.update", occurredAt: start, targetUserId: "grp_00000000-0000-4000-8000-000000000001", targetDisplayName: "Old group name" },
    { auditId: "unknown-subject", eventType: "future.group.event", occurredAt: start - 1000, targetUserId: "wrld_00000000-0000-4000-8000-000000000001" },
  ]} />,
};
