import type { ReactNode } from "react";
import Link from "next/link";
import { Card, SectionHeading } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { ViewerLocalEventDateTime } from "./viewer-local-event-times";

const growthDates = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});

export function CommunityActivitySection({ freshness, children }: {
  freshness?: "current" | "stale";
  children: ReactNode;
}) {
  return <section className="border-t border-border py-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <SectionHeading>Activity</SectionHeading>
      {freshness ? <p className="text-xs text-muted">{freshness === "current" ? "Current" : "Stale"}</p> : null}
    </div>
    {children}
  </section>;
}

export function CommunityActivitySummary({ currentPopulation, memberCount, memberGrowth }: {
  currentPopulation?: { value: number; activeInstanceCount: number };
  memberCount?: { value: number; observedAt: number };
  memberGrowth?: { value: number; startAt: number; endAt: number };
}) {
  const cardCount = Number(Boolean(currentPopulation)) + Number(Boolean(memberCount)) + Number(Boolean(memberGrowth));
  if (cardCount === 0) return null;
  const singleMetric = cardCount === 1;
  const cardLayout = singleMetric ? "sm:flex sm:items-baseline sm:gap-x-4 sm:py-3" : undefined;
  const valueClass = cn("mt-2 text-3xl font-semibold", singleMetric && "sm:mt-0 sm:text-2xl");
  const dateClass = cn("mt-1 text-xs text-muted", singleMetric && "sm:mt-0");
  return <div className={cn("mt-5 grid gap-3", cardCount === 2 && "sm:grid-cols-2", cardCount === 3 && "sm:grid-cols-3")}>
    {currentPopulation ? <Card className={cardLayout} padding="sm" surface="strong">
      <p className="text-sm text-muted">In group instances</p>
      <p className={valueClass}>{currentPopulation.value}</p>
      <p className={dateClass}>{currentPopulation.activeInstanceCount} active instances</p>
    </Card> : null}
    {memberCount ? <Card className={cardLayout} padding="sm" surface="strong">
      <p className="text-sm text-muted">Group members</p>
      <p className={valueClass}>{memberCount.value.toLocaleString("en-GB")}</p>
      <time className={cn(dateClass, "block")} dateTime={new Date(memberCount.observedAt).toISOString()}>
        {new Date(memberCount.observedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC", year: "numeric" })}
      </time>
    </Card> : null}
    {memberGrowth ? <Card className={cardLayout} padding="sm" surface="strong">
      <p className="text-sm text-muted">Member growth</p>
      <p className={valueClass}>{memberGrowth.value > 0 ? "+" : ""}{memberGrowth.value.toLocaleString("en-GB")}</p>
      {memberGrowth.startAt <= memberGrowth.endAt ? <p className={dateClass}>
        {growthDates.formatRange(memberGrowth.startAt, memberGrowth.endAt)}
      </p> : null}
    </Card> : null}
  </div>;
}

export type CommunityActivityEntries = {
  instanceHistory?: readonly { world: { slug: string; displayName: string } | null; openedAt: number }[];
  eventRecaps?: readonly {
    event?: { slug: string; title: string };
    startAt: number;
    peakConcurrency: number;
    playerHours: number;
    durationMinutes: number;
    coverageRatio: number;
  }[];
};

export function CommunityActivityDetails({ instanceHistory, eventRecaps }: CommunityActivityEntries) {
  return <>
    {instanceHistory?.length ? <div className="mt-7">
      <h3 className="text-sm font-semibold">Recent instances</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {instanceHistory.map((session, index) => <li key={`${session.openedAt}-${index}`}>
          <Card padding="sm" surface="strong">
            {session.world ? <Link className="font-medium hover:underline" href={`/${session.world.slug}`}>{session.world.displayName}</Link> : <p className="font-medium">VRChat instance</p>}
            <p className="mt-2 text-sm text-muted"><ViewerLocalEventDateTime timestamp={session.openedAt} /></p>
          </Card>
        </li>)}
      </ul>
    </div> : null}
    {eventRecaps?.length ? <div className="mt-7 grid gap-3 sm:grid-cols-2">
      {eventRecaps.map((recap) => <Card key={`${recap.event?.slug ?? "event"}-${recap.startAt}`} padding="sm" surface="strong">
        <p className="font-medium">{recap.event?.title ?? "Event recap"}</p>
        <p className="mt-2 text-sm text-muted">Peak {recap.peakConcurrency.toLocaleString("en-GB")} · {recap.playerHours.toFixed(1)} player hours · {Math.round(recap.durationMinutes)} min · {Math.round(recap.coverageRatio * 100)}% coverage</p>
      </Card>)}
    </div> : null}
  </>;
}
