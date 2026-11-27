import { expect, test, type Locator } from "@playwright/test";

const path = "/playwright-afterglow-social/events/";
const listedSlug = "playwright-afterglow-harbor-sessions";
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

test("listed events show the world and original listing before the poster on mobile @flow @fixture", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(path + listedSlug);

  const main = page.getByRole("main");
  const world = main.getByRole("link", { name: "Neon Harbor World", exact: true });
  const reference = main.getByRole("link", { name: "Afterglow event listing Reference link", exact: true });
  const poster = main.getByRole("link", { name: "Afterglow Harbor Sessions poster", exact: true });
  await expect(world).toHaveAttribute("href", "/playwright-neon-harbor");
  await expect(reference).toHaveAttribute("href", "https://example.invalid/events/afterglow-harbor-sessions");
  await expect(reference).toHaveAttribute("target", "_blank");

  for (const link of [world, reference]) {
    await expect(link).toBeInViewport({ ratio: 1 });
  }
  const [referenceBox, posterBox] = await Promise.all([reference.boundingBox(), poster.boundingBox()]);
  if (!referenceBox || !posterBox) throw new Error("Missing listed event layout");
  expect(referenceBox.y + referenceBox.height).toBeLessThanOrEqual(posterBox.y);

  await world.focus();
  await page.keyboard.press("Tab");
  await expect(reference).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(poster).toBeFocused();
});

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

        await expect(actions.getByText("Calendar", { exact: true })).toBeVisible();
        await expect(actions.getByText("Report", { exact: true })).toBeVisible();

        for (const width of [320, 360, 412, 640, 768]) {
          await page.setViewportSize({ width, height: 720 });
          const actionLayout = await actions.evaluate((nav) => {
            const container = nav.getBoundingClientRect();
            const buttons = [...nav.querySelectorAll("a, button")].map((button) => button.getBoundingClientRect());
            return {
              contained: buttons.every((button) => button.left >= container.left && button.right <= container.right),
              singleRow: buttons.every((button) => Math.abs(button.top - buttons[0].top) <= 1),
            };
          });
          expect(actionLayout).toEqual({ contained: true, singleRow: true });
          const [timeBox, actionsBox] = await Promise.all([time.boundingBox(), actions.boundingBox()]);
          if (!timeBox || !actionsBox) throw new Error("Missing event hero layout");
          if (width < 640) {
            expect(timeBox.y + timeBox.height).toBeLessThan(actionsBox.y);
          } else {
            expect(actionsBox.y + actionsBox.height).toBeLessThan(timeBox.y);
          }
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
          await page.setViewportSize({ width: 320, height: 740 });
          const control = await play.locator("[data-watch-play-control]").boundingBox();
          expect(control && control.y + control.height).toBeLessThanOrEqual(620);
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
  const sparseHost = main.getByRole("link", { name: /Afterglow Social.*Host/ });
  await expect(sparseHost).toBeVisible();
  await expect(sparseHost).toHaveAttribute("href", "/playwright-afterglow-social");
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await sparseHost.boundingBox())?.width).toBeLessThan(576);
  const calendar = await request.get(path + sparseSlug + "/calendar.ics");
  expect(calendar.status()).toBe(200);
  expect(calendar.headers()["content-type"]).toContain("text/calendar");
  const ics = await calendar.text();
  expect(ics).toContain("DTSTART;VALUE=DATE:20260704");
  expect(ics).not.toContain("DTEND");

  const report = main.getByRole("button", { name: "Report event" });
  await page.setViewportSize({ width: 320, height: 740 });
  await report.focus();
  await expect(main.getByRole("tooltip", { name: "Report event" })).toBeInViewport({ ratio: 1 });
  await report.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Report event" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(report).toBeFocused();

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

test("desktop watch shares the media row with event details @flow @fixture", async ({ page }) => {
  await page.route("https://*.vrcdn.live/**", (route) => route.abort());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(watchTime);

  await page.goto(path + guestWatchSlug);
  const main = page.getByRole("main");
  const poster = main.getByAltText(/ poster$/);
  const stage = main.getByRole("button", { name: /^Play / });
  const host = main.getByRole("link", { name: /Afterglow Social.*Host/ });
  const lineup = main.getByRole("heading", { name: "Lineup", exact: true });
  await expect(stage).toBeVisible();
  await expect(host).toBeVisible();
  await poster.evaluate((image: HTMLImageElement) => image.decode());
  const [posterBox, stageBox, hostBox, lineupBox] = await Promise.all([
    poster.boundingBox(),
    stage.boundingBox(),
    host.boundingBox(),
    lineup.boundingBox(),
  ]);
  if (!posterBox || !stageBox || !hostBox || !lineupBox) throw new Error("Missing desktop event layout");
  expect(Math.abs(posterBox.y - stageBox.y)).toBeLessThanOrEqual(2);
  expect(hostBox.x + hostBox.width).toBeLessThan(stageBox.x);
  expect(hostBox.y).toBeGreaterThanOrEqual(posterBox.y + posterBox.height);
  expect(lineupBox.y).toBeGreaterThan(stageBox.y + stageBox.height);
  expect(lineupBox.y).toBeLessThan(980);

  await poster.evaluate((image: HTMLImageElement) => {
    image.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='960'%3E%3Crect width='480' height='960' fill='teal'/%3E%3C/svg%3E";
    return image.decode();
  });
  const portrait = await poster.boundingBox();
  expect(portrait?.height).toBeLessThanOrEqual(272);
  await expect(poster.locator("..")).toHaveAttribute("target", "_blank");

  await page.clock.setFixedTime(new Date("2025-01-01T11:00:00Z"));
  await page.reload();
  await expect(stage).toHaveCount(0);
  const [idlePoster, idleHost] = await Promise.all([poster.boundingBox(), host.boundingBox()]);
  if (!idlePoster || !idleHost) throw new Error("Missing pre-doors event layout");
  expect(idleHost.x).toBeGreaterThan(idlePoster.x + idlePoster.width);
});
