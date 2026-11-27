import { expect, type Locator, type Page } from "@playwright/test";

export async function gotoFlowPage(page: Page, path: string) {
  try {
    await page.goto(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("net::ERR_ABORTED")) {
      throw error;
    }

    await page.waitForTimeout(250);
    await page.goto(path);
  }
}

export async function waitForSiteMenuHydration(menu: Locator) {
  await expect.poll(() => menu.evaluate((button) =>
    Object.keys(button).some((key) => {
      if (!key.startsWith("__reactProps$")) return false;
      const props: unknown = Reflect.get(button, key);
      return props !== null && typeof props === "object" && "onClick" in props && typeof props.onClick === "function";
    }),
  ), { message: "Site Menu has a hydrated click handler" }).toBe(true);
}

export async function openSiteMenu(page: Page) {
  const menu = page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible() && await menu.getAttribute("aria-expanded") === "false") {
    await waitForSiteMenuHydration(menu);
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
  }
}

export async function closeSiteMenu(page: Page) {
  const menu = page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible() && await menu.getAttribute("aria-expanded") === "true") await menu.click();
}

export async function toggleSiteTheme(page: Page) {
  await openSiteMenu(page);
  await page.getByRole("banner").getByRole("button", { name: "Toggle color theme", exact: true }).click();
  await closeSiteMenu(page);
}
