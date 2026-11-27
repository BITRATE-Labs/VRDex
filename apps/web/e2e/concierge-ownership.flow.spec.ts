import { expect, test } from "@playwright/test";

test("concierge owner assignment reviews the exact recipient before assigning @flow @fixture", async ({ page }, info) => {
  await page.route("**/api/account/concierge-ownership", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      slug: "afterglow",
      email: "organizer@example.com",
      expectedProfileId: "fixture-profile",
      expectedUserId: "fixture-recipient",
      reason: "Requested by the organizer",
    });
    await route.fulfill({ json: { slug: "afterglow" } });
  });
  await page.goto("/playwright/concierge-ownership");
  await page.getByRole("combobox", { name: "Profile", exact: true }).fill("Afterglow");
  await page.getByRole("option", { name: /Afterglow/ }).click();
  await page.getByLabel("Recipient’s verified email").fill("organizer@example.com");
  await page.getByRole("button", { name: "Review assignment" }).click();
  await expect(page.getByText("Test Organizer · organizer@example.com")).toBeVisible();
  await page.getByLabel("Reason").fill("Requested by the organizer");
  await page.screenshot({ path: info.outputPath("concierge-ownership.png") });
  await page.getByRole("button", { name: "Assign owner" }).click();
  await expect(page.getByRole("status")).toHaveText("Owner assigned to afterglow.");
});
