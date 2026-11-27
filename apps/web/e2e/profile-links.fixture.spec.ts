import { expect, test } from "@playwright/test";

test("Discord keeps its handle visible and copies it from the compact control @fixture", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { sessionStorage.setItem("copied-profile-link", text); } } });
  });
  await page.goto("/basicbit");
  const copy = page.getByRole("button", { name: "Copy Discord", exact: true });
  await expect(copy.getByText("basic_bit", { exact: true })).toBeVisible();
  await copy.click();
  await expect(page.getByRole("button", { name: "Discord copied", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("copied-profile-link"))).toBe("basic_bit");
  await expect(page.getByRole("button", { name: "Discord copied", exact: true }).getByText("basic_bit", { exact: true })).toBeVisible();
});

test("VRChat keeps the account name visible inside its destination card @fixture", async ({ page }) => {
  await page.goto("/basicbit");
  const link = page.getByRole("link", { name: "VRChat BASICBIT", exact: true });
  await expect(link.getByText("BASICBIT", { exact: true })).toBeVisible();
  await expect(link.getByText("VRChat", { exact: true })).toHaveCount(1);
  await expect(link.getByText(/VRChat:/)).toHaveCount(0);
  await expect(link).toHaveAttribute("href", /vrchat\.com\/home\/user\//);
});

test("Twitch joins the link cards and compact VRCDN controls keep full copy values @fixture", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { sessionStorage.setItem("copied-profile-link", text); } } });
  });
  await page.route("**/api/profile-live/basicbit/vrcdn*", route => route.fulfill({ json: { states: { basicbit: "live" } } }));
  await page.goto("/basicbit");
  const links = page.getByRole("heading", { name: "Links", exact: true }).locator("xpath=ancestor::section[1]");
  await expect(links.getByRole("link", { name: "Twitch basic_bit", exact: true })).toHaveAttribute("href", "https://www.twitch.tv/basic_bit");
  await expect(page.getByRole("link", { name: /Open preview/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play VRCDN stream", exact: true })).toBeVisible();
  for (const [label, value] of [["Quest", "https://stream.vrcdn.live/live/basicbit.live.ts"], ["PC", "rtspt://stream.vrcdn.live/live/basicbit"]]) {
    await page.getByRole("button", { name: `Copy ${label}`, exact: true }).click();
    expect(await page.evaluate(() => sessionStorage.getItem("copied-profile-link"))).toBe(value);
  }
});

test("multiple profile streams expose distinct copy actions and keep exact destinations @fixture", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => { sessionStorage.setItem("copied-profile-link", text); } },
    });
  });
  await page.route("**/api/profile-live/playwright-dj-aurora/vrcdn*", route => route.fulfill({ json: { states: {} } }));
  await page.goto("/playwright-dj-aurora");

  for (const [stream, context] of [
    ["dj-aurora", "VRCDN dj-aurora"],
    ["suggested-aurora", "Suggested VRCDN suggested-aurora"],
  ]) {
    for (const [device, value] of [
      ["Quest", `https://stream.vrcdn.live/live/${stream}.live.ts`],
      ["PC", `rtspt://stream.vrcdn.live/live/${stream}`],
    ]) {
      const copyName = `Copy ${device} for ${context}`;
      const copy = page.getByRole("button", { name: copyName, exact: true });
      await expect(copy).toHaveAttribute("title", copyName);
      await copy.click();
      await expect(page.getByRole("button", { name: `${device} copied for ${context}`, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem("copied-profile-link"))).toBe(value);
    }
  }
});

test("an artless occurrence on a sparse profile uses its theme colors @fixture", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "light"));
  expect((await page.goto("/playwright-event-only-profile"))?.status()).toBe(200);

  const title = page.getByRole("link", { name: "July Fourth Sessions", exact: true });
  await expect(title).toHaveAttribute("href", "/playwright-afterglow-social/events/playwright-date-only-sparse-guest");
  const card = page.getByRole("article").filter({ has: title });
  const date = card.locator("time");
  await expect(date).toHaveText(/Time TBA/);
  const header = card.locator(":scope > div").first();
  await expect(header).toHaveCSS("background-image", /^linear-gradient\(/);
  await expect(header).not.toHaveCSS("background-image", /url\(/);

  const seenGradients = new Set<string>();
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") {
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition", "true");
    const [titleColor, dateColor, gradient] = await Promise.all([
      title.evaluate((element) => getComputedStyle(element).color),
      date.evaluate((element) => getComputedStyle(element).color),
      header.evaluate((element) => getComputedStyle(element).backgroundImage),
    ]);
    expect(seenGradients.has(gradient)).toBe(false);
    seenGradients.add(gradient);
    const stops = gradient.match(/rgb\([^)]*\)/g) ?? [];
    expect(stops).toHaveLength(2);

    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)?.map(Number);
      if (channels?.length !== 3) throw new Error(`Expected an opaque RGB color, got ${color}`);
      const [red, green, blue] = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const ratios = stops.map((stop) => {
      const contrast = (color: string) => {
        const first = luminance(color);
        const second = luminance(stop);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      };
      return { stop, title: contrast(titleColor), date: contrast(dateColor) };
    });
    await testInfo.attach(`artless-occurrence-${theme}-contrast`, {
      body: JSON.stringify({ titleColor, dateColor, ratios }, null, 2),
      contentType: "application/json",
    });
    for (const { title, date } of ratios) {
      expect(title).toBeGreaterThanOrEqual(4.5);
      expect(date).toBeGreaterThanOrEqual(4.5);
    }
    if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
      await card.screenshot({ path: testInfo.outputPath(`artless-occurrence-${theme}.png`), animations: "disabled" });
    }
  }
});

test("a sparse person profile puts its identity and ownership together @fixture", async ({ page }) => {
  expect((await page.goto("/playwright-sparse-import"))?.status()).toBe(200);
  const identity = page.getByRole("region", { name: "Sparse Import", exact: true });
  const ownership = page.getByRole("complementary", { name: "Profile ownership" });
  await expect(identity.getByRole("img", { name: "Sparse Import display image", exact: true })).toBeVisible();
  await expect(ownership.getByText("Unclaimed", { exact: true })).toBeVisible();
  await expect(ownership.getByRole("link", { name: "Claim profile", exact: true })).toHaveAttribute("href", "/claim/playwright-sparse-import?source=profile");
  await expect(ownership.getByRole("link", { name: "Suggest an edit", exact: true })).toHaveAttribute("href", "/playwright-sparse-import/edit");
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(identity).toBeInViewport({ ratio: 1 });
    const [hero, actions] = await Promise.all([identity.boundingBox(), ownership.boundingBox()]);
    if (!hero || !actions) throw Error("Missing sparse profile identity or ownership bounds");
    expect(Math.abs(hero.y + hero.height - actions.y)).toBeLessThanOrEqual(2);
    expect(hero.width).toBeLessThanOrEqual(672);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});
