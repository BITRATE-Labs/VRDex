import { linkedPerformer } from "./event-performer-helpers";
import { expect, test } from "@playwright/test";

for (const timeZone of ["UTC", "America/Los_Angeles"]) test.describe(`standalone event timing in ${timeZone}`, () => {
  test.use({ timezoneId: timeZone });
  test("retains doors and end without a poster or lineup @flow @fixture", async ({ page }, info) => {
    const doors = Date.UTC(2027, 9, 15, 22), start = Date.UTC(2027, 9, 15, 23), end = Date.UTC(2027, 9, 16, 3);
    await page.addInitScript(event => localStorage.setItem("event-lineup-fixture-public", JSON.stringify(event)), {
      id: "timing-only", slug: "timing-only", title: "Timing only", startAt: start, doorsOpenAt: doors, endAt: end,
      status: "scheduled", source: { sourceType: "community", label: "Fixture" },
      slots: [], lineup: [], participants: [], worlds: [], mediaLinks: [], authoredMediaLinks: [],
    });
    await page.goto("/playwright/event-lineup");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Timing only", exact: true })).toBeVisible();
    for (const [label, timestamp] of [["Doors open", doors], ["End", end]] as const) {
      const row = main.getByText(label, { exact: true }).locator("..");
      await expect(row.locator("time")).toHaveAttribute("datetime", new Date(timestamp).toISOString());
      await expect(row.locator("time")).toHaveText(new Intl.DateTimeFormat("en", {
        timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
      }).format(timestamp));
    }
    await expect(main.getByRole("heading", { name: "Lineup", exact: true })).toHaveCount(0);
    await expect(main.locator("img")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("standalone-timing.png"), fullPage: true });
  });
});


test("public lineup follows the unique authored set window while open @flow @fixture", async ({ page }) => {
  const startAt = Date.UTC(2029, 4, 20, 22);
  const lineup = [
    { key: "one", position: 0, displayLabel: "Opening set", startAt: startAt + 10_000, authoredEndAt: startAt + 20_000, endAt: startAt + 20_000 },
    { key: "two", position: 1, displayLabel: "Second set", startAt: startAt + 20_000, authoredEndAt: startAt + 30_000, endAt: startAt + 30_000 },
    { key: "derived", position: 2, displayLabel: "No published end", startAt: startAt + 35_000 },
    { key: "three", position: 3, displayLabel: "Third set", startAt: startAt + 45_000, authoredEndAt: startAt + 60_000, endAt: startAt + 60_000 },
    { key: "four", position: 4, displayLabel: "Fourth set", startAt: startAt + 55_000, authoredEndAt: startAt + 70_000, endAt: startAt + 70_000 },
  ];
  await page.clock.install({ time: startAt - 30_000 });
  await page.addInitScript(event => localStorage.setItem("event-lineup-fixture-public", JSON.stringify(event)), {
    id: "lineup-current", slug: "lineup-current", title: "Afterglow Harbor Sessions",
    startAt, endAt: startAt + 80_000, status: "scheduled",
    source: { sourceType: "community", label: "Fixture" },
    slots: [], participants: [], worlds: [], mediaLinks: [], authoredMediaLinks: [], lineup,
  });
  await page.goto("/playwright/event-lineup");
  const current = page.locator("li[aria-current=time]");
  const summary = page.getByRole("heading", { name: "Lineup", exact: true }).locator("xpath=../following-sibling::p[1]");
  const pendingEnd = page.locator('[data-lineup-row="derived"]');
  await expect(pendingEnd.locator("time")).toHaveCount(2);
  await page.clock.pauseAt(startAt - 900);
  await expect(current).toHaveCount(0);

  let offset = -900;
  for (const [at, label] of [
    [10_000, "Opening set"],
    [20_000, "Second set"],
    [30_000, null],
    [35_000, null],
    [45_000, "Third set"],
    [55_000, null],
    [60_000, "Fourth set"],
    [70_000, null],
  ] as const) {
    await page.clock.runFor(at - offset);
    offset = at;
    if (label) {
      await expect(current).toHaveCount(1);
      await expect(current).toContainText(label);
      await expect(summary.getByText("Scheduled now", { exact: true })).toBeVisible();
      await expect(summary.getByText(label, { exact: true })).toBeVisible();
      const scheduled = lineup.find(row => row.displayLabel === label)!;
      await expect(summary.locator("time").first()).toHaveAttribute("datetime", new Date(scheduled.startAt).toISOString());
      await expect(summary.locator("time").last()).toHaveAttribute("datetime", new Date(scheduled.authoredEndAt!).toISOString());
      await expect(current.getByText("Scheduled now", { exact: true })).toBeVisible();
    } else {
      await expect(current).toHaveCount(0);
      await expect(summary).toHaveCount(0);
    }
  }
});

for (const userTakesOver of [false, true]) {
  test(`Lineup Back ${userTakesOver ? "respects a new scroll" : "keeps the selected row"} when a cold poster loads @flow @fixture`, async ({ page }) => {
    const startAt = Date.UTC(2026, 10, 28, 2);
    const posterPath = "/held-lineup-poster.svg";
    const performerPath = "/playwright-dj-aurora";
    await page.setViewportSize({ width: 390, height: 750 });
    await page.addInitScript(({ startAt, posterPath }) => {
      // Exercise the app fallback even in engines with native scroll anchoring.
      document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.overflowAnchor = "none"; });
      localStorage.setItem("event-lineup-fixture-public", JSON.stringify({
        id: "held-poster-event", slug: "held-poster-event", title: "Afterglow Harbor Sessions",
        source: { sourceType: "manual", label: "Organizer" },
        posterImageUrl: posterPath, watchSurfaceEnabled: false, startAt,
        slots: [], participants: [], worlds: [], mediaLinks: [], authoredMediaLinks: [],
        lineup: Array.from({ length: 14 }, (_, i) => ({
          key: `row-${i}`, position: i, displayLabel: i === 6 ? "DJ Aurora" : `Set ${i + 1}`,
          startAt: startAt + i * 1_800_000, roleLabel: "DJ set",
          ...(i === 6 ? { performer: { slug: "playwright-dj-aurora", displayName: "DJ Aurora", outboundLinks: [] } } : {}),
        })),
      }));
    }, { startAt, posterPath });

    let releasePoster!: () => void;
    const heldPoster = new Promise<void>((resolve) => { releasePoster = resolve; });
    await page.route(`**${posterPath}`, async (route) => {
      await heldPoster;
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#174358"/></svg>',
      });
    });

    try {
      await page.goto("/playwright/event-lineup", { waitUntil: "domcontentloaded" });
      const performer = page.getByRole("link", { name: "DJ Aurora", exact: true });
      const row = performer.locator("xpath=ancestor::li");
      const poster = page.getByAltText("Afterglow Harbor Sessions poster");
      await performer.evaluate((link) => link.scrollIntoView({ block: "center", behavior: "instant" }));
      const rowTop = await row.evaluate((element) => element.getBoundingClientRect().top);
      const moved = () => row.evaluate((element, top) => Math.abs(element.getBoundingClientRect().top - top), rowTop);
      expect(await poster.evaluate((image) => image.getBoundingClientRect().height)).toBe(0);

      await performer.click();
      await expect(page).toHaveURL(performerPath);
      await page.goBack({ waitUntil: "domcontentloaded" });
      await expect.poll(moved).toBeLessThan(3);

      if (userTakesOver) {
        await page.keyboard.press("ArrowDown");
        await page.evaluate(() => window.scrollBy({ top: 80, behavior: "instant" }));
      }
      const scrollY = await page.evaluate(() => window.scrollY);
      releasePoster();
      await expect.poll(() => poster.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const ratio = await poster.evaluate((image) => {
        const box = image.getBoundingClientRect();
        return box.height / box.width;
      });
      expect(ratio).toBeCloseTo(1.25);

      if (userTakesOver) {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
        expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(scrollY);
        expect(await moved()).toBeGreaterThan(100);
      } else {
        await expect.poll(moved).toBeLessThan(3);
        await expect(performer).toBeInViewport({ ratio: 1 });
        await page.goForward({ waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(performerPath);
        await page.goBack({ waitUntil: "domcontentloaded" });
        await expect.poll(moved).toBeLessThan(3);
      }
    } finally {
      releasePoster();
    }
  });
}

for (const mode of ["create", "edit"]) test(`staff ${mode} keeps mounted values through steps and saves a draft`, async ({ page }, testInfo) => {
  await page.goto(`/playwright/event-lineup?editor&mode=${mode}`);
  const navigation = page.getByRole("navigation", { name: "Event editor" });
  await page.locator("summary").filter({ hasText: /^Source/ }).click();
  await page.getByLabel("Announcement link", { exact: true }).fill("https://example.com/new-source");
  await navigation.getByRole("button", { name: "Details" }).click();
  await page.getByLabel("Event title", { exact: true }).fill("Retained staff event");
  await page.getByLabel("Starts", { exact: true }).fill("2027-10-15T23:00");
  if (mode === "edit") await page.getByLabel("Ends (optional)", { exact: true }).fill("2027-10-16T03:00");
  await page.getByLabel("Description", { exact: true }).fill("Retained description");
  await navigation.getByRole("button", { name: "Lineup" }).click();
  if (mode === "create") await page.getByRole("button", { name: "Generate", exact: true }).click();
  await linkedPerformer(page.locator("[data-performer-field]").first(), "Aurora");
  await expect(page.locator("[data-performer-field]").first().getByTestId("selected-identity")).toContainText("Aurora");
  await expect(page.locator('img[src$="/seed/fixture-avatar-luma.svg"]').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`staff-${mode}-lineup.png`), fullPage: true });
  await expect(page.getByLabel("Event title", { exact: true })).toBeHidden();
  await navigation.getByRole("button", { name: "Details" }).click();
  await expect(page.getByLabel("Announcement link", { exact: true })).toHaveValue("https://example.com/new-source");
  await navigation.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Retained staff event" }).first()).toBeVisible();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: mode === "create" ? "Save draft" : "Unpublish and save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("event-lineup-fixture-v1-submission"))).not.toBeNull();
  const payload = await page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!));
  expect(payload.title).toBe("Retained staff event");
  expect(payload.summary).toBe("Retained description");
  expect(payload.sourceUrl).toBe("https://example.com/new-source");
  expect(payload.lineup[0].personSlug).toBe("aurora");
  expect(payload.published).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("event-lineup-fixture-command"))).toBe(`events:${mode === "create" ? "create" : "update"}CommunityEvent`);
  await expect(page).toHaveURL(/playwright\/event-lineup\?/);
  await page.getByRole("button", { name: mode === "create" ? "Publish event" : "Save and publish", exact: true }).click();
  await expect(page).toHaveURL(/playwright-afterglow-social\/events\/playwright-afterglow-harbor-sessions$/);
});

test("staff editor preserves legacy date-only drafts and artwork while correcting or removing contributed names", async ({ page }, testInfo) => {
  // This synthetic owned URL has no backend asset in the local transport fixture.
  await page.route("**/api/v0/events/event-contributed/artwork/artwork-owned", route => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#1b4538"/></svg>',
  }));
  await page.addInitScript(() => {
    if (localStorage.getItem("event-lineup-fixture-v1")) return;
    localStorage.setItem("event-lineup-fixture-v1", JSON.stringify({
      id: "event-contributed", slug: "contributed", title: "Contributed night", scheduleKind: "date_only", eventDate: "2027-10-15",
      venueLabel: "Harbor", status: "scheduled", communitySlug: "afterglow", publicationState: "draft_private",
      source: { sourceType: "contributor", label: "Community-submitted" }, posterImageUrl: "/api/v0/events/event-contributed/artwork/artwork-owned",
      watchSurfaceEnabled: false, watchMode: "event_stream", mediaLinks: [], authoredMediaLinks: [], worlds: [], participants: [], slots: [],
      lineup: [{ key: "guest", position: 0, displayLabel: "Unmatched guest" }],
      preservedParticipantAssociationIds: [], preservedSlotAssociationIds: [], preservedWorldAssociationIds: [],
    }));
  });
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  const artwork = page.getByRole("img", { name: "Event artwork", exact: true });
  await expect(artwork).toHaveAttribute("src", "/api/v0/events/event-contributed/artwork/artwork-owned");
  await expect.poll(() => artwork.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole("checkbox", { name: "Time TBA", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Starts", { exact: true })).toHaveValue("");
  await page.getByLabel("Event title", { exact: true }).fill("Corrected night");
  await page.getByLabel("Where", { exact: true }).fill("New harbor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await expect(page.getByRole("textbox", { name: "Performer", exact: true })).toHaveValue("Unmatched guest");
  await expect(page.getByText("Unlinked", { exact: true })).toBeVisible();
  await page.getByLabel("Performer", { exact: true }).fill("Corrected guest");
  await page.screenshot({ path: testInfo.outputPath("staff-date-only-editor.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("event-lineup-fixture-v1-submission"))).not.toBeNull();
  const payload = await page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!));
  expect(payload.scheduleKind).toBe("date_only");
  expect(payload.startAt).toBeUndefined();
  expect(payload.venueLabel).toBe("New harbor");
  expect(payload.posterImageUrl).toBe("/api/v0/events/event-contributed/artwork/artwork-owned");
  expect(payload.lineup[0].performerLabel).toBe("Corrected guest");
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await page.getByRole("button", { name: "Remove slot", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove slot", exact: true }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!).lineup)).toEqual([]);
  await expect(page).toHaveURL(/playwright\/event-lineup\?/);
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByText("Add start time", { exact: true }).click();
  await page.getByRole("button", { name: "Time zone", exact: true }).click();
  await page.getByRole("combobox", { name: "Time zone", exact: true }).fill("UTC");
  await page.getByRole("option", { name: /^UTC(?: |$)/ }).click();
  await page.getByLabel("Starts", { exact: true }).fill("2027-10-15T19:00");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save and publish", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!).scheduleKind)).toBe("timed");
});

for (const authorThenClear of [false, true]) test(`staff published date-only correction ${authorThenClear ? "requires an authored start after clearing" : "preserves its schedule on a title edit"}`, async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("event-lineup-fixture-v1", JSON.stringify({
    id: "event-contributed", slug: "contributed", title: "Contributed night", scheduleKind: "date_only", eventDate: "2027-10-15",
    status: "scheduled", communitySlug: "afterglow", publicationState: "published",
    source: { sourceType: "contributor", label: "Community-submitted" },
    watchSurfaceEnabled: false, watchMode: "event_stream", mediaLinks: [], authoredMediaLinks: [], worlds: [], participants: [], slots: [],
    lineup: [{ key: "guest", position: 0, displayLabel: "Unmatched guest" }],
    preservedParticipantAssociationIds: [], preservedSlotAssociationIds: [], preservedWorldAssociationIds: [],
  })));
  await page.goto("/playwright/event-lineup?editor");
  const navigation = page.getByRole("navigation", { name: "Event editor" });
  await navigation.getByRole("button", { name: "Details", exact: true }).click();
  const starts = page.getByLabel("Starts", { exact: true });
  await expect(starts).not.toHaveAttribute("required", "");
  await page.getByLabel("Event title", { exact: true }).fill("Corrected night");
  if (authorThenClear) {
    await page.getByText("Add start time", { exact: true }).click();
    await starts.fill("2027-10-15T20:00");
    await starts.fill("");
  }
  await navigation.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  if (authorThenClear) {
    await expect(starts).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem("event-lineup-fixture-v1-submission"))).toBeNull();
    return;
  }
  await expect.poll(() => page.evaluate(() => localStorage.getItem("event-lineup-fixture-v1-submission"))).not.toBeNull();
  const payload = await page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!));
  expect(payload.title).toBe("Corrected night");
  expect(payload.scheduleKind).toBe("date_only");
  expect(payload.startAt).toBeUndefined();
  expect(payload.lineup).toBeUndefined();
  expect(payload.published).toBe(true);
});

test("staff title edit does not confirm an untouched contributed lineup", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("event-lineup-fixture-v1", JSON.stringify({
    id: "event-contributed", slug: "contributed", title: "Contributed night", scheduleKind: "date_only", eventDate: "2027-10-15",
    status: "scheduled", communitySlug: "afterglow", publicationState: "draft_private",
    source: { sourceType: "contributor", label: "Community-submitted" },
    watchSurfaceEnabled: false, watchMode: "event_stream", mediaLinks: [], authoredMediaLinks: [], worlds: [], participants: [], slots: [],
    lineup: [{ key: "guest", position: 0, displayLabel: "Guest", performer: { slug: "nova", displayName: "Nova" } }],
    preservedParticipantAssociationIds: [], preservedSlotAssociationIds: [], preservedWorldAssociationIds: [],
  })));
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByLabel("Event title", { exact: true }).fill("Corrected night");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("event-lineup-fixture-v1-submission"))).not.toBeNull();
  const payload = await page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!));
  expect(payload.lineup).toBeUndefined();
  await expect(page).toHaveURL(/playwright\/event-lineup\?/);
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByText("Add start time", { exact: true }).click();
  await page.getByRole("button", { name: "Time zone", exact: true }).click();
  await page.getByRole("combobox", { name: "Time zone", exact: true }).fill("UTC");
  await page.getByRole("option", { name: /^UTC(?: |$)/ }).click();
  await page.getByLabel("Starts", { exact: true }).fill("2027-10-15T19:00");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save and publish", exact: true }).click();
  const rescheduled = await page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!));
  expect(rescheduled.preserveLineupConfirmation).toBe(true);
  expect(rescheduled.lineup[0].personSlug).toBe("nova");
});

test("staff editor sends explicit clears for optional event details", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("event-lineup-fixture-v1", JSON.stringify({
    id: "event-contributed", slug: "contributed", title: "Contributed night", scheduleKind: "date_only", eventDate: "2027-10-15",
    status: "scheduled", communitySlug: "afterglow", publicationState: "draft_private", venueLabel: "Harbor", summary: "Old summary", notes: "Old notes",
    source: { sourceType: "contributor", label: "Flyer", url: "https://example.com/source" },
    posterImageUrl: "https://example.com/poster.png", authoredBannerImageUrl: "https://example.com/banner.png", authoredThumbnailImageUrl: "https://example.com/thumb.png",
    watchSurfaceEnabled: false, watchMode: "event_stream", mediaLinks: [], authoredMediaLinks: [], worlds: [], participants: [], slots: [], lineup: [],
    preservedParticipantAssociationIds: [], preservedSlotAssociationIds: [], preservedWorldAssociationIds: [],
  })));
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.locator('[name="summary"]').fill("");
  await page.getByRole("combobox", { name: "Where", exact: true }).fill("");
  await page.locator("summary").filter({ hasText: "Private notes" }).click();
  await page.getByLabel("Private notes", { exact: true }).fill("");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.locator("summary").filter({ hasText: /^Advanced/ }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.locator("summary").filter({ hasText: /^Source/ }).click();
  for (const name of ["sourceLabel", "sourceUrl", "posterImageUrl", "bannerImageUrl", "thumbnailImageUrl"]) {
    await page.locator(`[name="${name}"]`).fill("");
  }
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const payload = await page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!));
  for (const key of ["summary", "notes", "sourceUrl", "posterImageUrl", "bannerImageUrl", "thumbnailImageUrl"]) expect(payload[key]).toBe(null);
  expect(payload.sourceLabel).toBe("");
  expect(payload.venueLabel).toBe("");
});

test("event roster offers host view without performer stream controls", async ({ page }) => {
  await page.goto("/playwright/event-lineup");
  await expect(page.getByRole("heading", { name: "Lineup", exact: true })).toBeVisible();
  await expect(page.locator("summary", { hasText: "DJ links" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy PC", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Tickets", exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Private fixture link" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Host view", exact: true })).toHaveAttribute("href", "/afterglow/events/harbor-sessions-7k2m4q/host");
});

test("editor submits and reloads selected mode and source", async ({ page }) => {
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.locator("summary").filter({ hasText: /^Advanced/ }).click();
  await expect(page.getByLabel("Watch mode", { exact: true })).toHaveValue("automatic");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  const sources = page.getByLabel("Stream", { exact: true });
  await expect(sources.nth(2)).toHaveValue("removed-source");
  await sources.nth(2).selectOption("lumen-visuals");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/playwright-afterglow-social\/events\/playwright-afterglow-harbor-sessions$/);
  const payload = await page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!));
  expect(payload.watchMode).toBe("performer_sequence");
  expect(payload.lineup[2].selectedStreamId).toBe("lumen-visuals");
  expect(payload.lineup[3].personSlug).toBeUndefined();
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await expect(page.getByLabel("Stream", { exact: true }).nth(2)).toHaveValue("lumen-visuals");
});

test("unavailable choices survive unrelated saves and clear on performer changes", async ({ page }) => {
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByLabel("Event title", { exact: true }).fill("Afterglow updated");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/playwright-afterglow-social\/events\/playwright-afterglow-harbor-sessions$/);
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  const source = page.getByLabel("Stream", { exact: true }).nth(2);
  await expect(source).toHaveValue("removed-source");
  await source.selectOption("");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!).lineup[2].selectedStreamId)).toBe(null);
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await expect(page.getByLabel("Stream", { exact: true }).nth(2)).toHaveValue("");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await page.getByLabel("Stream", { exact: true }).nth(2).selectOption("lumen-main");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await linkedPerformer(page.locator("[data-performer-field]").nth(2), "Nova");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await expect(page.getByLabel("Stream", { exact: true }).nth(2).getByRole("option", { name: "Automatic: nova" })).toHaveCount(1);
  await expect(page.getByLabel("Stream", { exact: true }).nth(2)).toHaveValue("");
  await expect(page.getByLabel("Stream", { exact: true }).nth(2).locator('option[value="lumen-main"]')).toHaveCount(0);
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!).lineup[2].personSlug)).toBe("nova");
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await expect(page.locator("[data-performer-field]").nth(2).getByTestId("selected-identity")).toContainText("Nova");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await expect(page.getByLabel("Stream", { exact: true }).nth(2)).toHaveValue("");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Lineup" }).click();
  await page.locator("[data-performer-field]").nth(2).getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!).lineup[2].selectedStreamId)).toBe(null);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("event-lineup-fixture-v1-submission")!).lineup[2].personSlug)).toBeUndefined();
});

test("roster copy controls work with keyboard without navigating", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/playwright-afterglow-social/events/playwright-event-host-view/host");
  const copy = page.getByRole("button", { name: "Copy PC", exact: true }).first();
  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("rtspt://stream.vrcdn.live/live/dj-aurora");
  const quest = page.getByRole("button", { name: "Copy Quest", exact: true }).first();
  await quest.focus();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("https://stream.vrcdn.live/live/dj-aurora.live.ts");
  await expect(page.getByRole("button", { name: "Copy Discord", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/playwright-event-host-view\/host$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("performer sequence hides output operations and event stream restores them", async ({ page }, testInfo) => {
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.locator("summary").filter({ hasText: /^Advanced/ }).click();
  await expect(page.getByRole("heading", { name: "VRCDN output", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Worker status", exact: true })).toHaveCount(0);
  await page.getByLabel("Watch mode", { exact: true }).selectOption("event_stream");
  await expect(page.getByRole("heading", { name: "VRCDN output", exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: /^Operations/ }).click();
  await expect(page.getByRole("button", { name: "Cancel event", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change history", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("staff-advanced-controls.png"), fullPage: true });
  await expect(page.getByLabel("Stream", { exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/\/playwright-afterglow-social\/events\/playwright-afterglow-harbor-sessions$/);
  await page.goto("/playwright/event-lineup?editor");
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Details" }).click();
  await page.getByRole("navigation", { name: "Event editor" }).getByRole("button", { name: "Review" }).click();
  await page.locator("summary").filter({ hasText: /^Advanced/ }).click();
  await expect(page.getByLabel("Watch mode", { exact: true })).toHaveValue("event_stream");
});
