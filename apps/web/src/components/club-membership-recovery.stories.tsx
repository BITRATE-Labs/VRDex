import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter, usePathname, useSearchParams } from "@storybook/nextjs-vite/navigation.mock";
import { ConvexProvider, ConvexReactClient, type Watch, type WatchQueryOptions, type MutationOptions } from "convex/react";
import { getFunctionName, type ArgsAndOptions, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { api } from "@convex-generated-api";
import { ClubMembershipRecovery } from "@/app/account/communities/[slug]/club-membership-recovery";
import { ClubMembershipActivity } from "@/app/account/communities/[slug]/club-membership";
import { useClubRange, ClubRangeControls } from "@/app/account/communities/[slug]/club-range";
import { ClubWorkspaceView, type WorkspaceData } from "@/app/account/communities/[slug]/club-workspace";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ClubPeopleFixture } from "./club-people-fixture";

const mira = "usr_00000000-0000-4000-8000-000000000001";
const sol = "usr_00000000-0000-4000-8000-000000000002";
const startAt = Date.UTC(2026, 8, 1);
const endAt = Date.UTC(2026, 9, 1);
type Recovery = FunctionReturnType<typeof api.clubMembershipRecovery.getRecoveryStatus>;
class RecoveryClient extends ConvexReactClient {
  private readonly fixtureListeners = new Set<() => void>();
  private readonly cache = new Map<string, unknown>();
  private readonly people = new ClubPeopleFixture();
  private job: Recovery["job"] = null;
  reads = 0;
  private hideMira = false;
  private rejectNext = false;
  failNext() { this.rejectNext = true; }
  hideSelected() { this.hideMira = true; this.notify(); }
  constructor(private readonly enabled: boolean, private readonly staff: boolean, initial?: "stopped" | "capped" | "page_cap") {
    super("https://fixture.invalid");
    if (initial) this.job = { recoveryId: "recovery-one" as Id<"communityMembershipRecoveries">, revision: 7, state: initial === "stopped" ? "stopped" : "partial", startAt, endAt, nextOffset: initial === "capped" ? 10000 : 100, pages: initial === "page_cap" ? 100 : 1, recovered: 2, conflicts: 1, unmatched: 97 };
  }
  progress() {
    if (this.job) this.job = { ...this.job, state: "running", nextOffset: this.job.nextOffset + 100, pages: this.job.pages + 1, recovered: this.job.recovered + 2, revision: this.job.revision + 1 };
    this.notify();
  }
  private notify() { this.cache.clear(); this.fixtureListeners.forEach(listener => listener()); }
  private events() {
    return Array.from({ length: 300 }, (_, index) => ({ auditId: `filtered-${index}`, eventType: ["group.member.join", "group.member.leave", "group.member.remove", "group.member.role.assign", "group.member.role.unassign"][index % 5]!, occurredAt: startAt + index * 1000, targetUserId: index % 2 === 0 ? mira : sol, targetDisplayName: index % 2 === 0 ? "Mira" : "Sol" })).filter(event => !this.hideMira || event.targetUserId !== mira);
  }
  private result(name: string, value: Record<string, unknown>) {
    const key = JSON.stringify([name, value]);
    if (this.cache.has(key)) return this.cache.get(key);
    let result: unknown;
    if (name === "clubMembershipRecovery:getRecoveryStatus") {
      document.documentElement.dataset.recoveryReads = String(++this.reads);
      if (this.staff) throw new Error("Owner-only fixture query");
      result = { enabled: this.enabled, available: this.enabled, state: this.enabled ? this.job?.state ?? "idle" : "disabled", job: this.job } satisfies Recovery;
    } else if (name === "clubMembership:listActivity") {
      document.documentElement.dataset.activityFilter = JSON.stringify(value);
      const args = value as FunctionArgs<typeof api.clubMembership.listActivity>;
      const matching = this.events().filter(event => (!args.targetUserId || args.targetUserId === event.targetUserId) && (!args.eventType || args.eventType === event.eventType));
      const offset = Number(args.paginationOpts.cursor ?? 0);
      const end = args.paginationOpts.endCursor ? Number(args.paginationOpts.endCursor) : offset + args.paginationOpts.numItems;
      result = { page: matching.slice(offset, end), isDone: end >= matching.length, continueCursor: String(Math.min(end, matching.length)) };
    } else if (name === "clubPeople:readView") result = this.people.read(String(value.viewId));
    else throw new Error(`Unexpected recovery fixture query ${name}`);
    this.cache.set(key, result);
    return result;
  }
  override watchQuery<Query extends FunctionReference<"query">>(query: Query, ...args: ArgsAndOptions<Query, WatchQueryOptions>): Watch<FunctionReturnType<Query>> {
    return { onUpdate: callback => { this.fixtureListeners.add(callback); return () => this.fixtureListeners.delete(callback); }, localQueryResult: () => this.result(getFunctionName(query), args[0] ?? {}) as FunctionReturnType<Query>, journal: () => undefined };
  }
  override async mutation<Mutation extends FunctionReference<"mutation">>(mutation: Mutation, ...args: ArgsAndOptions<Mutation, MutationOptions<FunctionArgs<Mutation>>>): Promise<FunctionReturnType<Mutation>> {
    const name = getFunctionName(mutation), value = args[0] as Record<string, unknown>;
    let result: unknown = null;
    if (name === "clubPeople:requestView") {
      const source = value.source as FunctionArgs<typeof api.clubPeople.requestView>["source"];
      const ids = source.kind === "activity" ? this.events().filter(event => source.auditIds.includes(event.auditId)).map(event => event.targetUserId) : [];
      result = this.people.request(source, ids, new Map([[mira, "Mira"], [sol, "Sol"]]));
    } else {
      if (!this.enabled || this.staff) throw new Error("Recovery is not authorized");
      if (this.rejectNext) { this.rejectNext = false; throw new Error("Internal authority unavailable, fixture detail"); }
      if (name === "clubMembershipRecovery:requestRecovery") {
        document.documentElement.dataset.recoveryRequest = JSON.stringify(value);
        if (!this.job) this.job = { recoveryId: "recovery-one" as Id<"communityMembershipRecoveries">, revision: 0, state: "pending", startAt, endAt, nextOffset: 0, pages: 0, recovered: 0, conflicts: 0, unmatched: 0 };
        else if (value.resume === true) {
          if (value.expectedRevision !== this.job.revision) throw new Error("Stale recovery revision");
          this.job = { ...this.job, revision: this.job.revision + 1, state: "pending" };
        }
        result = this.job.recoveryId;
      } else if (name === "clubMembershipRecovery:stopRecovery") {
        document.documentElement.dataset.recoveryStop = JSON.stringify(value);
        if (!this.job || value.expectedRevision !== this.job.revision) throw new Error("Stale recovery revision");
        this.job = { ...this.job, revision: this.job.revision + 1, state: "stopped" };
      } else throw new Error(`Unexpected recovery fixture mutation ${name}`);
    }
    this.notify();
    return result as FunctionReturnType<Mutation>;
  }
}
function FilteredActivity() {
  const { location, bounds, update } = useClubRange(30);
  const [mounted, setMounted] = useState(true);
  return <><ClubRangeControls location={location} update={update} /><button onClick={() => setMounted(value => !value)}>{mounted ? "Leave activity" : "Return to activity"}</button>{mounted ? <ClubMembershipActivity communitySlug="afterhours" {...bounds} targetUserId={location.member ?? undefined} eventType={location.eventType ?? undefined} onFilterChange={filters => update({ member: filters.targetUserId ?? null, eventType: filters.eventType ?? null })} /> : null}</>;
}
function Fixture({ enabled = true, staff = false, initial, filters = false }: { enabled?: boolean; staff?: boolean; initial?: "stopped" | "capped" | "page_cap"; filters?: boolean }) {
  const [client] = useState(() => new RecoveryClient(enabled, staff, initial));
  const [href, setHref] = useState("/account/communities/afterhours/analytics?from=2026-09-01&to=2026-09-30");
  const url = new URL(href, "https://fixture.invalid");
  usePathname.mockReturnValue(url.pathname);
  useSearchParams.mockReturnValue(url.searchParams as ReturnType<typeof useSearchParams>);
  getRouter().push.mockImplementation(next => setHref(next));
  const workspace: WorkspaceData = { community: { _id: "fixture-club" as Id<"profiles">, slug: "afterhours", displayName: "Afterhours" }, actor: { kind: staff ? "staff" : "owner", roleIds: [], permissions: [] }, roles: [], assignments: [], hasMoreAssignments: false, actionLog: [], visibility: null, integration: null, connectionState: "active", readableCategories: ["individual_membership_history"], eventConnectorsEnabled: false };
  return <ConvexProvider client={client}><main className="mx-auto max-w-5xl p-5"><button onClick={() => client.progress()}>Advance recovery</button><button onClick={() => client.hideSelected()}>Hide selected member</button><button onClick={() => client.failNext()}>Fail next recovery action</button><output aria-label="Fixture location">{href}</output><ClubWorkspaceView data={workspace} pathname={url.pathname}>{filters ? <FilteredActivity /> : <ClubMembershipRecovery />}</ClubWorkspaceView></main></ConvexProvider>;
}
const meta = { title: "Clubs/Membership recovery", component: Fixture, parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Owner: Story = {};
export const Disabled: Story = { args: { enabled: false, initial: "stopped" } };
export const Staff: Story = { args: { staff: true } };
export const Stopped: Story = { args: { initial: "stopped" } };
export const EntryCap: Story = { args: { initial: "capped" } };
export const PageCap: Story = { args: { initial: "page_cap" } };
export const Filters: Story = { args: { filters: true, enabled: false } };
