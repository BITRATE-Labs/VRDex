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
