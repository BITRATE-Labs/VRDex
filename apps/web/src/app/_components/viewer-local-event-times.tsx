"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";
import { formatCalendarDate } from "@/lib/calendar/zoned-date-time";

type ViewerLocalEventTimesProps = {
  timestamp: number;
  className?: string;
  timeZone?: string;
  hour12?: boolean;
  showOffset?: boolean;
  showTimeZone?: boolean;
};

type ViewerLocalEventTimeRangeProps = {
  className?: string;
  endAt?: number;
  startAt: number;
  timeZone?: string;
  hour12?: boolean;
  showOffset?: boolean;
  showTimeZone?: boolean;
};

const dateTimeOptions: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

const timeOptions: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

function timestampFormatter(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en", { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en", options);
  }
}

function formatTimestamp(timestamp: number, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return timestampFormatter(timeZone, options).format(timestamp);
}

function shareLocalDateAndOffset(timestamp: number, reference: number, timeZone: string): boolean {
  try {
    const format = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZoneName: "shortOffset",
    });
    return format.format(timestamp) === format.format(reference);
  } catch {
    return false;
  }
}

function subscribeToTimeZone(onStoreChange: () => void): () => void {
  void onStoreChange;
  return () => undefined;
}

function getBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function getServerTimeZone(): string | null {
  return "UTC";
}

function useViewerTimeZone(explicitTimeZone?: string): string {
  const timeZone = useSyncExternalStore(
    subscribeToTimeZone,
    getBrowserTimeZone,
    getServerTimeZone,
  );

  return explicitTimeZone ?? timeZone ?? "UTC";
}

export function ViewerLocalEventDateTime({
  className,
  timestamp,
  eventDate,
  scheduleKind,
  compactRelativeTo,
  groupTime = false,
  timeZone: explicitTimeZone,
  showTimeZone = true,
  hour12,
}: {
  className?: string;
  timestamp?: number;
  eventDate?: string;
  scheduleKind?: "timed" | "date_only";
  compactRelativeTo?: number;
  groupTime?: boolean;
  timeZone?: string;
  hour12?: boolean;
  showTimeZone?: boolean;
}) {
  const timeZone = useViewerTimeZone(explicitTimeZone);

  if (scheduleKind === "date_only" && eventDate !== undefined) {
    return (
      <time className={className} dateTime={eventDate}>
        {formatCalendarDate(eventDate)} · Time TBA
      </time>
    );
  }
  if (timestamp === undefined) return null;
  if (compactRelativeTo !== undefined && shareLocalDateAndOffset(timestamp, compactRelativeTo, timeZone)) {
    const fullTime = formatTimestamp(timestamp, timeZone, { ...dateTimeOptions, hour12 });
    return (
      <time className={className} dateTime={new Date(timestamp).toISOString()} title={fullTime}>
        <span aria-hidden="true">{formatTimestamp(timestamp, timeZone, { ...timeOptions, hour12 })}</span>
        <span className="sr-only">{fullTime}</span>
      </time>
    );
  }

  const formatter = timestampFormatter(timeZone, {
    ...dateTimeOptions,
    hour12,
    timeZoneName: showTimeZone ? dateTimeOptions.timeZoneName : undefined,
  });
  const dateTime = new Date(timestamp).toISOString();
  if (groupTime) {
    const parts = formatter.formatToParts(timestamp);
    const timeStart = parts.findIndex((part) => part.type === "hour");
    const separator = parts[timeStart - 1];
    if (separator?.type === "literal") {
      return (
        <time className={className} dateTime={dateTime}>
          {parts.slice(0, timeStart - 1).map((part) => part.value).join("")}
          <span className="sm:sr-only">{separator.value}</span>
          <span className="whitespace-nowrap sm:block">{parts.slice(timeStart).map((part) => part.value).join("")}</span>
        </time>
      );
    }
  }
  return <time className={className} dateTime={dateTime}>{formatter.format(timestamp)}</time>;
}

export function ViewerLocalEventTime({
  className,
  timestamp,
  timeZone: explicitTimeZone,
  showOffset = false,
  showTimeZone = true,
  hour12,
}: ViewerLocalEventTimesProps) {
  const timeZone = useViewerTimeZone(explicitTimeZone);

  return (
    <time className={className} dateTime={new Date(timestamp).toISOString()}>
      {formatTimestamp(
        timestamp,
        timeZone,
        {
          ...timeOptions,
          hour12,
          timeZoneName: showOffset && showTimeZone ? "shortOffset" : undefined,
        },
      )}
    </time>
  );
}

export function ViewerLocalEventTimeRange({
  className,
  endAt,
  startAt,
  timeZone,
  showOffset,
  showTimeZone,
  hour12,
}: ViewerLocalEventTimeRangeProps) {
  return (
    <span className={cn(className)}>
      <ViewerLocalEventTime
        timestamp={startAt}
        timeZone={timeZone}
        showOffset={showOffset}
        showTimeZone={showTimeZone}
        hour12={hour12}
      />
      {endAt === undefined ? null : (
        <>
          {" - "}
          <ViewerLocalEventTime
            timestamp={endAt}
            timeZone={timeZone}
            showOffset={showOffset}
            showTimeZone={showTimeZone}
            hour12={hour12}
          />
        </>
      )}
    </span>
  );
}
