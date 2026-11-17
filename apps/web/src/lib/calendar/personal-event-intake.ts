import type { EventIntakePatch } from "../../../../../packages/api-contracts/src/event-intake";
export { mergePersonalLineupSuggestions } from "../../../../../packages/api-contracts/src/event-intake";

export function personalEventUpdatePatch(baseline: EventIntakePatch, fields: EventIntakePatch) {
  const keys = ["title", "eventDate", "timeTba", "timezone", "start", "end", "doors", "venueLabel", "worldSlug", "summary", "lineup"] as const;
  return Object.fromEntries(keys.filter(key => JSON.stringify(baseline[key] ?? null) !== JSON.stringify(fields[key] ?? null)).map(key => [key, fields[key] ?? null]));
}
