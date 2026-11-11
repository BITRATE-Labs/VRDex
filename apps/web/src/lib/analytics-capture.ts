import type { AnalyticsMode } from "./analytics-preference";
import { sanitizePostHogEvent } from "./posthog";

export type DeploymentCategory = "development" | "preview" | "staging" | "production";
export function parseDeploymentCategory(value: unknown): DeploymentCategory | undefined {
  return value === "development" || value === "preview" || value === "staging" || value === "production" ? value : undefined;
}

const limitedEvents = new Set(["$pageview", "search_submitted", "search_result_clicked", "event_card_clicked", "discovery_filter_selected", "lookup_submitted"]);
const limitedValues: Record<string, ReadonlySet<string>> = {
  route_class: new Set(["public", "auth", "protected"]),
  surface: new Set(["featured", "home", "nav", "home_terms", "search", "search_results", "upcoming_events", "active_worlds", "featured_picks"]),
  entity_type: new Set(["event", "person", "community", "profile", "world"]),
  profile_type: new Set(["person", "community"]),
  scope: new Set(["all", "people", "communities", "events", "worlds"]),
  view_key: new Set(["standard", "dj"]),
  access_scope: new Set(["private_and_public", "public_only"]),
  mode: new Set(["bulk", "single"]),
};

export function analyticsRouteClass(pathname: string) {
  if (/^\/(sign-in|sign-up)(\/|$)/.test(pathname)) return "auth";
  if (/^\/(account|claim|handoff|admin|developers)(\/|$)/.test(pathname)) return "protected";
  return "public";
}

export function filterAnalyticsEvent<T extends { event: string; properties: Record<string, unknown> }>(
  event: T,
  mode: AnalyticsMode | undefined,
  category: DeploymentCategory | undefined,
  limitedEnabled: boolean,
): T | null {
  if (!category || !mode || mode === "off") return null;
  if (mode === "full") {
    const sanitized = sanitizePostHogEvent(event);
    sanitized.properties = { ...sanitized.properties, deployment_category: category, analytics_mode: "full" };
    return sanitized;
  }
  if (!limitedEnabled || !limitedEvents.has(event.event)) return null;
  const properties: Record<string, unknown> = {};
  for (const [key, values] of Object.entries(limitedValues)) {
    const value = event.properties[key];
    if (typeof value === "string" && values.has(value)) properties[key] = value;
  }
  const filtered = { ...event, properties: {
    ...properties,
    ...(typeof event.properties.token === "string" ? { token: event.properties.token } : {}),
    distinct_id: crypto.randomUUID(),
    deployment_category: category,
    analytics_mode: "limited",
    $process_person_profile: false,
    $geoip_disable: true,
    $ip: null,
  } };
  Reflect.deleteProperty(filtered, "$set");
  Reflect.deleteProperty(filtered, "$set_once");
  return filtered;
}
