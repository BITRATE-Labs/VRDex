type DateTimeLocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDateTimeLocalParts(value: string, fieldName: string): DateTimeLocalParts {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (match === null) throw new Error(`${fieldName} must be a valid timestamp.`);

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function formatDateTimeLocalParts(parts: DateTimeLocalParts): string {
  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}T${padDatePart(parts.hour)}:${padDatePart(parts.minute)}`;
}

function zonedDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new Error("Time zone must be a valid IANA time zone.");
  }
}

function getZonedDateTimeParts(timestamp: number, formatter: Intl.DateTimeFormat): DateTimeLocalParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatter.formatToParts(timestamp);
  } catch {
    throw new Error("Time zone must be a valid IANA time zone.");
  }

  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(valueByType.get("year")),
    month: Number(valueByType.get("month")),
    day: Number(valueByType.get("day")),
    hour: Number(valueByType.get("hour")),
    minute: Number(valueByType.get("minute")),
  };
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function formatZonedDateTimeInput(
  timestamp: number | undefined,
  timeZone: string | undefined,
): string {
  if (timestamp === undefined) return "";
  return formatDateTimeLocalParts(getZonedDateTimeParts(timestamp, zonedDateTimeFormatter(timeZone ?? browserTimeZone())));
}

function matchingZonedInstants(parts: DateTimeLocalParts, formatter: Intl.DateTimeFormat): number[] {
  const wallTimeUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const target = formatDateTimeLocalParts(parts);
  const offsets = new Set<number>();
  const hour = 60 * 60 * 1_000;
  for (const sampleHours of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = wallTimeUtc + sampleHours * hour;
    const zonedParts = getZonedDateTimeParts(sample, formatter);
    const zonedWallTimeUtc = Date.UTC(
      zonedParts.year,
      zonedParts.month - 1,
      zonedParts.day,
      zonedParts.hour,
      zonedParts.minute,
    );
    offsets.add(zonedWallTimeUtc - sample);
  }

  return [...offsets]
    .map((offset) => wallTimeUtc - offset)
    .filter(
      (timestamp) =>
        Number.isFinite(timestamp) &&
        formatDateTimeLocalParts(getZonedDateTimeParts(timestamp, formatter)) === target,
    );
}

export function getOtherZonedTimeOccurrence(timestamp: number, timeZone: string): number | undefined {
  const formatter = zonedDateTimeFormatter(timeZone);
  const minute = Math.floor(timestamp / 60_000) * 60_000;
  return matchingZonedInstants(getZonedDateTimeParts(minute, formatter), formatter)
    .find(instant => instant !== minute);
}

export function parseZonedDateTimeInput(
  value: string,
  timeZone: string,
  fieldName: string,
): number {
  const parts = parseDateTimeLocalParts(value, fieldName);
  const matches = matchingZonedInstants(parts, zonedDateTimeFormatter(timeZone));
  if (matches.length === 0) {
    throw new Error(`${fieldName} must be a valid local time in ${timeZone}.`);
  }

  return Math.min(...matches);
}
// A calendar date is formatted in UTC solely to keep its authored day stable.
// It must never be used as a playback, Discord, or event-start timestamp.
export function formatCalendarDate(date: string): string {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new Error("Event date must be a valid calendar date.");
  }
  return new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(timestamp);
}
