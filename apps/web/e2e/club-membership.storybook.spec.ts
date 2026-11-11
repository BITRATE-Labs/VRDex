import { expect, test } from "@playwright/test";
import path from "node:path";

test("membership bars and identifiable activity @storybook-visual", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    "/iframe.html?id=clubs-membership--movement-and-activity&viewMode=story",
  );
  await expect(
    page.getByRole("group", { name: "Membership movement chart" }),
  ).toBeVisible();
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await page.getByText("Details", { exact: true }).first().click();
  await expect(page.getByText("usr_example_nightbird", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show movement data" }).click();
  const missing = page.getByRole("row").filter({ hasText: "Aug 5" });
  await expect(
    missing.getByRole("cell", { name: "Unknown", exact: true }),
  ).toHaveCount(2);
  const zero = page.getByRole("row").filter({ hasText: "Aug 9" });
  await expect(zero).toContainText("0");
  await page.getByRole("button", { name: "Hide movement data" }).click();
  await expect(
    page.getByRole("button", { name: "Load more activity" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: path.resolve(
        process.cwd(),
        "../../.cache/artifacts",
        `membership-${isMobile ? "mobile" : "desktop"}.png`,
      ),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("role activity separates people, roles and audit evidence @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-membership--role-activity&viewMode=story");
  await expect(page.getByText("Assigned role: DJ", { exact: true })).toBeVisible();
  await expect(page.getByText("Removed role: Deputy", { exact: true })).toBeVisible();
  await expect(page.getByText("Role unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Other activity", { exact: true })).toBeVisible();
  const mira = page.getByRole("link", { name: "Mira", exact: true });
  await expect(mira).toHaveAttribute("href", "https://vrchat.com/home/user/usr_00000000-0000-4000-8000-000000000001");
  await expect(mira).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("link", { name: "VRDex", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "VRDex", exact: true })).toHaveAttribute("href", "/mira");
  await expect(page.getByRole("link", { name: "Sol", exact: true })).toBeVisible();
  await expect(page.getByText("group.member.role.assign", { exact: true }).first()).not.toBeVisible();
  await page.getByText("Details", { exact: true }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("group.member.role.assign", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Mira Moon", { exact: true })).toBeVisible();
  await expect(page.getByText("Old Sol", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: path.resolve(process.cwd(), "../../.cache/artifacts", `membership-roles-${test.info().project.name}.png`), fullPage: true });
});

test("membership pagination restores counts and clears denied history @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-membership--pagination-and-access&viewMode=story");
  await expect(page.getByText("Fixture member 24", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Load more activity" }).click();
  await expect(page.getByText("Fixture member 49", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Leave fixture" }).click();
  await expect(page.getByText("Fixture member 49", { exact: true }).first()).toHaveCount(0);
  await page.getByRole("button", { name: "Return to fixture" }).click();
  await expect(page.getByText("Fixture member 49", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Revoke fixture access" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to load activity.");
  await expect(page.getByText("Fixture member 0", { exact: true }).first()).toHaveCount(0);
  await page.getByRole("button", { name: "Restore fixture access" }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Fixture member 49", { exact: true }).first()).toBeVisible();
});
