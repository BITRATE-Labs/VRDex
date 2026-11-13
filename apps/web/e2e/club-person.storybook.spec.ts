import { test, expect } from "@playwright/test";

for (const skew of [-3_600_000, 3_600_000]) {
  test(`people grants retain names pending status and renewal with browser skew ${skew} @storybook-visual`, async ({ page }) => {
    await page.clock.install({ time: new Date(Date.now() + skew) });
    await page.goto(`/iframe.html?id=clubs-people-controls--${skew > 0 ? "fast" : "slow"}-browser-clock&viewMode=story`);
    const people = page.getByRole("region", { name: "People", exact: true });
    const count = () => page.evaluate(() => Number(document.documentElement.dataset.peopleRequests));
    await expect(people.getByText("Riley", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add chunk", exact: true }).click();
    await expect.poll(count).toBe(2);
    await expect(people.getByText("Riley", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Delay names", exact: true }).click();
    await expect(people.getByRole("status")).toContainText("2");
    await page.clock.fastForward(14 * 60_000);
    expect(await count()).toBe(2);
    await expect(people.getByRole("status")).toContainText("2");
    await page.getByRole("button", { name: "Resolve names", exact: true }).click();
    await expect(people.getByText("Riley", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Remove last chunk", exact: true }).click();
    await page.clock.fastForward(60_000 + 10);
    await expect.poll(count).toBe(3);
    await expect(people.getByText("Riley", { exact: true })).toBeVisible();
    await expect(people.getByRole("status")).toHaveCount(0);
  });
}

test("people grants that expire in transit cannot supply names or pending counts @storybook-visual", async ({ page }) => {
  await page.clock.install();
  await page.goto("/iframe.html?id=clubs-people-controls--lifecycle&viewMode=story");
  const people = page.getByRole("region", { name: "People", exact: true });
  await expect(people.getByText("Riley", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hold grant delivery", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(2);
  await expect(people.getByText("Riley", { exact: true })).toHaveCount(0);
  await page.clock.fastForward(16 * 60_000);
  await page.getByRole("button", { name: "Release grant delivery", exact: true }).click();
  await expect(people.getByText("Riley", { exact: true })).toHaveCount(0);
  await expect(people.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Close source", exact: true }).click();
});

test("mixed-case identity fallbacks compare canonical people and suffix collisions @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-people-controls--mixed-case-fallbacks&viewMode=story");
  await expect(page.locator("bdi")).toHaveCount(3);
  const names = await page.locator("bdi").allTextContents();
  expect(names).toHaveLength(3);
  expect(names[0]).toBe(names[1]); expect(names[0]).not.toBe(names[2]);
  await expect(page.getByText("USR_AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", { exact: true })).toBeVisible();
});

test("one failed chunk preserves successful active names and pending counts until global access loss @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-people-controls--chunked-sources&viewMode=story");
  const people = page.getByRole("region", { name: "People", exact: true });
  await page.getByRole("button", { name: "Add chunk", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Fail second chunk", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Delay names", exact: true }).click();
  await expect(people.getByRole("status")).toHaveText("Updating names · 1");
  await page.getByRole("button", { name: "Resolve names", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Remove workspace access", exact: true }).click();
  await expect(people.getByRole("link", { name: "Riley", exact: true })).toHaveCount(0);
  await expect(people.getByRole("status")).toHaveCount(0);
});

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
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/people-lifecycle-${test.info().project.name}.png`, fullPage: true });
  }
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


test("shared Details identify a VRDex profile name fallback @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-people-controls--lifecycle&viewMode=story");
  await page.getByRole("button", { name: "Use profile names", exact: true }).click();
  const people = page.getByRole("region", { name: "People", exact: true });
  await people.locator("summary").first().click();
  await expect(people.getByText("VRDex profile name", { exact: true }).first()).toBeVisible();
  await expect(people.getByText("Name last checked", { exact: true })).toHaveCount(0);
  await expect(people.getByText("vrdex_profile", { exact: true })).toHaveCount(0);
});


test("unchanged source chunks retain grants while removed chunks and scopes require new admission @storybook-visual", async ({ page }) => {
  await page.clock.install();
  await page.goto("/iframe.html?id=clubs-people-controls--chunked-sources&viewMode=story");
  const count = () => page.evaluate(() => Number(document.documentElement.dataset.peopleRequests));
  await expect.poll(count).toBe(1);
  await page.getByRole("region", { name: "People", exact: true }).getByRole("link", { name: "Riley", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add chunk", exact: true }).click();
  await expect.poll(count).toBe(2);
  await page.getByRole("button", { name: "Remove last chunk", exact: true }).click();
  expect(await count()).toBe(2);
  await page.getByRole("button", { name: "Add chunk", exact: true }).click();
  await expect.poll(count).toBe(3);
  await page.getByRole("button", { name: "Remove last chunk", exact: true }).click();
  await page.clock.fastForward(15 * 60_000 + 10);
  await expect.poll(count).toBe(4);
  await page.getByRole("button", { name: "Change viewer", exact: true }).click();
  await expect.poll(count).toBe(5);
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await page.clock.fastForward(16 * 60_000);
  expect(await count()).toBe(5);
});


test("older activity chunks cannot replace a better or newer authorized name @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-people-controls--name-precedence&viewMode=story");
  const people = page.getByRole("region", { name: "People", exact: true });
  await expect(people.getByText("New recorded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add chunk", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.peopleRequests))).toBe(2);
  await expect(people.getByText("New recorded", { exact: true })).toBeVisible();
  await expect(people.getByText("Old recorded", { exact: true })).toHaveCount(0);
  for (const [mode, expected] of [["public", "Public observation"], ["private", "New public observation"], ["profile", "New recorded"]]) {
    await page.getByRole("button", { name: `Use ${mode} observations`, exact: true }).click();
    await expect(people.getByText(expected, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Revoke access", exact: true }).click();
  await expect(people.getByText("New recorded", { exact: true })).toHaveCount(0);
  await expect(people.getByText("Profile fallback", { exact: true })).toHaveCount(0);
});
