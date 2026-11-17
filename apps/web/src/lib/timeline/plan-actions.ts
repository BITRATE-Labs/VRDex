import type { PlanReference, SavedResolution } from "../../../../../convex/_eventTimelineTypes";
import { dateOnlyRuntimeEndAt, timedEventRuntimeEndAt } from "../../../../../convex/_eventRuntime";
import type { PreferenceAction } from "./preferences";

export function isPastSaved(item: SavedResolution, now: number): boolean {
  if (item.kind !== "available") return false;
  const schedule = item.slot?.schedule ?? item.event.schedule;
  return schedule.kind === "date_only"
    ? dateOnlyRuntimeEndAt(schedule.eventDate) < now
    : timedEventRuntimeEndAt(schedule) <= now;
}

export function nextSavedStart(saved: SavedResolution[], rangeEndAt: number, now: number): number | undefined {
  const instants = saved.flatMap(item => {
    if (item.kind !== "available" || item.status === "cancelled" || isPastSaved(item, now)) return [];
    const schedule = item.slot?.schedule ?? item.event.schedule;
    return schedule.kind === "date_only" ? [] : [schedule.startAt];
  }).sort((a, b) => a - b);
  return instants.find(instant => instant > rangeEndAt) ?? instants[0];
}

export function planSaveState(
  plan: ReadonlyArray<PlanReference>,
  reference: PlanReference,
): "unsaved" | "saved" | "included" {
  if (
    reference.kind === "set" &&
    plan.some((p) => p.kind === "event" && p.eventId === reference.eventId)
  )
    return "included";
  return plan.some(
    (p) =>
      p.eventId === reference.eventId &&
      (p.kind === "event" ||
        (reference.kind === "set" && p.slotId === reference.slotId)),
  )
    ? "saved"
    : "unsaved";
}
export function togglePlanAction(
  plan: ReadonlyArray<PlanReference>,
  reference: PlanReference,
): Extract<PreferenceAction, { type: "add-plan" | "remove-plan" }> | null {
  const state = planSaveState(plan, reference);
  if (state === "included") return null;
  return state === "unsaved"
    ? { type: "add-plan", reference }
    : { type: "remove-plan", reference };
}
