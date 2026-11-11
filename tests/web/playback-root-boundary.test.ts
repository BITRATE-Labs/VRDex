import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

it("keeps the persistent playback owner outside the auth provisioning gate", () => {
  const layout = readFileSync("apps/web/src/app/layout.tsx", "utf8");
  assert.ok(layout.indexOf("<EventPlaybackProvider>") < layout.indexOf("<ConvexClientProvider>"));
  assert.ok(layout.indexOf("</EventPlaybackProvider>") > layout.indexOf("</ConvexClientProvider>"));
});
