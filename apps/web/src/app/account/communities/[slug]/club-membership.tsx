"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { ClubErrorBoundary } from "./club-workspace";
import { useQueries, usePaginatedQuery } from "convex/react";
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
import { metricNumber, metricTime } from "./club-chart";

export type MovementPoint = {
  at: number;
  label: string;
  joins: number | null;
  departures: number | null;
};
export type MembershipEvent = FunctionReturnType<typeof api.clubMembership.listActivity>["page"][number];
export function membershipEventLabel(type: string, roleName?: string) {
  if (type === "group.member.role.assign") return roleName ? `Assigned role: ${roleName}` : "Role assigned";
  if (type === "group.member.role.unassign") return roleName ? `Removed role: ${roleName}` : "Role removed";
  return ({ "group.member.join": "Joined", "group.member.leave": "Left", "group.member.remove": "Removed" } as Record<string, string>)[type] ?? "Other activity";
}
function PersonName({ identity, recordedName }: { identity?: MembershipEvent["targetIdentity"]; recordedName?: string }) {
  const name = identity?.displayName ?? recordedName ?? "Unknown member";
  return identity ? <a href={identity.vrchatUrl} target="_blank" rel="noreferrer" title="VRChat profile, opens in a new tab" className="underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2">{name}</a> : <>{name}</>;
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
}: {
  events: MembershipEvent[];
  loading?: boolean;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <Card padding="lg" className="min-w-0">
      <SectionTitle>Membership activity</SectionTitle>
      <div className="mt-4 divide-y divide-border">
        {events.map((event) => (
          <div key={event.auditId} className="py-4">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_12rem]">
              <div className="min-w-0">
                <p className="break-words font-medium"><PersonName identity={event.targetIdentity} recordedName={event.targetDisplayName} /></p>
                {event.targetIdentity ? <div className="mt-1 flex gap-4 text-xs text-muted">
                  <a href={event.targetIdentity.vrchatUrl} target="_blank" rel="noreferrer" title="Opens in a new tab" className="underline underline-offset-4">VRChat</a>
                  {event.targetIdentity.vrdexUrl ? <Link href={event.targetIdentity.vrdexUrl} className="underline underline-offset-4">VRDex</Link> : null}
                </div> : null}
              </div>
              <div>
                <p className="break-words text-sm">{membershipEventLabel(event.eventType, event.roleName)}</p>
                {event.actorUserId || event.actorDisplayName ? <p className="mt-1 text-xs text-muted">By <PersonName identity={event.actorIdentity} recordedName={event.actorDisplayName} />{event.actorIdentity?.vrdexUrl ? <> � <Link href={event.actorIdentity.vrdexUrl} className="underline">VRDex</Link></> : null}</p> : null}
                {event.eventType.startsWith("group.member.role.") && !event.roleName ? <p className="mt-1 text-xs text-muted">Role unavailable</p> : null}
              </div>
              <time dateTime={new Date(event.occurredAt).toISOString()} className="text-xs text-muted sm:text-right">{metricTime(event.occurredAt)}</time>
            </div>
            <details className="mt-3 text-xs text-muted">
              <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Details</summary>
              <dl className="mt-3 grid gap-2 border-l border-border pl-3">
                {[
                  ["Event type", event.eventType], ["Audit ID", event.auditId], ["Target ID", event.targetUserId],
                  ["Name recorded with event", event.targetDisplayName],
                  ["Name last checked", event.targetIdentity?.observedAt === undefined ? undefined : metricTime(event.targetIdentity.observedAt)],
                  ["Actor ID", event.actorUserId], ["Actor name recorded with event", event.actorDisplayName],
                  ["Actor name last checked", event.actorIdentity?.observedAt === undefined ? undefined : metricTime(event.actorIdentity.observedAt)],
                  ["Role ID", event.roleId], ["Role recorded with event", event.roleName],
                ].map(([label, value]) => value ? <div key={label}><dt>{label}</dt><dd className="break-all text-foreground">{value}</dd></div> : null)}
              </dl>
            </details>
          </div>
        ))}
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
      return Number.isSafeInteger(count) && count > 25 ? count : 25;
    } catch { return 25; }
  });
  const query = usePaginatedQuery(
    api.clubMembership.listActivity,
    { communitySlug, startAt, endAt },
    { initialNumItems: 25 },
  );
  const { status, results, loadMore } = query;
  useEffect(() => {
    if (status === "CanLoadMore" && results.length < restoreCount) {
      loadMore(Math.min(100, restoreCount - results.length));
    }
  }, [status, results.length, loadMore, restoreCount]);
  useEffect(() => {
    if (query.results.length > 0) {
      try { sessionStorage.setItem(storageKey, String(query.results.length)); } catch { /* Storage is optional. */ }
    }
  }, [storageKey, query.results.length]);
  return (
    <MembershipActivityView
      events={query.results}
      loading={
        query.status === "LoadingFirstPage" || query.status === "LoadingMore"
      }
      canLoadMore={query.status === "CanLoadMore"}
      onLoadMore={() => query.loadMore(25)}
    />
  );
}

export function ClubMembershipActivity(props: { communitySlug: string; startAt: number; endAt: number }) {
  return <ClubErrorBoundary key={`${props.communitySlug}:${props.startAt}:${props.endAt}`} errorMessage="Unable to load activity."><MembershipActivityQuery {...props} /></ClubErrorBoundary>;
}
