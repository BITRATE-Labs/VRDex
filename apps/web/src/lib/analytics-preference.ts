export type AnalyticsChoice = "off" | "on";
export type AnalyticsMode = "off" | "limited" | "full";
export const ANALYTICS_POLICY_VERSION = "2026-11-10";
export const ANALYTICS_CHOICE_KEY = "vrdex-analytics-choice";
export const ANALYTICS_OFFER_KEY = "vrdex-analytics-offered";
export const ANALYTICS_CHOICE_OWNER_KEY = "vrdex-analytics-choice-owner";
export const ANALYTICS_FOUNDATION_ENABLED = process.env.NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED === "true";

export function analyticsChoiceOwnerMatches(owner: string | null, userId: string) {
  return owner === "guest" || owner === userId;
}

export function retainAnalyticsAuthOutcome(previous: "anonymous" | "authenticated" | undefined, mode: AnalyticsMode | undefined) {
  return mode === "off" || mode === "limited" ? undefined : previous;
}

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

export function analyticsAccountMatches(expectedSubject: string | null | undefined, viewerSubject: string | undefined, authenticated: boolean) {
  return expectedSubject === undefined || (authenticated
    ? expectedSubject !== null && expectedSubject === viewerSubject
    : expectedSubject === null);
}
