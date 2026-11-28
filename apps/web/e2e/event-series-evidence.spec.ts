import { expect, test, type Locator, type Page } from "@playwright/test";

import { prepareVisualPage, waitForVisualReady } from "./public-routes";

test.beforeEach(async ({ page }) => { await prepareVisualPage(page); });

async function setTheme(page: Page, value: "light" | "dark") {
  await page.evaluate(next => {
    localStorage.setItem("vrdex-theme", next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  }, value);
  await waitForVisualReady(page);
}

async function capture(page: Page, path: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path, animations: "disabled", caret: "hide", fullPage: true, scale: "css" });
}

const seriesEditorPath = "/playwright/event-editor/edit?series=1&scope=series";
const seriesUpdates = (page: Page) => page.evaluate(() => (window as unknown as { seriesUpdates?: unknown[] }).seriesUpdates ?? []);

// Input and clicks that land before hydration are lost or misread, and the dev server hydrates late under load.
async function hydrated(locator: Locator) {
  await expect.poll(() => locator.evaluate(node => Object.keys(node).some(key => key.startsWith("__reactFiber")))).toBe(true);
  return locator;
}

for (const color of ["light", "dark"] as const) test(`series editor evidence ${color} @fixture`, async ({ page }, info) => {
  await page.goto("/playwright/event-editor"); await setTheme(page, color);
  const repeats = page.getByLabel("Repeats", { exact: true });
  await expect(repeats.getByRole("option")).toHaveText(["Does not repeat", "Weekly", "Every two weeks", "Monthly"]);
  await expect(page.getByLabel("Ends", { exact: true })).toHaveCount(0);
  await repeats.selectOption({ label: "Every two weeks" });
  await expect(page.getByLabel("Ends", { exact: true })).toBeVisible();
  await capture(page, info.outputPath(`series-repeats-${color}.png`));

  await page.goto("/playwright/event-editor/edit?series=1"); await setTheme(page, color);
  await expect(page.getByText("Part of a series.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit this night", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit the series", exact: true })).toHaveAttribute("href", "/afterglow/events/harbor-sessions-7k2m4q/edit?scope=series");
  await expect(page.getByRole("button", { name: "Reset Description to series", exact: true })).toHaveText("Reset to series");
  await expect(page.getByLabel("Repeats", { exact: true })).toHaveCount(0);
  await capture(page, info.outputPath(`series-note-${color}.png`));

  await page.goto(seriesEditorPath); await setTheme(page, color);
  await expect(page.getByLabel("Starts", { exact: true })).toHaveValue("18:00");
  await expect(page.getByLabel("Repeats", { exact: true }).getByRole("option")).toHaveText(["Weekly", "Every two weeks", "Monthly"]);
  await capture(page, info.outputPath(`series-editor-${color}.png`));

  await page.goto("/playwright-afterglow-social/series/playwright-afterglow-series"); await setTheme(page, color);
  await expect(page.getByRole("heading", { name: "Upcoming nights", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add to calendar", exact: true })).toHaveAttribute("href", "/playwright-afterglow-social/series/playwright-afterglow-series/calendar.ics");
  await capture(page, info.outputPath(`series-page-${color}.png`));
});

test("an empty public series shows its schedule status without a download action @fixture", async ({ page, request }) => {
  const route = "/playwright-afterglow-social/series/playwright-afterglow-series-empty";
  expect((await page.goto(route))?.status()).toBe(200);

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Upcoming nights", exact: true })).toBeVisible();
  await expect(main.getByText("None scheduled", { exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "Add to calendar", exact: true })).toHaveCount(0);

  const calendar = await request.get(route + "/calendar.ics");
  expect(calendar.status()).toBe(200);
  expect(calendar.headers()["content-type"]).toContain("text/calendar");
  expect(await calendar.text()).not.toContain("BEGIN:VEVENT");
});

for (const suffix of ["", "-empty"]) {
  test(`a public series with ${suffix ? "no" : "upcoming"} nights links its host @fixture`, async ({ page, isMobile }) => {
    const community = "/playwright-afterglow-social";
    const series = `${community}/series/playwright-afterglow-series${suffix}`;
    if (isMobile) await page.setViewportSize({ width: 320, height: 720 });
    expect((await page.goto(series))?.status()).toBe(200);

    const header = page.getByRole("main").locator("header").filter({ has: page.getByRole("heading", { level: 1 }) });
    const host = header.getByRole("link", { name: "Afterglow Social", exact: true });
    await expect(host).toHaveAttribute("href", community);
    await expect(host).toBeInViewport({ ratio: 1 });

    if (isMobile) await host.tap();
    else await host.press("Enter");

    await expect(page).toHaveURL(community);
    await expect(page.getByRole("heading", { name: "Afterglow Social", level: 1, exact: true })).toBeVisible();
  });
}

test("public series occurrences have distinct destinations and dates @fixture", async ({ page, request }) => {
  const route = "/playwright-afterglow-social/series/playwright-afterglow-series";
  await page.setViewportSize({ width: 320, height: 720 });
  expect((await page.goto(route))?.status()).toBe(200);
  const main = page.getByRole("main");
  const cards = main.getByRole("article");
  await expect(cards).toHaveCount(4);
  await expect(main.getByText("Late-night harbor club session with house, trance, and warm social energy.", { exact: true })).toHaveCount(1);
  await expect(cards.last().getByText("Extended guest set with DJ Aurora.", { exact: true })).toBeVisible();
  const destinations = new Set<string>();
  const days = new Set<string>();
  for (const card of await cards.all()) {
    const link = card.getByRole("heading", { level: 3 }).getByRole("link");
    const date = await card.locator("time").first().innerText();
    const title = await link.innerText();
    await expect(link).toHaveAccessibleName(title.trim() + " " + date.trim());
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/playwright-afterglow-social\/events\//);
    destinations.add(href!);
    days.add(date);
  }
  expect(destinations.size).toBe(4);
  expect(days.size).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  const calendar = await request.get(route + "/calendar.ics");
  expect(calendar.ok()).toBe(true);
  const entries = (await calendar.text()).split("BEGIN:VEVENT").slice(1);
  expect(entries).toHaveLength(4);
  for (const entry of entries) {
    const date = entry.match(/^DTSTART:(\d{8})T020000Z\r?$/m)?.[1];
    expect(date).toBeTruthy();
    expect(entry).toContain("DTEND:" + date + "T050000Z");
  }
  expect(calendar.headers()["content-disposition"]).toBe('attachment; filename="playwright-afterglow-series.ics"');
  const dates = ["2026-06-14", "2026-06-21", "2026-06-28", "2026-07-05"];
  for (const [index, href] of [...destinations].entries()) {
    const attachment = await request.get(href + "/calendar.ics");
    expect(attachment.ok()).toBe(true);
    expect(attachment.headers()["content-disposition"]).toBe(
      `attachment; filename="Afterglow-Harbor-Sessions-${dates[index]}.ics"`,
    );
    expect((await page.goto(href))?.status()).toBe(200);
    await expect(main.getByRole("link", { name: "Upcoming nights", exact: true })).toHaveAttribute("href", route);
  }
});

test("an occurrence links its series beside the event date @fixture", async ({ page, isMobile }) => {
  const occurrence = "/playwright-afterglow-social/events/playwright-afterglow-series-night";
  const series = "/playwright-afterglow-social/series/playwright-afterglow-series";
  if (isMobile) await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(occurrence);

  const actions = page.getByRole("navigation", { name: "Event actions", exact: true });
  const hero = page.getByRole("region", { name: "Afterglow Harbor Sessions", exact: true });
  const upcoming = hero.getByRole("link", { name: "Upcoming nights", exact: true });
  await expect(upcoming).toHaveAttribute("href", series);
  await expect(upcoming.locator("svg")).toBeVisible();
  await expect(actions.getByRole("link", { name: "Upcoming nights", exact: true })).toHaveCount(0);
  await expect(upcoming).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("link", { name: "Upcoming nights", exact: true })).toHaveCount(1);
  await expect(actions.getByRole("link", { name: "Media links", exact: true })).toHaveAttribute("href", "#event-links");
  await expect(page.locator("#event-links")).toBeVisible();

  if (isMobile) await upcoming.tap();
  else await upcoming.press("Enter");
  await expect(page).toHaveURL(series, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Upcoming nights", exact: true })).toBeVisible();

  const firstNight = page.locator(`main a[href="${occurrence}"]`);
  if (isMobile) await firstNight.tap();
  else await firstNight.press("Enter");
  await expect(page).toHaveURL(occurrence);
  await expect(upcoming).toBeVisible();
});

test("a series-only occurrence has no empty links section or jump @fixture", async ({ page }) => {
  await page.goto("/playwright-afterglow-social/events/playwright-afterglow-series-only");
  const actions = page.getByRole("navigation", { name: "Event actions", exact: true });
  const hero = page.getByRole("region", { name: "Afterglow Harbor Sessions", exact: true });
  await expect(hero.getByRole("link", { name: "Upcoming nights", exact: true })).toBeVisible();
  await expect(actions.locator('a[href="#event-links"]')).toHaveCount(0);
  await expect(page.locator("#event-links")).toHaveCount(0);
});

test("the series editor saves only what changed @fixture", async ({ page }) => {
  await page.goto(seriesEditorPath);
  await (await hydrated(page.getByLabel("Description", { exact: true }))).fill("Now fortnightly.");
  await page.getByLabel("Repeats", { exact: true }).selectOption({ label: "Every two weeks" });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => seriesUpdates(page)).toEqual([{
    seriesId: "series-editor-preview",
    summary: "Now fortnightly.",
    rule: { frequency: "biweekly", weekday: 6, startTime: "18:00", doorsTime: "17:30" },
  }]);
});

test("changing Starts moves doors and end with it @fixture", async ({ page }) => {
  await page.goto(seriesEditorPath);
  await (await hydrated(page.getByLabel("Starts", { exact: true }))).fill("19:30");
  await expect(page.getByLabel("Doors open", { exact: true })).toHaveValue("19:00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => seriesUpdates(page)).toEqual([{
    seriesId: "series-editor-preview",
    rule: { frequency: "weekly", weekday: 6, startTime: "19:30", doorsTime: "19:00" },
  }]);
});

test("the series editor saves media links and watch settings @fixture", async ({ page }) => {
  await page.goto(seriesEditorPath);
  await (await hydrated(page.locator("textarea[name=mediaLinks]"))).fill("watch | Harbor stream | https://example.com/live | open");
  await page.getByRole("checkbox", { name: /^Promote a watch surface during the event window/ }).check();
  await page.getByLabel("Watch mode", { exact: true }).selectOption({ label: "Performer sequence" });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => seriesUpdates(page)).toEqual([{
    seriesId: "series-editor-preview",
    mediaLinks: [{ type: "watch", label: "Harbor stream", url: "https://example.com/live", presentation: "open" }],
    watchMode: "performer_sequence",
    watchSurfaceEnabled: true,
  }]);
});

test("a failed series save keeps the form and hides the server message @fixture", async ({ page }) => {
  await page.goto(`${seriesEditorPath}&fail=1`);
  await (await hydrated(page.getByLabel("Event title", { exact: true }))).fill("Harbor Nights");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Backend error - please try again later", { exact: true })).toBeVisible();
  await expect(page.getByText("Field is not overridden on this night.")).toHaveCount(0);
  await expect(page.getByLabel("Event title", { exact: true })).toHaveValue("Harbor Nights");
  await expect(page).toHaveURL(/fail=1/);
});

test("a failed reset hides the server message @fixture", async ({ page }) => {
  await page.goto("/playwright/event-editor/edit?series=1&fail=1");
  await (await hydrated(page.getByRole("button", { name: "Reset Description to series", exact: true }))).click();
  await expect(page.getByText("Backend error - please try again later", { exact: true })).toBeVisible();
  await expect(page.getByText("Field is not overridden on this night.")).toHaveCount(0);
});

test("resetting with unsaved edits asks first @fixture", async ({ page }) => {
  await page.goto("/playwright/event-editor/edit?series=1");
  const description = await hydrated(page.getByLabel("Description", { exact: true }));
  await description.fill("Unsaved");
  const prompts: string[] = [];
  page.once("dialog", dialog => { prompts.push(dialog.message()); void dialog.dismiss(); });
  await page.getByRole("button", { name: "Reset Description to series", exact: true }).click();
  expect(prompts).toEqual(["Leave without saving?"]);
  await expect(description).toHaveValue("Unsaved");
});

test("a past night keeps the series link and drops its resets @fixture", async ({ page }) => {
  await page.goto("/playwright/event-editor/edit?series=1&past=1");
  await expect(page.getByText("Part of a series.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit the series", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset Description to series", exact: true })).toHaveCount(0);
});

test("an ended series offers only this night @fixture", async ({ page }) => {
  await page.goto("/playwright/event-editor/edit?series=1&state=ended");
  await expect(page.getByText("Part of a series.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit this night", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit the series", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset Description to series", exact: true })).toHaveCount(0);
});

for (const variant of ["state=ended", "flag=off"]) test(`scope=series falls back to the night editor with ${variant} @fixture`, async ({ page }) => {
  await page.goto(`${seriesEditorPath}&${variant}`);
  await expect(page.getByRole("navigation", { name: "Event editor" })).toBeVisible();
  await expect(page.getByText("Part of a series.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Repeats", { exact: true })).toHaveCount(0);
});

async function fillRepeatingEvent(page: Page, endsOn: string) {
  await (await hydrated(page.getByLabel("Event title", { exact: true }))).fill("Harbor Night");
  await page.getByLabel("Starts", { exact: true }).fill("2027-10-15T20:00");
  await page.getByLabel("Repeats", { exact: true }).selectOption({ label: "Weekly" });
  await page.getByLabel("Ends", { exact: true }).fill(endsOn);
}

async function publish(page: Page) {
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: /^(Publish event|Save changes)$/ }).click();
}

const editorMutations = (page: Page) => page.evaluate(() => (window as unknown as { editorMutations?: { name: string; args: unknown }[] }).editorMutations ?? []);
const seriesCreate = { eventSlug: "harbor-night", repeat: { frequency: "weekly", endsOn: "2027-12-31" } };

test("choosing a repeat creates one series on publish @fixture", async ({ page }) => {
  await page.goto("/playwright/event-editor?connected=1");
  await fillRepeatingEvent(page, "2027-12-31");
  await publish(page);
  await expect.poll(async () => (await editorMutations(page)).map(mutation => mutation.name)).toEqual(["events:createCommunityEvent", "eventSeries:create"]);
  expect((await editorMutations(page))[1]!.args).toEqual(seriesCreate);
});

test("a rejected series create retries without a second create of the event @fixture", async ({ page }) => {
  await page.goto("/playwright/event-editor?connected=1&fail=1");
  await fillRepeatingEvent(page, "2027-12-31");
  await publish(page);
  await expect(page.getByText("Backend error - please try again later", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/connected=1/);
  await page.getByRole("button", { name: /^(Publish event|Save changes)$/ }).click();
  await expect.poll(async () => (await editorMutations(page)).map(mutation => mutation.name)).toEqual([
    "events:createCommunityEvent", "eventSeries:create", "events:updateCommunityEvent", "eventSeries:create",
  ]);
  expect((await editorMutations(page))[3]!.args).toEqual(seriesCreate);
});

test("an Ends date before the start blocks publish @fixture", async ({ page }) => {
  await page.goto("/playwright/event-editor?connected=1");
  await fillRepeatingEvent(page, "2027-10-14");
  await publish(page);
  const ends = page.getByLabel("Ends", { exact: true });
  await expect(ends).toBeVisible();
  await expect(ends).toHaveJSProperty("validity.rangeUnderflow", true);
  expect(await editorMutations(page)).toEqual([]);
});

test("an Ends date before the series start blocks a series save @fixture", async ({ page }) => {
  await page.goto(seriesEditorPath);
  await (await hydrated(page.getByLabel("Ends", { exact: true }))).fill("2099-09-01");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByLabel("Ends", { exact: true })).toHaveJSProperty("validity.rangeUnderflow", true);
  expect(await seriesUpdates(page)).toEqual([]);
});

test("Edit this night moves focus into the form @fixture", async ({ page }) => {
  await page.goto("/playwright/event-editor/edit?series=1");
  await (await hydrated(page.getByRole("link", { name: "Edit this night", exact: true }))).click();
  await expect(page.getByLabel("Event title", { exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\/playwright\/event-editor\/edit\?series=1$/);
});
