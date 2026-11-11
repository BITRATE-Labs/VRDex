import { expect, test } from "@playwright/test";

test("unactivated analytics does not expose proposed copy or send capture requests", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/ingest/")) requests.push(request.url()); });
  await page.addInitScript(() => localStorage.setItem("vrdex-analytics-choice", "on"));
  await page.goto("/search");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("region", { name: "Usage & privacy", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Usage & privacy", exact: true })).toHaveCount(0);
  const policy = await page.goto("/privacy");
  expect(policy?.status()).toBe(404);
  expect(requests).toEqual([]);
});
