import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

function render(reason: "ended" | "unsupported") {
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { EventCompactPlayer } from "./src/app/_components/event-compact-player.tsx";
    import { EventPlaybackOwner } from "./src/lib/event-playback-owner.ts";
    const owner = new EventPlaybackOwner(() => { throw Error("SSR must not create a transport"); });
    const request = { kind: "vrcdn", profileId: "profile", profileSlug: "dj", title: "DJ", href: "/dj", sourceId: "DJ", src: "/stream", transport: "mpegts" };
    const state = { request, status: "unavailable", unavailableReason: "${reason}", mode: "video", volume: 1, muted: false };
    console.log(renderToStaticMarkup(createElement(EventCompactPlayer, { owner, state, mount: { current: null } })));
  `], { cwd: path.resolve("apps/web"), encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: "tsconfig.json" } });
}

test("a profile transport-end notification preserves its buffered video region", () => {
  const html = render("ended");
  const mount = html.match(/<div[^>]*data-event-playback-mount[^>]*>/)?.[0];
  assert.ok(mount);
  assert.doesNotMatch(mount, /hidden/);
  assert.match(html, /Playback stopped/);
});

test("an unsupported transport has no misleading Try again action", () => {
  const html = render("unsupported");
  assert.match(html, /Unsupported/);
  assert.doesNotMatch(html, /Try again/);
});
