import { expect, test } from "@playwright/test";

test("selected Discord message opens the shared editor, prepares once and can remove the default poster", async ({ page }, testInfo) => {
  await page.goto("/playwright/event-intake?source=discord");
  await expect(page.getByLabel("Operation", { exact: true })).toBeVisible();
  expect(await page.getByLabel("Operation", { exact: true }).evaluate(element => Boolean(element.closest("[data-ph-no-capture]")))).toBe(true);
  await expect(page.getByRole("textbox", { name: "Event title", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("fixture-personal-preparations"))).toBe("1");
  await page.getByRole("textbox", { name: "Event title", exact: true }).fill("My corrected event");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("discord-review.png"), fullPage: true });
  await page.getByRole("button", { name: "Import poster or text", exact: true }).click();
  await expect(page.getByAltText("Source poster")).toBeVisible();
  await page.getByRole("button", { name: "Remove poster", exact: true }).click();
  await expect(page.getByAltText("Source poster")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Event title", exact: true })).toHaveValue("My corrected event");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/\/events\/new\?draft=fixture-draft/);
  await page.goto("/playwright/event-intake?source=discord");
  await expect(page.getByLabel("Operation", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("fixture-personal-preparations"))).toBe("1");
});

for (const theme of ["light", "dark"]) test(`Discord review fits the ${theme} theme without horizontal overflow`, async ({ page }, testInfo) => {
  await page.addInitScript(value => localStorage.setItem("vrdex-theme", value), theme);
  await page.goto("/playwright/event-intake?source=discord");
  await expect(page.getByLabel("Operation", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`discord-review-${theme}.png`), fullPage: true });
});

test("multiple selected posters require a choice before the existing editor opens", async ({ page }, testInfo) => {
  await page.goto("/playwright/event-intake?source=discord-multiple");
  await expect(page.getByRole("region", { name: "Discord import" }).getByLabel("Poster", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("discord-poster-choice.png"), fullPage: true });
  await page.getByRole("region", { name: "Discord import" }).getByLabel("Poster", { exact: true }).selectOption("poster-2");
  await page.getByRole("region", { name: "Discord import" }).getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Operation", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-personal-preparation-input") ?? "{}").attachmentId)).toBe("poster-2");
});

test("owner denial retains update intent and does not invoke contribution publication", async ({ page }) => {
  await page.goto("/playwright/event-intake?source=discord");
  await page.getByLabel("Operation", { exact: true }).selectOption("update");
  await page.getByLabel("Existing event", { exact: true }).selectOption("fixture-existing");
  await expect(page.getByRole("textbox", { name: "Event title", exact: true })).toHaveValue("Existing harbor event");
  await page.getByRole("textbox", { name: "Description", exact: true }).fill("Updated event details");
  await page.evaluate(() => sessionStorage.setItem("fixture-owner-denied", "true"));
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fixture-owner-operation"))).not.toBeNull();
  await expect(page.getByLabel("Operation", { exact: true })).toHaveValue("update");
  expect(await page.evaluate(() => sessionStorage.getItem("fixture-published"))).toBeNull();
});

test("a failed multiple-poster download can retry another selected poster", async ({ page }) => {
  await page.goto("/playwright/event-intake?source=discord-multiple");
  await page.evaluate(() => sessionStorage.setItem("fixture-personal-fail-once", "true"));
  await page.getByRole("region", { name: "Discord import" }).getByLabel("Poster", { exact: true }).selectOption("poster-1");
  await page.getByRole("region", { name: "Discord import" }).getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Discord import" }).getByLabel("Poster", { exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Discord import" }).getByLabel("Poster", { exact: true }).selectOption("poster-2");
  await page.getByRole("region", { name: "Discord import" }).getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-personal-preparation-input") ?? "{}").attachmentId)).toBe("poster-2");
});

test("signed-out review preserves the draft return path and does not expose source text", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fixture-personal-signed-out", "true"));
  await page.goto("/playwright/event-intake?source=discord");
  const signIn = page.locator("main").getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toHaveAttribute("href", /returnTo=.*events.*new.*draft/);
  await expect(page.locator("main")).not.toContainText("JustIvy");
});


test("preparation waits for its returned version before mounting the shared editor", async ({ page }) => {
  await page.goto("/playwright/event-intake?source=discord-delayed");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fixture-personal-prepared"))).toBe("true");
  await expect(page.getByRole("textbox", { name: "Event title", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("release-personal-draft")));
  await expect(page.getByText("Harbor Sessions", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Event title", exact: true }).fill("Reviewed delayed draft");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-source-draft") ?? "{}").fields?.title)).toBe("Reviewed delayed draft");
});


test("retry disables editing until its prepared version reaches the editor", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fixture-personal-fail-once", "true"));
  await page.goto("/playwright/event-intake?source=discord-delayed");
  const title = page.getByRole("textbox", { name: "Event title", exact: true });
  await expect(title).toBeEnabled();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fixture-personal-prepared"))).toBe("true");
  await expect(title).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("release-personal-draft")));
  await expect(title).toBeEnabled();
  await title.fill("Reviewed retry");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-source-draft") ?? "{}").fields?.title)).toBe("Reviewed retry");
});


for (const foreign of [false, true]) test(`personal contribution survives resolution and navigates to ${foreign ? "another contributor existing event" : "its new event"}`, async ({ page }) => {
  if (foreign) await page.addInitScript(() => sessionStorage.setItem("fixture-publication-foreign", "true"));
  await page.goto("/playwright/event-intake?source=discord-contribution");
  await expect(page.getByRole("textbox", { name: "Event title", exact: true })).toHaveValue("Harbor Sessions");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Publish event", exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fixture-personal-resolved"))).toBe("true");
  await expect(page.locator("main").getByText("Unavailable", { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("release-personal-publication")));
  await expect(page).toHaveURL(/playwright-afterglow-social\/events\/playwright-afterglow-harbor-sessions/);
});


test("returning to New event restores the import instead of copying the update target", async ({ page }) => {
  await page.goto("/playwright/event-intake?source=discord");
  const title = page.getByRole("textbox", { name: "Event title", exact: true });
  await title.fill("Fresh import");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-source-draft") ?? "{}").fields?.title)).toBe("Fresh import");
  await page.getByLabel("Operation", { exact: true }).selectOption("update");
  await page.getByLabel("Existing event", { exact: true }).selectOption("fixture-existing");
  await expect(title).toHaveValue("Existing harbor event");
  await page.getByLabel("Operation", { exact: true }).selectOption("create");
  await expect(title).toHaveValue("Fresh import");
});


test("a failed extraction after poster adoption leaves a fresh editable draft", async ({ page }) => {
  await page.goto("/playwright/event-intake?source=discord-multiple");
  const controls = page.getByRole("region", { name: "Discord import" });
  await page.evaluate(() => sessionStorage.setItem("fixture-personal-fail-once", "true"));
  await controls.getByLabel("Poster", { exact: true }).selectOption("poster-1");
  await controls.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(controls.getByText("Unavailable", { exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("fixture-personal-fail-after-adoption", "true"));
  await controls.getByLabel("Poster", { exact: true }).selectOption("poster-2");
  await controls.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("fixture-personal-preparations"))).toBe("2");
  const title = page.getByRole("textbox", { name: "Event title", exact: true });
  await expect(title).toBeEnabled();
  await title.fill("Manual recovery");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-source-draft") ?? "{}").fields?.title)).toBe("Manual recovery");
  await page.getByRole("button", { name: "Import poster or text", exact: true }).click();
  await expect(page.getByAltText("Source poster")).toBeVisible();
});


test("lease expiry keeps an active local recovery disabled until it settles", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => sessionStorage.setItem("fixture-personal-fail-once", "true"));
  await page.goto("/playwright/event-intake?source=discord");
  const title = page.getByRole("textbox", { name: "Event title", exact: true });
  await expect(title).toBeEnabled();
  await page.evaluate(() => sessionStorage.setItem("fixture-personal-preparation-defer", "true"));
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Importing" })).toBeVisible();
  await page.clock.fastForward(1100);
  await expect(title).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("release-personal-preparation")));
  await expect(title).toBeEnabled();
  await title.fill("Recovered after lease expiry");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-source-draft") ?? "{}").fields?.title)).toBe("Recovered after lease expiry");
});

test("one timezone choice unlocks a dated Discord lineup without repeated warnings", async ({ page }, testInfo) => {
  await page.goto("/playwright/event-intake?source=discord-lineup");
  const lineup = page.getByRole("button", { name: "Lineup", exact: true });
  await lineup.click();
  const chooseTimezone = page.getByRole("button", { name: "Time zone", exact: true });
  const sourceTimezone = page.getByRole("button", { name: "Source time zone", exact: true });
  await expect(chooseTimezone).toHaveCount(1);
  await expect(page.getByText(/date_timezone_required/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("discord-lineup-timezone.png"), fullPage: true });
  await chooseTimezone.click();
  await sourceTimezone.click();
  await page.getByRole("combobox", { name: "Source time zone", exact: true }).fill("Eastern");
  await page.getByRole("option", { name: /America\/New York/ }).click();
  await page.getByRole("button", { name: "Accept Date", exact: true }).click();
  await chooseTimezone.click();
  await page.getByRole("combobox", { name: "Time zone", exact: true }).fill("Tokyo");
  await page.getByRole("option", { name: /Tokyo/ }).click();
  await expect(sourceTimezone).toContainText("Eastern");
  await lineup.click();
  await expect(page.getByText("Unresolved time", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept Lineup", exact: true })).toBeDisabled();
  await chooseTimezone.click();
  await sourceTimezone.click();
  await page.getByRole("combobox", { name: "Source time zone", exact: true }).fill("Tokyo");
  await page.getByRole("option", { name: /Tokyo/ }).click();
  await lineup.click();
  await page.getByRole("button", { name: "Accept Lineup", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accept Lineup", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accept Time zone", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-source-draft") ?? "{}").fields?.timezone)).toBe("Asia/Tokyo");
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("fixture-source-draft") ?? "{}").fields?.lineup?.map((row: { start?: { dayOffset?: number } }) => row.start?.dayOffset))).toEqual([0, 1]);
});
