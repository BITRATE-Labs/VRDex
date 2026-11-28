// A runtime window does not create an authored end or a displayed schedule time.
export const UNKNOWN_EVENT_END_WINDOW_MS = 6 * 60 * 60 * 1000;
export const DATE_ONLY_END_GRACE_MS = 36 * 60 * 60 * 1000;

export function dateOnlyRuntimeEndAt(eventDate: string): number {
  // An authored date remains current through the last timezone, UTC-12.
  return Date.parse(`${eventDate}T00:00:00.000Z`) + DATE_ONLY_END_GRACE_MS - 1;
}

export function timedEventRuntimeEndAt(event: { startAt: number; endAt?: number | null }): number {
  return event.endAt ?? event.startAt + UNKNOWN_EVENT_END_WINDOW_MS;
}

export function authoredEventSchedule(event: {
  scheduleKind?: "timed" | "date_only";
  startAt?: number;
  endAt?: number;
  status?: "scheduled" | "cancelled";
}, now: number): { scheduledNow: boolean; nextTransition?: number } {
  const { startAt, endAt } = event;
  if (event.scheduleKind === "date_only" || event.status === "cancelled"
    || startAt === undefined || !Number.isFinite(startAt)
    || endAt === undefined || !Number.isFinite(endAt) || endAt <= startAt) {
    return { scheduledNow: false };
  }
  if (now < startAt) return { scheduledNow: false, nextTransition: startAt };
  if (now <= endAt) return { scheduledNow: true, nextTransition: endAt + 1 };
  return { scheduledNow: false };
}

export function publicScheduleStatus(event: {
  scheduleKind?: "timed" | "date_only";
  startAt?: number;
  endAt?: number;
}, now: number): "now" | "soon" | "later" {
  if (event.scheduleKind === "date_only" || event.startAt === undefined) return "later";
  if (event.startAt <= now && timedEventRuntimeEndAt({ ...event, startAt: event.startAt }) >= now) return "now";
  return event.startAt - now <= 2 * 60 * 60 * 1000 ? "soon" : "later";
}

export function isInScheduledWatchWindow(event: {
  doorsOpenAt?: number;
  endAt?: number;
  now: number | null;
  startAt: number;
}): boolean {
  return event.now !== null && event.now >= (event.doorsOpenAt ?? event.startAt) &&
    event.now <= timedEventRuntimeEndAt(event);
}
