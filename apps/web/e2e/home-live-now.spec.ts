import { test, expect } from "@playwright/test";
import path from "node:path";

test("Live now starts no media before Play, retains one player while browsing @fixture", async ({ page }, testInfo) => {
  let requests = 0;
  await page.route("http://127.0.0.1:6799/**", route => { requests++; return route.fulfill({ path: path.resolve("e2e/fixtures/persistent-synthetic.mpegts"), contentType: "video/mp2t", headers: { "access-control-allow-origin": "*" } }); });
  await page.goto("/playwright/home-live-now");
  await expect(page.getByRole("region", { name: "Live now", exact: true })).toBeVisible();
  await expect(page.locator("video,iframe")).toHaveCount(0);
  expect(requests).toBe(0);
  await expect.poll(() => page.getByRole("region", { name: "Live now", exact: true }).locator("img").evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("home-live-now.png"), fullPage: true });
  await expect(page.getByRole("link", { name: "Aurora", exact: true })).toHaveAttribute("href", "/aurora");
  await page.getByRole("button", { name: "Play Harbor Sessions", exact: true }).click();
  const video = page.locator("video");
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime), { timeout: 20000 }).toBeGreaterThan(1);
  const original = await video.elementHandle();
  await page.getByRole("link", { name: "Event view", exact: true }).click();
  await expect(page).toHaveURL(/view=event/);
  expect(await video.evaluate((node, prior) => node === prior, original)).toBe(true);
  await page.getByRole("link", { name: "DJ view", exact: true }).click();
  await expect(page).toHaveURL(/view=dj/);
  expect(await video.evaluate((node, prior) => node === prior, original)).toBe(true);
  await page.getByRole("link", { name: "Home view", exact: true }).click();
  await expect(page).toHaveURL(/home-live-now$/);
  expect(await video.evaluate((node, prior) => node === prior, original)).toBe(true);
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Close event playback", exact: true }).click();
  await expect(video).toHaveCount(0);
});
test("empty and expired cache hides the row; a stale source cannot start playback @fixture", async ({ page }) => {
  let requests = 0;
  await page.route("http://127.0.0.1:6799/**", route => { requests++; return route.abort(); });
  await page.goto("/playwright/home-live-now");
  const row = page.getByRole("region", { name: "Live now", exact: true });
  await expect(row).toBeVisible();
  await page.getByLabel("Fixture state").selectOption("empty");
  await expect(row).toHaveCount(0);
  await page.getByLabel("Fixture state").selectOption("expired");
  await expect(row).toHaveCount(0);
  await page.getByLabel("Fixture state").selectOption("removed");
  await page.getByRole("button", { name: "Play Harbor Sessions", exact: true }).click();
  await expect(page.locator("video,iframe")).toHaveCount(0);
  expect(requests).toBe(0);
});

test("each cached entry expires without a successful refresh @fixture", async ({ page }) => {
  await page.goto("/playwright/home-live-now");
  await page.getByLabel("Fixture state").selectOption("expiring");
  const row = page.getByRole("region", { name: "Live now", exact: true });
  await expect(row.getByRole("article")).toHaveCount(2);
  await expect(row.getByRole("article")).toHaveCount(1);
  await expect(row).toHaveCount(0);
  await expect(page.locator("video,iframe")).toHaveCount(0);
});

test("unavailable artwork falls back to identity and Play @fixture", async ({ page }) => {
  await page.goto("/playwright/home-live-now");
  await page.getByLabel("Fixture state").selectOption("broken-image");
  const row = page.getByRole("region", { name: "Live now", exact: true });
  await expect(row.locator("img")).toHaveCount(0);
  await expect(row.getByRole("link", { name: "Harbor Sessions", exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Play Harbor Sessions", exact: true })).toBeEnabled();
});

test("several live events stay in one compact scrolling row @fixture", async ({ page }) => {
  await page.goto("/playwright/home-live-now");
  await page.getByLabel("Fixture state").selectOption("many");
  const row = page.getByRole("region", { name: "Live now", exact: true });
  await expect(row.getByRole("article")).toHaveCount(5);
  expect(await row.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(210);
  expect(await row.getByRole("article").first().evaluate(node => node.parentElement!.scrollWidth > node.parentElement!.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator("video,iframe")).toHaveCount(0);
});

test("a slow earlier lookup cannot replace the later Play selection @fixture", async ({ page }) => {
  let requests = 0;
  await page.route("http://127.0.0.1:6799/**", route => { requests++; return route.fulfill({ path: path.resolve("e2e/fixtures/persistent-synthetic.mpegts"), contentType: "video/mp2t", headers: { "access-control-allow-origin": "*" } }); });
  await page.goto("/playwright/home-live-now");
  await page.getByLabel("Fixture state").selectOption("race");
  await page.getByRole("button", { name: "Play Harbor Sessions 1", exact: true }).click();
  await page.getByRole("button", { name: "Play Harbor Sessions 2", exact: true }).click();
  const shell = page.locator('[data-event-id="home-live-fixture-1"]');
  await expect(page.locator("html")).toHaveAttribute("data-live-lookups", "2");
  await expect(shell).toBeVisible();
  await expect.poll(() => page.locator("video").evaluate(node => (node as HTMLVideoElement).currentTime), { timeout: 20000 }).toBeGreaterThan(1);
  await expect(shell).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Close event playback", exact: true }).click();
});

test("a stalled fresh public lookup releases Play without starting media @fixture", async ({ page }) => {
  await page.goto("/playwright/home-live-now");
  await page.getByLabel("Fixture state").selectOption("lookup-never");
  await page.clock.install();
  const play = page.getByRole("button", { name: "Play Harbor Sessions", exact: true });
  await play.click();
  await expect(play).toBeDisabled();
  await page.clock.fastForward(10_001);
  await expect(play).toBeEnabled();
  await expect(page.locator("video,iframe")).toHaveCount(0);
});

for (const action of ["resume", "pause"] as const) {
  test(`retained controls ${action} cancels a pending different live selection @fixture`, async ({ page }) => {
    let requests = 0;
    await page.route("http://127.0.0.1:6799/**", route => { requests++; return route.fulfill({ path: path.resolve("e2e/fixtures/persistent-synthetic.mpegts"), contentType: "video/mp2t", headers: { "access-control-allow-origin": "*" } }); });
    await page.goto("/playwright/home-live-now");
    await page.getByLabel("Fixture state").selectOption("race");
    await page.getByRole("button", { name: "Play Harbor Sessions 2", exact: true }).click();
    const shell = page.locator('[data-event-id="home-live-fixture-1"]');
    await expect.poll(() => page.locator("video").evaluate(node => (node as HTMLVideoElement).currentTime), { timeout: 20000 }).toBeGreaterThan(0);
    if (action === "resume") await shell.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Play Harbor Sessions 1", exact: true }).click();
    await shell.getByRole("button", { name: action === "resume" ? "Play" : "Pause", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-live-lookups", "2");
    await expect(page.getByRole("button", { name: "Play Harbor Sessions 1", exact: true })).toBeEnabled();
    await expect(shell).toBeVisible();
    expect(requests).toBe(1);
    expect(await page.locator("video").evaluate(node => (node as HTMLVideoElement).paused)).toBe(action === "pause");
    await page.getByRole("button", { name: "Close event playback", exact: true }).click();
  });
}
