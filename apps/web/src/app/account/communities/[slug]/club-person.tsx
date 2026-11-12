"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueries } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@convex-generated-api";
import { useOptionalClubWorkspace } from "./club-workspace";
import { metricTime } from "./club-chart";
import type { Id } from "../../../../../../../convex/_generated/dataModel";

export type PeopleSource = FunctionArgs<typeof api.clubPeople.requestView>["source"];
type PeopleView = FunctionReturnType<typeof api.clubPeople.readView>;
export type PersonIdentity = Partial<PeopleView["people"][number]>;

export function accessiblePersonName(name: string) {
  return name.replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "").trim() || "Unknown member";
}

export function isVrchatUserId(userId: string | undefined): userId is string {
  return userId !== undefined && /^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
}

export function personName(userId?: string, name?: string, visibleIds: string[] = []) {
  if (name?.trim()) return name;
  if (!userId) return "Unknown member";
  let length = 8;
  while (length < userId.length && visibleIds.some(id => id !== userId && id.slice(-length) === userId.slice(-length))) length++;
  return `Member ${userId.slice(-length)}`;
}

export function useClubPeople(source: PeopleSource | PeopleSource[] | null) {
  const workspace = useOptionalClubWorkspace();
  const communityProfileId = workspace?.community._id;
  const integration = workspace?.integration;
  const accessKey = JSON.stringify([workspace?.actor, workspace?.readableCategories, workspace?.visibility, workspace?.connectionState, integration && [integration._id, integration.telemetryEpochStartedAt, integration.createdAt, integration.state, integration.killSwitchEnabled, integration.assignedCollectorAccountId, integration.enabledFeatures, integration.namedMembershipCollectionEnabled]]);
  const key = JSON.stringify([communityProfileId, source, accessKey]);
  const request = useMutation(api.clubPeople.requestView);
  const [ticket, setTicket] = useState<{ key: string; views: { viewId: Id<"clubPeopleViews">; expiresAt: number }[]; expiresAt: number } | null>(null);
  const [previousKey, setPreviousKey] = useState(key);
  if (previousKey !== key) {
    setPreviousKey(key);
    setTicket(null);
  }
  const [renewal, setRenewal] = useState(0);
  useEffect(() => {
    if (!communityProfileId || !source || workspace?.actor.kind === "none") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const admit = async (attempt: number) => {
      try {
        const sources = Array.isArray(source) ? source : [source];
        const views = await Promise.all(sources.map(item => request({ communityProfileId, source: item })));
        if (views.some(view => view.expiresAt <= Date.now())) throw new Error("Expired people view");
        if (active && views.length) setTicket({ key, views, expiresAt: Math.min(...views.map(view => view.expiresAt)) });
      } catch {
        if (!active) return;
        setTicket(null);
        if (attempt < 2) timer = setTimeout(() => void admit(attempt + 1), 1000 * (attempt + 1));
      }
    };
    void admit(0);
    return () => { active = false; clearTimeout(timer); };
    // The serialized key includes the complete source and current access scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, request, renewal]);
  const current = ticket?.key === key && source !== null ? ticket : null;
  const queries = useMemo(() => Object.fromEntries(current?.views.map(view => [view.viewId, { query: api.clubPeople.readView, args: { viewId: view.viewId } }]) ?? []), [current]);
  const results: Record<string, PeopleView | Error | undefined> = useQueries(queries);
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => { setTicket(null); setRenewal(value => value + 1); }, Math.max(0, current.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [current]);
  const people = new Map<string, PeopleView["people"][number]>();
  const pending = new Set<string>();
  if (current && current.expiresAt > Date.now() && !Object.values(results).some(result => result instanceof Error)) {
    for (const result of Object.values(results)) if (result && !(result instanceof Error)) {
      for (const person of result.people) {
        people.set(person.userId, person);
        if (result.pendingCount > 0 && person.status === "pending") pending.add(person.userId);
      }
    }
  }
  return { people: [...people.values()], pendingCount: pending.size };
}

export function PeoplePending({ count }: { count: number }) {
  return count > 0 ? <p className="text-xs text-muted" role="status">Updating names <span aria-hidden="true">·</span> {count}</p> : null;
}

export function PersonName({ userId, identity, recordedName, visibleIds }: { userId?: string; identity?: PersonIdentity; recordedName?: string; visibleIds?: string[] }) {
  const name = personName(userId, identity?.displayName || recordedName, visibleIds);
  return identity?.vrdexUrl ? <a href={identity.vrdexUrl} aria-label={accessiblePersonName(name)} className="break-words underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"><bdi>{name}</bdi></a> : <bdi>{name}</bdi>;
}

export function PersonVRChat({ userId, identity, recordedName, visibleIds }: { userId?: string; identity?: PersonIdentity; recordedName?: string; visibleIds?: string[] }) {
  if (!isVrchatUserId(userId)) return null;
  const name = personName(userId, identity?.displayName || recordedName, visibleIds);
  return <a href={`https://vrchat.com/home/user/${encodeURIComponent(userId)}`} target="_blank" rel="noreferrer" aria-label={`${accessiblePersonName(name)} (VRChat profile, opens in a new tab)`} className="inline-flex min-h-10 min-w-10 items-center rounded-control border border-border px-3 text-xs hover:bg-surface-hover focus-visible:outline focus-visible:outline-2">VRChat</a>;
}

export function ClubPerson({ userId, identity, recordedName, visibleIds, exactId = false, children }: { userId: string; identity?: PersonIdentity; recordedName?: string; visibleIds?: string[]; exactId?: boolean; children?: ReactNode }) {
  const name = personName(userId, identity?.displayName || recordedName, visibleIds);
  return <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><span className="min-w-0 break-words font-medium"><PersonName userId={userId} identity={identity} recordedName={recordedName} visibleIds={visibleIds} /></span><PersonVRChat userId={userId} identity={identity} recordedName={recordedName} visibleIds={visibleIds} /></div>
    {exactId ? <p className="mt-1 break-all font-mono text-xs">{userId}</p> : null}
    <details className="mt-2 text-xs text-muted"><summary aria-label={`Details for ${accessiblePersonName(name)}, ${userId}`} className="w-fit cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2">Details</summary><dl className="mt-2 grid gap-2 border-l border-border pl-3">{!exactId ? <div><dt>VRChat user ID</dt><dd className="break-all text-foreground">{userId}</dd></div> : null}{identity?.status ? <div><dt>Name lookup</dt><dd>{identity.status}</dd></div> : null}{identity?.observedAt !== undefined ? <div><dt>Name last checked</dt><dd>{metricTime(identity.observedAt)}</dd></div> : null}{children}</dl></details>
  </div>;
}
