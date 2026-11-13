import { expect, test } from "@playwright/test";
test("mixed-case identity members keep names and original action payload IDs @storybook-visual", async ({ page }) => {
  const rawId = "USR_00000000-0000-0000-0000-000000000001";
  await page.goto("/iframe.html?id=clubs-members--mixed-case-people&viewMode=story");
  await expect(page.getByRole("checkbox", { name: "Select Riley", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manage member Riley", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Riley", exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Riley", exact: true }).check();
  await page.getByLabel("VRChat role", { exact: true }).selectOption("grol_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
  await page.getByRole("button", { name: "Assign selected", exact: true }).click();
  const review = page.locator("section").filter({ has: page.getByRole("heading", { name: "Review action", exact: true }) }).last();
  await expect(review.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await expect(review).toContainText(rawId);
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/bd4a-member-review-${test.info().project.name}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Confirm action", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.memberPayload!).payloads[0].targetUserId)).toBe(rawId);
  const actions = page.locator("section").filter({ has: page.getByRole("heading", { name: "Recent actions", exact: true }) }).last();
  await expect(actions.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
});

for (const [story, count] of [["paged-people", 20], ["underfilled-people", 17]] as const) test(`identity admission keeps partial member groups stable on ${story} @storybook-visual`, async ({ page }) => {
  await page.clock.install();
  await page.goto(`/iframe.html?id=clubs-members--${story}&viewMode=story`);
  const actions = page.locator("section").filter({ has: page.getByRole("heading", { name: "Recent actions", exact: true }) }).last();
  await expect(actions.getByRole("link", { name: "Riley", exact: true })).toHaveCount(1);
  const admissions = () => page.evaluate(() => JSON.parse(document.documentElement.dataset.operationAdmissions!) as string[][]);
  await expect.poll(admissions).toEqual([Array.from({ length: count }, (_, index) => `Action-MiXeD-${index}`)]);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await expect.poll(admissions).toEqual([Array.from({ length: count }, (_, index) => `Action-MiXeD-${index}`), [`Action-MiXeD-${count + 5}`, `Action-MiXeD-${count + 6}`]]);
  // Freeze the fixture's 500ms second admission while checking the retained group.
  await expect(actions.getByRole("link", { name: "Riley", exact: true })).toHaveCount(1);
  await page.clock.runFor(500);
  await expect(actions.getByRole("link", { name: "Riley", exact: true })).toHaveCount(2);
});
test("clearing member search restores the unfiltered directory @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-members--owner&viewMode=story");
  await page.getByLabel("Search members").fill("Riley");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Manage member Nova", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.getByLabel("Search members")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Manage member Nova", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear search", exact: true })).toHaveCount(0);
});

test("assigned bot remains inspectable when omitted from the directory @storybook-visual", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=clubs-members--owner&viewMode=story");
  await page
    .getByRole("button", { name: "View assigned bot", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Club bot", exact: true }),
  ).toBeVisible();
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: `../../.cache/artifacts/member-bot-${test.info().project.name}.png`,
      fullPage: true,
    });
  }
});
test("member search, pagination and confirmed actions @storybook-visual", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=clubs-members--owner&viewMode=story");
  await expect(
    page.getByRole("button", { name: "Manage member Riley", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByRole("button", { name: "Manage member Morgan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous page" }).click();
  await page.getByRole("button", { name: "Manage member Riley", exact: true }).click();
  await expect(page.getByText("DJ", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close detail" }).click();
  await page.getByLabel("Search members").fill("Riley");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Manage member Nova", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ban member", exact: true }).click();
  await expect(page.getByText("Review action", { exact: true })).toBeVisible();
  await expect(page.getByText("Queued", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  await expect(page.getByText("Completed", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cancel action", exact: true })
    .click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("staff role picker only offers owner-permitted provider roles @storybook-visual", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=clubs-members--staff&viewMode=story");
  await page
    .getByRole("checkbox", { name: "Select Riley", exact: true })
    .check();
  await expect(
    page.getByRole("option", { name: "DJ", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("option", { name: "Group admin", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ban member", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Bans", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("VRChat role", { exact: true })
    .selectOption({ label: "DJ" });
  await page
    .getByRole("button", { name: "Assign selected", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
});
test("failed provider reads offer refresh without inventing members @storybook-visual", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=clubs-members--read-failure&viewMode=story");
  await expect(page.getByRole("alert")).toContainText("Unable to load data");
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Manage member Riley", exact: true }),
  ).toHaveCount(0);
});

test("requests support selected approval while removals remain individual @storybook-visual", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=clubs-members--owner&viewMode=story");
  await page.getByRole("tab", { name: "Requests", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Select Riley", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Nova", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Approve selected", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(page.getByText("Queued", { exact: true })).toHaveCount(2);
  await page.getByRole("tab", { name: "Invitations", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel invitation", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(page.getByText("Queued", { exact: true })).toHaveCount(3);
  await page.getByRole("tab", { name: "Bans", exact: true }).click();
  await page
    .getByRole("button", { name: "Unban member", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(page.getByText("Queued", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("stale member pages disable new actions until refresh @storybook-visual", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/iframe.html?id=clubs-members--owner&viewMode=story");
  await expect(
    page.getByRole("button", { name: "Ban member", exact: true }).first(),
  ).toBeEnabled();
  await page.clock.fastForward(61_000);
  await expect(
    page.getByRole("button", { name: "Ban member", exact: true }).first(),
  ).toBeDisabled();
  await expect(
    page.getByText("Refresh to continue.", { exact: true }),
  ).toBeVisible();
});
test("staff can select uppercase provider roles against lowercase grants @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-members--staff-mixed-case-roles&viewMode=story");
  await page.getByRole("checkbox", { name: "Select Riley", exact: true }).check();
  const role = page.getByLabel("VRChat role", { exact: true });
  await expect(page.getByRole("option", { name: "DJ", exact: true })).toHaveCount(1);
  await role.selectOption({ label: "DJ" });
  await expect(role).toHaveValue("grol_AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAA1");
  await expect(page.getByRole("button", { name: "Assign selected", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Remove selected role", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Assign selected", exact: true }).click();
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: `../../.cache/artifacts/member-mixed-case-role-${test.info().project.name}.png`,
      fullPage: true,
    });
  }
});

for (const story of ["owner-directory-unavailable", "mixed-role-directory-unavailable"]) {
  test(`${story} keeps direct actions available when the directory fails @storybook-visual`, async ({ page }) => {
    await page.goto(`/iframe.html?id=clubs-members--${story}&viewMode=story`);
    await expect(page.getByRole("alert")).toContainText("Unable to load data");
    await expect(page.getByRole("tab", { name: "Directory", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Actions", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByLabel("Search members")).toHaveCount(0);
    await page.getByLabel("VRChat user ID").fill("usr_00000000-0000-0000-0000-000000000001");
    await page.getByLabel("VRChat role").selectOption({ label: "DJ" });
    await expect(page.getByRole("button", { name: "Assign role", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Remove member", exact: true })).toBeEnabled();
    if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
      await page.screenshot({ path: `../../.cache/artifacts/member-${story}-${test.info().project.name}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Assign role", exact: true }).click();
    await expect(page.getByText("Review action", { exact: true })).toBeVisible();
  });
}

test("role-only staff can assign a permitted role by ID without a directory read @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-members--role-only&viewMode=story");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByLabel("Search members")).toHaveCount(0);
  await page.getByLabel("VRChat user ID").fill("USR_00000000-0000-0000-0000-000000000099");
  await page.getByLabel("VRChat role").selectOption({ label: "DJ" });
  await expect(page.getByRole("option", { name: "Group admin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assign role", exact: true })).toBeDisabled();
  await page.getByLabel("VRChat user ID").fill("usr_00000000-0000-0000-0000-000000000001");
  await expect(page.getByRole("button", { name: "Assign role", exact: true })).toBeEnabled();
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/member-role-only-${test.info().project.name}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Assign role", exact: true }).click();
  await expect(page.getByText("Review action", { exact: true })).toBeVisible();
  await expect(page.getByText("usr_00000000-0000-0000-0000-000000000001", { exact: true })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^DJ$/ })).toBeVisible();
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("remove-only staff can remove a member by ID @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-members--remove-only&viewMode=story");
  await page.getByLabel("VRChat user ID").fill("USR_00000000-0000-0000-0000-000000000099");
  await expect(page.getByRole("button", { name: "Remove member", exact: true })).toBeDisabled();
  await page.getByLabel("VRChat user ID").fill("usr_00000000-0000-0000-0000-000000000001");
  await expect(page.getByLabel("VRChat role")).toHaveCount(0);
  await page.getByRole("button", { name: "Remove member", exact: true }).click();
  await expect(page.getByText("Review action", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
});

test("ban-only staff can ban by ID without directory access @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-members--ban-only&viewMode=story");
  await expect(page.getByRole("tab", { name: "Directory" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Bans" })).toBeVisible();
  await page.getByRole("tab", { name: "Actions" }).click();
  await expect(page.getByLabel("Search members")).toHaveCount(0);
  await expect(page.getByLabel("VRChat role")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove member" })).toHaveCount(0);
  const target = page.getByLabel("VRChat user ID");
  const ban = page.getByRole("button", { name: "Ban member", exact: true });
  await target.fill("bad-id");
  await expect(ban).toBeDisabled();
  await target.fill("USR_00000000-0000-0000-0000-000000000099");
  await expect(ban).toBeDisabled();
  await target.fill("usr_00000000-0000-0000-0000-000000000001");
  await expect(ban).toBeEnabled();
  await ban.click();
  await expect(page.getByText("Review action", { exact: true })).toBeVisible();
  await expect(page.getByText("usr_00000000-0000-0000-0000-000000000001", { exact: true })).toBeVisible();
  await expect(page.getByText("Queued", { exact: true })).toHaveCount(0);
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/member-ban-only-${test.info().project.name}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Review action", { exact: true })).toHaveCount(0);
  await ban.click();
  await page.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("unauthorized direct Members visit shows access notice without querying context @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-members--no-access&viewMode=story");
  await expect(page.getByText("You do not have access to this page.", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("live directory revocation switches to permitted actions without remounting @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-members--live-permissions&viewMode=story");
  await expect(page.getByLabel("Search members")).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Riley" }).check();
  await page.getByRole("button", { name: "Switch permissions" }).click();
  await expect(page.getByLabel("VRChat user ID")).toBeVisible();
  await expect(page.getByLabel("Search members")).toHaveCount(0);
  await expect(page.getByText("1 selected", { exact: true })).toHaveCount(0);
  await page.getByLabel("VRChat user ID").fill("usr_00000000-0000-0000-0000-000000000001");
  await page.getByLabel("VRChat role").selectOption({ label: "DJ" });
  await page.getByRole("button", { name: "Assign role", exact: true }).click();
  await expect(page.getByText("Review action", { exact: true })).toBeVisible();
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/member-live-permissions-${test.info().project.name}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Switch permissions" }).click();
  await expect(page.getByRole("tab", { name: "Directory", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Directory", exact: true }).click();
  await expect(page.getByLabel("Search members")).toBeVisible();
  await expect(page.getByText("Review action", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 selected", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const skew of [-3600000, 3600000]) {
  test(`immediate member action with skew ${skew} @storybook-visual`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(Date.now() + skew));
    await page.goto("/iframe.html?id=clubs-members--owner&viewMode=story");
    await page.getByLabel("Search members").fill("Riley");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: "Ban member", exact: true }).click();
    await page.getByRole("button", { name: "Confirm action" }).click();
    await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  });
}


test("member confirmation distinguishes missing names with colliding short IDs @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-members--colliding-ids&viewMode=story");
  const selected = page.getByRole("checkbox");
  await expect(selected).toHaveCount(3);
  const visibleNames = await page.locator("div.py-4 bdi").allTextContents();
  expect(visibleNames).toHaveLength(3);
  expect(new Set(await selected.evaluateAll(elements => elements.map(element => element.getAttribute("aria-label")))).size).toBe(visibleNames.length);
  for (const name of visibleNames) {
    await expect(page.getByRole("checkbox", { name: `Select ${name}`, exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: `Manage member ${name}`, exact: true })).toHaveCount(1);
  }
  await selected.nth(0).check();
  await selected.nth(1).check();
  await page.getByLabel("VRChat role", { exact: true }).selectOption({ label: "DJ" });
  await page.getByRole("button", { name: "Assign selected", exact: true }).click();
  const review = page.locator("section").filter({ has: page.getByRole("heading", { name: "Review action", exact: true }) }).last();
  const names = await review.locator("bdi").allTextContents();
  expect(names).toHaveLength(2);
  expect(new Set(names).size).toBe(2);
  await expect(review).toContainText("usr_00000000-0000-0000-0000-000000000001");
  await expect(review).toContainText("usr_11111111-1111-1111-1111-111100000001");
});
