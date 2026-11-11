import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";

const enabled = process.env.NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED !== "false";
const port = Number(process.env.PLAYWRIGHT_TEST_PORT || 3031);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...base,
  testMatch: enabled ? ["analytics-preference.spec.ts", "event-persistent-playback.flow.spec.ts"] : "analytics-gate.spec.ts",
  outputDir: `test-results/analytics-${enabled ? "enabled" : "disabled"}`,
  reporter: [["list"], ["json", { outputFile: `playwright-artifacts/results-analytics-${enabled ? "enabled" : "disabled"}.json` }]],
  use: { ...base.use, baseURL },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    timeout: 300_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_CONVEX_URL: "", CONVEX_URL: "", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      VRDEX_ENABLE_PLAYWRIGHT_FIXTURES: "true",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_synthetic_analytics_test",
      NEXT_PUBLIC_POSTHOG_DEPLOYMENT_CATEGORY: "staging",
      NEXT_PUBLIC_POSTHOG_LIMITED_ENABLED: "true",
      NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED: String(enabled),
    },
  },
});
