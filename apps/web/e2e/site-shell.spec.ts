import { expect, test } from "@playwright/test";

test("public routes share one site header and footer", async ({ page }) => {
  for (const path of ["/", "/playwright-afterglow-social", "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions", "/sign-in", "/support", "/developers/api"]) {
    await page.goto(path);
    const header = page.getByRole("banner");
    await expect(header).toHaveCount(1);
    await expect(header.getByRole("img", { name: "VRDex", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Discovery", exact: true })).toHaveAttribute("href", "/discovery");
    await expect(header.getByRole("link", { name: "Add profile", exact: true })).toHaveAttribute("href", "/submit");
    await expect(header.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Contact", exact: true })).toHaveAttribute("href", "/support");
    expect(await page.locator("body").evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("the signed-out header fits a 320 px viewport with usable search", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/support");

  const nav = page.getByRole("navigation", { name: "Primary navigation", exact: true });
  const logo = nav.getByRole("img", { name: "VRDex", exact: true });
  const search = nav.getByRole("button", { name: "Search", exact: true });
  const theme = nav.getByRole("button", { name: "Toggle color theme", exact: true });
  const signIn = nav.getByRole("link", { name: "Sign in", exact: true });
  const discovery = nav.getByRole("link", { name: "Discovery", exact: true });
  const addProfile = nav.getByRole("link", { name: "Add profile", exact: true });
  await expect(signIn).toBeVisible();
  await expect(discovery).toHaveAttribute("href", "/discovery");
  await expect(addProfile).toHaveAttribute("href", "/submit");

  const [mark, searchButton, themeButton, account, directory, add] = await Promise.all(
    [logo, search, theme, signIn, discovery, addProfile].map(item => item.boundingBox()),
  );
  if (!mark || !searchButton || !themeButton || !account || !directory || !add) {
    throw new Error("Expected all primary navigation items to have a visible box.");
  }
  const topCenter = mark.y + mark.height / 2;
  for (const control of [searchButton, themeButton, account]) {
    expect(Math.abs(control.y + control.height / 2 - topCenter)).toBeLessThanOrEqual(1);
  }
  expect(directory.y).toBeGreaterThanOrEqual(searchButton.y + searchButton.height);
  expect(Math.abs(directory.y - add.y)).toBeLessThanOrEqual(1);

  const input = nav.getByRole("combobox", { name: "Search VRDex", exact: true });
  await expect(input).toHaveCount(0);
  await search.click();
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport({ ratio: 1 });
  await expect.poll(async () => (await input.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(80);
  expect(await nav.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(search).toBeFocused();
});

test("the shared header switches to one readable logo in each theme", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "dark"));
  await page.goto("/support");
  const logos = page.getByRole("banner").getByRole("img", { name: "VRDex", exact: true });
  await expect(logos).toHaveCount(1);
  const darkSource = await logos.getAttribute("src");
  await page.getByRole("button", { name: "Toggle color theme", exact: true }).click();
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
