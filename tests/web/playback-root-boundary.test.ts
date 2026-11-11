import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

it("keeps the persistent playback owner outside the auth provisioning gate", () => {
  const layout = readFileSync("apps/web/src/app/layout.tsx", "utf8");
  assert.ok(layout.indexOf("<EventPlaybackProvider>") < layout.indexOf("<ConvexClientProvider>"));
  assert.ok(layout.indexOf("</EventPlaybackProvider>") > layout.indexOf("</ConvexClientProvider>"));
});

it("keeps auth analytics history alive across provider remounts", () => {
  const provider = readFileSync("apps/web/src/app/PostHogProvider.tsx", "utf8");
  assert.ok(provider.includes("const authSessionRef"));
  assert.ok(provider.indexOf("const authSessionRef") < provider.indexOf("export function PostHogProvider"));
  assert.doesNotMatch(provider.slice(provider.indexOf("export function PostHogProvider")), /const authSessionRef/);
});
