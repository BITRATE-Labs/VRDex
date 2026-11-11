import { v } from "convex/values";

export const ANALYTICS_POLICY_VERSION = "2026-11-10";
export const analyticsChoice = v.union(v.literal("off"), v.literal("on"));
export const analyticsPreference = v.object({
  choice: analyticsChoice,
  changedAt: v.number(),
  policyVersion: v.string(),
  source: v.literal("account"),
  revision: v.number(),
});
export const deploymentCategory = v.union(
  v.literal("development"), v.literal("preview"), v.literal("staging"), v.literal("production"),
);

export function analyticsDeploymentCategory() {
  const value = process.env.POSTHOG_DEPLOYMENT_CATEGORY;
  return value === "development" || value === "preview" || value === "staging" || value === "production"
    ? value : undefined;
}
