import { test, expect } from "@playwright/test";
const member = "usr_00000000-0000-4000-8000-000000000001";

test("analytics sign-in returns to the exact filtered history @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-workspace--signed-out-analytics&viewMode=story");
  const href = await page.getByRole("link", { name: "Sign in", exact: true }).getAttribute("href");
  const signIn = new URL(href!, "https://example.test");
  const target = new URL(signIn.searchParams.get("returnTo")!, "https://example.test");
  expect(target.pathname).toBe("/account/communities/afterhours/analytics");
  expect(target.searchParams.get("member")).toBe(member);
  expect(target.searchParams.get("eventType")).toBe("group.member.role.assign");
  expect(target.searchParams.get("from")).toBe("2026-09-01");
  expect(target.searchParams.get("to")).toBe("2026-09-30");
});


test("activity filters reach indexed pagination and restore their own loaded pages @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-membership-recovery--filters&viewMode=story");
  await expect(page.locator("div.py-4")).toHaveCount(25);
  await page.getByLabel("Member", { exact: true }).selectOption(member);
  await page.getByLabel("Activity", { exact: true }).selectOption("group.member.join");
  await expect(page.locator("div.py-4")).toHaveCount(25);
  await expect(page.getByRole("status").filter({ hasText: "Updating names" })).toHaveCount(0);
  const filter = await page.evaluate(() => JSON.parse(document.documentElement.dataset.activityFilter!));
  expect(filter.targetUserId).toBe(member);
  expect(filter.eventType).toBe("group.member.join");
  await expect(page.getByLabel("Fixture location")).toContainText(`member=${member}`);
  await expect(page.getByLabel("Fixture location")).toContainText("eventType=group.member.join");
  await page.getByRole("button", { name: "Load more activity", exact: true }).click();
  await expect(page.locator("div.py-4")).toHaveCount(30);
  await page.getByRole("button", { name: "Leave activity", exact: true }).click();
  await page.getByRole("button", { name: "Return to activity", exact: true }).click();
  await expect(page.locator("div.py-4")).toHaveCount(30);
  await page.getByLabel("Activity", { exact: true }).selectOption("group.member.leave");
  await expect(page.locator("div.py-4")).toHaveCount(25);
  await expect(page.getByLabel("Member", { exact: true })).toHaveValue(member);
  await page.getByLabel("Inspect day", { exact: true }).fill("2026-09-01");
  await expect(page.getByLabel("Fixture location")).toContainText(`member=${member}`);
  await expect(page.getByLabel("Fixture location")).toContainText("eventType=group.member.leave");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("heading", { name: "Membership activity", exact: true }).evaluate(element => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `../../.cache/artifacts/membership-filter-${test.info().project.name}.png` });
});

test("a known person can be filtered from their Details @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-membership-recovery--filters&viewMode=story");
  await page.locator("summary").first().click();
  await page.getByRole("button", { name: "Filter member", exact: true }).first().click();
  await expect(page.getByLabel("Member", { exact: true })).toHaveValue(member);
  await expect(page.getByLabel("Fixture location")).toContainText(`member=${member}`);
});

for (const story of ["disabled", "staff"]) {
  test(`${story} has no inoperable recovery prompt @storybook-visual`, async ({ page }) => {
    await page.goto(`/iframe.html?id=clubs-membership-recovery--${story}&viewMode=story`);
    await expect(page.getByRole("button", { name: "Recover recent history", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resume recovery", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "History recovery", exact: true })).toHaveCount(0);
  });
}

test("owner recovery uses fixed bounds and exact stop and resume revisions @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-membership-recovery--owner&viewMode=story");
  await page.getByRole("button", { name: "Recover recent history", exact: true }).click();
  const recovery = page.getByRole("region", { name: "History recovery", exact: true });
  await expect(recovery.getByText("Pending", { exact: true })).toBeVisible();
  const bounds = await recovery.getByLabel("Recovery window").textContent();
  await page.getByRole("button", { name: "Advance recovery", exact: true }).click();
  await expect(recovery.getByText("Running", { exact: true })).toBeVisible();
  await expect(recovery.locator("div").filter({ has: page.getByText("Scanned", { exact: true }) }).last()).toContainText("100");
  await page.getByRole("button", { name: "Stop recovery", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.recoveryStop!))).toEqual({ recoveryId: "recovery-one", expectedRevision: 1 });
  await expect(recovery.getByText("Stopped", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume recovery", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.recoveryRequest!))).toEqual({ communityProfileId: "fixture-club", resume: true, expectedRevision: 2 });
  await expect(recovery.getByLabel("Recovery window")).toHaveText(bounds!);
  await expect(recovery.getByText("Pending", { exact: true })).toBeVisible();
  await recovery.screenshot({ path: `../../.cache/artifacts/membership-history-repair-${test.info().project.name}.png` });
});

for (const story of ["entry-cap", "page-cap"]) {
  test(`${story} cannot resume past its cumulative bound @storybook-visual`, async ({ page }) => {
    await page.goto(`/iframe.html?id=clubs-membership-recovery--${story}&viewMode=story`);
    await expect(page.getByText("Partial", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resume recovery", exact: true })).toHaveCount(0);
  });
}


test("selected member retains a distinct fallback when loaded options disappear @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-membership-recovery--filters&viewMode=story");
  await page.getByLabel("Member", { exact: true }).selectOption(member);
  await page.getByRole("button", { name: "Hide selected member", exact: true }).click();
  await expect(page.getByText("No recorded membership events.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Member", { exact: true })).toHaveValue(member);
  await expect(page.getByLabel("Member", { exact: true }).locator("option:checked")).toHaveText("Member 00000001");
  await expect(page.getByLabel("Fixture location")).toContainText(`member=${member}`);
});


test("Details distinguish recorded recovered and last-observed role evidence @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-membership--evidence-provenance&viewMode=story");
  const rows = page.locator("div.py-4");
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) await row.locator("summary").click();
  await expect(rows.nth(0).getByText("Role recorded with event", { exact: true })).toBeVisible();
  await expect(rows.nth(0).getByText("Actor name recorded with event", { exact: true })).toBeVisible();
  await expect(rows.nth(0).getByText("Recovered actor name", { exact: true })).toHaveCount(0);
  await expect(rows.nth(1).getByText("Recovered role name", { exact: true })).toBeVisible();
  await expect(rows.nth(1).getByText("Recovered actor name", { exact: true })).toBeVisible();
  await expect(rows.nth(1).getByText("Evidence recovered", { exact: true })).toBeVisible();
  await expect(rows.nth(2).getByText("Last observed role name", { exact: true })).toBeVisible();
  await expect(rows.nth(2).getByText("Role last observed", { exact: true })).toBeVisible();
  await expect(rows.nth(2).getByText("Role recorded with event", { exact: true })).toHaveCount(0);
  await expect(page.getByText("role_observation", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `../../.cache/artifacts/membership-provenance-${test.info().project.name}.png`, fullPage: true });
});


test("recovery failures retain truthful state and approved error copy @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-membership-recovery--stopped&viewMode=story");
  await page.getByRole("button", { name: "Fail next recovery action", exact: true }).click();
  await page.getByRole("button", { name: "Resume recovery", exact: true }).click();
  const recovery = page.getByRole("region", { name: "History recovery", exact: true });
  await expect(recovery.getByRole("alert")).toHaveText("Refresh to continue.");
  await expect(recovery.getByText("Stopped", { exact: true })).toBeVisible();
  await expect(page.getByText(/Internal authority unavailable/)).toHaveCount(0);
  await page.getByRole("button", { name: "Resume recovery", exact: true }).click();
  await expect(recovery.getByText("Pending", { exact: true })).toBeVisible();
  await expect(recovery.getByRole("alert")).toHaveCount(0);
});
