import { test, expect } from "@playwright/test";

test("old repaired instance links return to one retained history @storybook-visual", async ({
  page,
  isMobile,
}) => {
  await page.goto(
    "/iframe.html?id=clubs-analytics--repaired-instance&viewMode=story",
  );
  await expect(
    page.getByText("Data completeness", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Instance unavailable.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Back to instances", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Afterhours Lounge", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByText(/Unknown/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Afterhours Lounge", exact: true })
    .click();
  await expect(
    page.getByText("Data completeness", { exact: true }),
  ).toBeVisible();
  await page.goto(
    "/iframe.html?id=clubs-analytics--repaired-home&viewMode=story",
  );
  await expect(
    page.getByRole("heading", { name: "Recent instances", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Afterhours Lounge", exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: `../../.cache/artifacts/repair-history-${isMobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
  }
});
