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
  hasLineup,
  onReport,
}: {
  bannerStyle?: CSSProperties;
  canHost: boolean;
  event: PublicEvent;
  eventPath: string | undefined;
  hasLineup: boolean;
  onReport: () => void;
}) {
  const actionClassName = cn(
    buttonVariants({ variant: bannerStyle ? "secondary" : "surface" }),
    "h-11 min-w-11 gap-1 whitespace-nowrap px-1.5 py-0 text-xs sm:h-9 sm:min-w-9 sm:px-3 [&_svg]:hidden [&_svg]:size-3.5 [&_svg]:shrink-0 min-[360px]:[&_svg]:block",
    !bannerStyle && "focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-strong",
  );
  const tooltipClassName = "pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden whitespace-nowrap rounded-control border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-lg group-focus-within:block sm:top-full sm:right-0 sm:bottom-auto sm:left-auto sm:mt-2 sm:mb-0";
  const actionTooltipClassName = cn(tooltipClassName, "group-hover:block");

  const detailTextClassName = bannerStyle ? "text-white/80" : "text-muted";
  const startTime = (
    <ViewerLocalEventDateTime className={cn(
      "block text-base leading-snug font-semibold tabular-nums sm:text-lg",
      bannerStyle ? "text-white" : "text-foreground",
    )} timestamp={event.startAt} eventDate={event.eventDate} scheduleKind={event.scheduleKind} />
  );

  return (
    <section className={cn("overflow-hidden rounded-hero border border-border shadow-sm", bannerStyle ? "bg-media" : "bg-surface-strong")}>
      <div
        className={cn(
          "flex flex-col bg-cover bg-center px-4 py-[var(--event-watch-mobile-space,1rem)] sm:min-h-56 sm:p-6 lg:min-h-60 lg:p-8",
          bannerStyle ? "text-white" : "bg-[linear-gradient(135deg,var(--surface-strong),var(--surface-raised))] text-foreground",
        )}
        style={bannerStyle}
      >
        <div className="flex flex-1 flex-col justify-end sm:mt-3 lg:mt-2">
          <div className="max-w-4xl">
            {event.status === "cancelled" ? (
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]">Cancelled</p>
            ) : null}
            {hasLineup ? (
              <div className="flex flex-wrap items-center gap-x-4">
                {startTime}
                <a
                  className="inline-flex min-h-11 min-w-11 items-center rounded-control text-sm font-medium underline decoration-current/50 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-current sm:min-h-8"
                  href="#event-lineup"
                >
                  Lineup
                </a>
              </div>
            ) : startTime}
            {event.scheduleKind !== "date_only" && (event.doorsOpenAt !== undefined || event.endAt !== undefined) ? <div className={cn("mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums sm:mt-2 sm:gap-x-5", detailTextClassName)}>
              {event.doorsOpenAt !== undefined ? <span><span>Doors open</span>{" "}<ViewerLocalEventDateTime timestamp={event.doorsOpenAt} compactRelativeTo={event.startAt} /></span> : null}
              {event.endAt !== undefined ? <span><span>End</span>{" "}<ViewerLocalEventDateTime timestamp={event.endAt} compactRelativeTo={event.startAt} /></span> : null}
            </div> : null}
            <h1 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-[-0.05em] [overflow-wrap:anywhere] sm:mt-4 sm:text-7xl sm:leading-none">
              {event.title}
            </h1>
            {event.summary ? <p className={cn("mt-3 max-w-2xl text-base leading-6 [overflow-wrap:anywhere] sm:mt-4 sm:text-lg sm:leading-7", bannerStyle && "text-white/82")}>{event.summary}</p> : null}
            {event.venueLabel ? <p className={cn("mt-3 text-sm", detailTextClassName)}>{event.venueLabel}</p> : null}
          </div>
        </div>
        <nav aria-label="Event actions" className="mt-3 flex shrink-0 flex-wrap gap-1.5 sm:order-first sm:mt-0 sm:justify-end">
          {eventPath && canHost ? <span className="group relative inline-flex">
            <Link aria-label="Host view" className={actionClassName} href={`${eventPath}/host`}>
              <ListMusic aria-hidden="true" />
              Host view
            </Link>
            <span role="tooltip" className={cn(tooltipClassName, "sm:group-hover:block")}>Host view</span>
          </span> : null}
          {eventPath ? <span className="group relative inline-flex">
            <a aria-label="Add to calendar" className={actionClassName} href={`${eventPath}/calendar.ics`}>
              <CalendarDays aria-hidden="true" />
              Calendar
            </a>
            <span role="tooltip" className={actionTooltipClassName}>Add to calendar</span>
          </span> : null}
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label="Report event"
              aria-haspopup="dialog"
              className={cn(actionClassName, "border-transparent bg-transparent text-inherit! hover:border-transparent hover:bg-current/10")}
              onClick={onReport}
            >
              <Flag aria-hidden="true" />
              Report
            </button>
            <span role="tooltip" className={actionTooltipClassName}>Report event</span>
          </span>
        </nav>
      </div>
    </section>
  );
}
