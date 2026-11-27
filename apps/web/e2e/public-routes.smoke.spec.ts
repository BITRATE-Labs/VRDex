import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

import type { PublicEventShareCard } from "../../../convex/_eventShareCard";
import { AUTH_UNAVAILABLE_COPY } from "../src/lib/auth-copy";
import { eventShareRevision } from "../src/lib/event-share-card";
import { toggleSiteTheme } from "./flow-navigation";
import {
  capturedRoutes,
  expectEventPage,
  expectProfilePlaybackLinks,
  expectSearchPage,
  expectSignInPage,
  prepareVisualPage,
  productionSmokeRoutes,
  visualProfilePaths,
  waitForVisualReady,
} from "./public-routes";

const routes = process.env.PLAYWRIGHT_BASE_URL ? productionSmokeRoutes : capturedRoutes;
const isHostedRun = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const eventShareImageFixtures = [
  {
    name: "event-open-graph-image-no-artwork",
    event: {
      slug: "playwright-event-share-no-artwork",
      communitySlug: "playwright-afterglow-social",
      communityName: "Afterglow Social",
      title: "Night Shift",
      startAt: Date.UTC(2026, 5, 14, 22, 0, 0),
      timezone: "America/New_York",
      status: "scheduled",
    },
  },
  {
    name: "event-open-graph-image-cancelled-long",
    event: {
      slug: "playwright-event-share-cancelled-long",
      communitySlug: "playwright-afterglow-social",
      communityName: "Afterglow Social",
      title: "Afterglow Harbor Sessions Presents an Extra Long Community Showcase Night",
      startAt: Date.UTC(2026, 5, 14, 22, 0, 0),
      timezone: "America/New_York",
      status: "cancelled",
    },
  },
  {
    name: "event-open-graph-image-long-community",
    event: {
      slug: "playwright-event-share-long-community",
      communitySlug: "playwright-afterglow-social",
      communityName: "A".repeat(80),
      title: "Night Shift",
      startAt: Date.UTC(2026, 5, 14, 22, 0, 0),
      timezone: "America/New_York",
      status: "scheduled",
    },
  },
] as const satisfies ReadonlyArray<{ name: string; event: PublicEventShareCard }>;

test.beforeEach(async ({ page }) => {
  await prepareVisualPage(page);
});

for (const route of routes) {
  test(`${route.name} renders`, async ({ page }) => {
    await page.goto(route.path);
    await route.expectPage(page);
  });
}

test("featured world fits the narrow discovery viewport", async ({ page }) => {
  test.skip(isHostedRun, "The featured world card uses a local fixture.");

  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/discovery");

  const card = page.getByRole("link").filter({
    has: page.getByRole("heading", { name: "Neon Harbor", exact: true }),
  });
  await expect(card).toHaveAttribute("href", "/playwright-neon-harbor");
  await expect(card.getByText("Afterglow Harbor Sessions", { exact: true })).toBeVisible();
  expect(await card.evaluate((link) => link.getBoundingClientRect().right)).toBeLessThanOrEqual(320);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
});

test("sign-in offers a route to create an account", async ({ page }) => {
  await page.goto("/sign-in");

  // The credential fields and the progressive-disclosure button belonged to the
  // removed VRDex form; Clerk's identifier-first UI owns them now and asserting
  // its markup would break on any upstream change. What is still VRDex's, and
  // still worth guarding, is that a visitor can reach account creation — the
  // action Clerk routes to `/sign-up`, which needs its own catch-all route to
  // exist rather than 404.
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();

  await page.goto("/sign-up");
  const shell = page.getByRole("region", { name: "Create account", exact: true });
  const title = shell.getByRole("heading", { name: "Create account", exact: true, level: 1 });
  await expect(shell).toBeVisible();
  if (await shell.getByText(AUTH_UNAVAILABLE_COPY, { exact: true }).count()) {
    await expect(title).toBeVisible();
    await expect(title).not.toHaveClass(/\bsr-only\b/);
  } else {
    await expect(title).toHaveClass(/\bsr-only\b/);
  }
});

test("legacy discovery query redirects to search", async ({ page }) => {
  await page.goto("/discover?q=aurora");
  await expect(page).toHaveURL(/\/search\?q=aurora$/);

  if (process.env.PLAYWRIGHT_BASE_URL) {
    await expect(page.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Search results" })).toHaveAccessibleDescription("Results for aurora");
    await expect(page.getByRole("button", { name: /Search VRDex/i })).toBeVisible();
    return;
  }

  await expectSearchPage(page);
});

test("legacy root query and lookup URL keep the DJ lookup destination", async ({ page }) => {
  for (const path of ["/?q=%20BASICBIT%20", "/lookup?q=BASICBIT"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/search\?q=BASICBIT&view=dj$/);
    await expect(page.getByLabel("DJ name")).toHaveValue("BASICBIT");
    await expect(page.getByRole("navigation", { name: "Search view" })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("button", { name: "Search", exact: true })).toBeVisible();
  }
});

test("missing public event offers themed recovery", async ({ page }) => {
  test.skip(isHostedRun, "The invalid canonical route uses a local public event fixture.");

  const wrongCommunityPath = visualProfilePaths.eventPath.replace(
    "/playwright-afterglow-social/",
    "/playwright-wrong-community/",
  );
  const response = await page.goto(wrongCommunityPath);
  expect(response?.status()).toBe(404);

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await expect(main.getByText("This page could not be found.", { exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("href", "/search");
  const discovery = main.getByRole("link", { name: "Discovery", exact: true });
  await expect(discovery).toHaveAttribute("href", "/discovery");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const lightBackground = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
  await expect(main).toHaveCSS("background-color", lightBackground);

  await toggleSiteTheme(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkBackground = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);
  await expect(main).toHaveCSS("background-color", darkBackground);

  await discovery.click();
  await expect(page).toHaveURL("/discovery");
});


test("legacy media contribution route rejects claimed profiles", async ({ page }) => {
  test.skip(isHostedRun, "The Playwright-only media contribution flag is local-only.");

  const response = await page.goto(`${visualProfilePaths.verifiedPersonPath}/contribute-media`);

  expect(response?.status()).toBe(404);
});

test("private profile claim actions stay on owner-aware routes", async ({ page }) => {
  test.skip(isHostedRun, "The Playwright-only claim fixture is not enabled on hosted targets.");

  await page.goto("/playwright/claim?private=1");

  await expect(page.getByRole("link", { name: "Back to account" })).toHaveAttribute("href", "/account");
  await expect(page.getByRole("link", { name: "Manage profile" })).toHaveAttribute(
    "href",
    "/account/appearance?profileId=playwright-profile",
  );
  await expect(page.getByRole("link", { name: "View profile" })).toHaveCount(0);
  await expect(page.getByText("vrdex.net/basicbit")).toHaveCount(0);

  await page.getByRole("link", { name: "Manage profile" }).click();
  await expect(page).toHaveURL(/\/account\/appearance\?profileId=playwright-profile$/);
  await expect(page.getByRole("link", { name: "View profile" })).toHaveCount(0);
});

test("sign-in describes recognized contribution return paths without echoing them", async ({ page }) => {
  const cases = [
    ["/submit", "Add profile"],
    ["/claim/playwright-sparse-import?source=profile", "Claim profile"],
    ["/playwright-sparse-import/edit?section=media#media-contributions", "Edit profile"],
    ["/account"],
    ["https://example.invalid/submit"],
    ["https://example.invalid/events/new"],
    ["/events/newer"],
    ["/claim/"],
  ] as const;
  for (const [returnTo, journeyLabel] of cases) {
    expect((await page.goto("/sign-in?" + new URLSearchParams({ returnTo })))?.status()).toBe(200);
    await expectSignInPage(page, journeyLabel);
    if (!journeyLabel) {
      await expect(page.getByText("Manage your VRDex profile and events.", { exact: true })).toBeVisible();
    }
  }
});

test("add event sign-in keeps the contribution context and full return target", async ({ page }) => {
  for (const returnTo of [
    "/events/new",
    "/events/new?community=playwright-afterglow-social",
    "/events/new?draft=fixture-draft",
    "/events/new?community=playwright-afterglow-social&draft=fixture-draft",
  ]) {
    expect((await page.goto(returnTo))?.status()).toBe(200);
    await expect(page).toHaveURL(
      (url) => url.pathname === "/sign-in" && url.searchParams.get("returnTo") === returnTo,
    );
    await expectSignInPage(page, "Add event");
    await expect(page.locator('section[aria-labelledby="sign-in-heading"]')).not.toContainText(returnTo);
  }
});

test("OpenAPI YAML document is served", async ({ page }) => {
  const response = await page.request.get("/api/v0/openapi.yaml");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/yaml");

  const body = await response.text();

  expect(body).toContain("openapi: 3.1.0");
  expect(body).toContain("/api/v0/openapi.yaml:");
});

test("profile links expose Discord-ready metadata and a generated image", async ({ page }, testInfo) => {
  test.skip(isHostedRun, "The deterministic profile metadata fixture is local-only.");

  await page.goto("/playwright-dj-aurora");

  await expect(page).toHaveTitle("DJ Aurora | VRDex");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "DJ Aurora | VRDex",
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    "Melodic house sets for late-night VRChat floors.",
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    /\/playwright-dj-aurora$/,
  );

  const imageUrl = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(imageUrl).not.toBeNull();

  const rasterFixture = await page.request.get(
    "/api/e2e/fixture-assets/fixture-aurora-profile-image-raster",
  );
  expect(rasterFixture.ok()).toBe(true);
  expect(rasterFixture.headers()["content-type"]).toContain("image/jpeg");
  expect(Array.from((await rasterFixture.body()).subarray(0, 3))).toEqual([
    0xff, 0xd8, 0xff,
  ]);

  const imageRequestUrl = new URL(imageUrl!);
  imageRequestUrl.searchParams.set("fixture", "raster-avatar");
  const imageResponse = await page.request.get(imageRequestUrl.href);
  expect(imageResponse.ok()).toBe(true);
  expect(imageResponse.headers()["content-type"]).toContain("image/png");
  const imageBody = await imageResponse.body();
  expect(imageBody.byteLength).toBeGreaterThan(1_000);
  const profileOpenGraphImagePath = testInfo.outputPath("profile-open-graph-image.png");
  await writeFile(profileOpenGraphImagePath, imageBody);
  await testInfo.attach("profile-open-graph-image", {
    path: profileOpenGraphImagePath,
    contentType: "image/png",
  });
  const renderedPixels = await sharp(imageBody).ensureAlpha().raw().toBuffer();
  let rasterFixturePixelCount = 0;
  for (let offset = 0; offset < renderedPixels.length; offset += 4) {
    if (
      Math.abs(renderedPixels[offset]! - 0xd6) <= 12 &&
      Math.abs(renderedPixels[offset + 1]! - 0x6a) <= 12 &&
      Math.abs(renderedPixels[offset + 2]! - 0x4d) <= 12
    ) {
      rasterFixturePixelCount += 1;
    }
  }
  expect(rasterFixturePixelCount).toBeGreaterThan(1_000);

  const maxContentImage = await page.request.get("/playwright-max-share-card/opengraph-image");
  expect(maxContentImage.ok()).toBe(true);
  await testInfo.attach("profile-open-graph-image-max-content", {
    body: await maxContentImage.body(),
    contentType: "image/png",
  });

  const invalidSlugImage = await page.request.get("/not_valid/opengraph-image");
  expect(invalidSlugImage.status()).toBe(404);

  const missingSlugImage = await page.request.get("/scanner-unique-123/opengraph-image");
  expect(missingSlugImage.status()).toBe(404);

  // Events have a community-scoped, revision-bound image route, covered below.
  const bareEventImage = await page.request.get("/playwright-afterglow-harbor-sessions/opengraph-image");
  expect(bareEventImage.status()).toBe(404);

  for (const entitySlug of [
    "playwright-neon-harbor",
    "playwright-afterglow-social",
  ]) {
    const entityImage = await page.request.get(`/${entitySlug}/opengraph-image`);
    expect(entityImage.status()).toBe(200);
    expect(entityImage.headers()["content-type"]).toContain("image/png");
  }
});

test("event links expose community-scoped metadata and a poster share image", async ({ page }, testInfo) => {
  test.skip(isHostedRun, "The deterministic event metadata fixture is local-only.");

  await page.goto(visualProfilePaths.eventPath);

  await expect(page).toHaveTitle("Afterglow Harbor Sessions | VRDex");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Afterglow Harbor Sessions | VRDex",
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    "Late-night harbor club session with house, trance, and warm social energy.",
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    /\/playwright-afterglow-social\/events\/playwright-afterglow-harbor-sessions$/,
  );

  const imageUrl = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(imageUrl).not.toBeNull();
  expect(imageUrl).toMatch(/\/opengraph-image\?revision=[0-9a-f]{16}$/);

  const imageResponse = await page.request.get(imageUrl!);
  expect(imageResponse.ok()).toBe(true);
  expect(imageResponse.headers()["content-type"]).toContain("image/png");
  expect(imageResponse.headers()["cache-control"]).toBe("no-store");
  const imageBody = await imageResponse.body();
  const metadata = await sharp(imageBody).metadata();
  expect(metadata.width).toBe(1200);
  expect(metadata.height).toBe(630);

  const imagePath = testInfo.outputPath("event-open-graph-image.png");
  await writeFile(imagePath, imageBody);
  await testInfo.attach("event-open-graph-image", {
    path: imagePath,
    contentType: "image/png",
  });

  const renderedPixels = await sharp(imageBody).ensureAlpha().raw().toBuffer();
  let posterPixelCount = 0;
  for (let offset = 0; offset < renderedPixels.length; offset += 4) {
    if (
      renderedPixels[offset]! > 40 &&
      renderedPixels[offset + 2]! > 80 &&
      renderedPixels[offset + 2]! > renderedPixels[offset + 1]!
    ) {
      posterPixelCount += 1;
    }
  }
  expect(posterPixelCount).toBeGreaterThan(1_000);

  for (const fixture of eventShareImageFixtures) {
    const fixtureResponse = await page.request.get(
      `/playwright-afterglow-social/events/${fixture.event.slug}/opengraph-image?revision=${eventShareRevision(fixture.event)}`,
    );
    expect(fixtureResponse.ok()).toBe(true);
    const fixtureBody = await fixtureResponse.body();
    const fixturePath = testInfo.outputPath(`${fixture.name}.png`);
    await writeFile(fixturePath, fixtureBody);
    await testInfo.attach(fixture.name, {
      path: fixturePath,
      contentType: "image/png",
    });
  }

  const fabricatedRevisionUrl = new URL(imageUrl!);
  fabricatedRevisionUrl.searchParams.set("revision", "0000000000000000");
  const fabricatedRevision = await page.request.get(fabricatedRevisionUrl.href);
  expect(fabricatedRevision.status()).toBe(404);
  expect(fabricatedRevision.headers()["cache-control"]).toBe("no-store");

  const extraQueryUrl = new URL(imageUrl!);
  extraQueryUrl.searchParams.set("cache-buster", "1");
  expect((await page.request.get(extraQueryUrl.href)).status()).toBe(404);

  const wrongCommunityImage = await page.request.get(
    "/playwright-dj-aurora/events/playwright-afterglow-harbor-sessions/opengraph-image",
  );
  expect(wrongCommunityImage.status()).toBe(404);

  const missingEventImage = await page.request.get(
    "/playwright-afterglow-social/events/missing-event/opengraph-image",
  );
  expect(missingEventImage.status()).toBe(404);
});

test("public API supports browser CORS and preflight", async ({ page }) => {
  const origin = "https://developer.example.test";
  const response = await page.request.get("/api/v0/openapi.json", {
    headers: { Origin: origin },
  });

  expect(response.ok()).toBe(true);
  expect(response.headers()["access-control-allow-origin"]).toBe("*");
  expect(response.headers()["access-control-allow-credentials"]).toBeUndefined();
  expect(response.headers()["access-control-expose-headers"]).toContain("RateLimit-Limit");

  const preflight = await page.request.fetch("/api/v0/developer/oauth-apps/example", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Headers": "authorization, content-type",
      "Access-Control-Request-Method": "PATCH",
    },
  });

  expect(preflight.ok()).toBe(true);
  expect(preflight.headers()["access-control-allow-origin"]).toBe("*");
  expect(preflight.headers()["access-control-allow-credentials"]).toBeUndefined();
  expect(preflight.headers()["access-control-allow-methods"]).toContain("PATCH");
  expect(preflight.headers()["access-control-allow-headers"]).toContain("Authorization");
  expect(preflight.headers()["access-control-allow-headers"]).not.toContain("Cookie");
  expect(preflight.headers()["access-control-allow-headers"]).not.toContain("X-CSRF-Token");
  expect(preflight.headers()["access-control-allow-headers"]).not.toContain("X-Arbitrary-Client-Header");
  expect(preflight.headers()["access-control-max-age"]).toBe("600");
});

test.describe("hosted lookup smoke", () => {
  test.skip(!isHostedRun, "Hosted-only smoke coverage.");

  test("anonymous public API search succeeds", async ({ page }) => {
    const response = await page.request.get("/api/v0/search?q=basicbit&limit=1");
    const responseText = await response.text();

    expect(response.status(), responseText).toBe(200);

    const body = JSON.parse(responseText) as { results?: unknown };
    expect(Array.isArray(body.results)).toBe(true);
  });

  test("lookup route and suggest endpoint render", async ({ page }) => {
    await page.goto("/lookup");
    await expect(page.getByRole("heading", { name: "DJ links", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/search\?view=dj$/);
    await expect(page.getByLabel("DJ name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lookup", exact: true })).toBeVisible();

    const suggestResponse = await page.request.get("/lookup/suggest?q=a");
    expect(suggestResponse.ok()).toBe(true);
    const suggestBody = await suggestResponse.json();
    expect(Array.isArray(suggestBody.results)).toBe(true);
  });
});

test.describe("fixture lookup smoke", () => {
  test.skip(isHostedRun, "Fixture-specific lookup suggestions are local-only.");

  test("profile image keeps its fallback until the asset loads", async ({ page }) => {
    let releaseImage: () => void = () => {};
    const imageHold = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });

    await page.route("**/api/e2e/fixture-assets/fixture-aurora-profile-image", async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      await imageHold;
      await route.fulfill({ body, contentType: response.headers()["content-type"] });
    });

    await page.goto("/playwright-dj-aurora", { waitUntil: "domcontentloaded" });

    const avatarState = page.locator('[aria-busy="true"]').filter({ hasText: "DA" });
    await expect(avatarState).toBeVisible();
    const avatar = page.getByRole("img", { name: "DJ Aurora display image" });
    await expect(avatar.locator("img")).toHaveCSS("opacity", "0");

    releaseImage();

    await expect(avatar.locator("img")).toHaveCSS("opacity", "1");
    await expect(avatar.getByText("DA", { exact: true })).toHaveCSS("opacity", "0");
    await expect(avatarState).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("img", { name: "DJ Aurora display image" }).locator("img")).toHaveCSS("opacity", "1");
  });

  test("media preview shows progress until its image loads", async ({ page }) => {
    let releaseImage: () => void = () => {};
    const imageHold = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });

    await page.route("**/api/e2e/fixture-assets/fixture-aurora-primary-logo", async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      await imageHold;
      await route.fulfill({ body, contentType: response.headers()["content-type"] });
    });

    await page.goto("/playwright-dj-aurora", { waitUntil: "domcontentloaded" });
    const mediaKit = page.getByRole("heading", { name: "Media kit" }).locator("xpath=ancestor::section");
    await mediaKit.scrollIntoViewIfNeeded();

    const logoCard = mediaKit.getByRole("article").filter({ hasText: "Primary logo" });
    const preview = logoCard.getByRole("img", { name: "Aurora wordmark" });
    await expect(logoCard.getByRole("status", { name: "Loading image" })).toBeVisible();
    await expect(preview).toHaveCSS("opacity", "0");

    releaseImage();

    await expect(preview).toHaveCSS("opacity", "1");
    await expect(logoCard.locator('div[aria-hidden="true"] > span.animate-none').locator(".."))
      .toHaveCSS("opacity", "0");
    await expect(logoCard.getByRole("status", { name: "Loading image" })).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    const reloadedMediaKit = page.getByRole("heading", { name: "Media kit" }).locator("xpath=ancestor::section");
    await reloadedMediaKit.scrollIntoViewIfNeeded();
    await expect(reloadedMediaKit.getByRole("img", { name: "Aurora wordmark" })).toHaveCSS("opacity", "1");
  });

  test("VRCDN live state recovers after the profile renders without a reload", async ({ page }) => {
    let attempts = 0;
    let releaseFirstResponse: () => void = () => {};
    const firstResponseHold = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve;
    });

    await page.route("**/api/profile-live/basicbit/vrcdn*", async (route) => {
      attempts += 1;

      if (attempts === 1) {
        await firstResponseHold;
        await route.fulfill({ contentType: "application/json", json: { states: { basicbit: "unavailable" } } });
        return;
      }

      await route.fulfill({ contentType: "application/json", json: { states: { basicbit: "live" } } });
    });

    await page.goto("/basicbit");
    await expect(page.getByRole("heading", { name: "BASICBIT" })).toBeVisible();
    await expect.poll(() => attempts).toBe(1);
    await expect(page.getByRole("heading", { name: "Watch", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open preview" })).toHaveCount(0);
    await expectProfilePlaybackLinks(page, 1);
    await expect(page.getByText("Live now", { exact: true })).toHaveCount(0);

    await page.clock.install();
    const firstResponse = page.waitForResponse((response) =>
      response.url().includes("/api/profile-live/basicbit/vrcdn"),
    );
    releaseFirstResponse();
    await firstResponse;
    await page.clock.fastForward(17_000);

    await expect(page.getByText("VRCDN stream", { exact: true })).toBeVisible();
    await expect(page.getByText("Live now", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play VRCDN stream" })).toBeVisible();
    await expect(page.locator("video")).toHaveCount(0);
    expect(attempts).toBe(2);
  });

  test("VRCDN-only profile keeps its compact copy controls while offline", async ({ page }) => {
    let attempts = 0;

    await page.route("**/api/profile-live/playwright-dj-night-market/vrcdn*", async (route) => {
      attempts += 1;
      await route.fulfill({ contentType: "application/json", json: { states: { "dj-night-market": "offline" } } });
    });

    await page.goto("/playwright-dj-night-market");
    await expect(page.getByRole("heading", { name: "DJ Night Market" })).toBeVisible();
    await expect.poll(() => attempts).toBe(1);
    await expect(page.getByRole("heading", { name: "Watch", exact: true })).toHaveCount(0);
    const watch = page.locator("aside").filter({ has: page.getByText("VRCDN stream", { exact: true }) });
    await expect(watch).toBeVisible();
    await expect(watch.getByRole("link", { name: "Open preview" })).toHaveCount(0);
    await expectProfilePlaybackLinks(page, 1);
    let copiedPlayback = "";
    await page.exposeFunction("capturePlaybackCopy", (value: string) => { copiedPlayback = value; });
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: (value: string) => (window as unknown as {
          capturePlaybackCopy: (value: string) => Promise<void>;
        }).capturePlaybackCopy(value),
      } });
    });
    const playback = watch;
    for (const [label, value] of [
      ["Quest", "https://stream.vrcdn.live/live/dj-night-market.live.ts"],
      ["PC", "rtspt://stream.vrcdn.live/live/dj-night-market"],
    ]) {
      await expect(playback.getByText(value, { exact: true })).toBeVisible();
      await playback.getByRole("button", { name: `Copy ${label}`, exact: true }).click();
      await expect(playback.getByRole("button", { name: `${label} copied`, exact: true })).toBeVisible();
      await expect.poll(() => copiedPlayback).toBe(value);
    }
    await expect(page.getByRole("link", { exact: true, name: "VRCDN stream" })).toHaveCount(0);
    await expect(page.getByText("Live now", { exact: true })).toHaveCount(0);
  });

  test("confirmed live VRCDN waits for two offline observations", async ({ page }) => {
    let attempts = 0;
    let releaseFirstResponse: () => void = () => {};
    const firstResponseHold = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve;
    });

    await page.route("**/api/profile-live/playwright-dj-aurora/vrcdn*", async (route) => {
      attempts += 1;

      if (attempts === 1) {
        await firstResponseHold;
      }

      await route.fulfill({ contentType: "application/json", json: { states: { "dj-aurora": "offline", "suggested-aurora": "offline" } } });
    });

    await page.goto("/playwright-dj-aurora");
    const vrcdnBlock = page
      .getByText("VRCDN", { exact: true })
      .locator("xpath=ancestor::section[1]");
    const player = page.getByRole("button", { name: "Play VRCDN" });
    const preview = page.getByRole("link", { name: "Open preview" });
    await expect(player).toBeVisible();
    await expect(page.getByText("Suggested VRCDN", { exact: true })).toBeVisible();
    await expect(preview).toHaveCount(0);
    await waitForVisualReady(page);
    const copyPosition = () => vrcdnBlock.evaluate((block) => {
      const link = block.querySelector('button[aria-label="Copy Quest for VRCDN dj-aurora"]')!;
      const linkRect = link.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      return { x: linkRect.x - blockRect.x, y: linkRect.y - blockRect.y,
        width: linkRect.width, height: linkRect.height };
    });
    const copyBefore = await copyPosition();
    await player.evaluate((element) => {
      element.setAttribute("data-lifecycle-marker", "original");
    });

    await page.clock.install();
    const firstResponse = page.waitForResponse((response) =>
      response.url().includes("/api/profile-live/playwright-dj-aurora/vrcdn"),
    );
    releaseFirstResponse();
    await firstResponse;

    await expect(player).toHaveAttribute("data-lifecycle-marker", "original");
    await expect(player).toBeVisible();
    await expect(vrcdnBlock.getByText("Live now", { exact: true })).toBeVisible();

    await page.clock.fastForward(10_000);

    await expect.poll(() => attempts).toBe(2);
    await expect(player).toHaveCount(0);
    await expect(vrcdnBlock.getByText("Live now", { exact: true })).toHaveCount(0);
    await expect(vrcdnBlock.getByRole("button", { name: "Copy Quest for VRCDN dj-aurora", exact: true })).toBeVisible();
    expect(await copyPosition()).toEqual(copyBefore);
  });

  // Public-page fixtures have synthetic IDs; retained authorization must read the
  // same projection, rather than accidentally querying an unrelated seeded row.
  async function retainAuroraFixture(page: import("@playwright/test").Page) {
    await page.route("**/api/query", async route => {
      const query = route.request().postDataJSON();
      const args = Array.isArray(query.args) ? query.args[0] : query.args;
      if (query.path !== "profiles:getPublicBySlug" || args?.slug !== "playwright-dj-aurora") return route.fallback();
      await route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        contentType: "application/json",
        json: {
          status: "success",
          value: {
            id: "fixture-profile-dj-aurora",
            slug: "playwright-dj-aurora",
            displayName: "DJ Aurora",
            outboundLinks: [{ type: "vrcdn", url: "https://stream.vrcdn.live/live/dj-aurora.live.ts" }],
          },
        },
      });
    });
  }

  test("confirmed offline state does not interrupt active VRCDN playback", async ({ page }) => {
    await retainAuroraFixture(page);
    let attempts = 0;
    let releaseFirstResponse: () => void = () => {};
    let releaseMedia: () => void = () => {};
    const firstResponseHold = new Promise<void>((resolve) => {
      releaseFirstResponse = resolve;
    });
    const mediaHold = new Promise<void>((resolve) => {
      releaseMedia = resolve;
    });

    await page.route("https://stream.vrcdn.live/live/dj-aurora.live.ts*", async (route) => {
      await mediaHold;
      await route.abort();
    });
    await page.route("**/api/profile-live/playwright-dj-aurora/vrcdn*", async (route) => {
      attempts += 1;

      if (attempts === 1) {
        await firstResponseHold;
      }

      await route.fulfill({ contentType: "application/json", json: { states: { "dj-aurora": "offline", "suggested-aurora": "offline" } } });
    });

    await page.goto("/playwright-dj-aurora");
    const vrcdnBlock = page
      .getByText("VRCDN", { exact: true })
      .locator("xpath=ancestor::section[1]");
    const player = page.getByRole("button", { name: "Play VRCDN" });
    await expect(player).toBeVisible();
    await player.click();
    const video = page.locator("video");
    await expect(video).toBeVisible();
    await video.evaluate((element) => {
      element.setAttribute("data-lifecycle-marker", "playing");
      // This policy fixture holds network bytes; model the state of a real playing event.
      Object.defineProperty(element, "paused", { configurable: true, get: () => false });
      element.dispatchEvent(new Event("playing"));
    });
    await expect(page.getByText("LIVE", { exact: true })).toBeVisible();

    await page.clock.install();
    const firstResponse = page.waitForResponse((response) =>
      response.url().includes("/api/profile-live/playwright-dj-aurora/vrcdn"),
    );
    releaseFirstResponse();
    await firstResponse;
    await page.clock.fastForward(10_000);

    await expect.poll(() => attempts).toBe(2);
    await expect(video).toHaveAttribute("data-lifecycle-marker", "playing");
    await expect(video).toBeVisible();
    await expect(vrcdnBlock.getByText("Live now", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open preview" })).toHaveCount(0);

    releaseMedia();
  });

  test("player ended requests a sanity check without declaring offline", async ({ page }, testInfo) => {
    await retainAuroraFixture(page);
    let attempts = 0;
    let releaseMedia: () => void = () => {};
    const mediaHold = new Promise<void>((resolve) => {
      releaseMedia = resolve;
    });

    await page.route("https://stream.vrcdn.live/live/dj-aurora.live.ts*", async (route) => {
      await mediaHold;
      await route.abort();
    });
    await page.route("**/api/profile-live/playwright-dj-aurora/vrcdn*", async (route) => {
      attempts += 1;
      await route.fulfill({ contentType: "application/json", json: { states: { "dj-aurora": "live", "suggested-aurora": "offline" } } });
    });

    await page.goto("/playwright-dj-aurora");
    const vrcdnBlock = page
      .getByText("VRCDN", { exact: true })
      .locator("xpath=ancestor::section[1]");
    await expect.poll(() => attempts).toBe(1);
    const player = page.getByRole("button", { name: "Play VRCDN" });
    await player.click();
    const video = page.locator("video");
    await expect(video).toBeVisible();

    await page.clock.install();
    await video.evaluate((element) => {
      Object.defineProperty(element, "paused", { configurable: true, get: () => false });
      element.dispatchEvent(new Event("playing"));
      Object.defineProperty(element, "paused", { configurable: true, get: () => true });
      element.dispatchEvent(new Event("ended"));
    });

    // The playback event ends this connection, but liveness stays with the
    // provider: the badge holds until the requested check answers.
    await expect(page.getByText("Playback stopped", { exact: true })).toBeVisible();
    await expect(vrcdnBlock.getByText("Live now", { exact: true })).toBeVisible();

    await page.clock.fastForward(10_000);
    await expect.poll(() => attempts).toBe(2);
    await expect(vrcdnBlock.getByText("Live now", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    if (process.env.PLAYWRIGHT_CAPTURE_SCREENSHOTS !== "false") {
      await testInfo.attach("profile-playback-stopped", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }

    releaseMedia();
  });

  test("VRCDN live endpoint stays profile-scoped and private", async ({ page }) => {
    const response = await page.request.get("/api/profile-live/playwright-dj-aurora/vrcdn");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ states: { "dj-aurora": "live" } });
  });

  test("profile claim actions stay separate and keyboard focusable", async ({ page }) => {
    await page.goto("/playwright-afterglow-social");

    const communityCard = page.getByRole("region", { name: "Afterglow Social" });
    const communityClaim = page
      .getByRole("complementary", { name: "Profile ownership" })
      .getByRole("link", { name: "Claim profile" });

    await expect(communityCard.getByRole("link", { name: "Claim profile" })).toHaveCount(0);
    await communityClaim.focus();
    await expect(communityClaim).toBeFocused();

    await page.goto("/playwright-dj-aurora");

    const personCard = page.getByRole("region", { name: "DJ Aurora" });
    const personClaim = page
      .getByRole("complementary", { name: "Profile ownership" })
      .getByRole("link", { name: "Claim profile" });

    await expect(personCard.getByRole("link", { name: "Claim profile" })).toHaveCount(0);
    await personClaim.focus();
    await expect(personClaim).toBeFocused();

    await page.goto("/basicbit");
    await expect(page.getByRole("complementary", { name: "Profile ownership" })).toHaveCount(0);
  });

  test("event short link redirects to its public event", async ({ page }) => {
    await page.goto("/l/afh2x67");
    await expect(page).toHaveURL(
      /\/playwright-afterglow-social\/events\/playwright-afterglow-harbor-sessions$/,
    );
    await expectEventPage(page);
  });

  test("lookup suggestions select a public person row", async ({ page }) => {
    await page.goto("/lookup");
    await page.getByLabel("DJ name").fill("b");
    const basicBitOption = page.getByRole("option", { name: /BASICBIT/i });
    await expect(basicBitOption).toHaveCount(1);
    await expect(basicBitOption).not.toContainText("Private seed");
    await page.getByLabel("DJ name").press("ArrowDown");
    await expect(page.getByRole("option", { selected: true })).toHaveClass(/bg-surface-strong/);
    await basicBitOption.click();
    await expect(page).toHaveURL(/\/search\?q=BASICBIT&view=dj$/);
    await expect(page.getByRole("link", { name: "BASICBIT", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Website: basicbit.net", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "VRCDN stream preview", exact: true })).toBeVisible();
    await expect(page.locator('input[value="basic_bit"]')).toHaveCount(2);
    await expect(page.getByRole("link", { name: /Discord:/ })).toHaveCount(0);
    await expect(page.locator("code").filter({ hasText: "https://stream.vrcdn.live/live/basicbit.live.ts" })).toHaveCount(2);
    await expect(page.locator("code").filter({ hasText: "rtspt://stream.vrcdn.live/live/basicbit" })).toHaveCount(2);
    await expect(page.locator('input[value="https://www.twitch.tv/basic_bit"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Twitch: twitch.tv", exact: true })).toBeVisible();
    await expect(page.getByText("BASIC", { exact: true })).toHaveCount(2);
    const copyButton = page.getByRole("button", { name: "Copy" }).first();
    const copyButtonWidth = await copyButton.evaluate((element) => (element as HTMLElement).offsetWidth);
    await copyButton.click();
    const copiedButton = page.getByRole("button", { name: "Copied" }).first();
    await expect(copiedButton).toBeVisible();
    const copiedButtonWidth = await copiedButton.evaluate((element) => (element as HTMLElement).offsetWidth);
    expect(copiedButtonWidth).toBe(copyButtonWidth);
    await expect.poll(async () => await page.evaluate(() => JSON.parse(window.localStorage.getItem("vrdex.lookup.recentSearches") ?? "[]")[0])).toBe("BASICBIT");
    await page.getByRole("button", { name: "Clear lookup" }).click();
    await page.getByLabel("DJ name").focus();
    await expect(page.getByRole("option", { name: /BASICBIT/i })).toBeVisible();
  });

  test("lookup hides stale suggestions as soon as the visible query changes", async ({ page }) => {
    await page.goto("/search?view=dj");
    const lookupInput = page.getByLabel("DJ name");

    await lookupInput.fill("b");
    await expect(page.getByRole("option", { name: /BASICBIT/i })).toBeVisible();
    await lookupInput.fill("unrelated query");
    await expect(page.getByRole("option", { name: /BASICBIT/i })).toHaveCount(0);
  });

  test("lookup promotes Shift+Enter and multiline paste into bulk mode", async ({ page }) => {
    await page.goto("/search?view=dj");
    const lookupInput = page.getByLabel("DJ name");

    await lookupInput.fill("BASICBIT");
    await lookupInput.press("Shift+Enter");

    const shiftedBulkEditor = page.getByLabel("Lineup text");
    await expect(shiftedBulkEditor).toBeFocused();
    await expect(shiftedBulkEditor).toHaveValue("BASICBIT\n");
    await expect(page.getByRole("button", { name: "Single" })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/search?view=dj");
    const pasteTarget = page.getByLabel("DJ name");

    await pasteTarget.evaluate((element) => {
      const clipboardData = new DataTransfer();

      clipboardData.setData("text/plain", "BASICBIT\nDJ Aurora");
      element.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }));
    });

    const pastedBulkEditor = page.getByLabel("Lineup text");
    await expect(pastedBulkEditor).toBeFocused();
    await expect(pastedBulkEditor).toHaveValue("BASICBIT\nDJ Aurora");
    await expect(page.getByText("2 pasted entries")).toBeVisible();
  });

  test("standard search hides stale suggestions as soon as the visible query changes", async ({ page }) => {
    await page.goto("/search");
    const searchInput = page.getByRole("combobox", { name: /Search/i });

    await searchInput.fill("basic");
    await expect(page.getByRole("option", { name: /BASICBIT/i })).toBeVisible();
    await searchInput.fill("unrelated query");
    await expect(page.getByRole("option", { name: /BASICBIT/i })).toHaveCount(0);
  });

  test("standard search keeps typeahead and submission within the active entity filter", async ({ page }) => {
    await page.goto("/search?q=BASICBIT&type=person");
    const searchInput = page.getByRole("combobox", { name: /Search/i });
    const suggestionResponse = page.waitForResponse((response) =>
      response.url().includes("/search/suggest?q=Afterglow&type=person"),
    );

    await searchInput.fill("Afterglow");
    await suggestionResponse;
    await expect(page.getByRole("option", { name: /Afterglow Harbor Sessions/i })).toHaveCount(0);
    await expect(page.getByRole("option", { name: /Afterglow Social/i })).toHaveCount(0);

    await searchInput.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=Afterglow&type=person$/);
    await expect(page.getByRole("link", { name: "People" })).toHaveAttribute("aria-current", "page");
  });

  test("unified search preserves BASICBIT identity across standard and legacy DJ URLs", async ({ page }) => {
    await page.goto("/search?q=BASICBIT");

    await expect(page.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();
    const standardResults = page.getByRole("region", { name: "Search results" });
    await expect(standardResults.getByRole("link", { name: /BASICBIT/ })).toHaveCount(1);
    await expect(standardResults.getByText("BASICBIT", { exact: true })).toBeVisible();
    await expect(standardResults.getByText("Software Dev | 3D Designer | VRDJ")).toBeVisible();
    await expect(standardResults.getByRole("img", { name: "BASICBIT" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/search\?q=BASICBIT$/);
    await expect(page.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Search results" }).getByText("BASICBIT", { exact: true })).toBeVisible();

    await expect(page.getByRole("link", { name: "DJ links", exact: true })).toHaveCount(0);
    await page.goto("/search?q=BASICBIT&view=dj");
    await expect(page).toHaveURL(/\/search\?q=BASICBIT&view=dj$/);
    await expect(page.getByRole("heading", { name: "DJ links", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Search results", exact: true })).toHaveAttribute("href", "/search?q=BASICBIT");
    await expect(page.getByRole("link", { name: "BASICBIT", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Website: basicbit.net", exact: true })).toBeVisible();
    const djAvatar = page.locator(".lookup-avatar img").first();
    await expect(djAvatar).toBeVisible();
    await expect(djAvatar).toHaveAttribute("src", /fixture-avatar-velvet-circuit\.svg/);

    await page.reload();
    await expect(page).toHaveURL(/\/search\?q=BASICBIT&view=dj$/);
    await expect(page.getByRole("link", { name: "Search results", exact: true })).toHaveAttribute("href", "/search?q=BASICBIT");
    await expect(page.getByRole("link", { name: "BASICBIT", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Search results", exact: true }).click();
    await expect(page).toHaveURL(/\/search\?q=BASICBIT$/);
    await expect(page.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/search\?q=BASICBIT&view=dj$/);
    await expect(page.getByRole("link", { name: "Search results", exact: true })).toHaveAttribute("href", "/search?q=BASICBIT");

    await page.goForward();
    await expect(page).toHaveURL(/\/search\?q=BASICBIT$/);
    await expect(page.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();
  });

  test("DJ links preserves the legacy lookup query and offers search recovery", async ({ page }) => {
    await page.goto("/lookup?q=No%20Matching%20Fixture");
    await expect(page).toHaveURL(/\/search\?q=No(?:%20|\+)Matching(?:%20|\+)Fixture&view=dj$/);
    const lookupResults = page.getByRole("region", { name: "Lookup results" });
    await expect(lookupResults.getByText("No matches found.", { exact: true })).toBeVisible();
    const searchRecovery = lookupResults.getByRole("link", { name: "Search results", exact: true });
    await expect(page.getByRole("link", { name: "Search results", exact: true })).toHaveCount(1);

    await searchRecovery.click();
    await expect(page).toHaveURL(/\/search\?q=No(?:%20|\+)Matching(?:%20|\+)Fixture$/);
    await expect(page.getByText("No public results matched that search yet.", { exact: true })).toBeVisible();

    await page.goto("/search?q=BASICBIT&view=dj&type=world");
    await expect(page).toHaveURL(/\/search\?q=BASICBIT&view=dj$/);
    await expect(page.getByRole("link", { name: "Search results", exact: true })).toHaveAttribute("href", "/search?q=BASICBIT");
  });

  test("DJ links recovers a community miss and keeps its clear control usable on phones", async ({ page }) => {
    await page.goto("/search?q=Afterglow+Social&view=dj");
    const lookupResults = page.getByRole("region", { name: "Lookup results" });
    await expect(lookupResults.getByText("No matches found.", { exact: true })).toBeVisible();

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const clearControl = page.getByRole("button", { name: "Clear lookup" });
      await expect(clearControl).toBeVisible();
      const bounds = await clearControl.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(40);
      expect(bounds?.height).toBeGreaterThanOrEqual(40);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }

    await lookupResults.getByRole("link", { name: "Search results", exact: true }).click();
    await expect(page).toHaveURL("/search?q=Afterglow+Social");
    await expect(page.getByRole("region", { name: "Search results" })
      .getByText("Afterglow Social", { exact: true }).first()).toBeVisible();
  });

  test("DJ links distinguishes unavailable lookup and all-miss bulk results", async ({ page }) => {
    await page.route("**/lookup/suggest?q=Unavailable%20Lookup", async (route) => {
      await route.fulfill({ status: 503, json: { results: [], privateResults: [] } });
    });
    await page.goto("/search?q=Afterglow+Social&view=dj");
    await expect(page.getByText("No matches found.", { exact: true })).toBeVisible();
    await page.getByLabel("DJ name").fill("Unavailable Lookup");
    await page.getByRole("button", { name: "Lookup", exact: true }).click();
    await expect(page.getByText("Lookup data is temporarily unavailable.")).toBeVisible();
    await expect(page.getByText("No matches found.", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Bulk", exact: true }).click();
    await page.getByLabel("Lineup text").fill("No Artist Alpha Fixture\nNo Artist Beta Fixture");
    await expect(page.getByText("No match", { exact: true })).toHaveCount(2);
    await expect(page.getByText("No matches found.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Lookup data is temporarily unavailable.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Search results", exact: true })).toHaveAttribute(
      "href",
      "/search",
    );
  });

  test("standard search supports keyboard typeahead and sparse profile fallbacks", async ({ page }) => {
    await page.goto("/search");
    const searchInput = page.getByRole("combobox", { name: /Search/i });

    await searchInput.fill("basic");
    await expect(page.getByRole("option", { name: /BASICBIT/i })).toBeVisible();
    await searchInput.press("ArrowDown");
    await expect(page.getByRole("option", { name: /BASICBIT/i })).toHaveAttribute("aria-selected", "true");
    await expect(searchInput).toBeFocused();
    await searchInput.press("Enter");
    await expect(page).toHaveURL(/\/basicbit$/);

    await page.goto("/search?q=Sparse%20Import");
    const sparseResult = page.getByRole("region", { name: "Search results" });
    await expect(sparseResult.getByText("Sparse Import", { exact: true })).toBeVisible();
    await expect(sparseResult.getByRole("img", { name: "Sparse Import" })).toHaveCount(0);
    await expect(sparseResult.getByRole("link", { name: "Claim this profile" })).toHaveAttribute(
      "href",
      "/claim/playwright-sparse-import?source=search",
    );
    await expect(sparseResult.getByText("Imported profile seed", { exact: true })).toHaveCount(0);

    await page.goto("/search?q=Sparse%20Import&view=dj");
    await expect(page.getByRole("link", { name: "Sparse Import", exact: true })).toBeVisible();
    await expect(page.getByText(/Imported profile seed|Unclaimed/, { exact: true })).toHaveCount(0);

    await page.goto("/search?q=DJ%20Aurora&view=dj");
    await expect(page.getByText("Community submitted", { exact: true })).toHaveCount(0);
  });

  test("lookup suggestions include authorized private seed rows", async ({ page }) => {
    await page.goto("/lookup");
    await page.getByLabel("DJ name").fill("nwinn");

    const privateOption = page.getByRole("option", { name: "DJ Northstar", exact: true });

    await expect(privateOption).toBeVisible();
    await expect(privateOption).not.toContainText(/Private seed|NWinn/);
    await privateOption.click();
    await expect(page).toHaveURL((url) =>
      url.pathname === "/search" &&
      url.searchParams.get("q") === "DJ Northstar" &&
      url.searchParams.get("view") === "dj",
    );
    const privateResult = page.locator(".lookup-result-card.ph-no-capture").filter({ hasText: "DJ Northstar" });
    await expect(privateResult).toBeVisible();
    await expect(privateResult).not.toContainText(/Private seed|Source|Reviewed|Freshness|Jul 9, 2026|Checked Jul 8, 2026/);
  });

  test("logo-only DJ suggestions stay contained and unframed", async ({ page }) => {
    await page.route("**/lookup/suggest?q=logo-only", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        json: {
          privateResults: [],
          results: [{
            aliases: [],
            avatarImageKind: "logo",
            avatarImageUrl: "/seed/fixture-avatar-luma.svg",
            displayName: "Logo Only",
            genres: [],
            outboundLinks: [],
            profilePath: "/logo-only",
            roleTags: ["DJ"],
            slug: "logo-only",
            tags: [],
            trustLabel: "claimed_unverified",
          }],
          viewerAccess: { allowed: false, source: "signed_out" },
        },
      });
    });

    await page.goto("/search?view=dj");
    await page.getByLabel("DJ name").fill("logo-only");
    const option = page.getByRole("option", { name: /Logo Only/ });
    const logo = option.locator(".lookup-avatar--logo");

    await expect(option).toBeVisible();
    await expect(logo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(logo).toHaveCSS("border-top-width", "0px");
    await expect(logo).toHaveCSS("border-radius", "0px");
    await expect(logo.locator("img")).toHaveCSS("object-fit", "contain");
  });

  test("verified profiles use the same compact mark across profile and search views", async ({ page }) => {
    await page.goto("/basicbit");
    const profileMark = page.getByLabel("Verified profile");
    await expect(profileMark).toBeVisible();
    const profileBox = await profileMark.boundingBox();

    await page.goto("/search?q=BASICBIT");
    const searchRegion = page.getByRole("region", { name: "Search results" });
    const searchResult = searchRegion.getByRole("link", { name: /BASICBIT Verified profile/ });
    const searchMark = searchRegion.getByLabel("Verified profile");
    await expect(searchMark).toBeVisible();
    await expect(searchResult.getByText("Person", { exact: true })).toBeVisible();
    await expect(searchResult.getByText("BASICBIT", { exact: true })).toHaveCSS("text-decoration-line", "underline");
    await searchResult.focus();
    await expect(searchResult).toBeFocused();
    const searchBox = await searchMark.boundingBox();

    await page.goto("/search?q=BASICBIT&view=dj");
    const lookupMark = page.getByLabel("Verified profile").first();
    await expect(lookupMark).toBeVisible();
    const lookupBox = await lookupMark.boundingBox();

    expect(profileBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(lookupBox).not.toBeNull();
    expect(profileBox!.width).toBeLessThanOrEqual(18);
    expect(profileBox!.width).toBe(searchBox!.width);
    expect(profileBox!.height).toBe(searchBox!.height);
    expect(profileBox!.width).toBe(lookupBox!.width);
    expect(profileBox!.height).toBe(lookupBox!.height);
  });

  test("bulk lookup summaries dedupe overlapping public and private rows", async ({ page }) => {
    await page.goto("/lookup");
    await page.getByRole("button", { name: "Bulk" }).click();
    await page.getByLabel("Lineup text").fill("BASICBIT");
    await page.getByRole("button", { name: "Lookup lineup" }).click();

    const summaryRow = page.locator(".lookup-bulk-row").filter({ hasText: "BASICBIT" });

    await expect(summaryRow).toBeVisible();
    await expect(summaryRow.locator(".text-sm")).toHaveText("BASICBIT");
  });
});

test("public OAuth failure groups the status and documented recovery", async ({ page }) => {
  const authorizationCodeDocs = "https://docs.vrdex.net/docs/developers/api-auth#authorization-code-with-pkce";
  for (const [query, message, docsHref] of [
    ["?problem=invalid_request", "response_type, client_id, redirect_uri, scope, resource, and an S256 PKCE code challenge are required.", authorizationCodeDocs],
    ["", "The OAuth consent transaction is invalid or expired.", authorizationCodeDocs],
    ["?problem=invalid_client", "This OAuth client cannot use the requested redirect URI, resource, or scopes.", "/developers/api"],
  ]) {
    expect((await page.goto("/oauth/authorize/review" + query))?.status()).toBe(200);
    const main = page.getByRole("main");
    const card = main.getByRole("region", { name: "Authorization request failed" });
    const heading = card.getByRole("heading", { level: 1, name: "Authorization request failed", exact: true });
    const status = card.getByText(message, { exact: true });
    const recovery = card.getByRole("link", { name: "API docs", exact: true });
    await expect(heading).toBeVisible();
    await expect(status).toBeVisible();
    await expect(recovery).toHaveAttribute("href", docsHref);
    if (docsHref === authorizationCodeDocs) await expect(recovery).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(recovery).toBeVisible();
    const [titleBox, statusBox, linkBox] = await Promise.all([
      heading.boundingBox(), status.boundingBox(), recovery.boundingBox(),
    ]);
    if (!titleBox || !statusBox || !linkBox) throw new Error("Expected all OAuth problem card elements");
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(statusBox.y);
    expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(linkBox.y);
  }
});

test("VRDex Time sign-in keeps the visitor's return path", async ({ page }) => {
  test.skip(isHostedRun, "The signed-out Time surface is tested with the local Convex binding.");
  expect((await page.goto("/time"))?.status()).toBe(200);
  const main = page.getByRole("main");
  const gate = main.getByRole("region", { name: "VRDex Time", exact: true });
  const heading = gate.getByRole("heading", { level: 1, name: "VRDex Time", exact: true });
  await expect(heading).toBeVisible();
  await expect(gate.getByText(/Turn phrases like/)).toContainText("next Friday at 8");
  const signIn = gate.getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toHaveAttribute("href", "/sign-in?returnTo=%2Ftime");
  const box = await signIn.boundingBox();
  if (!box) throw new Error("Expected a visible Time sign-in action");
  expect(box.height).toBeGreaterThanOrEqual(44);
  await signIn.click();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftime$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in", exact: true })).toBeVisible();
});

test("public API reference puts endpoints in the first phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  expect((await page.goto("/developers/api"))?.status()).toBe(200);
  const main = page.getByRole("main");
  const directory = main.getByRole("region", { name: "Endpoints" });
  const filter = directory.getByRole("searchbox", { name: "Filter endpoints" });
  const operations = directory.getByRole("list", { name: "Operations" });
  const rows = operations.locator(":scope > li");
  const firstEndpoint = rows.first().locator("code");
  const tags = directory.locator("summary").filter({ hasText: /^Tags$/ });
  const tools = directory.locator("summary").filter({ hasText: /^API tools$/ });
  await expect(main.getByRole("heading", { name: "VRDex Public API", exact: true, level: 1 })).toBeVisible();
  await expect(filter).toBeVisible();
  await expect(rows.nth(3)).toBeInViewport({ ratio: 1 });
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  await expect(directory.getByRole("status")).toHaveText(`${total} operations`);

  const utilityPosition = await tools.boundingBox();
  expect(utilityPosition).not.toBeNull();
  await filter.fill("gET   cLaImS");
  await expect(directory.getByRole("status")).toHaveText("1 operation");
  expect(await tools.boundingBox()).toEqual(utilityPosition);
  expect(await firstEndpoint.evaluate((endpoint) => {
    const range = document.createRange();
    range.selectNodeContents(endpoint);
    return range.toString();
  })).toBe("/api/v0/claims/{slug}/status");
  await filter.fill("");
  await expect(rows).toHaveCount(total);

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: width === 320 ? 760 : 900 });
    await expect(firstEndpoint).toBeInViewport();
    const box = await firstEndpoint.boundingBox();
    if (!box) throw new Error("Expected a visible endpoint");
    expect(box.y).toBeLessThan(width === 320 ? 350 : 330);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }

  const endpointBeforeOpening = await firstEndpoint.boundingBox();
  await tags.press("Enter");
  await expect(tags.locator("..")).toHaveAttribute("open", "");
  await expect(tags.locator("..").getByText("Events", { exact: true })).toBeVisible();
  expect((await firstEndpoint.boundingBox())?.y).toBe(endpointBeforeOpening?.y);

  await tools.press("Enter");
  await expect(tags.locator("..")).not.toHaveAttribute("open", "");
  const actions = directory.getByRole("navigation", { name: "API tools" });
  for (const [name, href] of [
    ["OpenAPI JSON", "/api/v0/openapi.json"],
    ["OpenAPI YAML", "/api/v0/openapi.yaml"],
    ["Developer tokens", "/developers/tokens"],
    ["OAuth apps", "/developers/apps"],
  ]) {
    const link = actions.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", href);
    expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await tools.press("Enter");
  await expect(actions).toBeHidden();

  for (const [value, path] of [
    ["gET   cLaImS", "/api/v0/claims/{slug}/status"],
    ["public claim and trust", "/api/v0/claims/{slug}/status"],
    ["eVenTs", "/api/v0/worlds/{slug}/events"],
  ]) {
    await filter.fill(value);
    await expect(operations.getByText(path, { exact: true })).toBeVisible();
    await expect.poll(() => rows.count()).toBeLessThan(total);
    const count = await rows.count();
    await expect(directory.getByRole("status")).toHaveText(`${count} ${count === 1 ? "operation" : "operations"}`);
  }

  await filter.fill("no-endpoint-should-match");
  await expect(rows).toHaveCount(0);
  await expect(directory.getByRole("status")).toHaveText("0 operations");
  await expect(directory.getByText("No results", { exact: true })).toBeVisible();
  await directory.getByRole("button", { name: "Reset", exact: true }).press("Enter");
  await expect(filter).toBeFocused();
  await expect(filter).toHaveValue("");
  await expect(rows).toHaveCount(total);
});

test("public API reference and exports remain available without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 760 } });
  try {
    const page = await context.newPage();
    await page.goto("/developers/api");
    const main = page.getByRole("main");
    const rows = main.getByRole("list", { name: "Operations" }).locator(":scope > li");
    await expect(main.getByRole("searchbox", { name: "Filter endpoints" })).toBeHidden();
    expect(await rows.count()).toBeGreaterThan(1);
    await expect(main.getByRole("status")).toHaveText(`${await rows.count()} operations`);
    await expect(rows.first().locator("code")).toBeInViewport();
    await main.locator("summary").filter({ hasText: /^API tools$/ }).press("Enter");
    await expect(main.getByRole("link", { name: "OpenAPI JSON" })).toHaveAttribute("href", "/api/v0/openapi.json");
    await expect(main.getByRole("link", { name: "OpenAPI YAML" })).toHaveAttribute("href", "/api/v0/openapi.yaml");
  } finally {
    await context.close();
  }
});
