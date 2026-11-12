import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveContributionPolicy } from "../../convex/_contributionPolicy";
it("uses the same role limits locally and on hosted deployments", () => {
  for (const CONVEX_DEPLOYMENT of [undefined, "prod:real", "dev:ordinary", "local:proof"]) {
    const policy = resolveContributionPolicy({ CONVEX_DEPLOYMENT });
    assert.equal(policy.ordinary.dailyActor, 6);
    assert.equal(policy.trusted.dailyActor, 1000);
    assert.equal(policy.trusted.openTarget, 20);
    assert.equal(policy.superadmin.dailyActor, null);
  }
});
