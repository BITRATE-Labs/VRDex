import { test, expect } from "@playwright/test";
import { prepareVisualPage, waitForVisualReady } from "./public-routes";

test("discovery rail fades the overflow edge and clears the fade on focus @storybook-snapshot", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(
    "/iframe.html?id=home-discovery--two-clubs-no-events&viewMode=story",
  );
  const clubs = page.getByRole("group", { name: "Clubs", exact: true });
  const rail = clubs.getByTestId("discovery-club-card").first().locator("../..");
  const firstFavorite = clubs.getByRole("button").first();

  await expect(rail).toHaveAttribute("data-scroll-right", "");
  await expect(rail).not.toHaveAttribute("data-scroll-left", "");
  await expect(rail).toHaveCSS("mask-image", /linear-gradient/);
  await firstFavorite.focus();
  await expect(rail).toHaveCSS("mask-image", "none");

  await firstFavorite.blur();
  await rail.evaluate((element) => element.scrollTo(element.scrollWidth, 0));
  await expect(rail).toHaveAttribute("data-scroll-left", "");
  await expect(rail).not.toHaveAttribute("data-scroll-right", "");
  await expect(rail).toHaveCSS("mask-image", /linear-gradient/);
});

for (const state of [
  "mixed",
  "cold-start",
  "sparse",
  "empty",
  "one-club-no-events",
  "two-clubs-no-events",
  "two-events-no-clubs",
  "partial",
  "failed",
  "loading",
  "missing-artwork",
  "missing-public-genres",
  "long-custom-labels",
]) {
  test(`discovery ${state} presentation @storybook-snapshot`, async ({
    page,
    isMobile,
  }) => {
    await prepareVisualPage(page);
    await page.goto(`/iframe.html?id=home-discovery--${state}&viewMode=story`);
    await expect(
      page.getByRole("heading", { name: "Discover", exact: true }),
    ).toBeVisible();
    await waitForVisualReady(page);
    if (state.includes("-no-")) {
      const emptyName = state.endsWith("-no-events") ? "Events" : "Clubs";
      const populatedName = emptyName === "Events" ? "Clubs" : "Events";
      const empty = page.getByRole("group", { name: emptyName, exact: true });
      const populated = page.getByRole("group", { name: populatedName, exact: true });
      const status = empty.getByText(`No ${emptyName.toLowerCase()}`, { exact: true });
      await expect(status).toBeVisible();
      const statusContentTop = await status.evaluate((element) =>
        element.getBoundingClientRect().top + parseFloat(getComputedStyle(element).paddingTop),
      );
      const heading = (await empty.getByRole("heading", { name: emptyName, exact: true }).boundingBox())!;
      expect(statusContentTop - (heading.y + heading.height)).toBeLessThanOrEqual(20);
      const emptyBounds = (await empty.boundingBox())!;
      const populatedBounds = (await populated.boundingBox())!;
      if (isMobile) {
        expect(emptyBounds.width).toBe(populatedBounds.width);
      } else {
        expect(emptyBounds.width).toBeLessThan(populatedBounds.width);
      }
    }
    await page.locator("img").evaluateAll(async (images) => {
      await Promise.all(
        images.map(async (image) => {
          if (image instanceof HTMLImageElement) {
            image.loading = "eager";
            await image.decode();
          }
        }),
      );
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    await expect(page).toHaveScreenshot(`home-discovery-state-${state}.png`, {
      animations: "disabled",
      caret: "hide",
      fullPage: true,
      maxDiffPixelRatio: 0.002,
      threshold: 0.2,
      scale: "css",
    });
  });
}
