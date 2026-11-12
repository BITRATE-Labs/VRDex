import { test, expect } from "@playwright/test";

for (const button of ["Change source", "Change viewer", "Change community", "Replace integration scope"]) {
  test(`people clear immediately on ${button} @storybook-visual`, async ({ page }) => {
    await page.goto("/iframe.html?id=clubs-people-controls--lifecycle&viewMode=story");
    const people = page.getByRole("region", { name: "People", exact: true });
    await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(0);
    await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
    expect(await page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(2);
  });
}

test("people drop unauthorized names and distinguish colliding fallbacks @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-people-controls--lifecycle&viewMode=story");
  const people = page.getByRole("region", { name: "People", exact: true });
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delay names", exact: true }).click();
  await expect(people.getByRole("status")).toHaveText("Updating names \u00b7 2");
  const references = await people.locator("bdi").allTextContents();
  expect(references).toHaveLength(2);
  expect(new Set(references).size).toBe(2);
  await page.getByRole("button", { name: "Disable lookup", exact: true }).click();
  await expect(people.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Resolve names", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revoke access", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(0);
  await expect(people.getByText("Nova", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `../../.cache/artifacts/people-lifecycle-${test.info().project.name}.png`, fullPage: true });
});


test("people grants renew only while active and expired responses have bounded retries @storybook-visual", async ({ page }) => {
  await page.clock.install();
  await page.goto("/iframe.html?id=clubs-people-controls--lifecycle&viewMode=story");
  const people = page.getByRole("region", { name: "People", exact: true });
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await page.clock.fastForward(15 * 60_000 + 10);
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(2);
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(0);
  await page.clock.fastForward(16 * 60_000);
  expect(await page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(2);
});

test("expired people responses stop after three attempts @storybook-visual", async ({ page }) => {
  await page.clock.install();
  await page.goto("/iframe.html?id=clubs-people-controls--lifecycle&viewMode=story");
  const people = page.getByRole("region", { name: "People", exact: true });
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Return expired grants", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(0);
  await page.clock.runFor(3100);
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(4);
  await page.clock.fastForward(60_000);
  expect(await page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(4);
});

test("workspace access loss removes people immediately @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-people-controls--lifecycle&viewMode=story");
  const people = page.getByRole("region", { name: "People", exact: true });
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove workspace access", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(0);
  await expect(people.getByRole("status")).toHaveCount(0);
  expect(await page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(1);
});


test("restoring a previous scope cannot briefly reuse its old grant @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-people-controls--lifecycle&viewMode=story");
  const people = page.getByRole("region", { name: "People", exact: true });
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove workspace access", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restore workspace access", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(0);
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  expect(await page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(2);
});
