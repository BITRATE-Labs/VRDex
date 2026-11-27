import { expect, test } from "@playwright/test";

const neonHarborWorldUrl = "https://vrchat.com/home/world/wrld_00000000-0000-4000-8000-000000000001";
const neonHarborReferenceUrl = "https://example.invalid/neon-harbor-notes";
const afterglowEventPath = "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions";

test("world shows artwork and linked creator pictures without placeholder copy", async ({ page }) => {
  await page.goto("/playwright-neon-harbor");
  await expect(page.getByText("Place, vibe, context", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "About this world", exact: true })).toBeVisible();
  const platforms = page.locator("dl > div").filter({ has: page.getByText("Platforms", { exact: true }) });
  await expect(platforms.getByText("PC", { exact: true })).toBeVisible();
  await expect(platforms.getByText("Android / Quest", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Neon Harbor", exact: true })).toBeVisible();
  for (const creator of ["Afterglow Social", "DJ Aurora"]) {
    const credit = page.getByRole("link").filter({ hasText: creator });
    await expect(credit.getByRole("img")).toBeVisible();
    if (creator === "DJ Aurora") await expect(credit.getByRole("img")).toHaveAttribute("src", /\/api\/e2e\/fixture-assets\/fixture-aurora-profile-image$/);
  }

  const upcoming = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Afterglow Harbor Sessions", exact: true, level: 4 }),
  });
  const recent = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Neon Harbor Opening Night", exact: true, level: 4 }),
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(upcoming.locator("time")).toHaveAttribute("datetime", "2026-06-15T02:00:00.000Z");
  await expect(recent.locator("time")).toHaveAttribute("datetime", "2026-04-18T23:00:00.000Z");
  for (const event of [upcoming, recent]) {
    await expect(event.getByText("Confirmed venue", { exact: true })).toBeVisible();
    await expect(event.getByText("/", { exact: true })).toHaveCount(0);
  }
  const upcomingEvent = upcoming.getByRole("link", { name: "Afterglow Harbor Sessions", exact: true });
  const upcomingSource = upcoming.getByRole("link", { name: "Afterglow event listing", exact: true });
  const upcomingSummary = upcoming.getByText("Late-night harbor club session with house, trance, and warm social energy.");
  await expect(upcomingEvent).toHaveAttribute("href", afterglowEventPath);
  await expect(upcomingEvent).not.toHaveAttribute("target", "_blank");
  await expect(upcomingSource).toHaveAttribute("href", "https://example.invalid/events/afterglow-harbor-sessions");
  await expect(upcomingSource).toHaveAttribute("target", "_blank");
  await expect(recent.getByText("Community-submitted event", { exact: true })).toBeVisible();
  await expect(recent.getByRole("link")).toHaveCount(0);
  const [phoneUpcoming, phoneRecent, phoneEvent, phoneSource, phoneSummary] = await Promise.all([
    upcoming.boundingBox(),
    recent.boundingBox(),
    upcomingEvent.boundingBox(),
    upcomingSource.boundingBox(),
    upcomingSummary.boundingBox(),
  ]);
  if (!phoneUpcoming || !phoneRecent || !phoneEvent || !phoneSource || !phoneSummary) {
    throw new Error("Missing phone event card bounds");
  }
  for (const link of [phoneEvent, phoneSource]) {
    expect(link.height).toBeGreaterThanOrEqual(44);
    expect(link.width).toBeGreaterThanOrEqual(44);
  }
  expect(phoneEvent.y + phoneEvent.height).toBeLessThan(phoneSource.y);
  expect(phoneSource.y + phoneSource.height).toBeLessThan(phoneSummary.y);
  expect(phoneRecent.x).toBeCloseTo(phoneUpcoming.x, 0);
  expect(phoneRecent.y).toBeGreaterThan(phoneUpcoming.y + phoneUpcoming.height);

  await page.setViewportSize({ width: 1280, height: 900 });
  const [desktopUpcoming, desktopRecent] = await Promise.all([upcoming.boundingBox(), recent.boundingBox()]);
  if (!desktopUpcoming || !desktopRecent) throw new Error("Missing desktop event card bounds");
  expect(desktopRecent.y).toBeCloseTo(desktopUpcoming.y, 0);
  expect(desktopRecent.x).toBeGreaterThan(desktopUpcoming.x + desktopUpcoming.width);
});


test("world references have thumbnails and world page has no duplicate add action", async({page})=>{
 for(const path of ['/playwright-dj-aurora','/playwright-afterglow-social']){
  await page.goto(path,{waitUntil:'domcontentloaded'});
  const world=page.getByRole('link').filter({has:page.getByText('Neon Harbor',{exact:true})}).last();
  await expect(world.getByRole('img',{name:'Neon Harbor',exact:true})).toBeVisible();
 }
 await page.goto('/playwright-neon-harbor',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('link',{name:'Add a missing profile',exact:true})).toHaveCount(0);
});

test("world puts the single VRChat destination before hero artwork on phones", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 720 });
  const response = await page.goto("/playwright-neon-harbor");
  expect(response?.status()).toBe(200);

  const main = page.getByRole("main");
  const title = main.getByRole("heading", { name: "Neon Harbor", exact: true });
  const openWorld = main.getByRole("link", { name: "Open VRChat world", exact: true });
  const platforms = main.getByText("Platforms", { exact: true });
  const summary = main.getByText(/Cyberpunk harbor club world/);
  const visibility = main.getByText("Visibility", { exact: true });
  const artwork = main.getByRole("img", { name: "Neon Harbor", exact: true });
  await expect(openWorld).toHaveAttribute("href", neonHarborWorldUrl);
  await expect(openWorld).toHaveAttribute("target", "_blank");
  await expect(openWorld).toHaveAttribute("rel", "noreferrer");
  await expect(main.locator(`a[href="${neonHarborWorldUrl}"]`)).toHaveCount(1);
  await expect(main.getByRole("link", { name: "Reference link", exact: true })).toHaveCount(0);

  for (const width of [320, 412]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(openWorld).toBeInViewport({ ratio: 1 });
    const [heading, label, platform, action, intro, status, image] = await Promise.all([
      title.boundingBox(), platforms.boundingBox(), main.getByText("Android / Quest", { exact: true }).boundingBox(),
      openWorld.boundingBox(), summary.boundingBox(), visibility.boundingBox(), artwork.boundingBox(),
    ]);
    if (!heading || !label || !platform || !action || !intro || !status || !image) throw new Error("Missing world hero bounds");
    const titleGap = label.y - heading.y - heading.height;
    expect(titleGap).toBeGreaterThanOrEqual(0);
    expect(titleGap).toBeLessThanOrEqual(20);
    expect(action.y + action.height).toBeLessThan(intro.y);
    expect(intro.y + intro.height).toBeLessThan(status.y);
    expect(action.y + action.height).toBeLessThan(image.y);
    const platformGap = action.y - platform.y - platform.height;
    expect(platformGap).toBeGreaterThanOrEqual(0);
    expect(platformGap).toBeLessThanOrEqual(20);
    expect(action.height).toBeGreaterThanOrEqual(44);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  const [intro, label, status, action] = await Promise.all([
    summary.boundingBox(), platforms.boundingBox(), visibility.boundingBox(), openWorld.boundingBox(),
  ]);
  if (!intro || !label || !status || !action) throw new Error("Missing desktop world hero bounds");
  expect(intro.y + intro.height).toBeLessThan(label.y);
  expect(status.y).toBeCloseTo(label.y, 0);
  expect(label.y + label.height).toBeLessThan(action.y);
});

test("world retains a reference destination when it differs or stands alone", async ({ page }) => {
  const main = page.getByRole("main");
  const openWorld = main.getByRole("link", { name: "Open VRChat world", exact: true });
  const reference = main.getByRole("link", { name: "Reference link", exact: true });

  await page.goto("/playwright-neon-harbor-distinct-reference");
  await expect(openWorld).toHaveAttribute("href", neonHarborWorldUrl);
  await expect(reference).toHaveAttribute("href", neonHarborReferenceUrl);

  await expect(main.getByRole("heading", { name: "Upcoming and active", exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Recent", exact: true })).toHaveCount(0);

  await page.goto("/playwright-neon-harbor-reference-only");
  await expect(openWorld).toHaveCount(0);
  await expect(reference).toHaveAttribute("href", neonHarborReferenceUrl);
  await expect(main.getByText("Not listed", { exact: true })).toHaveCount(0);
});

test("sparse world renders real identity without fabricating a destination", async ({ page }) => {
  const response = await page.goto("/playwright-lantern-cove");
  expect(response?.status()).toBe(200);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Lantern Cove", exact: true })).toBeVisible();
  await expect(main.getByText("World visibility", { exact: true })).toBeVisible();
  await expect(main.getByText("VRChat link", { exact: true })).toBeVisible();
  await expect(main.getByText("Not listed", { exact: true })).toBeVisible();
  const platforms = main.locator("dl > div").filter({ has: page.getByText("Platforms", { exact: true }) });
  const destination = main.locator("dl > div").filter({ has: page.getByText("VRChat link", { exact: true }) });
  const visibility = main.locator("dl > div").filter({ has: page.getByText("World visibility", { exact: true }) });
  await expect(platforms.getByText("Unknown", { exact: true })).toBeVisible();
  await expect(main.locator("dl")).toHaveCount(1);
  const record = main.locator("section");
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(record).toBeInViewport({ ratio: 1 });
    const [shell, card] = await Promise.all([main.boundingBox(), record.boundingBox()]);
    if (!shell || !card) throw new Error("Missing sparse world bounds");
    expect(card.y - shell.y).toBeGreaterThanOrEqual(24);
    expect(card.y - shell.y).toBeLessThanOrEqual(40);

    const [platform, link, status] = await Promise.all([
      platforms.boundingBox(), destination.boundingBox(), visibility.boundingBox(),
    ]);
    if (!platform || !link || !status) throw new Error("Missing sparse world metadata bounds");
    expect(link.y).toBeCloseTo(platform.y, 0);
    expect(link.x).toBeGreaterThan(platform.x);
    if (width === 320) {
      expect(status.y).toBeGreaterThan(Math.max(platform.y + platform.height, link.y + link.height));
    } else {
      expect(status.y).toBeCloseTo(platform.y, 0);
      expect(status.x).toBeGreaterThan(link.x + link.width);
    }
  }
  await expect(main.getByText("Public", { exact: true })).toBeVisible();
  await expect(main.getByRole("img", { name: "Lantern Cove", exact: true })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "About this world", exact: true })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Events at this world", exact: true })).toHaveCount(0);
  await expect(main.getByText(/No public|No confirmed/)).toHaveCount(0);
  await expect(main.getByRole("link", { name: /VRChat/i })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Reference link", exact: true })).toHaveCount(0);
});

test("world event shortcut follows launch and puts keyboard focus on the populated section", async ({ page }) => {
  const main = page.getByRole("main");
  const shortcut = main.getByRole("link", { name: "Events", exact: true });
  const eventHeading = main.getByRole("heading", { name: "Events at this world", exact: true });
  const openWorld = main.getByRole("link", { name: "Open VRChat world", exact: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/playwright-neon-harbor", { waitUntil: "domcontentloaded" });
  await expect(shortcut).toBeHidden();
  await expect(eventHeading).toBeInViewport({ ratio: 1 });

  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/playwright-neon-harbor", { waitUntil: "domcontentloaded" });
    await expect(shortcut).toBeInViewport({ ratio: 1 });
    await expect(shortcut).toHaveAttribute("href", "#world-events");
    await openWorld.focus();
    await page.keyboard.press("Tab");
    await expect(shortcut).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#world-events$/);
    await expect(eventHeading).toBeFocused();
    await expect(eventHeading).toBeInViewport({ ratio: 1 });

    const [heading, header] = await Promise.all([eventHeading.boundingBox(), page.locator("header").boundingBox()]);
    if (!heading || !header) throw new Error("Missing focused heading or sticky header bounds");
    expect(heading.y).toBeGreaterThan(header.y + header.height);
    const event = main.getByRole("link", { name: "Afterglow Harbor Sessions", exact: true });
    await page.keyboard.press("Tab");
    await expect(event).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(main.getByRole("link", { name: "Afterglow event listing", exact: true })).toBeFocused();
    await event.focus();
    await Promise.all([
      page.waitForURL(afterglowEventPath, { waitUntil: "domcontentloaded" }),
      page.keyboard.press("Enter"),
    ]);
    await expect(main.getByRole("heading", { name: "Afterglow Harbor Sessions", level: 1, exact: true })).toBeVisible();
  }

  await page.goto("/playwright-neon-harbor-reference-only", { waitUntil: "domcontentloaded" });
  await expect(openWorld).toHaveCount(0);
  await expect(shortcut).toBeInViewport({ ratio: 1 });
  await expect(main.getByRole("link", { name: "Discovery", exact: true })).toHaveCount(0);
});

test("sparse world offers Discovery where the mobile header has no direct link", async ({ page }) => {
  const inPageDiscovery = page.getByRole("main").getByRole("link", { name: "Discovery", exact: true });
  const headerDiscovery = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Discovery", exact: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/playwright-lantern-cove");
  await expect(inPageDiscovery).toBeHidden();
  await expect(headerDiscovery).toBeVisible();

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(headerDiscovery).toBeHidden();
  await expect(page.getByRole("main").getByRole("link", { name: "Events", exact: true })).toHaveCount(0);
  await expect(inPageDiscovery).toHaveAttribute("href", "/discovery");
  await expect(inPageDiscovery).toBeInViewport({ ratio: 1 });
  await inPageDiscovery.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/discovery$/);
  await expect(page.getByRole("heading", { name: "Discover VR", exact: true })).toBeVisible();
});
