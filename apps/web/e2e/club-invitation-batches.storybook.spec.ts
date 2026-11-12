import { test, expect } from "@playwright/test";
import path from "node:path";
const alice = "usr_11111111-1111-1111-1111-111111111111";
const bob = "usr_22222222-2222-2222-2222-222222222222";

test("fixed invitation time uses server clock when device time is skewed @storybook-visual", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-14T20:10:00Z"));
  await page.goto("/iframe.html?id=clubs-invitation-batches--composer&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByLabel("Send invitations").selectOption("fixed");
  await page.getByLabel("Invitation time").fill("2026-09-14T20:05");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review invitations" })).toBeVisible();
  await page.getByRole("button", { name: "Back to edit" }).click();
  await page.clock.setFixedTime(new Date("2026-09-14T19:50:00Z"));
  await page.getByLabel("Invitation time").fill("2026-09-14T19:55");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Choose a future invitation time.");
  await expect(page.getByRole("region", { name: "Review invitations" })).toHaveCount(0);
});

test("invitation history advances past a filtered page without a click @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitations-workspace--auto-history&viewMode=story");
  await expect(page.getByRole("button", { name: /1 recipients · Group/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more batches" })).toHaveCount(0);
});

test("invitation history keeps manual paging after bounded automatic scans @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitations-workspace--bounded-history&viewMode=story");
  await expect(page.getByRole("button", { name: "Load more batches" })).toBeVisible();
  await expect(page.getByRole("button", { name: /1 recipients · Group/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Load more batches" }).click();
  await expect(page.getByRole("button", { name: /1 recipients · Group/ })).toBeVisible();
});

test("an expired instance read cannot confirm an open invitation review @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitation-batches--expiring-instance&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByRole("combobox", { name: "Instance", exact: true }).selectOption("visible-instance");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm invitations" })).toBeEnabled();
  await page.getByRole("button", { name: "Expire instance check" }).click();
  await expect(page.getByRole("button", { name: "Confirm invitations" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Instance", exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Refresh instance check" }).click();
  await expect(page.getByRole("button", { name: "Confirm invitations" })).toHaveCount(0);
  await expect(page.getByTestId("queued-review")).toHaveCount(0);
});

test("a fresh result missing the reviewed instance clears its selection @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitation-batches--omitted-instance&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByRole("combobox", { name: "Instance", exact: true }).selectOption("visible-instance");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm invitations" })).toBeEnabled();
  await page.getByRole("button", { name: "Omit instance" }).click();
  await expect(page.getByRole("button", { name: "Confirm invitations" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Instance", exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Restore instance" }).click();
  await expect(page.getByRole("button", { name: "Confirm invitations" })).toHaveCount(0);
  await expect(page.getByLabel("VRChat user IDs")).toHaveValue(`${alice}\n${bob}`);
});

test("staff can load older pending invitations past the first hundred @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-workspace--staff-invitations&viewMode=story");
  const revoke = page.getByRole("button", { name: "Revoke invitation" });
  await expect(revoke).toHaveCount(50);
  await page.clock.setFixedTime(new Date(Date.now() + 8 * 86400_000));
  await page.getByRole("button", { name: "Load more invitations" }).click();
  await expect(revoke).toHaveCount(100);
  await page.getByRole("button", { name: "Load more invitations" }).click();
  await expect(revoke).toHaveCount(101);
  await expect(page.getByRole("button", { name: "Load more invitations" })).toHaveCount(0);
});

test("individual invitation eligibility requires an explicit check @storybook-visual", async ({
  page,
  isMobile,
}) => {
  await page.goto(
    "/iframe.html?id=clubs-invitations-workspace--owner&viewMode=story",
  );
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByLabel("Destination").selectOption("instance");
  await page
    .getByRole("combobox", { name: "Instance", exact: true })
    .selectOption("instance-one");
  await page
    .getByRole("button", { name: "Review invitations", exact: true })
    .click();
  const rows = page
    .getByRole("list", { name: "Reviewed recipients" })
    .getByRole("listitem");
  await expect(
    page.getByText("Eligibility not checked", { exact: true }),
  ).toHaveCount(2);
  await rows.nth(0).getByRole("button", { name: "Check eligibility" }).click();
  await expect(rows.nth(0)).toContainText("Invitation check passed");
  await expect(page.getByRole("button", { name: "Confirm invitations" })).toBeEnabled();
  await expect(rows.nth(1)).toContainText("Eligibility not checked");
  await rows.nth(1).getByRole("button", { name: "Check eligibility" }).click();
  await expect(rows.nth(1)).toContainText("Not friends with bot");
  await expect(
    page.getByRole("link", { name: "Open assigned bot in VRChat" }),
  ).toBeVisible();
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: path.resolve(
        process.cwd(),
        "../../.cache/artifacts",
        `invitation-eligibility-${isMobile ? "mobile" : "desktop"}.png`,
      ),
      fullPage: true,
    });
  }
});

test("connected invitation workspace saves lists and cancels only unsent outcomes @storybook-visual", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    "/iframe.html?id=clubs-invitations-workspace--owner&viewMode=story",
  );
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByLabel("List name").fill("Friday attendees");
  await page.getByRole("button", { name: "Update list" }).click();
  await expect(page.getByRole("status")).toHaveText("List saved.");
  await page.getByLabel("Saved list").selectOption("list-one");
  await expect(page.getByLabel("List name")).toHaveValue("Friday attendees");
  await page
    .getByRole("button", { name: "Review invitations", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByRole("status")).toHaveText("Invitations queued.");
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel unsent invitations", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByRole("button", { name: "Delete list", exact: true }).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByLabel("Saved list").locator("option")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: path.resolve(
        process.cwd(),
        "../../.cache/artifacts",
        `invitation-workspace-${isMobile ? "mobile" : "desktop"}.png`,
      ),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("invitation list editing and frozen review @storybook-visual", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    "/iframe.html?id=clubs-invitation-batches--composer&viewMode=story",
  );
  await page.getByLabel("Saved list").selectOption("list-one");
  await expect(page.getByLabel("VRChat user IDs")).toHaveValue(
    `${alice}\n${bob}`,
  );
  await page.getByLabel("List name").fill("Friday guests");
  await page.getByRole("button", { name: "Update list" }).click();
  await expect(page.getByRole("status")).toHaveText("List saved.");
  await page.getByLabel("VRChat user IDs").fill(`${alice},${bob},${alice}`);
  await page
    .getByRole("button", { name: "Review invitations", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Review invitations" });
  await expect(review).toContainText("Duplicates removed: 1");
  await expect(
    page
      .getByRole("list", { name: "Reviewed recipients" })
      .getByRole("listitem"),
  ).toHaveCount(2);
  await expect(page.getByTestId("queued-review")).toHaveCount(0);
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: path.resolve(
        process.cwd(),
        "../../.cache/artifacts",
        `invitation-review-${isMobile ? "mobile" : "desktop"}.png`,
      ),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByTestId("queued-review")).toHaveText(
    "2 recipients · group · immediate",
  );
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByRole("button", { name: "Delete list", exact: true }).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByLabel("Saved list").locator("option")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("instance-only staff review a creation with event-relative timing @storybook-visual", async ({
  page,
  isMobile,
}) => {
  await page.goto(
    "/iframe.html?id=clubs-invitation-batches--instance-staff&viewMode=story",
  );
  await expect(
    page.getByLabel("Destination").locator('option[value="group"]'),
  ).toHaveCount(0);
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByLabel("Destination").selectOption("scheduled_instance");
  await page
    .getByRole("combobox", { name: "Instance creation", exact: true })
    .selectOption("creation-one");
  await expect(
    page.getByRole("link", { name: "Open assigned bot in VRChat" }),
  ).toHaveAttribute("href", `https://vrchat.com/home/user/${alice}`);
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review invitations" })).toContainText("9:30 PM");
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: path.resolve(
        process.cwd(),
        "../../.cache/artifacts",
        `invitation-creation-default-${isMobile ? "mobile" : "desktop"}.png`,
      ),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByTestId("queued-review")).toHaveText(
    "2 recipients · scheduled_instance · fixed",
  );
  await page.getByLabel("Send invitations").selectOption("event");
  await page
    .getByRole("combobox", { name: "Event", exact: true })
    .selectOption("event-one");
  await page.getByLabel("Minutes after event start").fill("-15");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: path.resolve(
        process.cwd(),
        "../../.cache/artifacts",
        `invitation-composer-${isMobile ? "mobile" : "desktop"}.png`,
      ),
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Review invitations", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Review invitations" }),
  ).toContainText("9:45 PM");
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByTestId("queued-review")).toHaveText(
    "2 recipients · scheduled_instance · event_relative",
  );
});


test("changed creation requires a fresh invitation review @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitation-batches--changed-creation&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByLabel("Destination").selectOption("scheduled_instance");
  await page.getByRole("combobox", { name: "Instance creation", exact: true }).selectOption("creation-one");
  await page.getByLabel("Send invitations").selectOption("event");
  await page.getByRole("combobox", { name: "Event", exact: true }).selectOption("event-one");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  const review = page.getByRole("region", { name: "Review invitations" });
  await expect(review).toContainText("wrld_33333333-3333-3333-3333-333333333333");
  await page.getByRole("button", { name: "Change creation" }).click();
  await expect(review).toContainText("wrld_33333333-3333-3333-3333-333333333333");
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByRole("alert")).toHaveText("Instance creation is unavailable.");
  await expect(page.getByTestId("queued-review")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to edit" }).click();
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await expect(review).toContainText("wrld_55555555-5555-5555-5555-555555555555");
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByTestId("queued-review")).toHaveAttribute("data-creation-revision", "8");
});

test("an expired frozen invitation time must be reviewed again @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitation-batches--expiring-schedule&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByLabel("Send invitations").selectOption("fixed");
  await page.getByLabel("Invitation time").fill("2030-09-20T22:00");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review invitations" })).toBeVisible();
  await page.getByRole("button", { name: "Advance server clock" }).click();
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByRole("alert")).toHaveText("Choose a future invitation time.");
  await expect(page.getByTestId("queued-review")).toHaveCount(0);
});

test("a moved event cannot submit an invitation whose current time is past @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitation-batches--moved-event&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByLabel("Send invitations").selectOption("event");
  await page.getByRole("combobox", { name: "Event", exact: true }).selectOption("event-one");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await page.getByRole("button", { name: "Move event earlier" }).click();
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByRole("alert")).toHaveText("Choose a future invitation time.");
  await expect(page.getByTestId("queued-review")).toHaveCount(0);
});

test("a moved-later event requires a fresh invitation review @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitation-batches--moved-event&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByLabel("Send invitations").selectOption("event");
  await page.getByRole("combobox", { name: "Event", exact: true }).selectOption("event-one");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review invitations" })).toContainText("10:00 PM");
  await page.getByRole("button", { name: "Move event later" }).click();
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByRole("alert")).toHaveText("Refresh to continue.");
  await expect(page.getByRole("region", { name: "Review invitations" })).toHaveCount(0);
  await expect(page.getByTestId("queued-review")).toHaveCount(0);
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await expect(page.getByRole("region", { name: "Review invitations" })).toContainText("11:00 PM");
});

test("deleting a list requires the revision shown at confirmation @storybook-visual", async ({ page, isMobile }) => {
  await page.goto("/iframe.html?id=clubs-invitation-batches--changed-list&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByRole("button", { name: "Delete list", exact: true }).click();
  await page.getByRole("button", { name: "Change list from another session" }).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByRole("alert")).toHaveText("List changed. Reload before saving.");
  await expect(page.getByLabel("Saved list").locator("option")).toHaveCount(2);
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({
      path: path.resolve(process.cwd(), "../../.cache/artifacts", `invitation-stale-list-${isMobile ? "mobile" : "desktop"}.png`),
      fullPage: true,
    });
  }
});

test("mixed-case identity invitation outcomes and cancellation retain stored IDs @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitations-workspace--mixed-case-people&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await expect(page.getByRole("list", { name: "Select recipients" }).getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  const review = page.getByRole("list", { name: "Reviewed recipients" });
  await expect(review.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await expect(review.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Confirm invitations", exact: true }).click();
  expect((await page.evaluate(() => JSON.parse(document.documentElement.dataset.invitationPayload!))).reviewedRecipients).toEqual([alice, bob]);
  await page.getByRole("button", { name: "Cancel unsent invitations", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Cancel unsent invitations", exact: true });
  await expect(confirmation.getByText("Nova", { exact: true })).toBeVisible();
  await expect(confirmation).toContainText(bob.toUpperCase());
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/bd4a-invitation-cancel-${test.info().project.name}.png`, fullPage: true });
  }
  await confirmation.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  expect((await page.evaluate(() => JSON.parse(document.documentElement.dataset.invitationCancel!))).batchId).toBe("batch-1");
});

test("recipient review deduplicates user IDs regardless of hex case @storybook-visual", async ({ page }) => {
  const mixedCase = "usr_AaAaAaAa-bBbB-cCcC-dDdD-eEeEeEeEeEeE";
  await page.goto("/iframe.html?id=clubs-invitation-batches--composer&viewMode=story");
  await page.getByLabel("VRChat user IDs").fill(`${mixedCase}\n${mixedCase.toLowerCase()}`);
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  const review = page.getByRole("region", { name: "Review invitations" });
  await expect(review).toContainText("Duplicates removed: 1");
  await expect(review.getByRole("listitem")).toHaveCount(1);
  await expect(review.getByRole("listitem")).toContainText(mixedCase.toLowerCase());
});

for (const skew of [-3600000, 3600000]) {
  test(`immediate invitation review with skew ${skew} @storybook-visual`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(Date.now() + skew));
    await page.goto(
      "/iframe.html?id=clubs-invitation-batches--composer&viewMode=story",
    );
    await page.getByLabel("Saved list").selectOption("list-one");
    await page
      .getByRole("button", { name: "Review invitations", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm invitations" }).click();
    await expect(page.getByTestId("queued-review")).toHaveText(
      "2 recipients · group · immediate",
    );
  });
}


test("identity review preserves exact targets while names resolve @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitations-workspace--owner&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  const rows = page.getByRole("list", { name: "Reviewed recipients" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.first().getByRole("link", { name: "Riley", exact: true })).toHaveAttribute("href", "/riley");
  await expect(rows.nth(1).getByText("Nova", { exact: true })).toBeVisible();
  await expect(rows.nth(1).getByRole("link", { name: "Nova", exact: true })).toHaveCount(0);
  await expect(rows.first()).toContainText(alice);
  const provider = rows.first().getByRole("link", { name: /VRChat profile/ });
  expect((await provider.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await rows.first().getByText("Details", { exact: true }).click();
  await expect(rows.first().locator("details")).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});


test("late names preserve invitation payload and clear on denied views @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitations-workspace--late-names&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  const review = page.getByRole("region", { name: "Review invitations" });
  await expect(review.getByRole("status")).toHaveText("Updating names \u00b7 2");
  await expect(review).toContainText(alice);
  await expect(review).toContainText(bob);
  await page.getByRole("button", { name: "Resolve names", exact: true }).click();
  await expect(review.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await expect(review.getByRole("status")).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke people access", exact: true }).click();
  await expect(review.getByRole("link", { name: "Riley", exact: true })).toHaveCount(0);
  await expect(review).toContainText(alice);
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  const payload = await page.evaluate(() => JSON.parse(document.documentElement.dataset.invitationPayload!));
  expect(payload.reviewedRecipients).toEqual([alice, bob]);
  expect(payload.destination).toEqual({ kind: "group" });
  expect(payload.schedule).toEqual({ kind: "immediate" });
  expect(payload.requestId).toEqual(expect.any(String));
});


test("recipient selection survives name updates and freezes only selected IDs @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitations-workspace--late-names&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  const selection = page.getByRole("list", { name: "Select recipients", exact: true });
  await expect(selection.getByRole("checkbox")).toHaveCount(2);
  await selection.getByRole("checkbox", { name: `Select recipient ${bob}`, exact: true }).uncheck();
  await page.getByRole("button", { name: "Resolve names", exact: true }).click();
  await expect(selection.getByRole("link", { name: "Riley", exact: true })).toBeVisible();
  await expect(selection.getByRole("checkbox", { name: `Select recipient ${bob}`, exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  const review = page.getByRole("region", { name: "Review invitations" });
  await expect(review.getByRole("listitem")).toHaveCount(1);
  await expect(review).toContainText(alice);
  await expect(review).not.toContainText(bob);
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/invitation-identity-selection-${test.info().project.name}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Confirm invitations" }).click();
  const payload = await page.evaluate(() => JSON.parse(document.documentElement.dataset.invitationPayload!));
  expect(payload.reviewedRecipients).toEqual([alice]);
});


test("cancelling a batch distinguishes effective and originally reviewed IDs @storybook-visual", async ({ page }) => {
  const effective = "usr_33333333-3333-3333-3333-333333333333";
  await page.goto("/iframe.html?id=clubs-invitations-workspace--remapped-recipient&viewMode=story");
  await page.getByLabel("Saved list").selectOption("list-one");
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await page.getByRole("button", { name: "Confirm invitations", exact: true }).click();
  await page.getByRole("button", { name: "Cancel unsent invitations", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Cancel unsent invitations", exact: true });
  await expect(confirmation.getByText("Nova", { exact: true })).toBeVisible();
  await expect(confirmation).toContainText(effective);
  await expect(confirmation).toContainText(`Originally reviewed: ${bob}`);
  await expect(confirmation).not.toContainText(alice);
  await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
});


test("batch cancellation distinguishes colliding missing-name references @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitations-workspace--late-names&viewMode=story");
  const first = "usr_00000000-0000-0000-0000-000000000001";
  const second = "usr_11111111-1111-1111-1111-111100000001";
  await page.getByLabel("VRChat user IDs").fill([alice, first, second].join("\n"));
  await page.getByRole("button", { name: "Review invitations", exact: true }).click();
  await page.getByRole("button", { name: "Confirm invitations", exact: true }).click();
  await page.getByRole("button", { name: "Cancel unsent invitations", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Cancel unsent invitations", exact: true });
  const names = await confirmation.locator("bdi").allTextContents();
  expect(names).toHaveLength(2);
  expect(new Set(names).size).toBe(2);
  await expect(confirmation).toContainText(first);
  await expect(confirmation).toContainText(second);
});


test("recipient previews settle once and review cannot freeze stale selection @storybook-visual", async ({ page }) => {
  await page.clock.install();
  await page.goto("/iframe.html?id=clubs-invitations-workspace--late-names&viewMode=story");
  const input = page.getByLabel("VRChat user IDs");
  await input.fill(alice);
  const review = page.getByRole("button", { name: "Review invitations", exact: true });
  await expect(review).toBeDisabled();
  await input.fill(`${alice}\n`);
  await input.fill(`${alice}\n${bob}`);
  expect(await page.evaluate(() => Number(document.documentElement.dataset.invitationPreviews ?? 0))).toBe(0);
  await page.clock.runFor(350);
  await expect(page.getByRole("list", { name: "Select recipients", exact: true }).getByRole("checkbox")).toHaveCount(2);
  expect(await page.evaluate(() => Number(document.documentElement.dataset.invitationPreviews))).toBe(1);
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.invitationPeopleRequests))).toBe(1);
  await page.getByRole("checkbox", { name: `Select recipient ${bob}`, exact: true }).uncheck();
  await page.getByRole("checkbox", { name: `Select recipient ${alice}`, exact: true }).uncheck();
  await expect(review).toBeDisabled();
  await input.fill(bob);
  await expect(review).toBeDisabled();
  await page.clock.runFor(350);
  await expect(review).toBeEnabled();
  await review.click();
  const confirmation = page.getByRole("region", { name: "Review invitations", exact: true });
  await expect(confirmation).toContainText(bob);
  await expect(confirmation).not.toContainText(alice);
});


test("failed recipient previews retry unchanged text and freeze only the latest settled IDs @storybook-visual", async ({ page }) => {
  await page.clock.install();
  await page.goto("/iframe.html?id=clubs-invitation-batches--preview-retry&viewMode=story");
  const input = page.getByLabel("VRChat user IDs");
  const review = page.getByRole("button", { name: "Review invitations", exact: true });
  await input.fill(alice);
  await page.clock.runFor(350);
  await expect(page.getByRole("alert")).toContainText("Unable to save invitations.");
  await expect(review).toBeDisabled();
  if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
    await page.screenshot({ path: `../../.cache/artifacts/invitation-preview-retry-${test.info().project.name}.png`, fullPage: true });
  }
  await page.clock.fastForward(5000);
  expect(await page.evaluate(() => Number(document.documentElement.dataset.composerPreviews))).toBe(1);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(review).toBeDisabled();
  await page.clock.runFor(350);
  await expect(review).toBeEnabled();
  await expect(input).toHaveValue(alice);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => Number(document.documentElement.dataset.composerPreviews))).toBe(2);
  await input.fill(bob);
  await expect(review).toBeDisabled();
  await page.clock.runFor(350);
  await review.click();
  const confirmation = page.getByRole("region", { name: "Review invitations", exact: true });
  await expect(confirmation).toContainText(bob);
  await expect(confirmation).not.toContainText(alice);
  await page.getByRole("button", { name: "Confirm invitations", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.composerReviewedIds!))).toEqual([bob]);
});

test("malformed recipient preview shows established validation without enabling review @storybook-visual", async ({ page }) => {
  await page.goto("/iframe.html?id=clubs-invitation-batches--composer&viewMode=story");
  await page.getByLabel("VRChat user IDs").fill("not-a-user-id");
  await expect(page.getByRole("alert")).toContainText("Enter valid VRChat user IDs.");
  await expect(page.getByRole("button", { name: "Review invitations", exact: true })).toBeDisabled();
  await page.getByLabel("VRChat user IDs").fill(alice);
  await expect(page.getByRole("button", { name: "Review invitations", exact: true })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
