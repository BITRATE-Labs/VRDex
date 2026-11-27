import { expect, test, type Locator } from "@playwright/test";

const path = "/playwright-afterglow-social/events/";
const watchSlug = "playwright-afterglow-watch-room";
const guestWatchSlug = `${watchSlug}-guest`;
const sparseSlug = "playwright-date-only-sparse-guest";
const posterlessSlug = "playwright-watch-without-poster-guest";
const watchTime = new Date("2025-01-01T12:00:00Z");

async function renderedTimeLines(time: Locator) {
  return time.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const rowOffsets = new Map<number, [number, number]>();
    let offset = 0;

    while (walker.nextNode()) {
      const text = walker.currentNode as Text;
      for (let index = 0; index < text.data.length; index++) {
        if (!text.data[index].trim()) continue;
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const row = Math.round(range.getBoundingClientRect().top);
        const previous = rowOffsets.get(row);
        rowOffsets.set(row, [previous?.[0] ?? offset + index, offset + index + 1]);
      }
      offset += text.data.length;
    }

    return [...rowOffsets.values()].map(([start, end]) =>
      element.textContent?.slice(start, end),
    );
  });
}

test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "Public event layout fixtures run locally.");

for (const timezoneId of ["UTC", "America/Los_Angeles"]) {
  test.describe(`public event in ${timezoneId}`, () => {
    test.use({ timezoneId });
    test("schedule and actions fit narrow phone widths @flow @fixture", async ({ page }) => {
      await page.route("https://*.vrcdn.live/**", (route) => route.abort());
      await page.clock.setFixedTime(watchTime);
      const expectedZone = timezoneId === "UTC" ? "UTC" : "PST";
      for (const slug of [watchSlug, guestWatchSlug, sparseSlug]) {
        const result = await page.goto(path + slug);
        expect(result?.status()).toBe(200);
        const main = page.getByRole("main");
        const time = main.locator("section").first().locator("time").first();
        await expect(time).toContainText(slug === sparseSlug ? "Jul 4, 2026 · Time TBA" : expectedZone);
        const actions = main.getByRole("navigation", { name: "Event actions" });
        await expect(actions.getByRole("link", { name: "Host view" })).toHaveCount(slug === watchSlug ? 1 : 0);
        await expect(actions.getByRole("link", { name: "Add to calendar" })).toHaveAttribute("href", path + slug + "/calendar.ics");
        await expect(actions.getByRole("button", { name: "Report event" })).toBeVisible();

        for (const width of [320, 360, 412]) {
          await page.setViewportSize({ width, height: 720 });
          const lines = await renderedTimeLines(time);
          expect(lines).not.toContain("UTC");
          expect(lines).not.toContain("PST");
          expect(lines).not.toContain("TBA");
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }

        if (slug === sparseSlug) {
          await expect(main.getByRole("button", { name: /^Play / })).toHaveCount(0);
        } else {
          const play = main.getByRole("button", { name: /^Play / });
          await expect(play.getByText("Play", { exact: true })).toBeVisible();
          await page.setViewportSize({ width: 360, height: 720 });
          const control = await play.locator("[data-watch-play-control]").boundingBox();
          expect(control && control.y + control.height).toBeLessThanOrEqual(720);
        }
        await expect(main.locator("video, iframe")).toHaveCount(0);
      }
    });
  });
}

test("sparse guest events preserve real content and deny Host routes @flow @fixture", async ({ page, request }) => {
  await page.route("https://*.vrcdn.live/**", (route) => route.abort());
  await page.clock.setFixedTime(watchTime);
  for (const slug of [guestWatchSlug, sparseSlug, posterlessSlug]) {
    expect((await request.get(path + slug + "/host")).status()).toBe(404);
    const status = await request.get(path + slug + "/host/status");
    expect(status.status()).toBe(404);
    expect(status.headers()["cache-control"]).toContain("no-store");
  }
  expect((await request.get(path + watchSlug + "/host")).status()).toBe(200);

  await page.goto(path + sparseSlug);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "July Fourth Sessions" })).toBeVisible();
  await expect(main.getByAltText(/ poster$/)).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Lineup", exact: true })).toHaveCount(0);
  await expect(main.getByText("Links", { exact: true })).toHaveCount(0);
  await expect(main.getByRole("link", { name: /Afterglow Social/ })).toBeVisible();

  await page.goto(path + posterlessSlug);
  await expect(main.getByAltText(/ poster$/)).toHaveCount(0);
  await expect(main.getByText("Links", { exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Lineup", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: /^Play / })).toHaveCount(1);
  await expect(main.locator("video, iframe")).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  const stage = await main.getByRole("button", { name: /^Play / }).boundingBox();
  expect(stage?.width).toBeGreaterThan(400);
  expect(stage?.width).toBeLessThan(1000);
});
