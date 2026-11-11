import { expect, test } from "@playwright/test";
const preview = "/iframe.html?id=clubs-instance-population-preview--queue-and-gaps&viewMode=story";
test("shared instance chart retains counters and gaps @storybook-visual", async ({ page }) => {
  await page.goto(preview);
  await expect(page.locator(".recharts-line-curve")).toHaveCount(4);
  for (const line of await page.locator(".recharts-line-curve").all()) await expect(line).toHaveAttribute("d", /M.*M/);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Instance diagnostic counts", exact: true, includeHidden: true })).toHaveCount(0);
  await expect(page.locator(".recharts-line-dots circle")).toHaveCount(3);
  await expect(page.getByText("Closure time: Unknown", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show data table" }).click();
  const rows = page.getByRole("table", { name: "Instance population values", exact: true }).getByRole("row");
  expect((await rows.nth(1).getByRole("cell").allTextContents())).toEqual(["18", "14", "4", "0"]);
  expect((await rows.nth(4).getByRole("cell").allTextContents())).toEqual(["Unknown", "Unknown", "Unknown", "Unknown"]);
  await page.getByText("Diagnostics", { exact: true }).click();
  const diagnostics = page.getByRole("table", { name: "Instance diagnostic counts", exact: true });
  await expect(diagnostics).toContainText("standalonewindows: 14");
  expect(await diagnostics.getByRole("row").nth(6).getByRole("cell").allTextContents()).toEqual(["76", "Unknown", ""]);
  await page.getByText("Diagnostics", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Instance diagnostic counts", exact: true, includeHidden: true })).toHaveCount(0);
});
test("legacy and zero-only queue stay absent while closure keeps tail @storybook-visual", async ({ page }) => {
  await page.goto(preview);
  for (const scenario of ["historical", "noQueue"]) {
    await page.getByLabel("Sample case").selectOption(scenario);
    await expect(page.locator('.recharts-line-curve[name="Queue"]')).toHaveCount(0);
  }
  await page.getByLabel("Sample case").selectOption("closure");
  await expect(page.locator(".recharts-reference-line")).toHaveCount(1);
  await expect(page.getByText("Closed to new joins", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show data table" }).click();
  const table = page.getByRole("table", { name: "Instance population values", exact: true });
  expect(await table.getByRole("row").last().getByRole("cell").allTextContents()).toEqual(["12", "9", "3", "0"]);
});


test("unknown-only coverage retains the empty state @storybook-visual", async ({ page }) => {
  await page.goto(preview);
  await page.getByLabel("Sample case").selectOption("unknown");
  await expect(page.getByText("No observations in this range.", { exact: true })).toBeVisible();
  await expect(page.locator(".recharts-wrapper")).toHaveCount(0);
});
