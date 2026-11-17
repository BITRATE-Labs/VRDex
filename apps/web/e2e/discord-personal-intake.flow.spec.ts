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
  await expect(page.getByLabel("Poster", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("discord-poster-choice.png"), fullPage: true });
  await page.getByLabel("Poster", { exact: true }).selectOption("poster-2");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
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

test("signed-out review preserves the draft return path and does not expose source text", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fixture-personal-signed-out", "true"));
  await page.goto("/playwright/event-intake?source=discord");
  const signIn = page.locator("main").getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toHaveAttribute("href", /returnTo=.*events.*new.*draft/);
  await expect(page.locator("main")).not.toContainText("JustIvy");
});
