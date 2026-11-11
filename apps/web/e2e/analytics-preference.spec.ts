import { expect, test } from "@playwright/test";
import { gunzipSync } from "node:zlib";

test("first offer is nonblocking; dismiss stays unset and footer reopens the choice", async ({ page }) => {
  await page.goto("/search");
  const panel = page.getByRole("region", { name: "Usage & privacy", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Off", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(panel.getByRole("button", { name: "On", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("main")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("analytics-offer.png") });
  await page.reload();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Usage & privacy", exact: true }).click();
  await panel.getByRole("button", { name: "Close analytics preferences" }).click();
  expect(await page.evaluate(() => localStorage.getItem("vrdex-analytics-choice"))).toBeNull();
  await page.reload();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Usage & privacy", exact: true }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Usage & privacy", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Usage & privacy", exact: true }).click();
  await panel.getByRole("button", { name: "Off", exact: true }).click();
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("vrdex-analytics-choice"))).toBe("off");
  await expect(panel).toHaveCount(0);
});

test("Limited envelopes are independent and Off sends no optional requests", async ({ page }) => {
  const events: Array<{ event: string; properties: Record<string, unknown> }> = [];
  let off = false;
  let requestsAfterOff = 0;
  await page.route("**/ingest/**", async (route) => {
    if (off) requestsAfterOff++;
    const request = route.request();
    const buffer = request.postDataBuffer();
    if (buffer) {
      const decoded = buffer[0] === 31 && buffer[1] === 139 ? gunzipSync(buffer).toString() : buffer.toString();
      try {
        const body = JSON.parse(decoded);
        events.push(...(Array.isArray(body) ? body : [body]));
      } catch { /* Config requests are not capture payloads. */ }
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: 1, featureFlags: {}, sessionRecording: false }) });
  });
  await page.goto("/search?query=private-synthetic-text");
  await expect.poll(() => events.filter((event) => event.event === "$pageview").length).toBe(1);
  const first = events.find((event) => event.event === "$pageview")!;
  expect(first.properties.analytics_mode).toBe("limited");
  expect(JSON.stringify(first)).not.toContain("private-synthetic-text");
  expect(first.properties.$session_id).toBeUndefined();
  expect(first.properties.$device_id).toBeUndefined();
  expect(first.properties.$geoip_disable).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("ph_")))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("ph_")))).toEqual([]);
  await page.getByRole("region", { name: "Usage & privacy", exact: true }).getByRole("button", { name: "Off", exact: true }).click();
  off = true;
  await page.reload();
  await page.getByRole("button", { name: "Usage & privacy", exact: true }).click();
  await expect(page.getByRole("button", { name: "Off", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(requestsAfterOff).toBe(0);
});

test("On enables Full, SPA navigation captures once, and Off stops a late config response", async ({ page }) => {
  const events: Array<{ event: string; properties: Record<string, unknown> }> = [];
  let releaseConfig: () => void = () => {};
  const configResponse = new Promise<void>((resolve) => { releaseConfig = resolve; });
  let awaitingConfig = false;
  let off = false;
  let requestsAfterOff = 0;
  await page.route("**/ingest/**", async (route) => {
    if (off) requestsAfterOff++;
    if (route.request().url().includes("/flags")) {
      awaitingConfig = true;
      await configResponse;
      await route.fulfill({ json: { featureFlags: {}, sessionRecording: { endpoint: "/s/" } } });
      return;
    }
    const buffer = route.request().postDataBuffer();
    if (buffer) {
      try {
        const body = JSON.parse(buffer[0] === 31 && buffer[1] === 139 ? gunzipSync(buffer).toString() : buffer.toString());
        events.push(...(Array.isArray(body) ? body : [body]));
      } catch { /* Ignore non-event config request bodies. */ }
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: 1, featureFlags: {}, sessionRecording: false }) });
  });
  await page.goto("/search");
  await page.getByRole("region", { name: "Usage & privacy", exact: true }).getByRole("button", { name: "On", exact: true }).click();
  await expect.poll(() => events.filter((event) => event.event === "$pageview" && event.properties.analytics_mode === "full").length).toBe(1);
  await expect.poll(() => awaitingConfig).toBe(true);
  expect(events.some((event) => event.event === "auth_session_restore_completed")).toBe(true);
  await page.evaluate(() => history.pushState({}, "", "/search?query=synthetic-secret"));
  await expect.poll(() => events.filter((event) => event.event === "$pageview" && event.properties.analytics_mode === "full").length).toBe(2);
  expect(JSON.stringify(events)).not.toContain("synthetic-secret");
  await page.getByRole("button", { name: "Usage & privacy", exact: true }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click();
  await expect(page.getByRole("region", { name: "Usage & privacy", exact: true })).toHaveCount(0);
  off = true;
  releaseConfig();
  await page.waitForTimeout(300);
  expect(requestsAfterOff).toBe(0);
  expect(events.some((event) => event.event === "$snapshot")).toBe(false);
});

test("a failed Full request cannot reappear after Off then On", async ({ page }) => {
  let failedId: string | undefined;
  let repeatedOldRequest = false;
  await page.route("**/ingest/**", async (route) => {
    const buffer = route.request().postDataBuffer();
    if (buffer) {
      try {
        const body = JSON.parse(buffer[0] === 31 && buffer[1] === 139 ? gunzipSync(buffer).toString() : buffer.toString());
        if (body.event === "$pageview" && body.properties?.analytics_mode === "full") {
          if (!failedId) {
            failedId = body.uuid;
            await route.fulfill({ status: 503, body: "synthetic transport failure" });
            return;
          }
          if (body.uuid === failedId) repeatedOldRequest = true;
        }
      } catch { /* Ignore non-event requests. */ }
    }
    await route.fulfill({ json: { status: 1, featureFlags: {}, sessionRecording: false } });
  });
  await page.goto("/search");
  await page.getByRole("button", { name: "On", exact: true }).click();
  await expect.poll(() => failedId).toBeTruthy();
  await page.getByRole("button", { name: "Usage & privacy", exact: true }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click();
  await page.getByRole("button", { name: "Usage & privacy", exact: true }).click();
  await page.getByRole("button", { name: "On", exact: true }).click();
  await page.waitForTimeout(15_000);
  expect(repeatedOldRequest).toBe(false);
});

test("Full visitor continuity survives reload and another tab receives Off", async ({ page, context }) => {
  const identities: string[] = [];
  let off = false;
  let requestsAfterOff = 0;
  await context.route("**/ingest/**", async (route) => {
    if (off) requestsAfterOff++;
    const buffer = route.request().postDataBuffer();
    if (buffer) {
      try {
        const body = JSON.parse(buffer[0] === 31 && buffer[1] === 139 ? gunzipSync(buffer).toString() : buffer.toString());
        if (body.event === "$pageview" && body.properties?.analytics_mode === "full") identities.push(body.properties.distinct_id);
      } catch { /* Ignore non-event requests. */ }
    }
    await route.fulfill({ json: { status: 1, featureFlags: {}, sessionRecording: false } });
  });
  await page.goto("/search");
  await page.getByRole("button", { name: "On", exact: true }).click();
  await expect.poll(() => identities.length).toBe(1);
  const first = identities[0];
  await page.reload();
  await expect.poll(() => identities.length).toBe(2);
  expect(identities[1]).toBe(first);
  const other = await context.newPage();
  await other.goto("/search");
  await expect.poll(() => identities.length).toBe(3);
  await page.getByRole("button", { name: "Usage & privacy", exact: true }).click();
  await page.getByRole("button", { name: "Off", exact: true }).click();
  off = true;
  await other.getByRole("button", { name: "Usage & privacy", exact: true }).click();
  await expect(other.getByRole("button", { name: "Off", exact: true })).toHaveAttribute("aria-pressed", "true");
  await other.evaluate(() => history.pushState({}, "", "/search?query=other-tab"));
  await other.waitForTimeout(200);
  expect(requestsAfterOff).toBe(0);
});

test("Account Privacy can reopen analytics without a profile selection", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vrdex-analytics-choice", "off"));
  await page.goto("/account/privacy");
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Usage & privacy", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Usage & privacy", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("analytics-account.png") });
});
