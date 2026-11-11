export type AnalyticsChoice = "off" | "on";
export type AnalyticsMode = "off" | "limited" | "full";
export const ANALYTICS_POLICY_VERSION = "2026-11-10";
export const ANALYTICS_CHOICE_KEY = "vrdex-analytics-choice";
export const ANALYTICS_OFFER_KEY = "vrdex-analytics-offered";

export function parseAnalyticsChoice(value: unknown): AnalyticsChoice | undefined {
  return value === "off" || value === "on" ? value : undefined;
}

export function resolveAnalyticsMode(
  browserChoice: AnalyticsChoice | undefined,
  accountChoice: AnalyticsChoice | undefined,
  accountResolved: boolean,
): AnalyticsMode | undefined {
  if (browserChoice === "off" || accountChoice === "off") return "off";
  if (!accountResolved) return undefined;
  return browserChoice === "on" || accountChoice === "on" ? "full" : "limited";
}

export function analyticsRolloutEnabled(mode: AnalyticsMode | undefined, flag: boolean | undefined, configured: boolean) {
  return !configured || mode !== "full" || flag === true;
}

export function analyticsAccountMatches(expectedSubject: string | null | undefined, viewerSubject: string | undefined, authenticated: boolean) {
  return expectedSubject === undefined || (authenticated
    ? expectedSubject !== null && expectedSubject === viewerSubject
    : expectedSubject === null);
}
