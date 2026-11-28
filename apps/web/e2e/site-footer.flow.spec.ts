import { expect, test } from "@playwright/test";

test("mobile footer keeps developer links together @flow", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vrdex-analytics-choice", "off"));
  await page.route("**/ingest/**", (route) => route.abort());
  await page.goto("/search");

  const footer = page.getByRole("contentinfo").getByRole("navigation", { name: "Site" });
  const links = footer.getByRole("link");
  const names = ["Contact", "Privacy request", "Developers", "GitHub"];
  const settings = footer.getByRole("button", { name: "Usage & privacy" });
  await expect(links).toHaveText(names);

  for (const width of [320, 360, 412]) {
    await page.setViewportSize({ width, height: 760 });
    const positions = await links.evaluateAll((elements) =>
      elements.map((element) => {
        const { left, right, top } = element.getBoundingClientRect();
        return { left, right, top };
      }),
    );
    for (const position of positions) {
      expect(position.left).toBeGreaterThanOrEqual(0);
      expect(position.right).toBeLessThanOrEqual(width);
    }
    expect(Math.abs(positions[2].top - positions[3].top)).toBeLessThanOrEqual(2);
  }

  await page.setViewportSize({ width: 320, height: 760 });
  await links.first().focus();
  for (const name of names.slice(1)) {
    await page.keyboard.press("Tab");
    await expect(footer.getByRole("link", { name })).toBeFocused();
  }

  if (process.env.VRDEX_TEST_FOOTER_ANALYTICS === "true") {
    await expect(settings).toBeVisible();
  } else if (process.env.VRDEX_TEST_FOOTER_ANALYTICS === "false") {
    await expect(settings).toHaveCount(0);
  }
  if (await settings.isVisible()) {
    await settings.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("region", { name: "Usage & privacy" });
    await expect(panel).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(settings).toBeFocused();
  }
});
