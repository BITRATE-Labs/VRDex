import assert from "node:assert/strict";
import { it } from "node:test";
import { convexTest } from "convex-test";
import schemaModule from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { newClerkUserId } from "./_clerkTestIdentity";
const schema = (schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule;
const modules = {
  "../../convex/sandboxDesignSnapshot.ts": () => import("../../convex/sandboxDesignSnapshot"),
  "../../convex/communityTelemetry.ts": () => import("../../convex/communityTelemetry"),
  "../../convex/clubAnalytics.ts": () => import("../../convex/clubAnalytics"),
  "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"),
};
const url = "https://design-preview.convex.cloud";
const snapshot = {
  sourceCommunityId: "m5787kgxnvgygm02jjvp4gdfd58bacb2" as const, displayName: "BITRATE" as const,
  events: [{ sourceId: "source-event", slug: "design-event", title: "Design event", startAt: 1000,
    sessionIds: ["source-session"], slots: [{ startAt: 1000, displayLabel: "Unlinked DJ", roleLabel: "DJ" }] }],
  sessions: [{ sourceId: "source-session", providerInstanceId: "one", providerLocation: "wrld_design:one", vrchatWorldId: "wrld_design", worldName: "Test world", openedAt: 1000, lastObservedAt: 3000, state: "open" as const,
    points: [{ at: 1000, population: 10, platforms: { standalonewindows: 8 }, coverageState: "observed" as const }, { at: 3000, population: 0, queueSize: 0, coverageState: "observed" as const }] }],
  coverage: [{ startedAt: 1500, endedAt: 2000, state: "unknown" as const }],
};
it("imports isolated owned history, preserves lineup/gaps, pauses collection and refuses production", async () => {
  const keys = ["VRDEX_DEPLOYMENT_ENV", "VRDEX_ENABLE_HOSTED_SMOKE_FIXTURE", "CONVEX_CLOUD_URL", "CLERK_JWT_ISSUER_DOMAIN"];
  const original = keys.map(key => process.env[key]);
  const t = convexTest(schema, modules);
  const clerkUserId = newClerkUserId();
  const ownerUserId = await t.run(ctx => ctx.db.insert("users", { clerkUserId, email: "design@example.test" }));
  try {
    Object.assign(process.env, { VRDEX_DEPLOYMENT_ENV: "production", VRDEX_ENABLE_HOSTED_SMOKE_FIXTURE: "true", CONVEX_CLOUD_URL: url, CLERK_JWT_ISSUER_DOMAIN: "https://test.clerk.accounts.dev" });
    const args = { expectedDeploymentUrl: url, ownerUserId, snapshot };
    await assert.rejects(t.mutation(internal.sandboxDesignSnapshot.importBitrate, args), /unavailable/);
    process.env.VRDEX_DEPLOYMENT_ENV = "preview";
    await assert.rejects(t.mutation(internal.sandboxDesignSnapshot.importBitrate, { ...args, expectedDeploymentUrl: "https://wrong.convex.cloud" }), /exact sandbox/);
    const result = await t.mutation(internal.sandboxDesignSnapshot.importBitrate, args);
    const rows = await t.run(async ctx => ({ integration: (await ctx.db.query("communityVrchatIntegrations").collect())[0]!, points: await ctx.db.query("instancePopulationObservations").collect(), coverage: await ctx.db.query("collectionCoverageWindows").collect(), owners: await ctx.db.query("profileOwners").collect() }));
    assert.equal(rows.integration.killSwitchEnabled, true);
    assert.equal(rows.integration.assignedCollectorAccountId, undefined);
    assert.equal(rows.integration.nextPollAt, undefined);
    assert.equal(rows.integration.namedMembershipCollectionEnabled, false);
    assert.ok(Object.values(rows.integration.publicMetrics).every(value => value === false));
    assert.equal(rows.points.length, 2);
    assert.equal(rows.points[1]!.population, 0);
    assert.equal(rows.points[0]!.platforms?.standalonewindows, 8);
    assert.equal(rows.coverage[0]!.state, "unknown");
    assert.equal(rows.owners[0]!.userId, ownerUserId);
    const owner = t.withIdentity({ subject: clerkUserId, issuer: "https://test.clerk.accounts.dev", tokenIdentifier: `https://test.clerk.accounts.dev|${clerkUserId}` });
    const association = await owner.query(api.communityTelemetry.getInstanceEventAssociation, { communitySlug: "bitrate", sessionId: result.sessionIds[0]! });
    assert.deepEqual(association?.performerChanges, [{ at: 1000, performerLabel: "Unlinked DJ" }]);
    await assert.rejects(t.query(api.communityTelemetry.getInstanceEventAssociation, { communitySlug: "bitrate", sessionId: result.sessionIds[0]! }), /access/);
    assert.equal((await t.mutation(internal.sandboxDesignSnapshot.importBitrate, args)).alreadyImported, true);
    assert.equal(await t.run(async ctx => (await ctx.db.query("instancePopulationObservations").collect()).length), 2);
    const otherUser = await t.run(ctx => ctx.db.insert("users", { clerkUserId: newClerkUserId() }));
    await assert.rejects(t.mutation(internal.sandboxDesignSnapshot.importBitrate, { ...args, ownerUserId: otherUser }), /overwrite/);
  } finally {
    keys.forEach((key, index) => { if (original[index] === undefined) delete process.env[key]; else process.env[key] = original[index]; });
  }
});
