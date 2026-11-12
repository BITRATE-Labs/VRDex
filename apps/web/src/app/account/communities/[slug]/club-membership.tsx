"use client";

import { useEffect, useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { ClubErrorBoundary } from "./club-workspace";
import { useQueries } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex-generated-api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PersonName, PersonVRChat, PeoplePending, accessiblePersonName, isVrchatUserId, personName, useClubPeople, type PersonIdentity } from "./club-person";
import { metricNumber, metricTime } from "./club-chart";

export type MovementPoint = {
  at: number;
  label: string;
  joins: number | null;
  departures: number | null;
};
export type MembershipEvent = FunctionReturnType<typeof api.clubMembership.listActivity>["page"][number];
export function membershipEventLabel(type: string, roleName?: string) {
  if (type === "group.member.role.assign") return roleName ? <>Assigned role: <bdi>{roleName}</bdi></> : "Role assigned";
  if (type === "group.member.role.unassign") return roleName ? <>Removed role: <bdi>{roleName}</bdi></> : "Role removed";
  return ({ "group.member.join": "Joined", "group.member.leave": "Left", "group.member.remove": "Removed" } as Record<string, string>)[type] ?? "Other activity";
}
export function MembershipMovementView({
  points,
  onSelect,
}: {
  points: MovementPoint[];
  onSelect?: (at: number) => void;
}) {
  const [table, setTable] = useState(false);
  return (
    <Card padding="lg" className="min-w-0">
      <SectionTitle>Membership movement</SectionTitle>
      <div className="mt-3 flex gap-5 text-xs">
        <span className="text-emerald-400">Joins</span>
        <span className="text-rose-400">Departures</span>
      </div>
      {points.some((p) => p.joins !== null || p.departures !== null) ? (
        <div
          className="mt-4 h-64 min-w-0"
          role="group"
          aria-label="Membership movement chart"
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={points}
              accessibilityLayer
              margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
              onClick={(state) => {
                const p = points[Number(state.activeTooltipIndex)];
                if (state.activeTooltipIndex != null && p) onSelect?.(p.at);
              }}
            >
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <YAxis
                width={40}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
              />
              <Tooltip
                cursor={false}
                filterNull={false}
                contentStyle={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  borderRadius: 4,
                  color: "var(--foreground)",
                }}
                formatter={(value) =>
                  metricNumber(typeof value === "number" ? value : null)
                }
              />
              <Bar
                dataKey="joins"
                name="Joins"
                fill="#34d399"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="departures"
                name="Departures"
                fill="#fb7185"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Notice className="mt-5" variant="dashed">
          Membership movement unavailable.
        </Notice>
      )}
      <Button
        className="mt-3"
        size="sm"
        variant="ghost"
        aria-expanded={table}
        onClick={() => setTable(!table)}
      >
        {table ? "Hide movement data" : "Show movement data"}
      </Button>
      {table ? (
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2">Day</th>
                <th>Joins</th>
                <th>Departures</th>
                {onSelect ? (
                  <th>
                    <span className="sr-only">Inspect</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.at} className="border-b border-border">
                  <td className="py-3">{p.label}</td>
                  <td>{metricNumber(p.joins)}</td>
                  <td>{metricNumber(p.departures)}</td>
                  {onSelect ? (
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSelect(p.at)}
                      >
                        Inspect day
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
export function ClubMembershipMovement({
  communitySlug,
  days,
  onSelect,
}: {
  communitySlug: string;
  days: { key: string; startAt: number; endAt: number }[];
  onSelect: (at: number) => void;
}) {
  const queries = useMemo(
    () =>
      Object.fromEntries(
        days.map((day) => [
          day.key,
          {
            query: api.clubMembership.getMovementBucket,
            args: { communitySlug, startAt: day.startAt, endAt: day.endAt },
          },
        ]),
      ),
    [communitySlug, days],
  );
  const results = useQueries(queries);
  if (days.some((day) => results[day.key] === undefined))
    return <Notice role="status">Loading membership movement…</Notice>;
  return (
    <MembershipMovementView
      onSelect={onSelect}
      points={days.map((day) => {
        const result = results[day.key];
        return {
          at: day.startAt,
          label: new Date(day.startAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          joins:
            result && !(result instanceof Error) && result.complete
              ? result.joins
              : null,
          departures:
            result && !(result instanceof Error) && result.complete
              ? result.departures
              : null,
        };
      })}
    />
  );
}
export function MembershipActivityView({
  events,
  loading = false,
  canLoadMore = false,
  onLoadMore,
  people = [],
  pendingCount = 0,
}: {
  people?: PersonIdentity[];
  pendingCount?: number;
  events: MembershipEvent[];
  loading?: boolean;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
}) {
  const visibleIds = events.flatMap(event => [event.targetUserId, event.actorUserId, event.targetIdentity?.vrchatUrl.split("/").at(-1), event.actorIdentity?.vrchatUrl.split("/").at(-1)]).filter(isVrchatUserId);
  return (
    <Card padding="lg" className="min-w-0">
      <SectionTitle>Membership activity</SectionTitle>
      <PeoplePending count={pendingCount} />
      <div className="mt-4 divide-y divide-border">
        {events.map((event) => {
          const target: PersonIdentity | undefined = people.find(person => person.userId === event.targetUserId) ?? event.targetIdentity;
          const actor: PersonIdentity | undefined = people.find(person => person.userId === event.actorUserId) ?? event.actorIdentity;
          const targetId = event.targetUserId ?? target?.vrchatUrl?.split("/").at(-1);
          const userId = isVrchatUserId(targetId) ? targetId : undefined;
          const personSubject = userId !== undefined || event.eventType.startsWith("group.member.");
          const actorId = event.actorUserId ?? actor?.vrchatUrl?.split("/").at(-1);
          const nonPersonSubject = ({ "group.update": "Group settings", "group.post.create": "Group post", "group.instance.create": "Group instance", "group.role.create": "Group role", "group.role.update": "Group role", "group.role.delete": "Group role" } as Record<string, string>)[event.eventType] ?? "Group activity";
          const subject = personSubject ? personName(userId, target?.displayName || event.targetDisplayName, visibleIds) : nonPersonSubject;
          return <div key={event.auditId} className="py-4">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_12rem]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3"><p className="min-w-0 break-words font-medium">{personSubject ? <PersonName userId={userId} identity={target} recordedName={event.targetDisplayName} visibleIds={visibleIds} /> : subject}</p><PersonVRChat userId={userId} identity={target} recordedName={event.targetDisplayName} visibleIds={visibleIds} /></div>
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm">{membershipEventLabel(event.eventType, event.roleName)}</p>
                {actorId || event.actorDisplayName ? <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><span className="min-w-0 break-words">By <PersonName userId={actorId} identity={actor} recordedName={event.actorDisplayName} visibleIds={visibleIds} /></span>{actorId !== userId ? <PersonVRChat userId={actorId} identity={actor} recordedName={event.actorDisplayName} visibleIds={visibleIds} /> : null}</div> : null}
              </div>
              <time dateTime={new Date(event.occurredAt).toISOString()} className="text-xs text-muted sm:text-right">{metricTime(event.occurredAt)}</time>
            </div>
            <details className="mt-3 text-xs text-muted">
              <summary aria-label={`Details for ${accessiblePersonName(subject)}, ${event.auditId}`} className="w-fit cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Details</summary>
              <dl className="mt-3 grid gap-2 border-l border-border pl-3">
                {[
                  ["Event type", event.eventType], ["Audit ID", event.auditId], ["Target ID", event.targetUserId],
                  ["Name recorded with event", event.targetDisplayName],
                  ["Name source", target?.source === "vrdex_profile" ? "VRDex profile name" : undefined],
                  ["Name lookup", target?.status],
                  ["Name last checked", target?.observedAt === undefined ? undefined : metricTime(target.observedAt)],
                  ["Actor ID", event.actorUserId], ["Actor name recorded with event", event.actorDisplayName],
                  ["Actor name source", actor?.source === "vrdex_profile" ? "VRDex profile name" : undefined],
                  ["Actor name lookup", actor?.status],
                  ["Actor name last checked", actor?.observedAt === undefined ? undefined : metricTime(actor.observedAt)],
                  ["Role ID", event.roleId], ["Role recorded with event", event.roleName],
                  ["Role", event.eventType.startsWith("group.member.role.") && !event.roleName ? "Role not recorded" : undefined],
                ].map(([label, value]) => value ? <div key={label}><dt>{label}</dt><dd className="break-all text-foreground">{value}</dd></div> : null)}
              </dl>
            </details>
          </div>;
        })}
      </div>
      {loading ? (
        <Notice role="status">Loading membership activity…</Notice>
      ) : events.length === 0 ? (
        <Notice variant="dashed">No recorded membership events.</Notice>
      ) : null}
      {canLoadMore ? (
        <Button className="mt-4" onClick={onLoadMore}>
          Load more activity
        </Button>
      ) : null}
    </Card>
  );
}
function AdmittedActivity(props: Parameters<typeof MembershipActivityView>[0]) {
  const people = useClubPeople(props.events.length ? Array.from({ length: Math.ceil(props.events.length / 25) }, (_, index) => ({ kind: "activity" as const, auditIds: props.events.slice(index * 25, index * 25 + 25).map(event => event.auditId) })) : null);
  return <MembershipActivityView {...props} people={people.people} pendingCount={people.pendingCount} />;
}
function MembershipActivityQuery({
  communitySlug,
  startAt,
  endAt,
}: {
  communitySlug: string;
  startAt: number;
  endAt: number;
}) {
  const storageKey = `membership-pages:${communitySlug}:${startAt}:${endAt}`;
  const [restoreCount] = useState(() => {
    try {
      const count = Number(sessionStorage.getItem(storageKey));
      return Number.isSafeInteger(count) && count > 25 ? Math.min(250, count) : 25;
    } catch { return 25; }
  });
  type Page = FunctionReturnType<typeof api.clubMembership.listActivity>;
  const [requests, setRequests] = useState<{ cursor: string | null; id: number; endCursor?: string }[]>([{ cursor: null, id: 0 }]);
  const [cached, setCached] = useState<Record<string, Page>>({});
  const [cursorResets, setCursorResets] = useState(0);
  const queries = useMemo(() => Object.fromEntries(requests.map((pagination, index) => [index, {
    query: api.clubMembership.listActivity,
    args: { communitySlug, startAt, endAt, paginationOpts: { ...pagination, numItems: 25 } },
  }])), [communitySlug, startAt, endAt, requests]);
  const pages: Record<string, Page | Error | undefined> = useQueries(queries);
  const [previousPages, setPreviousPages] = useState(pages);
  const scopeUnavailable = Object.values(pages).some(page => page && !(page instanceof Error) && page.scopeUnavailable === true);
  const errors = Object.values(pages).filter((page): page is Error => page instanceof Error);
  const invalidCursor = errors.some(error => error.message.includes("InvalidCursor") ||
    (error instanceof ConvexError && typeof error.data === "object" &&
      (error.data?.code === "MEMBERSHIP_ACTIVITY_CURSOR_INVALID" ||
        (error.data?.isConvexSystemError === true && error.data?.paginationError === "InvalidCursor"))));
  // Only errors issued after authorization may keep previously authorized rows.
  const clearHistory = errors.some(error => !(error instanceof ConvexError && typeof error.data === "object" && error.data?.code === "MEMBERSHIP_ACTIVITY_PAGE_FAILED"));
  if (pages !== previousPages) {
    setPreviousPages(pages);
    if (invalidCursor && cursorResets === 0) {
      setCursorResets(1);
      setRequests([{ cursor: null, id: requests[0].id + 1 }]);
      setCached({});
    } else if (clearHistory || scopeUnavailable) {
      if (Object.keys(cached).length) setCached({});
      if (!invalidCursor && (requests.length > 1 || requests[0].endCursor !== undefined)) setRequests([{ cursor: null, id: requests[0].id + 1 }]);
    } else setCached(current => {
      const next = { ...current };
      let changed = false;
      for (const [key, page] of Object.entries(pages)) {
        if (page && !(page instanceof Error) && page !== current[key]) { next[key] = page; changed = true; }
      }
      return changed ? next : current;
    });
  }
  const events: MembershipEvent[] = [];
  let lastPage: Page | undefined;
  if (!clearHistory && !scopeUnavailable) for (let index = 0; index < requests.length; index++) {
    const current = pages[index];
    const page = current instanceof Error || current === undefined ? cached[index] : current;
    if (!page) break;
    events.push(...page.page);
    lastPage = page;
  }
  const loading = !scopeUnavailable && errors.length === 0 && Object.values(pages).some(page => page === undefined);
  const canLoadMore = !loading && errors.length === 0 && lastPage !== undefined && !lastPage.isDone;
  if (cursorResets > 0 && errors.length === 0 && !loading && lastPage && (events.length >= restoreCount || lastPage.isDone)) {
    setCursorResets(0);
  }
  const continueCursor = lastPage?.continueCursor;
  const loadMore = () => {
    if (continueCursor === undefined) return;
    setRequests(current => [
      ...current.map((request, index) => index === current.length - 1 ? { ...request, endCursor: continueCursor } : request),
      { cursor: continueCursor, id: current[0].id },
    ]);
  };
  if (canLoadMore && events.length < restoreCount && continueCursor !== undefined) {
    loadMore();
  }
  useEffect(() => {
    if (events.length > 0) {
      try {
        const stored = Number(sessionStorage.getItem(storageKey));
        const previous = Number.isSafeInteger(stored) && stored > 25 ? stored : 25;
        sessionStorage.setItem(storageKey, String(Math.min(250, Math.max(previous, restoreCount, events.length))));
      } catch { /* Storage is optional. */ }
    }
  }, [storageKey, events.length, restoreCount]);
  return <>
    {errors.length > 0 ? <Notice variant="error" role="alert">Unable to load activity.<Button className="ml-3" size="sm" variant="secondary" onClick={() => {
      if (invalidCursor) {
        setCached({});
        setRequests([{ cursor: null, id: requests[0].id + 1 }]);
        return;
      }
      setRequests(current => current.map((request, index) => pages[index] instanceof Error ? {
      ...request, id: request.id + 1,
    } : request));
    }}>Retry</Button></Notice> : null}
    {!clearHistory && (events.length > 0 || errors.length === 0) ? <AdmittedActivity
      events={events}
      loading={loading}
      canLoadMore={canLoadMore}
      onLoadMore={loadMore}
    /> : null}
  </>;
}

export function ClubMembershipActivity(props: { communitySlug: string; startAt: number; endAt: number }) {
  return <ClubErrorBoundary key={`${props.communitySlug}:${props.startAt}:${props.endAt}`} errorMessage="Unable to load activity."><MembershipActivityQuery {...props} /></ClubErrorBoundary>;
}
