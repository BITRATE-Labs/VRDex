import { expect, test } from "@playwright/test";
import { toggleSiteTheme } from "./flow-navigation";

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
    const card = page.getByRole("region", { name: context, exact: true });
    await expect(card.getByText("Community-submitted", { exact: true })).toHaveCount(stream === "suggested-aurora" ? 1 : 0);
    for (const [device, value] of [
      ["Quest", `https://stream.vrcdn.live/live/${stream}.live.ts`],
      ["PC", `rtspt://stream.vrcdn.live/live/${stream}`],
    ]) {
      const endpoint = card.locator("code").filter({ hasText: value });
      await expect(endpoint).toHaveText(value);
      await expect(endpoint.locator("span")).toHaveText([
        device === "Quest" ? "https://stream.vrcdn.live/" : "rtspt://stream.vrcdn.live/",
        "live/",
        device === "Quest" ? `${stream}.live.ts` : stream,
      ]);
      const copyName = `Copy ${device} for ${context}`;
      const copy = card.getByRole("button", { name: copyName, exact: true });
      await expect(copy).toHaveAttribute("title", copyName);
      const narrow = (page.viewportSize()?.width ?? 1280) < 640;
      const visibleLabel = copy.getByText("Copy", { exact: true });
      if (narrow) {
        await expect(visibleLabel).toBeVisible();
        const bounds = await copy.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      } else {
        await expect(visibleLabel).toBeHidden();
      }
      await copy.click();
      const copied = card.getByRole("button", { name: `${device} copied for ${context}`, exact: true });
      await expect(copied).toBeVisible();
      if (narrow) await expect(copied.getByText("Copied", { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem("copied-profile-link"))).toBe(value);
    }
  }
});

test("an artless occurrence on a sparse profile uses its theme colors @fixture", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("vrdex-theme", "light"));
  expect((await page.goto("/playwright-event-only-profile"))?.status()).toBe(200);
  await expect(page.getByRole("navigation", { name: "Profile sections" }).getByRole("link", { name: "VRCDN", exact: true })).toHaveCount(0);

  const title = page.getByRole("link", { name: "July Fourth Sessions", exact: true });
  await expect(title).toHaveAttribute("href", "/playwright-afterglow-social/events/playwright-date-only-sparse-guest");
  const card = page.getByRole("article").filter({ has: title });
  const date = card.locator("time");
  await expect(date).toHaveText(/Time TBA/);
  await expect(date).toHaveAttribute("datetime", "2026-07-04");
  const header = card.locator(":scope > div").first();
  await expect(header).toHaveCSS("background-image", "none");
  await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const host = card.getByText("Afterglow Social", { exact: true });
  await expect(host).toBeVisible();
  const [dateBox, titleBox, hostBox] = await Promise.all([date.boundingBox(), title.boundingBox(), host.boundingBox()]);
  if (!dateBox || !titleBox || !hostBox) throw new Error("Missing event schedule, title or host bounds");
  expect(dateBox.y + dateBox.height).toBeLessThanOrEqual(titleBox.y);
  expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(hostBox.y);
  await expect(title).toHaveCSS("text-underline-offset", "6px");
  await expect(card.getByText("Afterglow event listing", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: "Afterglow event listing" })).toHaveCount(0);

  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.map(Number);
    if (channels?.length !== 3) throw new Error(`Expected an opaque RGB color, got ${color}`);
    const [red, green, blue] = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };

  let lightBackdrop: string | undefined;
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") {
      await toggleSiteTheme(page);
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme-transition", "true");
    const [titleColor, dateColor, hostColor, backdrop] = await Promise.all([
      title.evaluate((element) => getComputedStyle(element).color),
      date.evaluate((element) => getComputedStyle(element).color),
      host.evaluate((element) => getComputedStyle(element).color),
      card.evaluate((element) => getComputedStyle(element).backgroundColor),
    ]);
    if (theme === "light") lightBackdrop = backdrop;
    else expect(backdrop).not.toBe(lightBackdrop);

    const contrast = (color: string) => {
      const foreground = luminance(color);
      const background = luminance(backdrop);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    };
    const ratios = { title: contrast(titleColor), date: contrast(dateColor), host: contrast(hostColor) };
    await testInfo.attach(`artless-occurrence-${theme}-contrast`, {
      body: JSON.stringify({ backdrop, titleColor, dateColor, hostColor, ratios }, null, 2),
      contentType: "application/json",
    });
    for (const ratio of Object.values(ratios)) expect(ratio).toBeGreaterThanOrEqual(4.5);
    if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
      await card.screenshot({ path: testInfo.outputPath(`artless-occurrence-${theme}.png`), animations: "disabled" });
    }
  }
});

test("populated person profiles give visitors keyboard shortcuts before ownership actions @fixture", async ({ page }) => {
  await page.route("**/api/profile-live/playwright-dj-aurora/vrcdn*", route => route.fulfill({
    json: { states: { "dj-aurora": "live", "suggested-aurora": "offline" } },
  }));
  await page.setViewportSize({ width: 320, height: 760 });
  expect((await page.goto("/playwright-dj-aurora"))?.status()).toBe(200);

  const identity = page.getByRole("region", { name: "DJ Aurora", exact: true });
  const nav = identity.getByRole("navigation", { name: "Profile sections" });
  const ownership = page.getByRole("complementary", { name: "Profile ownership" });
  await expect(identity.getByText("Unclaimed", { exact: true })).toBeVisible();
  await expect(page.getByText("Unclaimed", { exact: true })).toHaveCount(1);
  await expect(nav.getByRole("link")).toHaveText(["Links", "VRCDN", "Upcoming events", "Media kit", "Worlds"]);
  await expect(nav.getByRole("link", { name: "Upcoming events", exact: true })).toBeInViewport();
  await expect(nav.getByRole("link", { name: "VRCDN", exact: true })).toBeInViewport();
  const shortcutBounds = await nav.getByRole("link").evaluateAll(links => links.map(link => {
    const { y, width, height } = link.getBoundingClientRect();
    return { y, width, height };
  }));
  expect(new Set(shortcutBounds.map(({ y }) => y)).size).toBe(2);
  expect(shortcutBounds.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
  const [avatar, name] = await Promise.all([
    identity.getByRole("img", { name: "DJ Aurora display image", exact: true }).boundingBox(),
    identity.getByRole("heading", { name: "DJ Aurora", exact: true }).boundingBox(),
  ]);
  if (!avatar || !name) throw new Error("Missing profile avatar or name bounds");
  expect(avatar.x + avatar.width).toBeLessThan(name.x);
  expect(avatar.y).toBeLessThan(name.y + name.height);
  expect(name.y).toBeLessThan(avatar.y + avatar.height);
  const linksSection = page.locator("#profile-links").locator("xpath=ancestor::section[1]");
  const [vrchatLink, soundCloudTitle] = await Promise.all([
    linksSection.getByRole("link", { name: /^VRChat/ }).boundingBox(),
    linksSection.getByText("DJ Aurora SoundCloud", { exact: true }).boundingBox(),
  ]);
  if (!vrchatLink || !soundCloudTitle) throw new Error("Missing public visitor links");
  expect(vrchatLink.y).toBeLessThanOrEqual(633);
  expect(soundCloudTitle.y + soundCloudTitle.height).toBeLessThanOrEqual(760);
  await expect(ownership.getByRole("link", { name: "Claim profile", exact: true })).toHaveAttribute("href", "/claim/playwright-dj-aurora?source=profile");
  await expect(ownership.getByRole("link", { name: "Suggest an edit", exact: true })).toHaveAttribute("href", "/playwright-dj-aurora/edit");

  for (const [label, id] of [["Links", "profile-links"], ["VRCDN", "profile-streams"], ["Upcoming events", "profile-events"], ["Media kit", "profile-media-kit"], ["Worlds", "profile-worlds"]]) {
    const shortcut = nav.getByRole("link", { name: label, exact: true });
    const isStream = id === "profile-streams";
    const targetSection = isStream
      ? page.getByRole("complementary", { name: label, exact: true })
      : page.getByRole("heading", { name: label, exact: true });
    const section = isStream ? targetSection : targetSection.locator("xpath=ancestor::section[1]");
    const firstAction = section.locator("a[href]:visible, button:not([disabled]):visible").first();
    await expect(shortcut).toHaveAttribute("href", "#" + id);
    await expect(targetSection).toHaveAttribute("id", id);
    await shortcut.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(url => url.hash === "#" + id);
    await expect(targetSection).toBeFocused();
    await expect(targetSection).toBeInViewport();
    const [target, header] = await Promise.all([targetSection.boundingBox(), page.getByRole("banner").boundingBox()]);
    if (!target || !header) throw new Error("Missing profile section target or header bounds");
    expect(target.y).toBeGreaterThanOrEqual(header.y + header.height);
    await page.keyboard.press("Tab");
    await expect(firstAction).toBeFocused();
  }

  expect(await ownership.evaluate(element => Boolean(
    document.getElementById("profile-worlds")!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
  ))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.setViewportSize({ width: 1280, height: 900 });
  const links = page.getByRole("heading", { name: "Links", exact: true }).locator("xpath=ancestor::section[1]");
  const streams = page.getByRole("complementary", { name: "VRCDN", exact: true });
  const events = page.getByRole("heading", { name: "Upcoming events", exact: true });
  await expect(events).toHaveCount(1);
  const [linkBounds, streamBounds, eventBounds] = await Promise.all([
    links.boundingBox(), streams.boundingBox(), events.boundingBox(),
  ]);
  if (!linkBounds || !streamBounds || !eventBounds) throw new Error("Missing desktop profile section bounds");
  expect(eventBounds.x).toBe(linkBounds.x);
  expect(eventBounds.x + eventBounds.width).toBeLessThan(streamBounds.x);
  expect(eventBounds.y).toBeGreaterThanOrEqual(linkBounds.y + linkBounds.height);
  expect(eventBounds.y).toBeLessThan(streamBounds.y + streamBounds.height);
  expect(await streams.evaluate((element) => Boolean(
    element.compareDocumentPosition(document.getElementById("profile-events")!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ))).toBe(true);
});

test("a sparse person profile puts its identity and ownership together @fixture", async ({ page }) => {
  expect((await page.goto("/playwright-sparse-import"))?.status()).toBe(200);
  const identity = page.getByRole("region", { name: "Sparse Import", exact: true });
  await expect(page.getByRole("navigation", { name: "Profile sections" })).toHaveCount(0);
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

test("a sparse community highlights its group and confirms empty hosted events @fixture", async ({ page }) => {
  const slug = "playwright-sparse-community";
  const groupUrl = "https://vrchat.com/home/group/grp_12345678-1234-1234-1234-123456789abc";
  await page.setViewportSize({ width: 320, height: 720 });
  expect((await page.goto(`/${slug}`))?.status()).toBe(200);

  const identity = page.getByRole("region", { name: "Sparse Community", exact: true });
  const status = identity.getByText("Unclaimed", { exact: true });
  await expect(status).toBeVisible();
  await expect(page.getByText("Unclaimed", { exact: true })).toHaveCount(1);
  const group = identity.getByRole("link", { name: "VRChat group", exact: true });
  await expect(group).toHaveAttribute("href", groupUrl);
  await expect(group).toBeInViewport({ ratio: 1 });
  const ownership = page.getByRole("complementary", { name: "Profile ownership" });
  const claim = ownership.getByRole("link", { name: "Claim profile", exact: true });
  await expect(claim).toHaveAttribute("href", `/claim/${slug}?source=profile`);
  await expect(ownership.getByRole("link", { name: "Suggest an edit", exact: true })).toHaveAttribute("href", `/${slug}/edit`);
  const [groupBounds, claimBounds] = await Promise.all([group.boundingBox(), claim.boundingBox()]);
  if (!groupBounds || !claimBounds) throw new Error("Missing community group link or claim action bounds");
  expect(groupBounds.y + groupBounds.height).toBeLessThan(claimBounds.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  const events = page.getByRole("heading", { name: "Hosted events", exact: true }).locator("xpath=ancestor::section[1]");
  await expect(events.getByText("No events", { exact: true })).toBeVisible();
  await expect(events.getByRole("link", { name: "Add event", exact: true })).toHaveAttribute("href", `/events/new?community=${slug}`);
  const eventsBounds = await events.boundingBox();
  if (!eventsBounds) throw new Error("Missing hosted events bounds");
  expect(eventsBounds.y + eventsBounds.height).toBeLessThanOrEqual(claimBounds.y);

  expect((await page.goto(`/${slug}-custom`))?.status()).toBe(200);
  await expect(page.getByRole("link", { name: "VRChat group Official meetup group", exact: true })).toHaveAttribute("href", groupUrl);

  expect((await page.goto("/playwright-afterglow-social"))?.status()).toBe(200);
  const richIdentity = page.getByRole("region", { name: "Afterglow Social", exact: true });
  await expect(richIdentity.getByText("Unclaimed", { exact: true })).toBeVisible();
  await expect(page.getByText("Unclaimed", { exact: true })).toHaveCount(1);
  await expect(claim).toHaveAttribute("href", "/claim/playwright-afterglow-social?source=profile");
  await expect(ownership.getByRole("link", { name: "Suggest an edit", exact: true })).toHaveAttribute("href", "/playwright-afterglow-social/edit");
  const richEventsHeading = page.getByRole("heading", { name: "Hosted events", exact: true });
  const richAddEvent = page.getByRole("link", { name: "Add event", exact: true });
  await expect(richAddEvent).toHaveAttribute("href", "/events/new?community=playwright-afterglow-social");
  const [headingBounds, addEventBounds] = await Promise.all([richEventsHeading.boundingBox(), richAddEvent.boundingBox()]);
  if (!headingBounds || !addEventBounds) throw new Error("Missing hosted events heading or action bounds");
  expect(addEventBounds.height).toBeGreaterThanOrEqual(44);
  expect(addEventBounds.x).toBeGreaterThan(headingBounds.x + headingBounds.width);
  expect(addEventBounds.y).toBeLessThan(headingBounds.y + headingBounds.height);
  expect(addEventBounds.y + addEventBounds.height).toBeGreaterThan(headingBounds.y);
  const visitorContent = [
    page.getByText("Afterglow event archive", { exact: true }),
    page.getByRole("link", { name: "Afterglow Harbor Sessions", exact: true }),
    page.getByRole("heading", { name: "Worlds", exact: true }),
  ];
  const richClaims = await claim.boundingBox();
  if (!richClaims) throw new Error("Missing populated community claim bounds");
  for (const content of visitorContent) {
    await expect(content).toBeVisible();
    const bounds = await content.boundingBox();
    if (!bounds) throw new Error("Missing populated community content bounds");
    expect(bounds.y + bounds.height).toBeLessThan(richClaims.y);
  }
  await expect(page.getByText("No events", { exact: true })).toHaveCount(0);
});

test.describe("artless card variants", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("keeps sparse and long event cards readable at their natural heights @fixture", async ({ page, request }) => {
    expect((await page.goto("/playwright-event-card-variants"))?.status()).toBe(200);
    const eventBase = "/playwright-afterglow-social/events";
    const externalEvent = eventBase + "/playwright-artless-date-external";
    const timedEvent = eventBase + "/playwright-artless-timed-long";
    const sparseTitle = page.getByRole("link", { name: "Independence Day Guest Sessions", exact: true });
    const timedTitle = page.getByRole("link", { name: "Harbor Sound System Presents the Late Night Interstellar Bassline Sessions", exact: true });
    const sparse = page.getByRole("article").filter({ has: sparseTitle });
    const timed = page.getByRole("article").filter({ has: timedTitle });

    await expect(sparseTitle).toHaveAttribute("href", externalEvent);
    await expect(timedTitle).toHaveAttribute("href", timedEvent);
    await expect(sparse.locator("time")).toHaveText(/Time TBA/);
    const source = sparse.getByRole("link", { name: "Guest event listing", exact: true });
    await expect(source).toHaveAttribute("href", "https://example.invalid/events/independence-day-guest-sessions");
    await expect(source).toHaveAttribute("target", "_blank");
    const start = timed.locator("time").first();
    const doors = timed.locator("time").last().locator("..");
    await expect(start).toHaveText(/Jun 14.*7:00 PM PDT/);
    await expect(doors).toHaveText(/Doors 6:30 PM/);
    await expect(timed.getByText("Afterglow Social and the Interstellar Sound System Collective", { exact: true })).toBeVisible();

    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const [shortCard, richCard] = await Promise.all([sparse.boundingBox(), timed.boundingBox()]);
      if (!shortCard || !richCard) throw new Error("Expected both event cards");
      expect(shortCard.height).toBeLessThan(richCard.height);
      const [startBox, doorsBox] = await Promise.all([start.boundingBox(), doors.boundingBox()]);
      if (!startBox || !doorsBox) throw new Error("Expected the event start and Doors");
      if (doorsBox.y > startBox.y + startBox.height) {
        expect(doorsBox.x).toBe(startBox.x);
        await expect(doors).toHaveCSS("padding-inline-start", "0px");
      }
    }
    for (const path of [externalEvent, timedEvent]) {
      expect((await request.get(path)).status()).toBe(200);
    }
  });
});

test("pictured profile occurrences keep their artwork and canonical link @fixture", async ({ page }) => {
  expect((await page.goto("/playwright-dj-aurora"))?.status()).toBe(200);
  const title = page.getByRole("link", { name: "Afterglow Harbor Sessions", exact: true });
  await expect(title).toHaveAttribute("href", /^\/playwright-afterglow-social\/events\//);
  const card = page.getByRole("article").filter({ has: title });
  await expect(card.locator(":scope > div").first()).toHaveCSS("background-image", /url\(/);
  await expect(card.getByText("Afterglow Social", { exact: true })).toBeVisible();
});
