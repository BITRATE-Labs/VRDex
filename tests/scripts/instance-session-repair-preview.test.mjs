import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRepairPreviewQuery } from "../../scripts/preview-instance-session-repair.mjs";
test("repair dry-run emitter bundles the shared reader without write entry points", async () => {
  const request = {
    deploymentUrl: "https://example.convex.cloud",
    integrationId: "integration",
    epoch: 1,
    sessionIds: ["a", "b", "c", "d", "e", "f", "g"],
  };
  const query = await buildRepairPreviewQuery(request);
  assert(query.includes(JSON.stringify(request)));
  assert(query.includes("convex:/_system/repl/wrappers.js"));
  assert(query.includes("sessionRepair.previewRepair(ctx,"));
  assert(!query.includes("internalMutation"));
  assert(!/\.db\.(insert|patch|replace|delete)\(/.test(query));
  assert(!query.includes("instanceSessionRepair.apply"));
});
