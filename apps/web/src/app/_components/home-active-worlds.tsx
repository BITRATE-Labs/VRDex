import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { SectionTitle } from "@/components/ui/card";
import { EntityImage } from "@/components/ui/entity-image";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import { publicEventPath } from "@/lib/event-path";
import { safeImageUrl } from "@/lib/safe-image";
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

function ActiveWorldCard({ world, compactNextEvent }: { world: PublicActiveWorld; compactNextEvent: boolean }) {
  const titleId = `featured-world-${world.slug}`;
  const imageUrl = safeImageUrl(world.heroImageUrl);
  const secondaryText = imageUrl ? "text-white/72" : "text-muted";

  return (
    <Link
      aria-labelledby={titleId}
      className={cn(
        "group relative grid w-full min-w-0 grid-cols-1 overflow-hidden rounded-panel border transition hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong",
        imageUrl
          ? "min-h-72 border-border bg-media !text-white shadow-panel before:col-start-1 before:row-start-1 before:aspect-[4/3]"
          : "self-start border-border-strong bg-surface !text-foreground",
      )}
      href={`/${world.slug}`}
    >
      {imageUrl ? (
        <>
          <EntityImage alt="" className="absolute inset-0 size-full rounded-none bg-media" fallback={false} label={world.displayName} sizes="(min-width: 1024px) 33vw, 100vw" src={imageUrl} />
          <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--media)_80%,transparent),color-mix(in_srgb,var(--accent)_16%,transparent))]" />
        </>
      ) : null}

      <div className="relative col-start-1 row-start-1 p-4 [overflow-wrap:anywhere] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3
            id={titleId}
            className={cn(
              "min-w-0 text-xl font-semibold underline underline-offset-4 group-hover:decoration-current sm:text-3xl",
              imageUrl ? "decoration-white/55" : "decoration-border-strong",
            )}
          >
            {world.displayName}
          </h3>
          <ChevronRight aria-hidden="true" className={cn("mt-2 size-4 shrink-0", imageUrl ? "text-white/75 group-hover:text-white" : "text-muted group-hover:text-foreground")} />
        </div>
        <p className={cn("mt-2 line-clamp-2 text-sm leading-6 sm:mt-3", imageUrl ? "text-white/76" : "text-muted")}>
          {world.summary ?? "Upcoming public events are linked here."}
        </p>
        <div className={cn("mt-4 border-t pt-3", imageUrl ? "border-white/20" : "border-border")}>
          <p className={cn("text-xs font-medium", secondaryText)}>Next event</p>
          <p className="mt-1 text-sm font-medium">{world.nextEvent.title}</p>
          <p className={cn("mt-1 text-sm", secondaryText, compactNextEvent && "hidden sm:block")}>
            <ViewerLocalEventDateTime timestamp={world.nextEvent.startAt} eventDate={world.nextEvent.eventDate} scheduleKind={world.nextEvent.scheduleKind} />
            {world.nextEvent.communityName ? ` by ${world.nextEvent.communityName}` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function HomeActiveWorldsSection({
  paired = false,
  singleUpcomingEventPath,
  status,
  worlds,
}: {
  paired?: boolean;
  singleUpcomingEventPath?: string;
  status: "live" | "missing-url" | "error";
  worlds: PublicActiveWorld[];
}) {
  return (
    <section className="min-w-0 border-t border-border pt-3 sm:pt-6">
      <SectionTitle className={cn("max-sm:text-xl", paired && "xl:flex xl:min-h-11 xl:items-center")}>Featured worlds</SectionTitle>

      {worlds.length > 0 ? (
        <div className={cn("mt-3 grid grid-cols-1 gap-4 sm:mt-6 lg:grid-cols-3", paired && "xl:mt-5 xl:grid-cols-1")}>
          {worlds.map((world) => (
            <ActiveWorldCard
              compactNextEvent={singleUpcomingEventPath !== undefined && publicEventPath(world.nextEvent) === singleUpcomingEventPath}
              key={world.slug}
              world={world}
            />
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
