import { expect, test } from "@playwright/test";
import { prepareVisualPage, waitForVisualReady } from "./public-routes";
for (const editor of [false, true]) {
  test(`event lineup ${editor ? "editor" : "roster"} @snapshot`, async ({ page }) => {
    await prepareVisualPage(page);
    await page.goto(`/playwright/event-lineup${editor ? "?editor" : ""}`);
    if (editor) {
      await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review", exact: true }).click();
      await page.locator("summary").filter({ hasText: /^Advanced/ }).click();
      await expect(page.getByLabel("Watch mode", { exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Lineup", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "SoundCloud", exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Host view", exact: true })).toBeVisible();
    }
    await waitForVisualReady(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page).toHaveScreenshot(`event-lineup-${editor ? "editor" : "roster"}.png`, { fullPage: true, animations: "disabled", caret: "hide", scale: "css" });
  });
}
