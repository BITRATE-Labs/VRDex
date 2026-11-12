import { expect, test } from "@playwright/test";

test("world shows artwork and linked creator pictures without placeholder copy", async ({ page }) => {
  await page.goto("/playwright-neon-harbor");
  await expect(page.getByText("Place, vibe, context", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "About this world", exact: true })).toBeVisible();
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
