"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/cn";
import { formatCalendarDate, getOtherZonedTimeOccurrence } from "@/lib/calendar/zoned-date-time";

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
  disambiguateOffset?: boolean;
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
  showYear = false,
  yearReferenceAt,
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
  showYear?: boolean;
  yearReferenceAt?: number;
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

  let includeYear = showYear;
  if (!includeYear && yearReferenceAt !== undefined) {
    const yearFormatter = timestampFormatter(timeZone, { year: "numeric" });
    includeYear = yearFormatter.format(timestamp) !== yearFormatter.format(yearReferenceAt);
  }
  const formatter = timestampFormatter(timeZone, {
    ...dateTimeOptions,
    year: includeYear ? "numeric" : undefined,
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
    <EventTime
      className={className}
      timestamp={timestamp}
      timeZone={timeZone}
      hour12={hour12}
      zoneName={showOffset && showTimeZone ? "shortOffset" : undefined}
    />
  );
}

type ZoneName = "short" | "shortOffset";

function EventTime({ className, timestamp, timeZone, hour12, zoneName, separateZone = false }: {
  className?: string;
  timestamp: number;
  timeZone: string;
  hour12?: boolean;
  zoneName?: ZoneName;
  separateZone?: boolean;
}) {
  const qualifier = separateZone && zoneName
    ? zoneLabel(timestampFormatter(timeZone, { timeZoneName: zoneName }), timestamp)
        ?.replace(/^GMT(?=[+−-])/, "UTC")
    : undefined;
  return (
    <time className={className} dateTime={new Date(timestamp).toISOString()}>
      {formatTimestamp(timestamp, timeZone, { ...timeOptions, hour12, timeZoneName: separateZone ? undefined : zoneName })}
      {qualifier ? <span className="text-[0.875em]"> ({qualifier})</span> : null}
    </time>
  );
}

function zoneLabel(formatter: Intl.DateTimeFormat, timestamp: number): string | undefined {
  return formatter.formatToParts(timestamp).find(part => part.type === "timeZoneName")?.value;
}

function rangeZoneNames(startAt: number, endAt: number | undefined, timeZone: string): {
  start?: ZoneName;
  end?: ZoneName;
  offsetChanged?: boolean;
} {
  const offsets = timestampFormatter(timeZone, { timeZoneName: "shortOffset" });
  const zone = offsets.resolvedOptions().timeZone;
  if (endAt !== undefined && zoneLabel(offsets, startAt) !== zoneLabel(offsets, endAt)) {
    const names = timestampFormatter(zone, { timeZoneName: "short" });
    const name = zoneLabel(names, startAt) === zoneLabel(names, endAt) ? "shortOffset" : "short";
    return { start: name, end: name, offsetChanged: true };
  }

  const alternateStart = getOtherZonedTimeOccurrence(startAt, zone);
  const alternateEnd = endAt === undefined ? undefined : getOtherZonedTimeOccurrence(endAt, zone);
  if (alternateStart === undefined && alternateEnd === undefined) return {};
  const names = timestampFormatter(zone, { timeZoneName: "short" });
  const genericName = (alternateStart !== undefined && zoneLabel(names, startAt) === zoneLabel(names, alternateStart))
    || (endAt !== undefined && alternateEnd !== undefined && zoneLabel(names, endAt) === zoneLabel(names, alternateEnd));
  const name = genericName ? "shortOffset" : "short";
  return {
    start: alternateStart === undefined ? undefined : name,
    end: alternateEnd === undefined ? undefined : name,
  };
}

function elapsedTime(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = (durationMs % 60_000) / 1_000;
  return [minutes ? `${minutes} min` : "", seconds ? `${seconds} sec` : ""].filter(Boolean).join(" ");
}

export function ViewerLocalEventTimeRange({
  className,
  disambiguateOffset = false,
  endAt,
  startAt,
  timeZone: explicitTimeZone,
  showOffset = false,
  showTimeZone = true,
  hour12,
}: ViewerLocalEventTimeRangeProps) {
  const timeZone = useViewerTimeZone(explicitTimeZone);
  const { start, end, offsetChanged } = showTimeZone && disambiguateOffset
    ? rangeZoneNames(startAt, endAt, timeZone)
    : {};
  const offset = showOffset && showTimeZone ? "shortOffset" : undefined;
  const separatesZones = Boolean(start || end);
  const endTime = endAt === undefined ? null : (
    <EventTime timestamp={endAt} timeZone={timeZone} zoneName={offset ?? end} hour12={hour12} separateZone={separatesZones} />
  );
  return (
    <span className={cn(className)}>
      <EventTime
        className={separatesZones ? "inline-block whitespace-nowrap" : undefined}
        timestamp={startAt}
        timeZone={timeZone}
        zoneName={offset ?? start}
        hour12={hour12}
        separateZone={separatesZones}
      />
      {endTime && (separatesZones ? (
        <>{" "}<span className="inline-block whitespace-nowrap">to {endTime}</span></>
      ) : (
        <>
          {" - "}
          {endTime}
        </>
      ))}
      {offsetChanged && endAt !== undefined && endAt > startAt ? (
        <>{" "}<span className="block font-medium">{elapsedTime(endAt - startAt)}</span></>
      ) : null}
    </span>
  );
}
