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
  const actionClassName = cn(
    buttonVariants({ variant: bannerStyle ? "secondary" : "surface" }),
    "h-9 min-w-9 gap-1 whitespace-nowrap px-1.5 py-0 text-xs sm:px-3 [&_svg]:hidden [&_svg]:size-3.5 [&_svg]:shrink-0 min-[360px]:[&_svg]:block",
    !bannerStyle && "focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-strong",
  );

  const detailTextClassName = bannerStyle ? "text-white/80" : "text-muted";

  return (
    <section className={cn("overflow-hidden rounded-hero border border-border", bannerStyle ? "bg-media shadow-hero" : "bg-surface-strong shadow-sm")}>
      <div
        className={cn(
          "flex min-h-56 flex-col bg-cover bg-center p-5 sm:p-6 lg:min-h-60 lg:p-8",
          bannerStyle ? "text-white" : "bg-[linear-gradient(135deg,var(--surface-strong),var(--surface-raised))] text-foreground",
        )}
        style={bannerStyle}
      >
        <nav aria-label="Event actions" className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {eventPath && canHost ? <span className="group relative inline-flex">
            <Link aria-label="Host view" className={actionClassName} href={`${eventPath}/host`}>
              <ListMusic aria-hidden="true" />
              Host view
            </Link>
            <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden whitespace-nowrap rounded-control border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-lg group-hover:block group-focus-within:block">Host view</span>
          </span> : null}
          {eventPath ? <span className="group relative inline-flex">
            <a aria-label="Add to calendar" className={actionClassName} href={`${eventPath}/calendar.ics`}>
              <CalendarDays aria-hidden="true" />
              Calendar
            </a>
            <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden whitespace-nowrap rounded-control border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-lg group-hover:block group-focus-within:block">Add to calendar</span>
          </span> : null}
          <span className="group relative inline-flex">
            <button type="button" aria-label="Report event" aria-haspopup="dialog" className={actionClassName} onClick={onReport}>
              <Flag aria-hidden="true" />
              Report
            </button>
            <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden whitespace-nowrap rounded-control border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-lg group-hover:block group-focus-within:block">Report event</span>
          </span>
        </nav>
        <div className="mt-3 flex flex-1 flex-col justify-end lg:mt-2">
          <div className="max-w-4xl">
            {event.status === "cancelled" ? (
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]">Cancelled</p>
            ) : null}
            <ViewerLocalEventDateTime className={cn("block text-sm uppercase tracking-wider sm:tracking-[0.24em]", bannerStyle ? "text-white/70" : "text-muted")} timestamp={event.startAt} eventDate={event.eventDate} scheduleKind={event.scheduleKind} />
            {event.scheduleKind !== "date_only" && (event.doorsOpenAt !== undefined || event.endAt !== undefined) ? <div className={cn("mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm", detailTextClassName)}>
              {event.doorsOpenAt !== undefined ? <span><span>Doors open</span>{" "}<ViewerLocalEventDateTime timestamp={event.doorsOpenAt} /></span> : null}
              {event.endAt !== undefined ? <span><span>End</span>{" "}<ViewerLocalEventDateTime timestamp={event.endAt} /></span> : null}
            </div> : null}
            <h1 className="mt-4 text-5xl leading-none font-semibold tracking-[-0.05em] [overflow-wrap:anywhere] sm:text-7xl">
              {event.title}
            </h1>
            {event.summary ? <p className={cn("mt-4 max-w-2xl text-base leading-7 [overflow-wrap:anywhere] sm:text-lg", bannerStyle && "text-white/82")}>{event.summary}</p> : null}
            {event.venueLabel ? <p className={cn("mt-3 text-sm", detailTextClassName)}>{event.venueLabel}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
