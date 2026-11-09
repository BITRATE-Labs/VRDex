import { expect, test } from "@playwright/test";

const preview = "/iframe.html?id=clubs-instance-population-preview--queue-and-gaps&viewMode=story";

test("paired samples keep gaps, zero and independent queue values @storybook-visual", async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(preview);
  await expect(page.getByRole("heading", { name: "Instance population", exact: true })).toBeVisible();
  await expect(page.locator(".recharts-line-curve")).toHaveCount(4);
  for (const line of await page.locator(".recharts-line-curve").all()) {
    await expect(line).toHaveAttribute("d", /M.*M/);
  }
  await expect(page.locator('.recharts-line-curve[stroke-dasharray="5 4"]')).toHaveCount(1);
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/instance-platform-preview-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Show data table" }).click();
  const values = page.getByRole("table", { name: "Exact synthetic sample values" });
  await expect(values.getByRole("row", { name: "20:00 18 14 4 0", exact: true })).toBeVisible();
  await expect(values.getByRole("row", { name: "20:30 Unknown Unknown Unknown Unknown", exact: true })).toBeVisible();
  await expect(values.getByRole("row", { name: "20:50 76 Unknown Unknown Unknown", exact: true })).toBeVisible();
  if (!isMobile) {
    await page.locator(".recharts-wrapper").hover({ position: { x: 40, y: 100 } });
    await expect(page.getByText("Population: 18", { exact: true })).toBeVisible();
    await expect(page.getByText("Queue: 0", { exact: true })).toBeVisible();
    await expect(page.getByText("Windows: 14", { exact: true })).toBeVisible();
    await expect(page.getByText("Android: 4", { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("checkbox", { name: "Queue", exact: true })).toHaveCount(0);
  await page.getByText("Diagnostics", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Synthetic diagnostic counts" })).toContainText("standalonewindows: 14");
  await page.mouse.move(0, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/instance-count-preview-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("historical, conflicting and closure states stay explicit @storybook-visual", async ({ page, isMobile }) => {
  await page.goto(preview);
  await page.getByLabel("Sample case").selectOption("historical");
  await page.getByRole("button", { name: "Show data table" }).click();
  const values = page.getByRole("table", { name: "Exact synthetic sample values" });
  await expect(values.getByRole("row", { name: "20:00 18 Unknown", exact: true })).toBeVisible();
  await expect(page.locator('.recharts-line-curve[name="Queue"]')).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Queue", exact: true })).toHaveCount(0);
  await expect(page.getByText("Closure time: Unknown", { exact: true })).toBeVisible();
  await expect(page.locator(".recharts-reference-line")).toHaveCount(0);
  await page.getByLabel("Sample case").selectOption("conflicting");
  await expect(values.getByRole("row", { name: "20:40 110 58 18 135", exact: true })).toBeVisible();
  await page.getByText("Diagnostics", { exact: true }).click();
  const diagnostics = page.getByRole("table", { name: "Synthetic diagnostic counts" });
  await expect(diagnostics.getByRole("row").filter({ hasText: "20:40" })).toContainText("78");
  await expect(diagnostics.getByRole("row").filter({ hasText: "20:40" })).toContainText("76");
  await expect(diagnostics.getByRole("row").filter({ hasText: "20:50" })).toContainText("Unknown");
  await page.getByLabel("Sample case").selectOption("closure");
  await expect(page.locator(".recharts-reference-line")).toHaveCount(1);
  await expect(page.getByText("Closed to new joins", { exact: true })).toBeVisible();
  await expect(values.getByRole("row", { name: "21:20 12 9 3 0", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Closure marker" })).toHaveCount(0);
  await expect(page.getByText("Gaps are unknown", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/instance-count-closure-${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
  }
});

test("zero-only queue stays in exact data without a chart line @storybook-visual", async ({ page }) => {
  await page.goto(preview);
  await page.getByLabel("Sample case").selectOption("noQueue");
  await expect(page.getByRole("checkbox", { name: "Queue", exact: true })).toHaveCount(0);
  await expect(page.locator('.recharts-line-curve[name="Queue"]')).toHaveCount(0);
  await expect(page.locator('.recharts-line-curve[name="Windows"]')).toHaveCount(1);
  await expect(page.locator('.recharts-line-curve[name="Android"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Show data table" }).click();
  const values = page.getByRole("table", { name: "Exact synthetic sample values" });
  await expect(values.getByRole("row", { name: "20:00 18 14 4 0", exact: true })).toBeVisible();
  await expect(values.getByRole("row", { name: "20:50 76 Unknown Unknown Unknown", exact: true })).toBeVisible();
});
