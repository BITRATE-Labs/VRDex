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
  readonly people = new ClubPeopleFixture();
  private readonly fixtureListeners = new Set<() => void>();
  private cache = new Map<string, unknown>();
  requestCount = 0;
  delay = 0;
  expiredResponses = false;
  returnExpired() { this.expiredResponses = true; }
  delayRequests() { this.delay = 500; }
  constructor() { super("https://fixture.invalid"); }
  change(change: () => void) { change(); this.cache.clear(); this.fixtureListeners.forEach(listener => listener()); }
  override watchQuery<Query extends FunctionReference<"query">>(query: Query, ...args: ArgsAndOptions<Query, WatchQueryOptions>): Watch<FunctionReturnType<Query>> {
    const key = JSON.stringify(args[0]);
    return {
      onUpdate: callback => { this.fixtureListeners.add(callback); return () => this.fixtureListeners.delete(callback); },
      localQueryResult: () => {
        if (getFunctionName(query) !== "clubPeople:readView") throw new Error("Unexpected people query");
        if (!this.cache.has(key)) this.cache.set(key, this.people.read(String((args[0] as {viewId: string}).viewId)));
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
    const view = this.people.request(input.source, input.source.kind === "invitation_review" ? input.source.targetUserIds : []);
    return { ...view, ...(this.expiredResponses ? { expiresAt: Date.now() - 1 } : {}) } as FunctionReturnType<Mutation>;
  }
}
function PeopleList({ alternate, active }: { alternate: boolean; active: boolean }) {
  const ids = alternate ? [second] : [first, second];
  const people = useClubPeople(active ? { kind: "invitation_review", targetUserIds: ids, destination: { kind: "group" } } : null);
  return <section aria-label="People"><PeoplePending count={people.pendingCount} /><ul className="grid gap-5">{ids.map(userId => <li key={userId}><ClubPerson userId={userId} identity={people.people.find(person => person.userId === userId)} visibleIds={ids} /></li>)}</ul></section>;
}
function Fixture() {
  const [client] = useState(() => new PeopleClient());
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
    <button onClick={() => { client.returnExpired(); setViewer(value => value + 1); }}>Return expired grants</button>
    <button onClick={() => { client.delayRequests(); setAlternate(value => !value); }}>Change source</button>
    <button onClick={() => { client.delayRequests(); setCommunity(value => value + 1); }}>Change community</button>
    <button onClick={() => { client.delayRequests(); setViewer(value => value + 1); }}>Change viewer</button>
    <button onClick={() => { client.delayRequests(); setEpoch(value => value + 1); }}>Replace integration scope</button>
  </div><ClubWorkspaceView data={data} pathname="/account/communities/people"><PeopleList alternate={alternate} active={active} /></ClubWorkspaceView></main></ConvexProvider>;
}
const meta = { title: "Clubs/People controls", component: Fixture, parameters: { layout: "fullscreen", nextjs: { appDirectory: true } } } satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Lifecycle: Story = {};
