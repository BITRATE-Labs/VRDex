import { expect } from "@playwright/test";
import { test, TIMELINE_NOW } from "./home-timeline-fixture";

test.describe("recent event timestamps @flow @fixture", () => {
  test.use({ timelineScenario: "recent-timestamps" });

  test("retains recent starts, ends and DJ times without moving them into the current timeline", async ({ page }, info) => {
    const hour = 3_600_000;
    const finalSetEnd = TIMELINE_NOW - 0.5 * hour;
    await page.clock.setFixedTime(TIMELINE_NOW);
    await page.goto("/?tz=UTC");
    await expect(page.getByLabel("Schedule data state")).toHaveAttribute("data-state", "ready");
    const recent = page.getByRole("region", { name: "Recent events", exact: true });
    const softFocus = recent.getByRole("button", { name: "Open Soft Focus", exact: true });
    await expect(softFocus).toBeVisible();
    await expect(recent.getByRole("button", { name: "Open Afterimage", exact: true })).toBeVisible();
    await expect(softFocus.locator("time")).toHaveAttribute("datetime", new Date(finalSetEnd).toISOString());
    await expect(softFocus).toContainText("Set end");
    await expect(recent.getByText(/live/i)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Timeline chart", exact: true }).getByRole("button", { name: "Open Signal Room", exact: true })).toBeVisible();
    await softFocus.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("recent-event-timestamps.png"), fullPage: true });
    await softFocus.click();
    const detail = page.getByLabel("Event details", { exact: true });
    await expect(detail.locator("p").filter({ hasText: "Time TBA" }).first()).toBeVisible();

    await page.goto(`/?at=${TIMELINE_NOW - 72 * hour}&tz=UTC`);
    await expect(page.getByLabel("Schedule data state")).toHaveAttribute("data-state", "ready");
    await expect(recent).toHaveCount(0);
    await page.getByRole("button", { name: "Now", exact: true }).click();
    await expect(softFocus).toBeVisible();

    await page.clock.setFixedTime(finalSetEnd + 24 * hour);
    await page.goto("/?tz=UTC");
    await expect(page.getByLabel("Schedule data state")).toHaveAttribute("data-state", "ready");
    await expect(softFocus).toBeVisible();
    await page.clock.setFixedTime(finalSetEnd + 24 * hour + 1);
    await page.goto("/?tz=UTC");
    await expect(page.getByLabel("Schedule data state")).toHaveAttribute("data-state", "ready");
    await expect(softFocus).toHaveCount(0);
  });
});

test.describe("timeline time regressions @flow @fixture", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.clock.setFixedTime(TIMELINE_NOW);
  });

  test("keeps a compact schedule steady while loading an uncached date", async ({ page }, info) => {
    let hold = false;
    const buffered: (() => void)[] = [];
    await page.routeWebSocket("**/api/**/sync", (socket) => {
      const server = socket.connectToServer();
      server.onMessage((message) => {
        if (hold) buffered.push(() => socket.send(message));
        else socket.send(message);
      });
    });
    await page.goto(`/?at=${Date.UTC(2026, 9, 27, 12)}&tz=UTC`);
    const status = page.getByLabel("Schedule data state");
    const lanes = page.getByTestId("public-timeline-lanes");
    await expect(status).toHaveAttribute("data-state", "ready");
    await expect(lanes).toHaveCSS("height", "94px");

    hold = true;
    try {
      await page.getByLabel("Schedule date", { exact: true }).fill("2026-11-02");
      await expect(status).toHaveAttribute("data-state", "loading");
      await expect(lanes).toHaveCSS("height", "94px");
      await page.screenshot({ path: info.outputPath("schedule-loading-uncached-date.png") });
    } finally {
      hold = false;
      buffered.splice(0).forEach((send) => send());
    }
    await expect(status).toHaveAttribute("data-state", "ready");
  });

  test("fractional zoom pan retains the viewed date and Back anchor", async ({
    page,
  }, info) => {
    const anchor = Date.UTC(2026, 10, 2, 12);
    await page.goto(`/?at=${anchor}&tz=UTC`);
    const date = page.getByLabel("Schedule date", { exact: true });
    const chart = page.getByRole("region", {
      name: "Timeline chart",
      exact: true,
    });
    await expect(date).toHaveValue("2026-11-02");
    await expect(page.getByLabel("Schedule data state")).toHaveAttribute(
      "data-state",
      "ready",
    );
    const movement = await chart.evaluate((el) => {
      el.style.zoom = "1.25";
      const before = el.scrollLeft;
      el.scrollLeft += 101;
      return { before, after: el.scrollLeft };
    });
    expect(Number.isInteger(movement.after)).toBe(false);
    const expectedAnchor = Math.round(
      anchor + (movement.after - movement.before) * 36000,
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.get("at"))
      .toBe(String(expectedAnchor));
    await expect(date).toHaveValue("2026-11-02");
    await date.fill("2026-11-03");
    await expect(date).toHaveValue("2026-11-03");
    await page.goBack();
    await expect(date).toHaveValue("2026-11-02");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("at"))
      .toBe(String(expectedAnchor));
    await expect
      .poll(() => chart.evaluate((el) => el.scrollLeft))
      .toBeCloseTo(movement.after, 2);
    await page.screenshot({
      path: info.outputPath("fractional-pan-back.png"),
      fullPage: true,
    });
  });

  test("event and selected set details use the URL zone in a UTC browser", async ({
    page,
    timelineFixture,
  }, info) => {
    await page.goto(
      `/?at=${TIMELINE_NOW - 3600000}&tz=America%2FNew_York`,
    );
    expect(
      await page.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    ).toBe("UTC");
    await page
      .getByRole("button", {
        name: "Open Aurora at ORBIT: Interstellar Bassline Orchestra",
        exact: true,
      })
      .click();
    const panel = page.getByLabel("Event details", { exact: true });
    await expect(
      panel.locator('time[datetime="2026-10-26T21:00:00.000Z"]').first(),
    ).toHaveText("Oct 26, 2026, 5:00 PM EDT");
    const end = panel.locator('time[datetime="2026-10-27T01:00:00.000Z"]');
    await expect(end.locator('[aria-hidden="true"]')).toHaveText("9:00 PM");
    await expect(end).toHaveAttribute("title", "Oct 26, 9:00 PM EDT");
    const selected = panel.locator('[data-selected="true"]');
    await expect(selected).toHaveAttribute(
      "data-slot-id",
      timelineFixture.slotIds[6],
    );
    await expect(selected.locator("time")).toHaveText(["5:00 PM", "6:00 PM"]);
    await expect(selected).toBeInViewport();
    await page.screenshot({
      path: info.outputPath("url-zone-selected-set.png"),
    });
  });

  test.describe("ordinary startup geometry", () => {
    test.use({ timelineScenario: "discovery", timelineStartAt: TIMELINE_NOW - 7 * 86400000 });
    test("emptyStatusMatchesVisiblePublicContentThroughStartupAndPan", async ({ page }, info) => {
      await page.addInitScript(() => {
        const audit = { samples: 0, sawVisibleContent: false, sawEmpty: false, contradictions: [] as Array<{ text: string; date: string | null; anchor: string | null; content: string | null }> };
        Object.defineProperty(window, "timelineStatusAudit", { value: audit });
        const sample = () => {
          const chart = document.querySelector('[aria-label="Timeline chart"]');
          const status = document.querySelector('[aria-label="Schedule data state"]');
          if (!chart || !status) return;
          audit.samples++;
          const bounds = chart.getBoundingClientRect();
          const visible = [...chart.querySelectorAll('[data-testid^="event-"], [data-testid^="date-marker-"]')].find((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.right > bounds.left + 1 && rect.left < bounds.right - 1 && rect.bottom > bounds.top && rect.top < bounds.bottom;
          });
          const text = status.textContent ?? "";
          const empty = /No events from favorite communities or performers/.test(text);
          audit.sawVisibleContent ||= Boolean(visible);
          audit.sawEmpty ||= status.getAttribute("data-state") === "ready" && !visible;
          if (empty && visible && audit.contradictions.length < 40) audit.contradictions.push({ text, date: document.querySelector<HTMLInputElement>('[aria-label="Schedule date"]')?.value ?? null, anchor: new URL(location.href).searchParams.get("at"), content: visible.getAttribute("data-testid") });
        };
        new MutationObserver(sample).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
        document.addEventListener("scroll", sample, true);
        const frame = () => { sample(); requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
      });
      await page.goto("/");
      const chart = page.getByRole("region", { name: "Timeline chart", exact: true });
      const bar = page.locator('[data-testid^="event-"]').first();
      await expect(page.getByLabel("Schedule data state")).toHaveAttribute("data-state", "ready");
      await expect(bar).toBeInViewport();
      await chart.focus();
      await chart.press("ArrowRight");
      await page.getByRole("button", { name: "Later", exact: true }).click();
      await page.getByRole("button", { name: "Later", exact: true }).click();
      await expect(page.getByLabel("Schedule data state", { exact: true }),
      ).toHaveAttribute("data-state", "ready");
      await page.getByRole("button", { name: "Now", exact: true }).click();
      await expect(bar).toBeInViewport();
      await page.getByLabel("Schedule date", { exact: true }).fill("2026-10-27");
      await expect(page.getByLabel("Schedule data state", { exact: true }),
      ).toHaveAttribute("data-state", "ready");
      await page.getByRole("button", { name: "Now", exact: true }).click();
      await expect(bar).toBeInViewport();
      const audit: { samples: number; sawVisibleContent: boolean; sawEmpty: boolean; contradictions: unknown[] } = await page.evaluate(() => Reflect.get(window, "timelineStatusAudit"));
      await info.attach("empty-status-audit.json", { body: JSON.stringify(audit), contentType: "application/json" });
      expect(audit.samples).toBeGreaterThan(0);
      expect(audit.sawVisibleContent).toBe(true);
      expect(audit.sawEmpty).toBe(true);
      expect(audit.contradictions).toEqual([]);
      await page.screenshot({ path: info.outputPath("empty-status-consistency.png") });
    });
    test("startupReservesToolbarAxesAndFourRows", async ({ page, isMobile, timelineFixture }, info) => {
      const sizes = isMobile ? [page.viewportSize()!] : [{ width: 1280, height: 800 }, { width: 1440, height: 900 }];
      for (const size of sizes) {
        await page.setViewportSize(size);
        let release!: () => void;
        const held = new Promise<void>((resolve) => { release = resolve; });
        await page.route((url) => url.pathname.endsWith(".js"), async (route) => { await held; await route.continue(); });
        try {
          await page.goto("/", { waitUntil: "commit" });
          const shell = page.locator("[data-home-schedule]");
          await expect(shell).toBeVisible();
          await expect(shell.getByRole("status").filter({ hasText: "Loading events" })).toBeVisible();
          const placeholder = shell.locator("[data-loading-placeholder]");
          await expect(placeholder).toBeVisible();
          await expect(placeholder.getByRole("status")).toHaveText("Loading events");
          await expect(shell.getByRole("status")).toHaveCount(1);
          await expect(shell.locator("[data-loading-axis]")).toHaveCount(2);
          await expect(shell.getByLabel("Schedule date", { exact: true })).toHaveCount(0);
          expect(await placeholder.evaluate((element) => getComputedStyle(element, "::before").content)).toBe("none");
          const loading = await shell.boundingBox();
          expect(loading?.height).toBeGreaterThanOrEqual(376 + 56 + 48);
          const discovery = page.getByRole("region", { name: "Discover", exact: true });
          const discoveryHeading = discovery.getByRole("heading", { name: "Discover", exact: true });
          const browse = discovery.locator("header").getByRole("link", { name: "Browse", exact: true });
          if (!isMobile) {
            await expect(discoveryHeading).toBeInViewport({ ratio: 1 });
            await expect(browse).toBeInViewport({ ratio: 1 });
          }
          const loadingDiscovery = await discoveryHeading.boundingBox();
          await page.screenshot({ path: info.outputPath(`startup-${size.width}.png`) });
          release();
          await expect(page.getByLabel("Schedule data state")).toHaveAttribute("data-state", "ready", { timeout: 20000 });
          await expect(placeholder).toHaveCount(0);
          await expect(page.getByTestId("discovery-event-card").first()).toBeVisible();
          const ready = await shell.boundingBox();
          const chart = page.getByRole("region", { name: "Timeline chart", exact: true });
          const lanes = page.getByTestId("public-timeline-lanes");
          const readyDiscovery = await discoveryHeading.boundingBox();
          const artwork = page.getByTestId("discovery-event-card").first().getByRole("link", { name: /^Open / });
          const artworkBox = await artwork.boundingBox();
          const bar = page.getByTestId(`event-${timelineFixture.eventIds[0]}`);
          await expect(bar).toBeVisible();
          expect((await bar.boundingBox())?.height).toBe(78);
          const metrics = { size, loading, ready, loadingDiscovery, readyDiscovery, lanes: await lanes.boundingBox(), chart: await chart.boundingBox(), artwork: artworkBox, bar: await bar.boundingBox() };
          await info.attach(`startup-${size.width}.json`, { body: JSON.stringify(metrics), contentType: "application/json" });
          expect(ready?.height).toBe(loading?.height);
          expect((await lanes.boundingBox())?.height).toBe(376);
          await expect(page.getByRole("heading", { name: "My night", exact: true })).toHaveCount(0);
          if (!isMobile) {
            await expect(discoveryHeading).toBeInViewport({ ratio: 1 });
            await expect(browse).toBeInViewport({ ratio: 1 });
            expect(readyDiscovery!.y).toBeCloseTo(loadingDiscovery!.y, 0);
            if (size.height === 900) expect(artworkBox!.y).toBeLessThan(size.height - 12);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
          await page.screenshot({ path: info.outputPath(`ready-${size.width}.png`) });
          await page.screenshot({ path: info.outputPath(`ready-full-${size.width}.png`), fullPage: true });
        } finally {
          release();
          await page.unrouteAll({ behavior: "wait" });
        }
      }
    });
  });
  test.describe("24-hour viewer", () => {
    test.use({ locale: "en-GB" });
    test("toolbar and inspector share the viewer hour format", async ({ page, timelineFixture }, info) => {
      await page.goto(`/?at=${TIMELINE_NOW}&tz=UTC`);
      await expect(page.getByText("Hour format", { exact: true }).locator("..")).toHaveText(/24h$/);
      await page.getByRole("button", { name: "Open Aurora at ORBIT: Interstellar Bassline Orchestra", exact: true }).click();
      const panel = page.getByLabel("Event details", { exact: true });
      await expect(panel.getByText(/ (12|24)h$/, { exact: true })).toHaveCount(0);
      await expect(panel.locator('[data-selected="true"]')).toHaveAttribute("data-slot-id", timelineFixture.slotIds[6]);
      const times = await panel.locator("time").evaluateAll(elements => elements.map(element => ({ instant: element.getAttribute("datetime"), label: element.textContent })));
      expect(times.length).toBeGreaterThanOrEqual(4);
      for (const time of times) {
        const options: Intl.DateTimeFormatOptions = { timeZone: "UTC", hour: "numeric", minute: "2-digit", hour12: false };
        if (!time.instant) throw new Error("Inspector time lacks its instant");
        const expected = new Intl.DateTimeFormat("en", options).format(new Date(time.instant));
        expect(time.label).toContain(expected);
        expect(time.label).not.toMatch(/AM|PM/);
      }
      await page.screenshot({ path: info.outputPath("inspector-24-hour.png") });
    });
  });
  test.describe("DST rollback", () => {
    test.use({ timelineStartAt: Date.UTC(2026, 10, 1, 5, 30) });
    test("dateMarkersFollowLocalDstCalendarDay", async ({ page, timelineFixture }) => {
      await page.goto(`/?at=${Date.UTC(2026, 10, 1, 16)}&tz=America%2FNew_York`);
      const marker = page.getByTestId(`date-marker-${timelineFixture.eventIds[7]}`);
      await expect(marker).toHaveAttribute("data-calendar-date", "2026-11-01");
      const day = marker.locator("..");
      expect(await day.evaluate((el) => el.getBoundingClientRect().width)).toBe(2500);
      await marker.scrollIntoViewIfNeeded();
      await expect(marker).toBeInViewport();
      await marker.getByRole("button", { name: /^Open Day Gathering/ }).click();
      await expect(page.getByLabel("Event details", { exact: true })).toBeVisible();
    });
    test("panelTimesCrossDstWithoutRepeatedOffsets", async ({
      page,
      timelineFixture,
    }, info) => {
      await page.goto(
        `/?at=${Date.UTC(2026, 10, 1, 5)}&tz=America%2FNew_York`,
      );
      await page
        .getByRole("button", {
          name: "Open Aurora at ORBIT: Interstellar Bassline Orchestra",
          exact: true,
        })
        .click();
      const panel = page.getByLabel("Event details", { exact: true });
      await expect(
        panel.getByText(/ (12|24)h$/, { exact: true }),
      ).toHaveCount(0);
      await expect(panel.locator("time").nth(0)).toContainText("EDT");
      await expect(panel.locator("time").nth(1)).toContainText("EST");
      const selected = panel.locator('[data-selected="true"]');
      await expect(selected).toHaveAttribute(
        "data-slot-id",
        timelineFixture.slotIds[6],
      );
      await expect(selected.locator("time")).toHaveText(["1:30 AM", "1:30 AM"]);
      await expect(selected).toBeInViewport();
      await page.screenshot({ path: info.outputPath("dst-crossing-set.png") });
      await panel.getByRole("button", { name: "Close", exact: true }).click();
      await page
        .getByRole("button", {
          name: "Open Neon Harbor at ORBIT: Interstellar Bassline Orchestra",
          exact: true,
        })
        .click();
      await expect(selected).toHaveAttribute(
        "data-slot-id",
        timelineFixture.slotIds[7],
      );
      await expect(selected.locator("time")).toHaveText(["1:30 AM", "2:30 AM"]);
      await expect(selected).toBeInViewport();
      await page.screenshot({ path: info.outputPath("dst-second-hour.png") });
    });
  });
});
