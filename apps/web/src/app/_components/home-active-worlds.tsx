import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/ui/card";
import { EntityImage } from "@/components/ui/entity-image";
import { Notice } from "@/components/ui/notice";
import { ViewerLocalEventDateTime } from "./viewer-local-event-times";

type EventSourceType = "manual" | "community" | "partner" | "import" | "ai_suggested" | "contributor";

export type PublicActiveWorld = {
  slug: string;
  displayName: string;
  tags: string[];
  summary?: string;
  heroImageUrl?: string;
  upcomingEventCount: number;
  activityLabel: "Hosting upcoming events";
  nextEvent: {
    title: string;
    slug?: string;
    communitySlug?: string;
    startAt?: number;
  eventDate?: string;
  scheduleKind?: "timed" | "date_only";
    doorsOpenAt?: number;
    endAt?: number;
    timezone?: string;
    communityName?: string;
    source: {
      sourceType: EventSourceType;
      label: string;
      url?: string;
    };
  };
};

function ActiveWorldCard({ world }: { world: PublicActiveWorld }) {
  const titleId = `featured-world-${world.slug}`;

  return (
    <Link
      aria-labelledby={titleId}
      className="group relative grid min-h-72 w-full min-w-0 grid-cols-1 overflow-hidden rounded-panel border border-border bg-media !text-white shadow-panel transition before:col-start-1 before:row-start-1 before:aspect-[4/3] hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
      href={`/${world.slug}`}
    >
      <EntityImage alt="" className="absolute inset-0 size-full rounded-none bg-media" fallback={false} label={world.displayName} sizes="(min-width: 1024px) 33vw, 100vw" src={world.heroImageUrl} />
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--media)_80%,transparent),color-mix(in_srgb,var(--accent)_16%,transparent))]" />

      <div className="relative col-start-1 row-start-1 p-5 [overflow-wrap:anywhere]">
        <div className="flex items-start justify-between gap-3">
          <h3 id={titleId} className="min-w-0 text-3xl font-semibold text-white">{world.displayName}</h3>
          <ChevronRight aria-hidden="true" className="mt-2 size-4 shrink-0 text-white/75 group-hover:text-white" />
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/76">
          {world.summary ?? "Upcoming public events are linked here."}
        </p>
        <div className="mt-4 border-t border-white/20 pt-3">
          <p className="text-xs font-medium text-white/72">Next event</p>
          <p className="mt-1 text-sm font-medium text-white">{world.nextEvent.title}</p>
          <p className="mt-1 text-sm text-white/72">
            <ViewerLocalEventDateTime timestamp={world.nextEvent.startAt} eventDate={world.nextEvent.eventDate} scheduleKind={world.nextEvent.scheduleKind} />
            {world.nextEvent.communityName ? ` by ${world.nextEvent.communityName}` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function HomeActiveWorldsSection({
  status,
  worlds,
}: {
  status: "live" | "missing-url" | "error";
  worlds: PublicActiveWorld[];
}) {
  return (
    <section className="min-w-0 border-t border-border pt-6">
      <SectionHeading>Featured worlds</SectionHeading>

      {worlds.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {worlds.map((world) => (
            <ActiveWorldCard key={world.slug} world={world} />
          ))}
        </div>
      ) : (
        <Notice className="mt-6 px-5 py-6" variant="dashed">
          <p className="font-medium">No confirmed upcoming venues yet.</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {status === "live"
              ? "Published events will appear here after they are explicitly linked to world profiles."
              : "Start the local backend to read active world data, or use fixture mode during visual review."}
          </p>
        </Notice>
      )}
    </section>
  );
}
