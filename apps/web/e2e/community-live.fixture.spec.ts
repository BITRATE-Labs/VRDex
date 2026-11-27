import { expect, test } from "@playwright/test";

test("community stream can show live without changing its provenance @fixture", async ({ page }) => {
  await page.route("**/api/profile-live/playwright-dj-aurora/vrcdn*", (route) =>
    route.fulfill({ json: { states: { "dj-aurora": "offline", "suggested-aurora": "live" } } }),
  );
  await page.goto("/playwright-dj-aurora");
  await expect(page.getByRole("button", { name: "Play Suggested VRCDN suggested-aurora", exact: true })).toBeVisible();
  const stream = page.getByRole("region", { name: "Suggested VRCDN suggested-aurora", exact: true });
  await expect(stream.getByText("Community-submitted", { exact: true })).toBeVisible();
  const identity = page.getByRole("region", { name: "DJ Aurora", exact: true });
  await expect(identity.getByText("Unclaimed", { exact: true })).toBeVisible();
});
