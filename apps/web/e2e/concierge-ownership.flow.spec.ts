import { expect, test } from "@playwright/test";

test("concierge owner assignment reviews the exact recipient before assigning @fixture", async ({ page }, info) => {
  await page.goto("/playwright/concierge-ownership");
  await page.getByLabel("Profile slug").fill("afterglow");
  await page.getByLabel("Recipient’s verified email").fill("organizer@example.com");
  await page.getByRole("button", { name: "Review assignment" }).click();
  await expect(page.getByText("Test Organizer · organizer@example.com")).toBeVisible();
  await page.getByLabel("Reason").fill("Requested by the organizer");
  await page.screenshot({ path: info.outputPath("concierge-ownership.png") });
  await page.getByRole("button", { name: "Assign owner" }).click();
  await expect(page.getByRole("status")).toHaveText("Owner assigned to afterglow.");
});
