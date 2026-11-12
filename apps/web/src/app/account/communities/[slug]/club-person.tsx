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
const nameSourcePriority = { vrchat_public_cache: 3, vrchat_private: 3, recorded: 2, vrdex_profile: 1 };

export function accessiblePersonName(name: string) {
  return name.replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "").trim() || "Unknown member";
}

export function isVrchatUserId(userId: string | undefined): userId is string {
  return userId !== undefined && /^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
}

export const personKey = (userId: string) => isVrchatUserId(userId) ? userId.toLowerCase() : userId;
export function findPersonIdentity<T extends PersonIdentity>(people: readonly T[], userId?: string): T | undefined {
  return userId ? people.find(person => person.userId !== undefined && personKey(person.userId) === personKey(userId)) : undefined;
}

export function personName(userId?: string, name?: string, visibleIds: string[] = []) {
  if (name?.trim()) return name;
  if (!userId) return "Unknown member";
  const key = personKey(userId);
  let length = 8;
  while (length < key.length && visibleIds.some(id => personKey(id) !== key && personKey(id).slice(-length) === key.slice(-length))) length++;
  return `Member ${key.slice(-length)}`;
}

export function usePeopleSourceGroups<T extends string>(visibleIds: T[]) {
  const ids = [...new Set(visibleIds)];
  const key = JSON.stringify(ids);
  const [grouping, setGrouping] = useState<{ key: string; groups: T[][] }>({ key: "", groups: [] });
  let groups = grouping.groups;
  if (grouping.key !== key) {
    const visible = new Set(ids);
    groups = groups.map(group => group.filter(id => visible.has(id))).filter(group => group.length > 0);
    const retained = new Set(groups.flat());
    const added = ids.filter(id => !retained.has(id));
    // Freeze partial groups so new or reordered rows do not re-admit continuously visible IDs.
    groups = [...groups, ...Array.from({ length: Math.ceil(added.length / 25) }, (_, index) => added.slice(index * 25, index * 25 + 25))];
    setGrouping({ key, groups });
  }
  return groups;
}

export function useOperationPeople(operationIds: Id<"clubOperations">[]) {
  const groups = usePeopleSourceGroups(operationIds);
  return useClubPeople(groups.length ? groups.map(operationIds => ({ kind: "scheduled_operations", operationIds })) : null);
}

export function useClubPeople(source: PeopleSource | PeopleSource[] | null) {
  const workspace = useOptionalClubWorkspace();
  const communityProfileId = workspace?.community._id;
  const integration = workspace?.integration;
  const accessKey = JSON.stringify([workspace?.actor, workspace?.readableCategories, workspace?.visibility, workspace?.connectionState, integration && [integration._id, integration.telemetryEpochStartedAt, integration.createdAt, integration.state, integration.killSwitchEnabled, integration.assignedCollectorAccountId, integration.enabledFeatures, integration.namedMembershipCollectionEnabled]]);
  const scopeKey = JSON.stringify([communityProfileId, accessKey]);
  const sources = source === null ? [] : Array.isArray(source) ? source : [source];
  const sourceKeys = sources.map(item => JSON.stringify(item));
  const key = JSON.stringify([scopeKey, sourceKeys]);
  const request = useMutation(api.clubPeople.requestView);
  const [ticket, setTicket] = useState<{ key: string; scopeKey: string; views: { sourceKey: string; viewId: Id<"clubPeopleViews">; expiresAt: number }[] } | null>(null);
  const [previousKey, setPreviousKey] = useState(key);
  if (previousKey !== key) {
    setPreviousKey(key);
    // Retain only continuously active sources within the same authority scope.
    setTicket(previous => previous?.scopeKey === scopeKey ? { ...previous, key, views: previous.views.filter(view => sourceKeys.includes(view.sourceKey) && view.expiresAt > Date.now()) } : null);
  }
  const current = ticket?.key === key && source !== null ? ticket : null;
  const [renewal, setRenewal] = useState(0);
  useEffect(() => {
    if (!communityProfileId || !sources.length || workspace?.actor.kind === "none") return;
    const missing = sources.filter((_, index) => !current?.views.some(view => view.sourceKey === sourceKeys[index] && view.expiresAt > Date.now()));
    if (!missing.length) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const admit = async (attempt: number) => {
      try {
        const views = await Promise.all(missing.map(async item => ({ sourceKey: JSON.stringify(item), ...await request({ communityProfileId, source: item }) })));
        if (views.some(view => view.expiresAt <= Date.now())) throw new Error("Expired people view");
        if (active && views.length) setTicket(previous => ({ key, scopeKey, views: [...(previous?.key === key ? previous.views.filter(view => view.expiresAt > Date.now()) : []), ...views] }));
      } catch {
        if (!active) return;
        if (attempt < 2) timer = setTimeout(() => void admit(attempt + 1), 1000 * (attempt + 1));
      }
    };
    void admit(0);
    return () => { active = false; clearTimeout(timer); };
    // The serialized key includes the complete source and current access scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, request, renewal]);
  const queries = useMemo(() => Object.fromEntries(current?.views.map(view => [view.viewId, { query: api.clubPeople.readView, args: { viewId: view.viewId } }]) ?? []), [current]);
  const results: Record<string, PeopleView | Error | undefined> = useQueries(queries);
  useEffect(() => {
    if (!current?.views.length) return;
    const expiresAt = Math.min(...current.views.map(view => view.expiresAt));
    const timer = setTimeout(() => {
      setTicket(previous => previous ? { ...previous, views: previous.views.filter(view => view.expiresAt > Date.now()) } : null);
      setRenewal(value => value + 1);
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [current]);
  const people = new Map<string, PeopleView["people"][number]>();
  const pending = new Set<string>();
  if (current) {
    for (const [viewId, result] of Object.entries(results)) if (result && !(result instanceof Error) && result.expiresAt > Date.now() && current.views.some(view => view.viewId === viewId && view.expiresAt > Date.now())) {
      for (const person of result.people) {
        const personId = personKey(person.userId);
        const previous = people.get(personId);
        const priority = person.displayName && person.source ? nameSourcePriority[person.source] : 0;
        const previousPriority = previous?.displayName && previous.source ? nameSourcePriority[previous.source] : 0;
        if (!previous || priority > previousPriority ||
            (priority === previousPriority && (person.observedAt ?? 0) > (previous.observedAt ?? 0))) people.set(personId, person);
        if (result.pendingCount > 0 && person.status === "pending") pending.add(personId);
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
    <details className="mt-2 text-xs text-muted"><summary aria-label={`Details for ${accessiblePersonName(name)}, ${userId}`} className="w-fit cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2">Details</summary><dl className="mt-2 grid gap-2 border-l border-border pl-3">{!exactId ? <div><dt>VRChat user ID</dt><dd className="break-all text-foreground">{userId}</dd></div> : null}{identity?.source === "vrdex_profile" ? <div><dt>Name source</dt><dd>VRDex profile name</dd></div> : null}{identity?.status ? <div><dt>Name lookup</dt><dd>{identity.status}</dd></div> : null}{identity?.observedAt !== undefined ? <div><dt>Name last checked</dt><dd>{metricTime(identity.observedAt)}</dd></div> : null}{children}</dl></details>
  </div>;
}
