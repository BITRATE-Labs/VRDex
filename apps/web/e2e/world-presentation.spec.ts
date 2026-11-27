import { expect, test } from "@playwright/test";

const neonHarborWorldUrl = "https://vrchat.com/home/world/wrld_00000000-0000-4000-8000-000000000001";
const neonHarborReferenceUrl = "https://example.invalid/neon-harbor-notes";

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
});


test("world references have thumbnails and world page has no duplicate add action", async({page})=>{
 for(const path of ['/playwright-dj-aurora','/playwright-afterglow-social']){
  await page.goto(path,{waitUntil:'networkidle'});
  const world=page.getByRole('link').filter({has:page.getByText('Neon Harbor',{exact:true})}).last();
  await expect(world.getByRole('img',{name:'Neon Harbor',exact:true})).toBeVisible();
 }
 await page.goto('/playwright-neon-harbor');
 await expect(page.getByRole('link',{name:'Add a missing profile',exact:true})).toHaveCount(0);
});

test("world puts the single VRChat destination before hero artwork on phones", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 720 });
  const response = await page.goto("/playwright-neon-harbor");
  expect(response?.status()).toBe(200);

  const main = page.getByRole("main");
  const openWorld = main.getByRole("link", { name: "Open VRChat world", exact: true });
  const artwork = main.getByRole("img", { name: "Neon Harbor", exact: true });
  await expect(openWorld).toHaveAttribute("href", neonHarborWorldUrl);
  await expect(openWorld).toHaveAttribute("target", "_blank");
  await expect(openWorld).toHaveAttribute("rel", "noreferrer");
  await expect(main.locator(`a[href="${neonHarborWorldUrl}"]`)).toHaveCount(1);
  await expect(main.getByRole("link", { name: "Reference link", exact: true })).toHaveCount(0);

  for (const width of [320, 412]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(openWorld).toBeInViewport({ ratio: 1 });
    const [action, image] = await Promise.all([openWorld.boundingBox(), artwork.boundingBox()]);
    const platform = await main.getByText("Android / Quest", { exact: true }).boundingBox();
    if (!action || !image || !platform) throw new Error("Missing world hero bounds");
    expect(action.y + action.height).toBeLessThan(image.y);
    const platformGap = action.y - platform.y - platform.height;
    expect(platformGap).toBeGreaterThanOrEqual(0);
    expect(platformGap).toBeLessThanOrEqual(20);
    expect(action.height).toBeGreaterThanOrEqual(44);
  }
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
  await expect(platforms.getByText("Unknown", { exact: true })).toBeVisible();
  const record = main.locator("section");
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(record).toBeInViewport({ ratio: 1 });
    const [shell, card] = await Promise.all([main.boundingBox(), record.boundingBox()]);
    if (!shell || !card) throw new Error("Missing sparse world bounds");
    expect(card.y - shell.y).toBeGreaterThanOrEqual(24);
    expect(card.y - shell.y).toBeLessThanOrEqual(40);
  }
  await expect(main.getByText("Public", { exact: true })).toBeVisible();
  await expect(main.getByRole("img", { name: "Lantern Cove", exact: true })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "About this world", exact: true })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Events at this world", exact: true })).toHaveCount(0);
  await expect(main.getByText(/No public|No confirmed/)).toHaveCount(0);
  await expect(main.getByRole("link", { name: /VRChat/i })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Reference link", exact: true })).toHaveCount(0);
});
