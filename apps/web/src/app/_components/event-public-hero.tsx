import Link from "next/link";
import type { CSSProperties } from "react";
import { CalendarDays, Flag, ListMusic } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { PublicEvent } from "./event-public-page";
import { ViewerLocalEventDateTime } from "./viewer-local-event-times";

export function EventPublicHero({
  bannerStyle,
  canHost,
  event,
  eventPath,
  onReport,
}: {
  bannerStyle?: CSSProperties;
  canHost: boolean;
  event: PublicEvent;
  eventPath: string | undefined;
  onReport: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-hero border border-border bg-media shadow-hero">
      <div
        className="relative flex min-h-56 flex-col bg-[linear-gradient(135deg,var(--media),var(--media-raised))] bg-cover bg-center p-5 text-white sm:block sm:p-6 lg:p-8"
        style={bannerStyle}
      >
        <nav aria-label="Event actions" className="flex shrink-0 justify-end gap-2 sm:absolute sm:right-4 sm:top-4">
          {eventPath && canHost ? <span className="group relative inline-flex">
            <Link aria-label="Host view" className={cn(buttonVariants({ variant: "secondary" }), "size-9 p-0")} href={`${eventPath}/host`}>
              <ListMusic aria-hidden="true" className="size-4" />
            </Link>
            <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden whitespace-nowrap rounded-control border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-lg group-hover:block group-focus-within:block">Host view</span>
          </span> : null}
          {eventPath ? <span className="group relative inline-flex">
            <a aria-label="Add to calendar" className={cn(buttonVariants({ variant: "secondary" }), "size-9 p-0")} href={`${eventPath}/calendar.ics`}>
              <CalendarDays aria-hidden="true" className="size-4" />
            </a>
            <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden whitespace-nowrap rounded-control border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-lg group-hover:block group-focus-within:block">Add to calendar</span>
          </span> : null}
          <span className="group relative inline-flex">
            <button type="button" aria-label="Report event" aria-haspopup="dialog" className={cn(buttonVariants({ variant: "secondary" }), "size-9 p-0")} onClick={onReport}>
              <Flag aria-hidden="true" className="size-4" />
            </button>
            <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden whitespace-nowrap rounded-control border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-lg group-hover:block group-focus-within:block">Report event</span>
          </span>
        </nav>
        <div className="mt-3 flex flex-1 flex-col justify-end sm:mt-0 sm:min-h-44">
          <div className="max-w-4xl">
            {event.status === "cancelled" ? (
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">Cancelled</p>
            ) : null}
            <ViewerLocalEventDateTime className={cn("block text-sm uppercase tracking-wider text-white/70 sm:tracking-[0.24em]", canHost ? "sm:pr-36" : "sm:pr-24")} timestamp={event.startAt} eventDate={event.eventDate} scheduleKind={event.scheduleKind} />
            {event.scheduleKind !== "date_only" && (event.doorsOpenAt !== undefined || event.endAt !== undefined) ? <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/80">
              {event.doorsOpenAt !== undefined ? <span><span>Doors open</span>{" "}<ViewerLocalEventDateTime timestamp={event.doorsOpenAt} /></span> : null}
              {event.endAt !== undefined ? <span><span>End</span>{" "}<ViewerLocalEventDateTime timestamp={event.endAt} /></span> : null}
            </div> : null}
            <h1 className="mt-4 text-5xl leading-none font-semibold tracking-[-0.05em] [overflow-wrap:anywhere] sm:text-7xl">
              {event.title}
            </h1>
            {event.summary ? <p className="mt-4 max-w-2xl text-base leading-7 text-white/82 [overflow-wrap:anywhere] sm:text-lg">{event.summary}</p> : null}
            {event.venueLabel ? <p className="mt-3 text-sm text-white/80">{event.venueLabel}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
