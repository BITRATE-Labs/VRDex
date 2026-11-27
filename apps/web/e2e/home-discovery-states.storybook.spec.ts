import { test, expect } from "@playwright/test";
import { prepareVisualPage, waitForVisualReady } from "./public-routes";

test("club rail controls follow overflow and keep keyboard focus at the ends @storybook-snapshot", async ({
  page,
}) => {
  await page.setViewportSize({ width: 485, height: 800 });
  await page.goto(
    "/iframe.html?id=home-discovery--two-clubs-no-events&viewMode=story",
  );
  const clubs = page.getByRole("group", { name: "Clubs", exact: true });
  const cards = clubs.getByTestId("discovery-club-card");
  const rail = cards.first().locator("../..");
  const previous = clubs.getByRole("button", { name: "Previous clubs", exact: true });
  const next = clubs.getByRole("button", { name: "Next clubs", exact: true });

  await expect(next).toBeEnabled();
  await expect(previous).toBeDisabled();
  await expect(previous).not.toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await expect(next).not.toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await expect(rail).toHaveAttribute("data-scroll-right", "");
  await expect(rail).toHaveCSS("mask-image", /linear-gradient/);
  await cards.first().getByRole("button").focus();
  await expect(rail).toHaveCSS("mask-image", "none");

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(rail).toHaveCSS("mask-image", "none");
    await expect(cards.first()).toBeInViewport({ ratio: 0.99 });
    await expect(cards.last()).not.toBeInViewport();
    await next.press("Enter");
    await expect(next).toBeDisabled();
    await expect(next).not.toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
    await expect(next).toBeFocused();
    await expect(previous).toBeEnabled();
    await expect(cards.first()).not.toBeInViewport();
    await expect(cards.last()).toBeInViewport({ ratio: 0.99 });
    const activeClub = cards.last().getByRole("link").first();
    await page.keyboard.press("Tab");
    await expect(activeClub).toBeFocused();
    await expect(cards.first()).not.toBeInViewport();
    await next.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(previous).toBeFocused();
    await previous.press("Space");
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
  }

  // Native scrolling updates the same controls.
  await rail.evaluate((element) => element.scrollTo(element.scrollWidth, 0));
  await expect(rail).toHaveAttribute("data-scroll-left", "");
  await expect(rail).not.toHaveAttribute("data-scroll-right", "");
  await expect(next).toBeDisabled();
  await expect(rail).toHaveCSS("mask-image", "none");

  await previous.focus();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(next).toHaveCount(0);
  await expect(previous).toHaveCount(0);
  await expect(rail).toHaveCSS("mask-image", "none");
  await expect(cards.last().getByRole("link").first()).toBeFocused();

  await page.setViewportSize({ width: 320, height: 800 });
  for (const story of ["one-club-no-events", "empty", "loading"]) {
    await page.goto(`/iframe.html?id=home-discovery--${story}&viewMode=story`);
    await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
    await expect(next).toHaveCount(0);
    await expect(previous).toHaveCount(0);
  }
});

for (const state of [
  "mixed",
  "one-event-two-clubs",
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
    if (!isMobile && state === "one-event-two-clubs") {
      const event = page.getByRole("link", { name: "Open ORBIT", exact: true });
      const clubs = page.getByTestId("discovery-club-card");
      await expect(page.getByTestId("discovery-event-card")).toHaveCount(1);
      await expect(clubs).toHaveCount(2);
      const posterBounds = (await event.locator("..").boundingBox())!;
      const firstClub = (await clubs.first().boundingBox())!;
      const secondClub = (await clubs.last().boundingBox())!;
      expect(posterBounds.width).toBeCloseTo(firstClub.width);
      expect(posterBounds.width).toBeCloseTo(secondClub.width);
      expect(firstClub.x - posterBounds.x - posterBounds.width).toBe(24);
      const browse = page.getByRole("link", { name: "Browse", exact: true });
      const browseBounds = (await browse.boundingBox())!;
      expect(browseBounds.x + browseBounds.width).toBeCloseTo(secondClub.x + secondClub.width);
      await event.focus();
      await expect(event).toBeFocused();
      await event.blur();
    }
    if (state === "mixed") {
      const event = page.getByTestId("discovery-event-card").first();
      const interest = event.getByRole("button", { name: /^Interested:/ });
      const favorite = page.getByTestId("discovery-club-card").getByRole("button", { name: /^Favorite:/ }).first();
      for (const [action, label] of [[interest, "Interested"], [favorite, "Favorite"]] as const) {
        const visualLabel = action.getByText(label, { exact: true });
        await expect(visualLabel).toHaveAttribute("aria-hidden", "true");

        await expect(visualLabel).toBeVisible();
        const bounds = (await action.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      await expect(interest).toHaveCSS("opacity", "1");
      const artwork = (await event.getByRole("link", { name: /^Open / }).boundingBox())!;
      const action = (await interest.boundingBox())!;
      const caption = (await event.locator("p").first().boundingBox())!;
      expect(action.y).toBeGreaterThanOrEqual(artwork.y + artwork.height);
      expect(caption.width).toBeCloseTo(artwork.width + 2);
    }
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
