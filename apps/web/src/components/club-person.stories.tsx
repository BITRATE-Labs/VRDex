import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ConvexProvider, ConvexReactClient, type MutationOptions, type Watch, type WatchQueryOptions } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType, type ArgsAndOptions } from "convex/server";
import { api } from "@convex-generated-api";
import { ClubPerson, PeoplePending, useClubPeople } from "@/app/account/communities/[slug]/club-person";
import { ClubWorkspaceView, type WorkspaceData } from "@/app/account/communities/[slug]/club-workspace";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ClubPeopleFixture } from "./club-people-fixture";

const first = "usr_00000000-0000-0000-0000-000000000001";
const second = "usr_11111111-1111-1111-1111-111100000001";
class PeopleClient extends ConvexReactClient {
  readonly people: ClubPeopleFixture;
  private readonly fixtureListeners = new Set<() => void>();
  private cache = new Map<string, unknown>();
  nameMode: "recorded" | "public" | "private" | "profile" = "recorded";
  private readonly viewSources = new Map<string, string>();
  requestCount = 0;
  delay = 0;
  expiredResponses = false;
  failSecond = false;
  private holdDelivery = false;
  private deliveries: (() => void)[] = [];
  holdDeliveries() { this.holdDelivery = true; }
  releaseDeliveries() { this.holdDelivery = false; this.deliveries.splice(0).forEach(resolve => resolve()); }
  returnExpired() { this.expiredResponses = true; }
  delayRequests() { this.delay = 500; }
  constructor(private readonly namePrecedence = false, serverOffset = 0) { super("https://fixture.invalid"); this.people = new ClubPeopleFixture(serverOffset); }
  change(change: () => void) { change(); this.cache.clear(); this.fixtureListeners.forEach(listener => listener()); }
  override watchQuery<Query extends FunctionReference<"query">>(query: Query, ...args: ArgsAndOptions<Query, WatchQueryOptions>): Watch<FunctionReturnType<Query>> {
    const key = JSON.stringify(args[0]);
    return {
      onUpdate: callback => { this.fixtureListeners.add(callback); return () => this.fixtureListeners.delete(callback); },
      localQueryResult: () => {
        if (getFunctionName(query) !== "clubPeople:readView") throw new Error("Unexpected people query");
        if (!this.cache.has(key)) {
          const viewId = String((args[0] as { viewId: string }).viewId);
          if (this.failSecond && this.viewSources.get(viewId) === "second") throw new Error("Event unavailable");
          let view = this.people.read(viewId);
          if (this.namePrecedence) {
            const newerChunk = this.viewSources.get(viewId) === "first";
            const observation = this.nameMode === "recorded"
              ? { source: "recorded" as const, displayName: newerChunk ? "New recorded" : "Old recorded", observedAt: newerChunk ? 200 : 100 }
              : this.nameMode === "public"
                ? { source: newerChunk ? "recorded" as const : "vrchat_public_cache" as const, displayName: newerChunk ? "New recorded" : "Public observation", observedAt: newerChunk ? 200 : 50 }
                : this.nameMode === "private"
                  ? { source: newerChunk ? "vrchat_private" as const : "vrchat_public_cache" as const, displayName: newerChunk ? "Private observation" : "New public observation", observedAt: newerChunk ? 200 : 300 }
                  : { source: newerChunk ? "recorded" as const : "vrdex_profile" as const, displayName: newerChunk ? "New recorded" : "Profile fallback", observedAt: newerChunk ? 200 : 300 };
            view = { ...view, people: view.people.map(person => ({ ...person, userId: first, ...observation })) };
          }
          this.cache.set(key, view);
        }
        return this.cache.get(key) as FunctionReturnType<Query>;
      },
      journal: () => undefined,
    };
  }
  override async mutation<Mutation extends FunctionReference<"mutation">>(mutation: Mutation, ...args: ArgsAndOptions<Mutation, MutationOptions<FunctionArgs<Mutation>>>): Promise<FunctionReturnType<Mutation>> {
    if (getFunctionName(mutation) !== "clubPeople:requestView") throw new Error("Unexpected people mutation");
    document.documentElement.dataset.peopleRequests = String(++this.requestCount);
    const input = args[0] as FunctionArgs<typeof api.clubPeople.requestView>;
    if (this.delay) await new Promise(resolve => setTimeout(resolve, this.delay));
    if (this.people.denied) throw new Error("Access revoked");
    const view = this.people.request(input.source, input.source.kind === "invitation_review" ? input.source.targetUserIds : input.source.kind === "activity" ? [input.source.auditIds[0] === "first" ? first : second] : []);
    if (this.holdDelivery) await new Promise<void>(resolve => this.deliveries.push(resolve));
    if (input.source.kind === "activity") this.viewSources.set(view.viewId, input.source.auditIds[0]);
    return { ...view, ...(this.expiredResponses ? { expiresAt: Date.now() - 1 } : {}) } as FunctionReturnType<Mutation>;
  }
}
function PeopleList({ alternate, active, chunks }: { alternate: boolean; active: boolean; chunks?: number }) {
  const ids = alternate ? [second] : [first, second];
  const people = useClubPeople(active ? chunks ? ["first", "second"].slice(0, chunks).map(auditId => ({ kind: "activity" as const, auditIds: [auditId] })) : { kind: "invitation_review", targetUserIds: ids, destination: { kind: "group" } } : null);
  return <section aria-label="People"><PeoplePending count={people.pendingCount} /><ul className="grid gap-5">{ids.map(userId => <li key={userId}><ClubPerson userId={userId} identity={people.people.find(person => person.userId === userId)} visibleIds={ids} /></li>)}</ul></section>;
}
function Fixture({ chunked = false, namePrecedence = false, serverOffset = 0 }: { chunked?: boolean; namePrecedence?: boolean; serverOffset?: number }) {
  const [chunks, setChunks] = useState(1);
  const [client] = useState(() => new PeopleClient(namePrecedence, serverOffset));
  const [alternate, setAlternate] = useState(false);
  const [viewer, setViewer] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [community, setCommunity] = useState(0);
  const [active, setActive] = useState(true);
  const [authorized, setAuthorized] = useState(true);
  const data: WorkspaceData = {
    community: { _id: `people-club-${community}` as Id<"profiles">, slug: "people", displayName: "People fixture" },
    actor: { kind: authorized ? "owner" : "none", subject: { tokenIdentifier: `viewer-${viewer}`, issuer: "fixture", subject: `viewer-${viewer}` }, roleIds: [], permissions: [] },
    roles: [], assignments: [], hasMoreAssignments: false, actionLog: [], visibility: null, integration: {
      _id: "people-integration" as Id<"communityVrchatIntegrations">, _creationTime: 1, communityProfileId: `people-club-${community}` as Id<"profiles">,
      vrchatGroupId: "grp_fixture", collector: null, groupVisibility: "public", joinPolicy: "free", state: "active", killSwitchEnabled: false,
      requestsPerMinute: 4, leaseGeneration: 1, consecutiveFailures: 0, createdAt: 1, updatedAt: 1, telemetryEpochStartedAt: epoch,
      publicMetrics: { currentPopulation: false, populationHistory: false, groupMemberCount: false, groupMemberGrowth: false, eventRecaps: false },
    }, connectionState: "active", readableCategories: [], eventConnectorsEnabled: false,
  };
  return <ConvexProvider client={client}><main className="mx-auto max-w-4xl space-y-5 p-5"><div className="flex flex-wrap gap-3">
    <button onClick={() => client.change(() => { client.people.resolved = false; })}>Delay names</button>
    <button onClick={() => client.change(() => { client.people.resolved = true; })}>Resolve names</button>
    <button onClick={() => client.change(() => { client.people.profileNames = true; })}>Use profile names</button>
    <button onClick={() => client.change(() => { client.people.pendingAllowed = false; })}>Disable lookup</button>
    <button onClick={() => client.change(() => { client.people.denied = true; })}>Revoke access</button>
    <button onClick={() => setAuthorized(false)}>Remove workspace access</button>
    <button onClick={() => { client.delayRequests(); setAuthorized(true); }}>Restore workspace access</button>
    <button onClick={() => setActive(false)}>Close source</button>
    <button onClick={() => setChunks(2)}>Add chunk</button>
    <button onClick={() => client.change(() => { client.failSecond = true; })}>Fail second chunk</button>
    {namePrecedence ? (["recorded", "public", "private", "profile"] as const).map(mode => <button key={mode} onClick={() => client.change(() => { client.nameMode = mode; })}>Use {mode} observations</button>) : null}
    <button onClick={() => setChunks(1)}>Remove last chunk</button>
    <button onClick={() => { client.returnExpired(); setViewer(value => value + 1); }}>Return expired grants</button>
    <button onClick={() => { client.holdDeliveries(); setViewer(value => value + 1); }}>Hold grant delivery</button>
    <button onClick={() => client.releaseDeliveries()}>Release grant delivery</button>
    <button onClick={() => { client.delayRequests(); setAlternate(value => !value); }}>Change source</button>
    <button onClick={() => { client.delayRequests(); setCommunity(value => value + 1); }}>Change community</button>
    <button onClick={() => { client.delayRequests(); setViewer(value => value + 1); }}>Change viewer</button>
    <button onClick={() => { client.delayRequests(); setEpoch(value => value + 1); }}>Replace integration scope</button>
  </div><ClubWorkspaceView data={data} pathname="/account/communities/people"><PeopleList alternate={alternate} active={active} chunks={chunked ? chunks : undefined} /></ClubWorkspaceView></main></ConvexProvider>;
}
const meta = { title: "Clubs/People controls", component: Fixture, parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Lifecycle: Story = {};

export const ChunkedSources: Story = { args: { chunked: true } };
export const FastBrowserClock: Story = { args: { chunked: true, serverOffset: -3_600_000 } };
export const SlowBrowserClock: Story = { args: { chunked: true, serverOffset: 3_600_000 } };

export const NamePrecedence: Story = { args: { chunked: true, namePrecedence: true } };

export const MixedCaseFallbacks: Story = { render: () => {
  const ids = ["USR_AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", "usr_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "usr_bbbbbbbb-bbbb-bbbb-bbbb-aaaaaaaaaaaa"];
  return <main className="space-y-4 p-5">{ids.map(id => <ClubPerson key={id} userId={id} visibleIds={ids} exactId />)}</main>;
} };
