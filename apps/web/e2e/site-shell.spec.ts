import { expect, test } from "@playwright/test";

import { closeSiteMenu, openSiteMenu, toggleSiteTheme, waitForSiteMenuHydration } from "./flow-navigation";

test("public routes share one site header and footer", async ({ page }) => {
  for (const path of ["/", "/playwright-afterglow-social", "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions", "/sign-in", "/support", "/developers/api"]) {
    await page.goto(path);
    const header = page.getByRole("banner");
    await expect(header).toHaveCount(1);
    await expect(header.getByRole("img", { name: "VRDex", exact: true })).toBeVisible();
    await openSiteMenu(page);
    await expect(header.getByRole("link", { name: "Discovery", exact: true })).toHaveAttribute("href", "/discovery");
    await expect(header.getByRole("link", { name: "Add profile", exact: true })).toHaveAttribute("href", "/submit");
    await closeSiteMenu(page);
    await expect(header.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Contact", exact: true })).toHaveAttribute("href", "/support");
    expect(await page.locator("body").evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("the first Tab offers a shortcut to main content", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const skipLink = page.getByRole("link", { name: "Skip to content", exact: true });
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  const logo = nav.getByRole("link", { name: "VRDex", exact: true });
  const main = page.getByRole("main");
  const heading = main.getByRole("heading", { level: 1 });
  const restingHeadingTop = (await heading.boundingBox())?.y;

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport({ ratio: 1 });
  await expect(logo).toBeInViewport({ ratio: 1 });
  expect((await nav.boundingBox())?.y).toBeGreaterThan(44);
  await page.keyboard.press("Tab");
  await expect(logo).toBeFocused();
  await expect(skipLink).not.toBeInViewport();
  await page.keyboard.press("Shift+Tab");
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await expect(main).toBeFocused();
  await expect(main).toHaveCSS("outline-style", "none");
  await expect(heading).toBeInViewport({ ratio: 1 });
  expect((await heading.boundingBox())?.y).toBe(restingHeadingTop);
  await page.keyboard.press("Tab");
  await expect(main.getByRole("combobox", { name: "Search VRDex" })).toBeFocused();
});

for (const width of [320, 390]) {
  test(`the ${width}px header keeps search and the navigation disclosure in one row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
    await page.goto("/support");

    const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
    const logo = nav.getByRole("link", { name: "VRDex", exact: true });
    const search = nav.getByRole("button", { name: "Search", exact: true });
    const menu = nav.getByRole("button", { name: "Menu", exact: true });
    const signIn = nav.getByRole("link", { name: "Sign in", exact: true });
    const discovery = nav.getByRole("link", { name: "Discovery", exact: true });
    const addProfile = nav.getByRole("link", { name: "Add profile", exact: true });
    const theme = nav.getByRole("button", { name: "Toggle color theme", exact: true });

    await expect(signIn).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(discovery).toHaveCount(0);
    await expect(theme).toHaveCount(0);
    expect((await nav.boundingBox())?.height).toBeLessThanOrEqual(65);
    const [mark, searchButton, account, menuButton] = await Promise.all(
      [logo, search, signIn, menu].map(item => item.boundingBox()),
    );
    if (!mark || !searchButton || !account || !menuButton) throw new Error("Missing top-row bounds");
    for (const control of [mark, searchButton, account, menuButton]) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(control.y + control.height / 2 - (mark.y + mark.height / 2))).toBeLessThanOrEqual(1);
    }

    const mainHeading = page.getByRole("main").getByRole("heading", { level: 1 });
    const before = (await mainHeading.boundingBox())?.y;
    await waitForSiteMenuHydration(menu);
    await menu.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(discovery).toBeFocused();
    await expect(discovery).toHaveAttribute("href", "/discovery");
    await expect(addProfile).toHaveAttribute("href", "/submit");
    await expect(nav.getByRole("link", { name: "My events", exact: true })).toHaveCount(0);
    for (const control of [discovery, addProfile, theme]) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    await discovery.press("Escape");
    await expect(menu).toBeFocused();
    await expect(discovery).toHaveCount(0);

    const input = nav.getByRole("combobox", { name: "Search VRDex", exact: true });
    await menu.click();
    await search.click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport({ ratio: 1 });
    expect((await input.boundingBox())?.width).toBeGreaterThanOrEqual(width - 60);
    expect((await input.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await mainHeading.boundingBox())?.y).toBe(before);
    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(search).toBeFocused();

    await search.press("Enter");
    await expect(input).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(signIn).toBeFocused();
    await expect(input).toHaveCount(0);

    await menu.click();
    await theme.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await discovery.click();
    await expect(page).toHaveURL(/\/discovery$/, { timeout: 15_000 });
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await openSiteMenu(page);
    await discovery.click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
    expect(await nav.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}

test("mobile header search submits the query unless a suggestion is selected", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const match = "Aurora";
  const noMatch = "vrdex-no-match & test";
  await page.route(/\/search\/suggest\?q=/, (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    return route.fulfill({
      json: {
        results: query === match
          ? [{ entityType: "profile", profileType: "person", slug: "playwright-dj-aurora", title: "DJ Aurora", routePath: "/playwright-dj-aurora" }]
          : [],
      },
    });
  });
  await page.goto("/support");

  const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  const toggle = nav.getByRole("button", { name: "Search", exact: true });
  const input = nav.getByRole("combobox", { name: "Search VRDex", exact: true });
  const option = nav.getByRole("option", { name: /DJ Aurora/ });

  async function openSearch() {
    await waitForSiteMenuHydration(toggle);
    if (isMobile) await toggle.tap();
    else await toggle.click();
    await expect(input).toBeFocused();
  }

  await openSearch();
  await input.fill(" ");
  await input.press("Enter");
  await expect(input).toBeFocused();
  await expect(page).toHaveURL(/\/support$/);

  await input.fill(match);
  await expect(option).toBeVisible();
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Aurora$/);
  await expect(page.getByRole("main").getByRole("link", { name: /DJ Aurora/ })).toBeVisible();
  await expect(input).toHaveCount(0);
  await page.goBack();

  await openSearch();
  const suggestions = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/search/suggest" && url.searchParams.get("q") === noMatch;
  });
  await input.fill(noMatch);
  await suggestions;
  await expect(nav.getByRole("option")).toHaveCount(0);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=vrdex-no-match\+%26\+test$/);
  await expect(page.getByText("No public results matched that search yet.")).toBeVisible();
  await expect(input).toHaveCount(0);
  await page.goBack();

  await openSearch();
  await input.fill(match);
  await expect(option).toBeVisible();
  await input.press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/playwright-dj-aurora$/);
});

test("the mobile menu meets the desktop navigation at 639 and 640 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 639, height: 720 });
  await page.goto("/support");
  const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  const menu = nav.getByRole("button", { name: "Menu", exact: true });
  const discovery = nav.getByRole("link", { name: "Discovery", exact: true });
  const theme = nav.getByRole("button", { name: "Toggle color theme", exact: true });
  await openSiteMenu(page);
  await expect(discovery).toBeVisible();

  await page.setViewportSize({ width: 640, height: 720 });
  await expect(menu).toHaveCount(0);
  await expect(discovery).toHaveCount(1);
  await expect(theme).toHaveCount(1);
  await page.setViewportSize({ width: 639, height: 720 });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(discovery).toHaveCount(0);
});

test("the phone header keeps its menu reachable at enlarged text sizes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/support");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  const menu = nav.getByRole("button", { name: "Menu", exact: true });
  const theme = nav.getByRole("button", { name: "Toggle color theme", exact: true });
  await expect(nav.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(menu).toBeInViewport({ ratio: 1 });
  expect((await nav.boundingBox())?.height).toBeLessThan(568 / 2);
  expect(await nav.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  await openSiteMenu(page);
  await expect(nav.getByRole("link", { name: "Discovery", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(nav.getByRole("link", { name: "Add profile", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(theme).toBeInViewport({ ratio: 1 });
  await theme.focus();
  await theme.press("Escape");
  await expect(menu).toBeFocused();
  await expect(theme).toHaveCount(0);
});

test("the shared header switches to one readable logo in each theme", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
  await page.goto("/support");
  const logos = page.getByRole("banner").getByRole("img", { name: "VRDex", exact: true });
  await expect(logos).toHaveCount(1);
  const darkSource = await logos.getAttribute("src");
  await toggleSiteTheme(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(logos).toHaveCount(1);
  await expect(logos).not.toHaveAttribute("src", darkSource ?? "");
});

test("an unavailable event backend retains the public shell", async ({ page }) => {
  const response = await page.goto("/unconfigured-community/events/unconfigured-event");
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
});
