import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test.setTimeout(75_000);

test("capture the wiki schedule @storybook @wiki-screenshot", async ({ page }) => {
  await page.goto("/iframe.html?id=wiki-schedule--plan-your-night&viewMode=story");
  const preview = page.getByRole("region", { name: "Schedule preview" });
  await expect(preview.getByRole("heading", { name: "My night" })).toBeVisible({ timeout: 60_000 });
  const orbit = preview.getByTestId("event-orbit");
  await expect(orbit.getByRole("button", { name: "Open ORBIT", exact: true })).toBeVisible();
  await expect(orbit.getByRole("button", { name: "Open Nori at ORBIT", exact: true })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Open Low Tide", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await preview.screenshot({
    path: resolve(__dirname, "../../../docs/wiki/images/events-schedule.png"),
    animations: "disabled",
    scale: "css",
  });
});

test("capture the wiki profile @storybook @wiki-screenshot", async ({ page }) => {
  await page.goto("/iframe.html?id=profiles-profile-editor--wiki-public-profile&viewMode=story");
  const preview = page.getByRole("region", { name: "Profile preview" });
  await expect(preview.getByRole("heading", { name: "Aurora", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(preview.getByRole("link", { name: /SoundCloud/ })).toBeVisible();
  const avatar = preview.getByRole("img", { name: "Aurora display image" });
  await expect(avatar).toHaveAttribute("aria-busy", "false");
  await avatar.locator("img").evaluate((image: HTMLImageElement) => image.decode());
  await page.evaluate(() => document.fonts.ready);
  await preview.screenshot({
    path: resolve(__dirname, "../../../docs/wiki/images/verified-dj-profile.png"),
    animations: "disabled",
    scale: "css",
  });
});
