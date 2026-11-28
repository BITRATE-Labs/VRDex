import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { openSiteMenu, toggleSiteTheme } from "./flow-navigation";
import { expectHomePage, prepareVisualPage, waitForVisualReady } from "./public-routes";
import { test, waitForPublicSearchHydration } from "./public-search-fixture";

test("approved wordmark is exact and visible on Home and both search shells @flow @fixture", async ({ page, request }) => {
  const canonical = await readFile("../../docs/brand/wordmark/vrdex-wordmark.svg");
  const asset = await request.get("/brand/vrdex-wordmark.svg");
  await expect(asset).toBeOK();
  expect(await asset.body()).toEqual(canonical);
  const lightAsset = await request.get("/brand/vrdex-wordmark-light.svg");
  await expect(lightAsset).toBeOK();
  expect(await lightAsset.text()).toContain('fill="#547EAE"');
  const license = await request.get("/brand/LICENSE-OpenSans.txt");
  await expect(license).toBeOK();
  expect(await license.body()).toEqual(await readFile("../../docs/brand/wordmark/LICENSE-OpenSans.txt"));
  for (const route of ["/", "/search?q=BASICBIT", "/search?q=BASICBIT&view=dj"]) {
    await page.goto(route);
    const wordmark = page.getByRole("navigation").first().getByRole("img", { name: "VRDex", exact: true });
    await expect(wordmark).toBeVisible();
    const quickSearch = page.getByRole("banner").getByRole("button", { name: "Search", exact: true });
    if (route === "/search?q=BASICBIT") {
      await expect(quickSearch).toBeHidden();
    } else {
      await expect(quickSearch).toBeVisible();
    }
    const dark = await page.locator("html").getAttribute("data-theme") === "dark";
    await expect(wordmark).toHaveAttribute("src", dark ? "/brand/vrdex-wordmark.svg" : "/brand/vrdex-wordmark-light.svg");
    const box = await wordmark.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(128);
    expect(box!.width / box!.height).toBeCloseTo(469.002 / 132, 2);
    const explanation = page.getByText("Search across public people, communities, worlds, and events.", { exact: true });
    await expect(explanation).toHaveCount(0);
    if (route.includes("view=dj")) {
      await expect(page.getByRole("heading", { name: "DJ links", exact: true })).toBeVisible();
    }
    await toggleSiteTheme(page);
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveAttribute("src", dark ? "/brand/vrdex-wordmark-light.svg" : "/brand/vrdex-wordmark.svg");
    await expect(wordmark.locator("..")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await wordmark.locator("..").click();
    await expect(page).toHaveURL((url) => url.pathname === "/" && !url.search);
  }
  await page.goto("/discovery");
  const discoveryBrand = page.getByRole("navigation").first().getByRole("link", { name: "VRDex", exact: true });
  await expect(discoveryBrand).toHaveAttribute("href", "/");
  await expect(discoveryBrand.getByRole("img", { name: "VRDex", exact: true })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: "Search", exact: true })).toBeVisible();
});

test("new Home submissions and old root bookmarks retain distinct destinations @flow @fixture", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await expectHomePage(page);
  const input = page.getByRole("combobox", { name: /Search/i });
  await waitForPublicSearchHydration(page);
  const submit = page.getByRole("main").getByRole("button", { name: "Search VRDex", exact: true });
  await expect(submit.locator("svg")).toBeVisible();
  const [inputBounds, submitBounds] = await Promise.all([input.boundingBox(), submit.boundingBox()]);
  expect(Math.abs(inputBounds!.y - submitBounds!.y)).toBeLessThanOrEqual(1);
  const expectedSize = isMobile ? 44 : 56;
  expect(submitBounds).toMatchObject({ width: expectedSize, height: expectedSize });
  expect(inputBounds!.height).toBeGreaterThanOrEqual(expectedSize);
  await input.fill("  BASICBIT  ");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=BASICBIT$/, { timeout: 15_000 });
  await expect(publicResultRow(page, "/basicbit")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Search view" })).toHaveCount(0);
  await page.goto("/?q=%20BASICBIT%20");
  await expect(page).toHaveURL(/\/search\?q=BASICBIT&view=dj$/);
  await expect(page.getByLabel("DJ name")).toHaveValue("BASICBIT");
  await expect(page.getByRole("link", { name: "Website: basicbit.net", exact: true })).toBeVisible();
});

test("whitespace root query keeps Home and discovery reachable @flow @fixture", async ({ page }) => {
  await page.goto("/?q=%20%20%20");
  await expectHomePage(page);
  await expect(page.getByRole("combobox", { name: /Search/i })).toHaveValue("");
  await expect(page.getByRole("heading", { name: /My night|Upcoming events|Favorites|Timeline/i })).toHaveCount(0);
  await openSiteMenu(page);
  await page.getByRole("banner").getByRole("link", { name: "Discovery", exact: true }).click();
  await expect(page).toHaveURL(/\/discovery$/);
  await expect(page.getByRole("heading", { name: "Discover VR", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Search VRDex", exact: true })).toHaveAttribute("placeholder", "Search VRDex");
});

test("Home search, filters, refresh and history keep URL and results aligned @flow @fixture", async ({ page }) => {
  await page.goto("/");
  await waitForPublicSearchHydration(page);
  const input = page.getByRole("combobox", { name: /Search/i });
  await input.fill("Afterglow");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Afterglow$/);
  await expect(publicResultRow(page, "/playwright-afterglow-social")).toBeVisible();
  await expect(publicResultRow(page, "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions")).toBeVisible();
  await page.getByRole("link", { name: "Communities", exact: true }).click();
  const assertCommunityState = async () => {
    await expect(page).toHaveURL(/\/search\?q=Afterglow&type=community$/);
    await expect(input).toHaveValue("Afterglow");
    await expect(page.getByRole("link", { name: "Communities", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(publicResultRow(page, "/playwright-afterglow-social")).toBeVisible();
    await expect(publicResultRow(page, "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions")).toHaveCount(0);
  };
  await assertCommunityState();
  await page.reload();
  await waitForPublicSearchHydration(page);
  await assertCommunityState();
  await page.goBack();
  await expect(page).toHaveURL(/\/search\?q=Afterglow$/);
  await expect(input).toHaveValue("Afterglow");
  await expect(page.getByRole("link", { name: "All", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(publicResultRow(page, "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions")).toBeVisible();
  await page.goForward();
  await assertCommunityState();
});

test("Search identifies the applied query when the draft differs @flow @fixture", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/search?q=Afterglow");
  await waitForPublicSearchHydration(page);
  const input = page.getByRole("main").getByRole("combobox", { name: "Search VRDex", exact: true });
  const results = page.getByRole("region", { name: "Search results" });
  const caption = results.locator("#search-results-query");
  const timeout = { timeout: 15_000 };

  await expect(results).toHaveAccessibleDescription("Results for Afterglow");
  await expect(caption).toHaveCSS("position", "absolute");
  await input.fill("  Afterglow  ");
  await expect(caption).toHaveCSS("position", "absolute");

  await input.fill("BASICBIT");
  await input.press("Escape");
  await expect(caption).toHaveCSS("position", "static");
  await results.getByRole("link", { name: "Communities", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=Afterglow&type=community$/, timeout);
  await expect(input).toHaveValue("BASICBIT");
  await expect(caption).toHaveText("Results for Afterglow");
  await expect(caption).toHaveCSS("position", "static");
  await expect(publicResultRow(page, "/playwright-afterglow-social")).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "Search VRDex", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=BASICBIT&type=community$/, timeout);
  await expect(results).toHaveAccessibleDescription("Results for BASICBIT");
  await expect(caption).toHaveCSS("position", "absolute");
});

test("Search recovers from empty Events with the same query and preserves history @flow @fixture", async ({ page }) => {
  await page.goto("/search");
  await waitForPublicSearchHydration(page);
  const main = page.getByRole("main");
  const input = main.getByRole("combobox", { name: "Search VRDex", exact: true });
  await expect(main.getByRole("heading", { level: 1, name: "Search", exact: true })).toBeVisible();
  await expect(input).toHaveAttribute("placeholder", "Search VRDex");
  await input.fill("DJ");
  await main.getByRole("button", { name: "Search VRDex", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=DJ$/);
  await expect(main.getByRole("heading", { level: 1, name: "Search results", exact: true })).toBeVisible();
  const match = publicResultRow(page, "/basicbit");
  await expect(match).toBeVisible();

  const filters = page.getByRole("navigation", { name: "Entity type" });
  const events = filters.getByRole("link", { name: "Events", exact: true });
  await events.click();
  await expect(page).toHaveURL(/\/search\?q=DJ&type=event$/);
  await expect(input).toHaveValue("DJ");
  await expect(events).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No events", { exact: true })).toBeVisible();
  await expect(match).toHaveCount(0);
  const recover = page.getByRole("link", { name: "Search all", exact: true });
  await expect(recover).toHaveAttribute("href", "/search?q=DJ");
  await expect(page.getByRole("link", { name: "Add event", exact: true })).toHaveAttribute("href", "/events/new");
  await recover.click();
  await expect(page).toHaveURL(/\/search\?q=DJ$/);
  await expect(input).toHaveValue("DJ");
  await expect(filters.getByRole("link", { name: "All", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(match).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/search\?q=DJ&type=event$/);
  await expect(input).toHaveValue("DJ");
  await expect(recover).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`Search preserves a long unbroken no-match query at 320px in ${theme} @flow @fixture`, async ({ page }) => {
    const query = `VRDexNoMatch${"W".repeat(35)}`;
    await page.setViewportSize({ width: 320, height: 800 });
    await page.addInitScript((value) => localStorage.setItem("vrdex-theme", value), theme);
    await page.goto(`/search?q=${query}&source=fixture`);

    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: /^Results for/ })).toHaveCount(0);
    await expect(main.getByRole("heading", { level: 1, name: "Search results" })).toBeVisible();
    await expect(main.getByRole("region", { name: "Search results" })).toHaveAccessibleDescription(`Results for ${query}`);
    const input = main.getByRole("combobox", { name: "Search VRDex", exact: true });
    const submit = main.getByRole("button", { name: "Search VRDex", exact: true });
    await expect(input).toHaveValue(query);
    await expect(submit).toBeVisible();
    const fieldBounds = (await input.boundingBox())!;
    const submitBounds = (await submit.boundingBox())!;
    expect(submitBounds.x).toBeGreaterThan(fieldBounds.x + fieldBounds.width);
    expect(submitBounds.y).toBeLessThan(fieldBounds.y + fieldBounds.height);
    expect(Math.min(submitBounds.width, submitBounds.height)).toBeGreaterThanOrEqual(44);
    const filters = main.getByRole("navigation", { name: "Entity type" }).getByRole("link");
    await expect(filters).toHaveCount(5);
    const filterBounds = [];
    for (const link of await filters.all()) {
      const bounds = (await link.boundingBox())!;
      expect(Math.min(bounds.width, bounds.height)).toBeGreaterThanOrEqual(44);
      filterBounds.push(bounds);
    }
    expect(Math.max(...filterBounds.map(({ y }) => y))).toBe(Math.min(...filterBounds.map(({ y }) => y)));
    await expect(page.getByText("No public results matched that search yet.", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    const edit = main.getByRole("link", { name: "Edit search", exact: true });
    await expect(edit).toHaveAttribute("href", "#standard-search-query");
    const hint = main.getByText("Try a community name, DJ alias, world name, event title, genre, or scene term.", { exact: true });
    const editBounds = (await edit.boundingBox())!;
    expect(Math.min(editBounds.width, editBounds.height)).toBeGreaterThanOrEqual(44);
    const hintBounds = (await hint.boundingBox())!;
    expect(editBounds.y).toBeGreaterThan(hintBounds.y + hintBounds.height);
    expect(editBounds.x).toBe(hintBounds.x);
    await waitForPublicSearchHydration(page);
    const originalUrl = page.url();
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(query);
    const selection = await input.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd]);
    expect(selection).toEqual([0, query.length]);
    await expect(page).toHaveURL(originalUrl);
  });
}

test("Edit search reveals and replaces a no-match query at enlarged phone text size @flow @fixture", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  const query = "VRDexEditSearchNoMatch7831";
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`/search?q=${query}`);
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await waitForPublicSearchHydration(page);
  const main = page.getByRole("main");
  const edit = main.getByRole("link", { name: "Edit search", exact: true });
  const input = main.getByRole("combobox", { name: "Search VRDex", exact: true });
  const submit = main.getByRole("button", { name: "Search VRDex", exact: true });
  const header = page.locator("[data-site-header]");
  await header.evaluate((element: HTMLElement) => {
    Object.assign(element.style, { height: "65px", overflow: "hidden", transformOrigin: "top" });
  });
  await expect(edit).toHaveAttribute("href", "#standard-search-query");
  await edit.tap();
  await expect(input).toBeFocused();
  await expect.poll(() => input.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(65);
  // Grow the header's visual obstruction after reveal, without shifting the field's document position.
  await header.evaluate((element: HTMLElement) => {
    element.style.transform = `scaleY(${117 / 65})`;
  });
  await expect.poll(() => input.evaluate((element: HTMLInputElement) => {
    const { left, top, bottom } = element.getBoundingClientRect();
    const headerBottom = document.querySelector("[data-site-header]")?.getBoundingClientRect().bottom ?? 0;
    return top >= headerBottom && bottom <= window.innerHeight
      && [top + 6, bottom - 6].every((y) => document.elementFromPoint(left + 12, y) === element)
      && element.selectionStart === 0 && element.selectionEnd === element.value.length;
  })).toBe(true);
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === query && !url.hash);

  await page.keyboard.insertText("DJ Aurora");
  await expect(input).toHaveValue("DJ Aurora");
  await expect.poll(() => input.evaluate((element: HTMLInputElement) => {
    const css = getComputedStyle(element);
    const available = element.clientWidth - parseFloat(css.paddingInlineStart) - parseFloat(css.paddingInlineEnd);
    const canvas = document.createElement("canvas").getContext("2d");
    if (!canvas) return false;
    canvas.font = css.font;
    return available >= canvas.measureText(element.value).width;
  })).toBe(true);
  const suggestion = page.getByRole("option", { name: /DJ Aurora/ }).first();
  await expect(suggestion).toBeVisible();
  await expect.poll(async () => {
    const [option, button] = await Promise.all([suggestion.boundingBox(), submit.boundingBox()]);
    return Boolean(option && button && option.y >= button.y + button.height);
  }).toBe(true);
  await submit.tap();
  await expect(page).toHaveURL((url) => url.pathname === "/search" && url.searchParams.get("q") === "DJ Aurora");
  const result = main.getByRole("link", { name: /DJ Aurora/ }).first();
  await expect(result).toHaveAttribute("href", "/playwright-dj-aurora");
  await result.tap();
  await expect(page).toHaveURL("/playwright-dj-aurora");
});

test("Search reports a failed fetch without claiming there were no matches @flow @fixture", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "Uses the local Search outage fixture.");
  const query = "playwright-search-unavailable";
  const path = `/search?q=${query}&type=community`;
  await page.goto(path);

  const results = page.getByRole("region", { name: "Search results" });
  const outage = results.getByRole("status").filter({ hasText: "Search data is temporarily unavailable." });
  await expect(outage).toBeVisible();
  await expect(results.getByRole("link", { name: "Search all", exact: true })).toHaveCount(0);
  await expect(results.getByRole("link", { name: "Edit search", exact: true })).toHaveCount(0);
  await expect(results.getByText("No public results matched that search yet.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /Search/i })).toHaveValue(query);
  const filters = results.getByRole("navigation", { name: "Entity type" });
  await expect(filters.getByRole("link")).toHaveCount(5);
  await expect(filters.getByRole("link", { name: "Communities" })).toHaveAttribute("aria-current", "page");
  const retry = results.getByRole("link", { name: "Retry", exact: true });
  await expect(retry).toHaveAttribute("href", path);
  await Promise.all([
    page.waitForRequest((request) => request.isNavigationRequest() && request.url() === new URL(path, page.url()).href),
    retry.click(),
  ]);
  await expect(outage).toBeVisible();
});

for (const destination of [
  { query: "BASICBIT", name: /BASICBIT/, path: "/basicbit" },
  { query: "Afterglow Social", name: /Afterglow Social/, path: "/playwright-afterglow-social" },
  { query: "Afterglow Harbor Sessions", name: /Afterglow Harbor Sessions/, path: "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions" },
  { query: "Neon Harbor", name: /Neon Harbor/, path: "/playwright-neon-harbor" },
]) {
  test(`Home preview opens canonical ${destination.path} @flow @fixture`, async ({ page, isMobile }) => {
    await page.goto("/");
    await page.getByRole("combobox", { name: /Search/i }).fill(destination.query);
    const option = page.getByRole("option", { name: destination.name }).first();
    await expect(option).toBeVisible();
    // The first profile navigation includes the local server's route compilation.
    await Promise.all([
      page.waitForURL((url) => url.pathname === destination.path && !url.search, { timeout: 15_000 }),
      isMobile ? option.tap() : option.click(),
    ]);
    await expect(page).toHaveURL((url) => url.pathname === destination.path && !url.search);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

test("Home rest and five-option preview stay within the viewport @flow @fixture", async ({ page, createSearchProfiles }, info) => {
  const { query } = await createSearchProfiles(8);
  await prepareVisualPage(page);
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
  await page.goto("/");
  await expectHomePage(page);
  await waitForVisualReady(page);
  await page.screenshot({ path: info.outputPath("home-rest.png"), fullPage: true });
  const heading = page.getByRole("heading", { name: "DJs, clubs & events", exact: true });
  const before = await heading.boundingBox();
  const input = page.getByRole("combobox", { name: /Search/i });
  await input.fill(query);
  await expect(page.getByRole("option")).toHaveCount(5);
  expect(await heading.boundingBox()).toEqual(before);
  await expect(page.getByRole("link", { name: "View all results", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("home-preview.png"), fullPage: true });
});

function publicResultRow(page: Page, path: string) {
  return page.getByRole("region", { name: "Search results" }).locator(`a[href="${path}"]`).locator("..");
}

test("Search distinguishes known timed event states and preserves historical links @flow @fixture", async ({ page }) => {
  const query = "/search?q=Afterglow+event+schedule";
  const historicalPath = "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions";
  const results = page.getByRole("region", { name: "Search results" });
  const expectedEvents = [
    ["Afterglow Summer Signal", "Upcoming"],
    ["Afterglow Harbor Sessions", "Ended"],
    ["Afterglow Watch Room", "Ended"],
    ["Afterglow Live Session", "In progress"],
    ["Afterglow Late Shift", null],
    ["Afterglow Open Decks", null],
    ["Afterglow Studio Session", null],
  ] as const;

  for (const route of [query, `${query}&type=event`]) {
    await page.goto(route);
    const eventLinks = results.locator('a[href*="/events/"]');
    await expect(eventLinks).toHaveCount(expectedEvents.length);
    await expect(results.getByText("Ended", { exact: true })).toHaveCount(2);
    for (const [index, [title, status]] of expectedEvents.entries()) {
      const event = eventLinks.nth(index);
      await expect(event.getByText(title, { exact: true })).toBeVisible();
      const label = event.getByText(/^(Ended|In progress|Upcoming)$/);
      if (status === null) await expect(label).toHaveCount(0);
      else await expect(label).toHaveText(status);
    }
    await expect(eventLinks.nth(1)).toHaveAttribute("href", historicalPath);
  }
  await results.locator(`a[href="${historicalPath}"]`).click();
  await expect(page).toHaveURL(historicalPath);
  await expect(page.getByRole("heading", { level: 1, name: "Afterglow Harbor Sessions" })).toBeVisible();
  await expect(page.getByText("Ended", { exact: true })).toBeVisible();
});

test("mobile Search keeps event initials visible until artwork loads @flow @fixture", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  const poster = "**/events/afterglow-harbor-poster.png";
  const event = page.getByRole("link", { name: /Afterglow Harbor Sessions/ }).first();
  const initials = event.getByText("AH", { exact: true });
  const artwork = event.locator("img");

  for (const succeeds of [false, true]) {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route(poster, async (route) => {
      await pending;
      if (!succeeds) return route.abort();
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSioAAAAASUVORK5CYII=", "base64"),
      });
    });
    try {
      await page.goto("/search?q=Afterglow", { waitUntil: "commit" });
      await expect(initials).toBeVisible();
      await expect(artwork).toHaveCSS("opacity", "0");
      release();
      if (succeeds) {
        await expect(artwork).toHaveCSS("opacity", "1");
        await expect(initials).toHaveCount(0);
      } else {
        await expect(artwork).toHaveCount(0);
        await expect(initials).toBeVisible();
      }
    } finally {
      release();
      await page.unroute(poster);
    }
  }
});

test("narrow Search gives event descriptions room below the identity row @flow @fixture", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/search?q=Afterglow", { waitUntil: "commit" });
  const event = page.getByRole("link", { name: /Afterglow Harbor Sessions/ }).first();
  const eventTitle = event.getByText("Afterglow Harbor Sessions", { exact: true });
  const community = publicResultRow(page, "/playwright-afterglow-social");
  const communityTitle = community.getByText("Afterglow Social", { exact: true });
  const summary = event.getByText("Late-night harbor club session with house, trance, and warm social energy.", { exact: true });
  const communitySummary = community.getByText("A warm VRChat club night for music-first communities.", { exact: true });
  const left = async (locator: typeof summary) => (await locator.boundingBox())?.x;

  await expect(summary).toBeVisible();
  await expect.poll(() => summary.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  expect(await left(summary)).toBeLessThan((await left(eventTitle))!);
  expect(await left(communitySummary)).toBe(await left(communityTitle));

  await page.setViewportSize({ width: 390, height: 740 });
  await expect.poll(() => left(summary)).toBe(await left(eventTitle));
});

test("populated Search aligns titles and keeps media and role details available at 320px @flow @fixture", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
  await page.goto("/search?q=DJ");
  const aurora = publicResultRow(page, "/playwright-dj-aurora");
  const basicbit = publicResultRow(page, "/basicbit");
  const moth = publicResultRow(page, "/playwright-moth");
  const titles = await Promise.all([
    aurora.getByText("DJ Aurora", { exact: true }).boundingBox(),
    basicbit.getByText("BASICBIT", { exact: true }).boundingBox(),
    moth.getByText("Moth", { exact: true }).boundingBox(),
  ]);
  expect(titles.every((bounds) => bounds && bounds.x === titles[0]?.x)).toBe(true);

  const thumbnail = aurora.locator("img");
  await expect(thumbnail).toHaveCount(1);
  await expect(thumbnail).toHaveAttribute("src", /\/api\/e2e\/fixture-assets\/fixture-aurora-profile-image$/);
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(aurora.getByText("Melodic house sets for late-night VRChat floors.", { exact: true })).toBeVisible();
  await expect(aurora.getByText("DJ · Producer · Host", { exact: true })).toBeVisible();
  await expect(basicbit.getByText("Software Dev | 3D Designer | VRDJ", { exact: true })).toBeVisible();
  await expect(basicbit.getByText("Software Dev · 3D Designer · VRDJ", { exact: true })).toHaveCount(0);
  const mothRoles = moth.getByText("DJ · VRDJ · Fixture lineup", { exact: true });
  await expect(mothRoles).toBeVisible();
  await expect(moth.getByText("Techno · Hardgroove · Electro", { exact: true })).toBeVisible();
  await expect(moth.getByRole("link", { name: "Claim this profile", exact: true })).toBeVisible();
  await expect(moth.getByText("Community submitted", { exact: true })).toHaveCSS("border-inline-start-width", "0px");

  const genrePreview = basicbit.getByText("DnB · House · Techno", { exact: true });
  const moreGenres = basicbit.getByLabel("8 more genres", { exact: true });
  await expect.poll(() => moreGenres.innerText()).toBe("+8 genres");
  const links = basicbit.getByText("Links", { exact: true });
  const [previewBounds, moreBounds, linksBounds] = await Promise.all([
    genrePreview.boundingBox(),
    moreGenres.boundingBox(),
    links.boundingBox(),
  ]);
  expect(previewBounds!.x).toBe(titles[1]!.x);
  expect(moreBounds!.x).toBe(previewBounds!.x);
  expect(moreBounds!.y).toBeGreaterThanOrEqual(previewBounds!.y + previewBounds!.height);
  expect(linksBounds!.y).toBe(moreBounds!.y);
  expect(linksBounds!.x).toBeGreaterThan(moreBounds!.x);
  const mothLinksBounds = await moth.getByText("Links", { exact: true }).boundingBox();
  for (const bounds of [moreBounds!, linksBounds!, mothLinksBounds!]) {
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }

  await moreGenres.focus();
  await moreGenres.press("Enter");
  await expect(moreGenres).toBeFocused();
  const expandedGenres = basicbit.getByText("Bass · 140 · Trap · Space Bass · Midtempo · UKG · Dancefloor · Neurofunk", { exact: true });
  await expect(expandedGenres).toBeVisible();
  expect(await moreGenres.boundingBox()).toEqual(moreBounds);
  expect(await links.boundingBox()).toEqual(linksBounds);
  await links.focus();
  await links.press("Enter");
  await expect(links).toBeFocused();
  expect(await links.boundingBox()).toEqual(linksBounds);

  const expandedLinks = links.locator("..").locator(":scope > div");
  const website = expandedLinks.getByRole("link", { name: "Website: basicbit.net", exact: true });
  const twitch = expandedLinks.getByRole("link", { name: /^Twitch:/ });
  await expect(website).toHaveAttribute("href", "https://basicbit.net/");
  await expect(website.getByText("basicbit.net", { exact: true })).toBeVisible();
  await expect(twitch.getByText("Twitch", { exact: true })).toBeVisible();
  for (const destination of [website, twitch]) {
    const bounds = await destination.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  const [genresPanel, linksPanel] = await Promise.all([expandedGenres.boundingBox(), expandedLinks.boundingBox()]);
  expect(genresPanel!.x).toBe(previewBounds!.x);
  expect(linksPanel!.x).toBeLessThan(genresPanel!.x);
  expect(linksPanel!.x + linksPanel!.width).toBe(genresPanel!.x + genresPanel!.width);
  expect(linksPanel!.y).toBeGreaterThanOrEqual(genresPanel!.y + genresPanel!.height);
  await links.press("Space");
  await expect(links).toBeFocused();
  await expect(expandedLinks).toBeHidden();
  await moreGenres.press("Space");
  await expect(moreGenres).toBeFocused();
  await expect(expandedGenres).toBeHidden();

  const avatarRoute = "**/api/e2e/fixture-assets/fixture-aurora-profile-image";
  await page.route(avatarRoute, (route) => route.abort());
  await page.reload();
  await expect(aurora.getByText("DA", { exact: true })).toBeVisible();
  await expect(thumbnail).toHaveCount(0);
  await page.unroute(avatarRoute);

  await aurora.getByRole("link", { name: /DJ Aurora/ }).click();
  await expect(page).toHaveURL(/\/playwright-dj-aurora$/);
  await expect(page.getByRole("heading", { name: "Media kit", exact: true })).toBeVisible();
});

test("public result genres and Links disclose independently per person @flow @fixture", async ({ page }, info) => {
  await prepareVisualPage(page);
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
  await page.goto("/search?q=VRDJ");
  await expect(page.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Search view" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "DJ links", exact: true })).toHaveCount(0);
  const first = publicResultRow(page, "/basicbit");
  const second = publicResultRow(page, "/playwright-moth");
  await expect(first.getByRole("link", { name: /BASICBIT/ })).toBeVisible();
  await expect(first.getByText("Software Dev | 3D Designer | VRDJ", { exact: true })).toBeVisible();
  await expect(second.getByText("Moth fixture profile for lookup density checks.", { exact: true })).toBeVisible();
  await expect(second.getByText("DJ · VRDJ · Fixture lineup", { exact: true })).toBeVisible();
  await expect(second.locator("details").filter({ has: page.locator("summary", { hasText: "Links" }) })).not.toHaveAttribute("open");
  await expect(first.getByText("DnB · House · Techno", { exact: true })).toBeVisible();
  await expect(first.getByText("Drum and Bass", { exact: true })).toHaveCount(0);
  await expect(first.getByRole("button", { name: "Copy", exact: true })).toHaveCount(0);
  await expect(second.getByRole("button", { name: "Copy", exact: true })).toHaveCount(0);
  await expect(first.getByText("Bass · 140 · Trap · Space Bass · Midtempo · UKG · Dancefloor · Neurofunk", { exact: true })).toBeHidden();
  await page.screenshot({ path: info.outputPath("public-results-collapsed.png"), fullPage: true });
  const overflow = first.getByLabel("8 more genres", { exact: true });
  await expect(overflow.getByText("+8 genres", { exact: true })).toBeVisible();
  const genreChevron = overflow.locator("svg");
  await expect(genreChevron).toBeVisible();
  await expect(genreChevron).toHaveCSS("rotate", "none");
  await overflow.focus();
  await overflow.press("Enter");
  await expect(genreChevron).toHaveCSS("rotate", "180deg");
  await expect(first.getByText("Bass · 140 · Trap · Space Bass · Midtempo · UKG · Dancefloor · Neurofunk", { exact: true })).toBeVisible();
  await expect(first.getByRole("button", { name: "Copy", exact: true })).toHaveCount(0);
  await first.getByText("Links", { exact: true }).click();
  await second.getByText("Links", { exact: true }).click();
  await expect(first.getByRole("button", { name: "Copy", exact: true }).first()).toBeVisible();
  await expect(second.getByRole("button", { name: "Copy", exact: true }).first()).toBeVisible();
  await expect(first.locator('a[href="/basicbit"] button, a[href="/basicbit"] summary')).toHaveCount(0);
  await expect(first.getByRole("link", { name: "Website: basicbit.net", exact: true })).toHaveAttribute("href", "https://basicbit.net/");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("public-results-expanded.png"), fullPage: true });
  await first.locator('a[href="/basicbit"]').click();
  await expect(page).toHaveURL(/\/basicbit$/, { timeout: 15_000 });
});

test("Search Back restores the keyboard-activated result and tab order @flow @fixture", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 650 });
  const search = "/search?q=Sparse%20Import";
  const profile = "/playwright-sparse-import";
  const result = publicResultRow(page, profile);
  const name = result.locator(`a[href="${profile}"]`);
  const claim = result.getByRole("link", { name: "Claim this profile", exact: true });

  await page.goto(search);
  await waitForPublicSearchHydration(page);
  await expect(name).toBeVisible();
  await expect(claim).toBeVisible();
  for (let step = 0; step < 30; step++) {
    await page.keyboard.press("Tab");
    if (await name.evaluate(link => link === document.activeElement)) break;
  }
  await expect(name).toBeFocused();
  const scrollY = await page.evaluate(() => window.scrollY);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === profile);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === "/search" && url.searchParams.get("q") === "Sparse Import");
  await expect(name).toBeFocused();
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollY)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Tab");
  await expect(claim).toBeFocused();

  if (isMobile) await name.tap();
  else await name.click();
  await expect(page).toHaveURL((url) => url.pathname === profile);
  await page.goBack();
  await expect(name).toBeVisible();
  await expect(name).not.toBeFocused();
});

test("Search Back restores the keyboard result after a full-document history rewrite @flow @fixture", async ({ page }) => {
  const profile = "/playwright-sparse-import";
  const result = page.getByRole("region", { name: "Search results" }).locator(`a[href="${profile}"]`);

  await page.goto("/search?q=Sparse%20Import");
  await waitForPublicSearchHydration(page);
  const initialDocument = await page.evaluate(() => performance.timeOrigin);
  await result.evaluate(link => {
    link.addEventListener("click", event => {
      // Simulate an auth startup rewrite after result capture, before native anchor navigation.
      const state = { ...history.state };
      delete state.vrdexSearchResultFocus;
      const url = new URL(location.href);
      url.search = url.searchParams.toString();
      history.replaceState(state, "", url);
      event.stopPropagation();
    }, { once: true });
  });

  await result.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === profile);
  await expect.poll(() => page.evaluate(() => performance.timeOrigin)).not.toBe(initialDocument);

  await page.goBack();
  await expect(page).toHaveURL(/\/search\?q=Sparse\+Import$/);
  await expect(result).toBeFocused();
});

test("Search Back and Forward restore disclosures independently by entry @flow @fixture", async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  if (isMobile) await page.setViewportSize({ width: 320, height: 568 });
  const search = "/search?q=VRDJ";
  const profile = "/playwright-moth";
  const result = publicResultRow(page, profile);
  const mainSearch = page.getByRole("main").getByRole("combobox", { name: "Search VRDex" });
  const name = result.getByRole("link", { name: /Moth/ }).first();
  const links = result.locator("summary", { hasText: "Links" });
  const publicLink = result.getByRole("link", { name: "VRChat profile VRChat", exact: true });
  const genres = publicResultRow(page, "/basicbit").getByLabel("8 more genres", { exact: true });

  await page.goto(search);
  await waitForPublicSearchHydration(page);
  await expect(links.locator("..")).toHaveJSProperty("open", false);
  await page.evaluate(() => history.replaceState({ ...history.state, disclosureProbe: true }, ""));
  await links.press("Enter");
  await expect(publicLink).toBeVisible();
  await name.click();
  await expect(page).toHaveURL(/\/playwright-moth$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/search\?q=VRDJ$/);
  await expect(publicLink).toBeVisible();
  expect(await page.evaluate(() => history.state.disclosureProbe)).toBe(true);

  await mainSearch.press("Enter");
  await expect(publicLink).toBeVisible();
  await genres.press("Enter");
  await expect(genres.locator("..")).toHaveJSProperty("open", true);
  const people = page.getByRole("navigation", { name: "Entity type" }).getByRole("link", { name: "People" });
  await people.click();
  await expect(page).toHaveURL(/\/search\?q=VRDJ&type=person$/);
  await expect(links.locator("..")).toHaveJSProperty("open", false);
  await expect(genres.locator("..")).toHaveJSProperty("open", false);
  await page.goBack();
  await expect(publicLink).toBeVisible();
  await expect(genres.locator("..")).toHaveJSProperty("open", true);
  await page.goForward();
  await expect(links.locator("..")).toHaveJSProperty("open", false);
  await page.goBack();

  await expect(publicLink).toBeVisible();
  await name.click();
  await expect(page).toHaveURL(/\/playwright-moth$/);
  const nav = page.getByRole("banner").getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Search", exact: true }).click();
  const quickSearch = nav.getByRole("combobox", { name: "Search VRDex" });
  await quickSearch.fill("VRDJ");
  await quickSearch.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=VRDJ$/);
  await expect(links.locator("..")).toHaveJSProperty("open", false);
  await page.goBack();
  await expect(page).toHaveURL(/\/playwright-moth$/);
  await page.goBack();
  await expect(publicLink).toBeVisible();
  await links.press("Enter");
  await expect(links.locator("..")).toHaveJSProperty("open", false);
  await name.click();
  await expect(page).toHaveURL(/\/playwright-moth$/);
  await page.goBack();
  await expect(links.locator("..")).toHaveJSProperty("open", false);
  await expect(genres.locator("..")).toHaveJSProperty("open", true);

  await page.goto(search + "&type=all");
  await waitForPublicSearchHydration(page);
  await links.press("Enter");
  await expect(publicLink).toBeVisible();
  await mainSearch.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=VRDJ$/);
  await expect(links.locator("..")).toHaveJSProperty("open", false);
  await page.goBack();
  await expect(page).toHaveURL(/\/search\?q=VRDJ&type=all$/);
  await expect(publicLink).toBeVisible();
  await page.goForward();
  await expect(links.locator("..")).toHaveJSProperty("open", false);
});

test("sparse public results omit empty disclosure controls @flow @fixture", async ({ page, isMobile }, info) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 800 });
  await prepareVisualPage(page);
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
  await page.goto("/search?q=Sparse%20Import");
  const row = publicResultRow(page, "/playwright-sparse-import");
  const profile = row.getByRole("link", { name: /Sparse Import/ });
  await expect(profile).toBeVisible();
  await expect(profile.getByText("Unclaimed", { exact: true })).toBeVisible();
  const claim = row.getByRole("link", { name: "Claim this profile", exact: true });
  await expect(claim).toHaveAttribute("href", "/claim/playwright-sparse-import?source=search");
  await expect(row.getByRole("link")).toHaveCount(2);
  await expect(row.getByText("Links", { exact: true })).toHaveCount(0);
  await expect(row.locator("summary")).toHaveCount(0);
  await expect(row.getByText("No public links", { exact: true })).toHaveCount(0);
  await waitForVisualReady(page);
  const results = page.getByRole("region", { name: "Search results" });
  const form = page.getByRole("main").locator('form[action="/search"]');
  const resultsBounds = (await results.boundingBox())!;
  const formBounds = (await form.boundingBox())!;
  expect(resultsBounds.x).toBe(formBounds.x);
  expect(resultsBounds.width).toBe(formBounds.width);
  expect(resultsBounds.x * 2 + resultsBounds.width).toBeCloseTo(await page.evaluate(() => document.documentElement.clientWidth), 0);
  expect((await profile.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await claim.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await claim.locator("..").boundingBox())!.width).toBeLessThan((await row.boundingBox())!.width);
  expect((await claim.boundingBox())!.x).toBe((await row.getByText("Sparse Import", { exact: true }).boundingBox())!.x);
  if (isMobile) {
    const typeBounds = (await profile.getByText("Person", { exact: true }).boundingBox())!;
    const trustBounds = (await profile.getByText("Unclaimed", { exact: true }).boundingBox())!;
    expect(trustBounds.x).toBeGreaterThan(typeBounds.x + typeBounds.width);
    expect(trustBounds.y).toBe(typeBounds.y);
    await expect(profile.getByText("·", { exact: true })).toHaveCount(0);
    expect((await row.boundingBox())!.y).toBeLessThan(410);
  }
  await page.screenshot({ path: info.outputPath("public-results-sparse.png"), fullPage: true });
  await profile.focus();
  await page.keyboard.press("Tab");
  await expect(claim).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(profile).toBeFocused();
});

test("long public names and link destinations fit narrow results @flow @fixture", async ({ page, isMobile, createSearchProfiles }, info) => {
  const { query, profiles } = await createSearchProfiles(1);
  const [profile] = profiles;
  await prepareVisualPage(page);
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/search?q=${query}`);
  const row = publicResultRow(page, profile.profilePath);
  await expect(row.getByRole("link", { name: /Princess Starlight Interstellar Bassline Orchestra/ })).toBeVisible();
  await row.getByText("Links", { exact: true }).click();
  await expect(row.getByRole("link", { name: "Website: website.example.invalid", exact: true })).toHaveAttribute(
    "href", profile.website,
  );
  await waitForVisualReady(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("public-results-long.png"), fullPage: true });
});

for (const outcome of ["clipboard", "fallback", "failure", "fallback throws"] as const) {
  test(`public result ${outcome} copy preserves panels, focus and URL @flow @fixture`, async ({ page }) => {
    const copied: string[] = [];
    const fallbacks: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeFunction("recordCopiedValue", (value: string) => copied.push(value));
    await page.exposeFunction("recordFallbackValue", (value: string) => fallbacks.push(value));
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async (value: string) => {
          const record = Reflect.get(window, "recordCopiedValue");
          if (typeof record === "function") await record(value);
          if (mode !== "clipboard") throw new Error("Clipboard denied");
        },
      } });
      document.execCommand = (command) => {
        if (command !== "copy") throw new Error("Unexpected clipboard command");
        const record = Reflect.get(window, "recordFallbackValue");
        if (typeof record === "function") void record(document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.value : "");
        if (mode === "fallback throws") throw new Error("Fallback denied");
        return mode === "fallback";
      };
    }, outcome);
    await page.goto("/search?q=VRDJ");
    const first = publicResultRow(page, "/basicbit");
    const second = publicResultRow(page, "/playwright-moth");
    await first.getByText("Links", { exact: true }).click();
    await second.getByText("Links", { exact: true }).click();
    const url = page.url();
    const button = first.locator("button").first();
    await button.click();
    await expect(first.getByRole("status").filter({ hasText: outcome === "failure" || outcome === "fallback throws" ? "Copy failed" : "Copied" })).toHaveCount(1);
    await expect(button).toBeFocused();
    await expect(first.locator('details[open]')).toHaveCount(1);
    await expect(second.locator('details[open]')).toHaveCount(1);
    await expect(second.getByRole("button", { name: "Copy", exact: true }).first()).toBeVisible();
    await expect(page).toHaveURL(url);
    await expect(page.locator("textarea")).toHaveCount(0);
    expect(copied).toEqual(["basic_bit"]);
    expect(fallbacks).toEqual(outcome === "clipboard" ? [] : ["basic_bit"]);
    expect(errors).toEqual([]);
    if (outcome === "clipboard" || outcome === "fallback") {
      await expect(button).toHaveAccessibleName("Copy");
      await expect(first.getByRole("status").filter({ hasText: "Copied" })).toHaveCount(0);
    }
  });
}

test("overlapping public copies retain one reset timer and cancel it on unmount @flow @fixture", async ({ page }) => {
  await page.goto("/search?q=VRDJ");
  const row = publicResultRow(page, "/basicbit");
  await row.getByText("Links", { exact: true }).click();
  const button = row.getByRole("button", { name: "Copy", exact: true }).first();
  const now = new Date();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await page.evaluate(() => {
    const copies: Array<() => void> = [];
    const timers = new Set<number>();
    let fired = 0;
    const setTimer = window.setTimeout.bind(window);
    const clearTimer = window.clearTimeout.bind(window);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: () => new Promise<void>((resolve) => copies.push(resolve)),
    } });
    // Observe the real reset callbacks while Playwright controls browser time.
    Object.defineProperty(window, "setTimeout", { configurable: true, value: (handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay !== 1400 || typeof handler !== "function") return setTimer(handler, delay, ...args);
      const timer = setTimer(() => {
        timers.delete(timer);
        fired++;
        handler(...args);
      }, delay);
      timers.add(timer);
      return timer;
    } });
    Object.defineProperty(window, "clearTimeout", { configurable: true, value: (timer?: number) => {
      if (timer !== undefined) timers.delete(timer);
      clearTimer(timer);
    } });
    Reflect.set(window, "copyLifecycle", {
      count: () => copies.length,
      settle: (index: number) => copies[index]?.(),
      timers: () => ({ pending: timers.size, fired }),
    });
  });
  await button.click();
  await button.click();
  expect(await page.evaluate(() => Reflect.get(window, "copyLifecycle").count())).toBe(2);
  await page.evaluate(async () => {
    Reflect.get(window, "copyLifecycle").settle(0);
    await Promise.resolve();
  });
  await page.clock.runFor(900);
  await page.evaluate(() => Reflect.get(window, "copyLifecycle").settle(1));
  await expect(row.getByRole("status").filter({ hasText: "Copied" })).toHaveCount(1);
  expect(await page.evaluate(() => Reflect.get(window, "copyLifecycle").timers())).toEqual({ pending: 1, fired: 0 });
  await page.getByRole("link", { name: "Communities", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=VRDJ&type=community$/);
  await expect(row).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "copyLifecycle").timers())).toEqual({ pending: 0, fired: 0 });
  await page.clock.runFor(3000);
  expect(await page.evaluate(() => Reflect.get(window, "copyLifecycle").timers())).toEqual({ pending: 0, fired: 0 });
});

test("expanded public links agree with legacy provider formatting @flow @fixture", async ({ page }) => {
  const copied: string[] = [];
  await page.exposeFunction("recordStreamCopy", (value: string) => copied.push(value));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: (value: string) => Reflect.get(window, "recordStreamCopy")(value),
    } });
  });

  for (const view of ["standard", "dj"]) {
    await page.goto(`/search?q=DJ+Aurora${view === "dj" ? "&view=dj" : ""}`);
    if (view === "standard") {
      await waitForPublicSearchHydration(page);
      await publicResultRow(page, "/playwright-dj-aurora").getByText("Links", { exact: true }).click();
    }

    const previousCopies = copied.length;
    const expectedCopies: string[] = [];
    for (const [name, id] of [["VRCDN", "dj-aurora"], ["Suggested VRCDN", "suggested-aurora"]]) {
      const group = page.getByRole("group", { name, exact: true });
      await expect(group.getByText(name, { exact: true })).toBeVisible();
      await expect(group.getByText("Community-submitted", { exact: true })).toHaveCount(id === "suggested-aurora" ? 1 : 0);
      await expect(group.getByRole("link", { name: `${name} preview`, exact: true })).toHaveAttribute(
        "href", `https://panel.vrcdn.live/preview/${id}`,
      );

      for (const [platform, value] of [
        ["Quest MPEG-TS", `https://stream.vrcdn.live/live/${id}.live.ts`],
        ["PC RTSPT", `rtspt://stream.vrcdn.live/live/${id}`],
      ]) {
        const row = group.locator(".lookup-primary-url-card").filter({ hasText: platform });
        const address = row.locator("code");
        await expect(address).toHaveText(value);
        expect(await address.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        await row.getByRole("button", { name: `Copy ${name} ${platform}`, exact: true }).click();
        await expect(row.getByRole("status")).toHaveText("Copied");
        expectedCopies.push(value);
      }
    }
    expect(copied.slice(previousCopies)).toEqual(expectedCopies);
  }
});

test("non-person public results retain canonical metadata and viewer-local event dates @flow @fixture", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, timezoneId: "America/Los_Angeles" });
  const page = await context.newPage();
  await page.goto("/search?q=Afterglow");
  const event = publicResultRow(page, "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions");
  await expect(event.getByText("Afterglow Social", { exact: true })).toBeVisible();
  await expect(event.getByText("Late-night harbor club session with house, trance, and warm social energy.", { exact: true })).toBeVisible();
  const time = event.locator("time");
  const timestamp = await time.getAttribute("datetime");
  expect(timestamp).not.toBeNull();
  await expect(time).toHaveText(new Intl.DateTimeFormat("en", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(timestamp!)));
  const community = publicResultRow(page, "/playwright-afterglow-social");
  await expect(community.getByText("A warm VRChat club night for music-first communities.", { exact: true })).toBeVisible();
  await expect(event.locator("summary")).toHaveCount(0);
  await expect(community.locator("summary")).toHaveCount(0);
  await community.locator('a[href="/playwright-afterglow-social"]').click();
  await expect(page).toHaveURL(/\/playwright-afterglow-social$/);
  await page.goto("/search?q=Neon%20Harbor");
  const world = publicResultRow(page, "/playwright-neon-harbor");
  await expect(world.getByText("Cyberpunk harbor club world with layered dance floors and quiet balcony corners.", { exact: true })).toBeVisible();
  await expect(world.locator("summary")).toHaveCount(0);
  await world.locator('a[href="/playwright-neon-harbor"]').click();
  await expect(page).toHaveURL(/\/playwright-neon-harbor$/);
  await context.close();
});

test("Discovery search and category headings fit at enlarged phone text size @flow @fixture", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/discovery");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await waitForPublicSearchHydration(page);
  const input = page.getByRole("combobox", { name: "Search VRDex", exact: true });
  const submit = page.getByRole("button", { name: "Search VRDex", exact: true });
  await expect(submit).toBeInViewport({ ratio: 1 });
  await expect.poll(() => input.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) return false;
    const css = getComputedStyle(element);
    const available = element.clientWidth - parseFloat(css.paddingInlineStart) - parseFloat(css.paddingInlineEnd);
    const canvas = document.createElement("canvas").getContext("2d");
    if (!canvas) return false;
    canvas.font = css.font;
    return available >= canvas.measureText(element.placeholder).width
      && document.documentElement.scrollWidth === window.innerWidth
      && [...document.querySelectorAll("main h1, main h2")].every((heading) => heading.scrollWidth <= heading.clientWidth);
  })).toBe(true);

  const option = page.getByRole("option", { name: /DJ Aurora/ });
  await expect(async () => {
    await input.fill("");
    await input.fill("Aurora");
    await expect(option).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
  await expect(input).toHaveValue("Aurora");
  await expect.poll(async () => {
    const [result, submitButton] = await Promise.all([option.boundingBox(), submit.boundingBox()]);
    return Boolean(result && submitButton && result.y >= submitButton.y + submitButton.height);
  }).toBe(true);
  await option.tap({ trial: true });
  await submit.tap();
  await expect(page).toHaveURL((url) => url.pathname === "/search" && url.searchParams.get("q") === "Aurora");
});

test("Discovery Back restores the keyboard-activated result @flow @fixture", async ({ page }) => {
  const community = "/playwright-afterglow-social";
  for (const [path, nextPath] of [
    [community + "/events/playwright-afterglow-harbor-sessions", "/playwright-dj-aurora"],
    [community, "/playwright-neon-harbor"],
  ]) {
    await page.goto("/discovery");
    await waitForPublicSearchHydration(page);
    const link = page.locator(`main a[href="${path}"]`).first();
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL((url) => url.pathname === path);
    await page.goBack();
    await expect(link).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("main a:focus")).toHaveAttribute("href", nextPath);
  }
});

test("Back from a Discovery category result restores the category @flow @fixture", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 320 : 390, height: 750 });
  const category = page.getByRole("navigation", { name: "Discovery categories" }).getByRole("link", { name: "People", exact: true });
  const people = page.getByRole("heading", { name: "People", exact: true });
  const discovery = page.getByRole("heading", { name: "Discover VR", exact: true });
  const profile = page.getByRole("heading", { name: "DJ Aurora", exact: true, level: 1 });
  const result = page.locator('a[data-discovery-result="home:/playwright-dj-aurora"]');

  for (const keyboard of [false, true]) {
    await page.goto("/discovery", { waitUntil: "networkidle" });
    await waitForPublicSearchHydration(page);

    if (keyboard) await category.press("Enter");
    else if (isMobile) await category.tap();
    else await category.click();
    await expect(page).toHaveURL(/\/discovery#people$/);
    await expect(people).toBeInViewport();
    if (keyboard) await expect(people).toBeFocused();

    await result.scrollIntoViewIfNeeded();
    const position = await page.evaluate(() => window.scrollY);
    if (keyboard) await result.press("Enter");
    else if (isMobile) await result.tap();
    else await result.click();
    await expect(profile).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/discovery#people$/);
    await expect(discovery).toBeVisible();
    await expect(result).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(position);
    if (keyboard) await expect(result).toBeFocused();

    await page.goForward();
    await expect(profile).toBeVisible();
    await page.goBack();
    await expect(discovery).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(position);
  }
});

test("Discovery Back preserves an adjusted scroll position beyond the category anchor @flow @fixture", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 390, height: 750 });
  await page.goto("/discovery", { waitUntil: "networkidle" });
  await waitForPublicSearchHydration(page);
  const category = page.getByRole("navigation", { name: "Discovery categories" }).getByRole("link", { name: "People", exact: true });
  if (isMobile) await category.tap();
  else await category.click();
  await expect(page).toHaveURL(/\/discovery#people$/);

  // Place the World result in view at an intermediate offset rather than the anchor or page end.
  const position = 932;
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), position);
  const world = page.locator('a[data-discovery-result="home:/playwright-neon-harbor"]');
  await expect(world).toBeInViewport();
  if (isMobile) await world.tap();
  else await world.click();
  const destination = page.getByRole("heading", { name: "Neon Harbor", exact: true, level: 1 });
  const discovery = page.getByRole("heading", { name: "Discover VR", exact: true, level: 1 });
  await expect(destination).toBeVisible();

  for (let visit = 0; visit < 2; visit++) {
    await page.goBack();
    await expect(page).toHaveURL(/\/discovery#people$/);
    await expect(discovery).toBeVisible();
    const settledScroll = await page.evaluate(() => new Promise<number>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY))));
    }));
    expect(settledScroll).toBe(position);
    if (visit === 0) {
      await page.goForward();
      await expect(destination).toBeVisible();
    }
  }
});

test("public preview caps real eight-result responses without shifting layout @flow @fixture", async ({ page, createSearchProfiles }, info) => {
  const { query, profiles } = await createSearchProfiles(8);
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
  await page.goto("/discovery");
  const input = page.getByRole("combobox", { name: /Search/i });
  const heading = page.getByRole("heading", { name: "Discover VR", exact: true });
  const before = await heading.boundingBox();
  const response = page.waitForResponse((value) => new URL(value.url()).pathname === "/search/suggest"
    && new URL(value.url()).searchParams.get("q") === query);
  await input.fill(query);
  const payload = await (await response).json();
  expect(payload.results).toHaveLength(8);
  expect(payload.results.map((result: { routePath: string }) => result.routePath).sort()).toEqual(profiles.map((profile) => profile.profilePath).sort());
  await expect(page.getByRole("option")).toHaveCount(5);
  await expect(page.getByRole("listbox").getByRole("link", { name: "View all results" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View all results", exact: true })).toBeVisible();
  expect(await heading.boundingBox()).toEqual(before);
  const ids = await page.getByRole("option").evaluateAll((options) => options.map((option) => option.id));
  for (let index = 0; index < 6; index++) {
    await input.press("ArrowDown");
    await expect(input).toHaveAttribute("aria-activedescendant", ids[index % 5]);
  }
  await input.press("ArrowUp");
  await expect(input).toHaveAttribute("aria-activedescendant", ids[4]);
  await page.screenshot({ path: info.outputPath("public-search-preview.png"), fullPage: true });
});

test("selected Enter opens the canonical public profile @flow @fixture", async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
  await page.goto("/discovery");
  await waitForPublicSearchHydration(page);
  const input = page.getByRole("combobox", { name: /Search/i });
  await input.fill("basic");
  await expect(page.getByRole("option", { name: /BASICBIT/ })).toBeVisible();
  await input.press("ArrowDown");
  await expect(page.getByRole("option", { name: /BASICBIT/ })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: info.outputPath("public-search-identity.png"), fullPage: true });
  await input.press("Enter");
  await expect(page).toHaveURL(/\/basicbit$/, { timeout: 15_000 });
});

for (const [name, path, submitted, action, destination] of [
  ["Home Enter", "/", "  Aurora  ", "enter", "/search?q=Aurora"],
  ["Home button", "/", "  Aurora  ", "button", "/search?q=Aurora"],
  ["Discovery Enter", "/discovery", "  Aurora  ", "enter", "/search?q=Aurora"],
  ["Discovery button", "/discovery", "  Aurora  ", "button", "/search?q=Aurora"],
  ["filtered Search replacement", "/search?q=basic&type=person", "  Aurora  ", "enter", "/search?q=Aurora&type=person"],
  ["filtered Search clearing", "/search?q=basic&type=person", "", "button", "/search?type=person"],
  ["filtered multiword Search clearing", "/search?q=Afterglow%20Harbor%20Sessions&type=event", "", "enter", "/search?type=event"],
] as const) {
  test(`cold ${name} submits what the browser field contains @flow @fixture`, async ({ page, isMobile }) => {
    let releaseScripts!: () => void;
    const held = new Promise<void>((resolve) => { releaseScripts = resolve; });
    let heldCount = 0;
    await page.route("**/_next/static/**/*.js*", async (route) => {
      heldCount++;
      await held;
      await route.continue();
    });

    try {
      await page.goto(path, { waitUntil: "commit" });
      const main = page.getByRole("main");
      const input = main.getByRole("combobox", { name: "Search VRDex" });
      await expect(input).toBeVisible();
      await expect.poll(() => heldCount).toBeGreaterThan(0);
      await input.press("ControlOrMeta+a");
      await input.press("Backspace");
      if (submitted) await input.pressSequentially(submitted);
      await expect(input).toHaveValue(submitted);

      releaseScripts();
      await waitForPublicSearchHydration(page);
      await expect(input).toHaveValue(submitted);
      if (action === "enter") {
        await expect(input).toBeFocused();
        await page.keyboard.press("Enter");
      } else {
        const submit = main.getByRole("button", { name: "Search VRDex", exact: true });
        if (isMobile) await submit.tap();
        else await submit.click();
      }
      await expect(page).toHaveURL((url) => url.pathname + url.search === destination);
      await expect(input).toHaveValue(submitted.trim());
    } finally {
      releaseScripts();
    }
  });
}

test("View all results opens the full search from each public suggestion footer @flow @fixture", async ({ page, isMobile }) => {
  for (const [source, destination] of [
    ["/", "/search?q=Aurora"],
    ["/discovery", "/search?q=Aurora"],
    ["/search?q=basic&type=person", "/search?q=Aurora&type=person"],
  ]) {
    await page.goto(source, { waitUntil: "networkidle" });
    await waitForPublicSearchHydration(page);
    const main = page.getByRole("main");
    const input = main.getByRole("combobox", { name: "Search VRDex" });
    await input.focus();
    await input.fill("  Aurora  ");
    await expect(main.getByRole("option", { name: /DJ Aurora/ })).toBeVisible();
    const footer = main.getByRole("link", { name: "View all results", exact: true });
    await expect(footer).toHaveAttribute("href", destination);
    if (isMobile) await footer.tap();
    else await footer.click();
    await expect(page).toHaveURL((url) => url.pathname + url.search === destination);
    await expect(main.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();
    await expect(input).toHaveValue("Aurora");
  }
});

for (const submit of ["Enter", "View all results"]) test(`unselected ${submit} preserves trimmed query and filter @flow @fixture`, async ({ page }) => {
  await page.goto("/search?q=basic&type=person");
  const input = page.getByRole("combobox", { name: /Search/i });
  await input.fill("  Aurora  ");
  await expect(page.getByRole("option", { name: /DJ Aurora/ })).toBeVisible();
  if (submit === "Enter") await input.press("Enter");
  else await page.getByRole("link", { name: submit, exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=Aurora&type=person$/);
  await expect(input).toHaveValue("Aurora");
  await page.goBack();
  await expect(input).toHaveValue("basic");
  await page.goForward();
  await expect(input).toHaveValue("Aurora");
});

test("clear, dismissal, focus, IME and pointer selection stay usable @flow @fixture", async ({ page, isMobile }) => {
  await page.goto("/discovery");
  await waitForPublicSearchHydration(page);
  const input = page.getByRole("combobox", { name: /Search/i });
  await input.fill("basic");
  await expect(page.getByRole("option")).toHaveCount(1);
  await input.press("ArrowDown");
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await expect(page).toHaveURL(/\/discovery$/);
  await input.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(input).not.toHaveAttribute("aria-activedescendant");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=basic$/);
  await page.goto("/discovery");
  await waitForPublicSearchHydration(page);
  await input.fill("basic");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("heading", { name: "Discover VR", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(0);
  await input.focus();
  await expect(page.getByRole("option")).toHaveCount(1);
  await input.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("option")).toHaveCount(0);
  await input.focus();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await expect(page.getByRole("option")).toHaveCount(0);
  await input.fill("basic");
  const option = page.getByRole("option", { name: /BASICBIT/ });
  await expect(option).toBeVisible();
  if (isMobile) await option.tap();
  else await option.click();
  await expect(page).toHaveURL(/\/basicbit$/);
});

test("old query responses and cleared requests cannot restore stale options @flow @fixture", async ({ page }) => {
  let releaseOld = () => {};
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  let sawOld = () => {};
  const oldStarted = new Promise<void>((resolve) => { sawOld = resolve; });
  await page.route("**/search/suggest?**", async (route) => {
    const response = await route.fetch();
    if (new URL(route.request().url()).searchParams.get("q") === "basic") {
      sawOld();
      await oldGate;
    }
    await route.fulfill({ response });
  });
  await page.goto("/discovery");
  await waitForPublicSearchHydration(page);
  const input = page.getByRole("combobox", { name: /Search/i });
  await input.fill("basic");
  await oldStarted;
  await input.fill("Aurora");
  await expect(page.getByRole("option", { name: /DJ Aurora/ })).toBeVisible();
  releaseOld();
  await expect(page.getByRole("option", { name: /BASICBIT/ })).toHaveCount(0);
  await input.press("ArrowDown");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(0);
  await input.fill("Aurora");
  await expect(page.getByRole("option", { name: /DJ Aurora/ })).toBeVisible();
  await expect(input).not.toHaveAttribute("aria-activedescendant");
});

test("changing the entity filter invalidates the same visible query @flow @fixture", async ({ page }) => {
  let releaseFiltered = () => {};
  const filteredGate = new Promise<void>((resolve) => { releaseFiltered = resolve; });
  let sawFiltered = () => {};
  const filteredStarted = new Promise<void>((resolve) => { sawFiltered = resolve; });
  await page.route("**/search/suggest?**", async (route) => {
    const response = await route.fetch();
    if (new URL(route.request().url()).searchParams.get("type") === "person") {
      sawFiltered();
      await filteredGate;
    }
    await route.fulfill({ response });
  });
  await page.goto("/search?q=afterglow");
  const input = page.getByRole("combobox", { name: /Search/i });
  await input.fill("Afterglow");
  await expect(page.getByRole("option", { name: /Afterglow Harbor Sessions/ })).toBeVisible();
  await input.press("ArrowDown");
  const response = page.waitForResponse((value) => value.url().includes("/search/suggest?q=Afterglow&type=person"));
  await page.getByRole("link", { name: "People", exact: true }).focus();
  await page.getByRole("link", { name: "People", exact: true }).press("Enter");
  await expect(input).toHaveValue("Afterglow");
  await filteredStarted;
  await input.focus();
  await expect(page.getByRole("option", { name: /Afterglow Harbor Sessions/ })).toHaveCount(0);
  releaseFiltered();
  await response;
  await expect(input).not.toHaveAttribute("aria-activedescendant");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Afterglow&type=person$/);
});

for (const entry of ["/", "/discovery"]) test(`${entry} empty input and private lookup recents never enumerate public suggestions @flow @fixture`, async ({ page }) => {
  const requests: string[] = [];
  const reads: string[] = [];
  await page.exposeFunction("recordPrivateRecentRead", (key: string) => reads.push(key));
  await page.addInitScript(() => {
    localStorage.setItem("vrdex.lookup.recentSearches", JSON.stringify(["private seed secret"]));
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === "vrdex.lookup.recentSearches") {
        // Record the read even if a caller catches its storage error.
        window.dispatchEvent(new CustomEvent("private-recent-read", { detail: key }));
      }
      return read.call(this, key);
    };
  });
  await page.addInitScript(() => {
    window.addEventListener("private-recent-read", (event) => {
      if (event instanceof CustomEvent) {
        const recorder = Reflect.get(window, "recordPrivateRecentRead");
        if (typeof recorder === "function") void recorder(event.detail);
      }
    });
  });
  page.on("request", (request) => { if (request.url().includes("/suggest")) requests.push(request.url()); });
  await page.goto(entry);
  const input = page.getByRole("combobox", { name: /Search/i });
  await input.focus();
  await input.fill("   ");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByText("private seed secret")).toHaveCount(0);
  expect(requests).toEqual([]);
  await input.fill("basic");
  await expect(page.getByRole("option", { name: /BASICBIT/ })).toBeVisible();
  expect(requests.every((url) => new URL(url).pathname === "/search/suggest")).toBe(true);
  expect(reads).toEqual([]);
});

test("Home and full search exclude private seed terms and nonpublic profile fields @flow @fixture", async ({ page, request }, info) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "Uses anonymous local Convex fixtures only.");
  const headers = { "x-vrdex-e2e-token": process.env.VRDEX_E2E_BROWSER_TOKEN ?? "local-playwright-token" };
  const runId = `playwright-home-privacy-${info.project.name}-${Date.now()}`;
  const displayName = `Home Visibility ${info.project.name} ${Date.now()}`;
  const privateTerm = `secret${Date.now()}`;
  const suggestRequests: string[] = [];
  page.on("request", (value) => { if (value.url().includes("/suggest")) suggestRequests.push(value.url()); });
  try {
    const created = await request.post("/api/e2e/profile-submissions", {
      headers,
      data: { runId, profileType: "person", displayName, aliases: [privateTerm], bio: privateTerm,
        roleTags: [privateTerm], outboundLinks: [{ type: "website", url: "https://example.invalid/private" }],
        fieldVisibility: { aliases: "private", bio: "unlisted", personRoleTags: "private", outboundLinks: "private" } },
    });
    await expect(created).toBeOK();
    const { profilePath } = await created.json();
    await page.goto("/");
    await waitForPublicSearchHydration(page);
    const input = page.getByRole("combobox", { name: /Search/i });
    const response = page.waitForResponse((value) => new URL(value.url()).pathname === "/search/suggest");
    await input.fill(displayName);
    const payload = await (await response).json();
    expect(payload.results.some((value: { routePath: string }) => value.routePath === profilePath)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain(privateTerm);
    expect(JSON.stringify(payload)).not.toContain("example.invalid/private");
    await input.press("Enter");
    const row = publicResultRow(page, profilePath);
    await expect(row).toBeVisible();
    await expect(row).not.toContainText(privateTerm);
    await expect(row.getByText("Links", { exact: true })).toHaveCount(0);
    for (const term of [privateTerm, "nwinn"]) {
      await page.goto("/");
      await waitForPublicSearchHydration(page);
      const suggested = page.waitForResponse((value) => new URL(value.url()).pathname === "/search/suggest");
      await input.fill(term);
      expect((await (await suggested).json()).results).toEqual([]);
      await input.press("Enter");
      await expect(publicResultRow(page, profilePath)).toHaveCount(0);
      await expect(page.getByText("DJ Northstar", { exact: true })).toHaveCount(0);
      await expect(page.getByText("No public results matched that search yet.", { exact: true })).toBeVisible();
    }
    expect(suggestRequests.length).toBeGreaterThan(0);
    expect(suggestRequests.every((value) => new URL(value).pathname === "/search/suggest")).toBe(true);
  } finally {
    const cleanup = await request.delete("/api/e2e/profile-submissions", { headers, data: { runId } });
    await expect(cleanup).toBeOK();
  }
});

test("suggestion failure still permits explicit search @flow @fixture", async ({ page }) => {
  await page.route("**/search/suggest?**", (route) => route.fulfill({ status: 503, body: "<!doctype html>" }));
  await page.goto("/discovery");
  await waitForPublicSearchHydration(page);
  const input = page.getByRole("combobox", { name: /Search/i });
  const failed = page.waitForResponse((response) => response.url().includes("/search/suggest"));
  await input.fill("basic");
  await failed;
  await expect(page.getByRole("option")).toHaveCount(0);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=basic$/);
});

test("clearing an in-flight request invalidates it before the same query is retyped @flow @fixture", async ({ page }) => {
  let releaseOld = () => {};
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  let sawOld = () => {};
  const oldStarted = new Promise<void>((resolve) => { sawOld = resolve; });
  let releaseNew = () => {};
  const newGate = new Promise<void>((resolve) => { releaseNew = resolve; });
  let sawNew = () => {};
  const newStarted = new Promise<void>((resolve) => { sawNew = resolve; });
  let finishedOld = () => {};
  const oldFinished = new Promise<void>((resolve) => { finishedOld = resolve; });
  let count = 0;
  await page.route("**/search/suggest?**", async (route) => {
    const requestNumber = ++count;
    const response = await route.fetch();
    if (requestNumber === 1) {
      sawOld();
      await oldGate;
      await route.fulfill({ response });
      finishedOld();
    } else {
      sawNew();
      await newGate;
      await route.fulfill({ response });
    }
  });
  await page.goto("/discovery");
  await waitForPublicSearchHydration(page);
  const input = page.getByRole("combobox", { name: /Search/i });
  await input.fill("basic");
  await oldStarted;
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await input.fill("basic");
  await newStarted;
  releaseOld();
  await oldFinished;
  await expect(page.getByRole("option")).toHaveCount(0);
  await input.press("ArrowDown");
  await expect(input).not.toHaveAttribute("aria-activedescendant");
  releaseNew();
  await expect(page.getByRole("option", { name: /BASICBIT/ })).toBeVisible();
  await expect(input).not.toHaveAttribute("aria-activedescendant");
});

test("GET search remains usable without JavaScript @flow @fixture", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DJs, clubs & events", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Schedule", exact: true })).toBeHidden();
  const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  await expect(nav.getByRole("link", { name: "Discovery", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Add profile", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
  const homeInput = page.getByRole("combobox", { name: /Search/i });
  await homeInput.fill("BASICBIT");
  await homeInput.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=BASICBIT$/);
  await expect(publicResultRow(page, "/basicbit")).toBeVisible();
  await page.goto("/search?q=basic&type=person");
  const input = page.getByRole("combobox", { name: /Search/i });
  await expect(input.locator("xpath=ancestor::form")).toHaveAttribute("action", "/search");
  await expect(input.locator("xpath=ancestor::form")).toHaveAttribute("method", "get");
  await input.fill("Aurora");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Aurora&type=person$/);
  await context.close();
});
