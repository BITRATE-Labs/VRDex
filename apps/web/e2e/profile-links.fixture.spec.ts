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
