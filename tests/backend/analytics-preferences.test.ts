import assert from "node:assert/strict";
import { it } from "node:test";
import { convexTest } from "convex-test";
import schemaModule from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { claimAnalyticsContext, enqueueClaimAnalyticsEvent } from "../../convex/_claimAnalytics";

const schema = (schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule;
const modules = {
  "../../convex/accounts.ts": () => import("../../convex/accounts"),
  "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"),
  "../../convex/analyticsPreferences.ts": () => import("../../convex/analyticsPreferences"),
  "../../convex/claimAnalytics.ts": () => import("../../convex/claimAnalytics"),
  "../../convex/claimAnalyticsDelivery.ts": () => import("../../convex/claimAnalyticsDelivery"),
};

it("requires authentication and rejects fabricated policy versions", async () => {
  const t = convexTest({ schema, modules });
  await assert.rejects(t.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" }));
  await t.run(async (ctx) => { await ctx.db.insert("users", { clerkUserId: "analytics-a" }); });
  const a = t.withIdentity({ subject: "analytics-a" });
  await assert.rejects(a.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "anything" }));
});

it("terminally suppresses legacy queued events rather than sending unproven telemetry", async () => {
  const t = convexTest({ schema, modules });
  const id = await t.run(async (ctx) => ctx.db.insert("claimAnalyticsOutbox", {
    eventKey: "legacy", journeyId: "legacy", event: "claim_resolved", profileType: "person",
    method: "discord", entrySource: "profile", occurredAt: Date.now(), state: "pending", attemptCount: 0, nextAttemptAt: 0,
  }));
  const result = await t.mutation(internal.claimAnalytics.claimNextForDelivery, {});
  assert.equal(result.row, null);
  assert.equal((await t.run(async (ctx) => ctx.db.get(id)))?.state, "suppressed");
});

it("cleans suppressed transport history on the existing retention window", async () => {
  const t = convexTest({ schema, modules });
  const now = Date.now();
  await t.run(async (ctx) => ctx.db.insert("claimAnalyticsOutbox", {
    eventKey: "suppressed-old", journeyId: "suppressed-old", event: "claim_resolved", profileType: "person",
    method: "discord", entrySource: "profile", occurredAt: now - 31 * 86_400_000,
    state: "suppressed", attemptCount: 0, nextAttemptAt: 0,
  }));
  assert.deepEqual(await t.mutation(internal.claimAnalytics.sweepDeliveredEvents, { now }), { deletedCount: 1 });
});

it("saves only the caller's binary choice with a stable UUID and monotonic revision", async () => {
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { clerkUserId: "analytics-a" });
    await ctx.db.insert("users", { clerkUserId: "analytics-b" });
  });
  const a = t.withIdentity({ subject: "analytics-a" });
  const on = await a.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" });
  assert.match(on.analyticsId!, /^[0-9a-f-]{36}$/);
  const concurrent = await Promise.all([1, 2].map(() => a.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" })));
  assert.ok(concurrent.every((result) => result.analyticsId === on.analyticsId));
  const repeat = await a.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" });
  assert.equal(repeat.analyticsId, on.analyticsId);
  assert.equal(repeat.preference.revision, on.preference.revision);
  const off = await a.mutation(api.analyticsPreferences.set, { choice: "off", policyVersion: "2026-11-10" });
  assert.equal(off.analyticsId, undefined);
  assert.equal((await a.query(api.accounts.viewer, {}))?.user.analyticsId, undefined);
  assert.equal(off.preference.revision, on.preference.revision + 1);
  const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
  assert.equal(rows.find((u) => u.clerkUserId === "analytics-b")?.analyticsPreference, undefined);
  await assert.rejects(a.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" }));
  await t.run(async (ctx) => {
    const stored = await ctx.db.query("users").withIndex("clerkUserId", (q) => q.eq("clerkUserId", "analytics-a")).unique();
    await ctx.db.patch(stored!._id, { analyticsPreference: { ...stored!.analyticsPreference!, changedAt: Date.now() - 60_001 } });
  });
  const again = await a.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" });
  assert.notEqual(again.analyticsId, on.analyticsId);
  assert.equal(again.preference.revision, off.preference.revision + 1);
});

it("withdrawal never revives a queued generation after On returns", async () => {
  process.env.POSTHOG_DEPLOYMENT_CATEGORY = "staging";
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => { await ctx.db.insert("users", { clerkUserId: "generation-user" }); });
  const user = t.withIdentity({ subject: "generation-user" });
  await user.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" });
  const journey = "d667e1c5-94c6-48c5-93ea-ecb82e428f6a";
  const milestone = { event: "claim_attempt_created", profileType: "person", method: "discord", occurredAt: Date.now() } as const;
  await user.run(async (ctx) => {
    await enqueueClaimAnalyticsEvent(ctx, claimAnalyticsContext(journey, "profile", "off"), milestone);
    assert.equal((await ctx.db.query("claimAnalyticsOutbox").collect()).length, 0);
    await enqueueClaimAnalyticsEvent(ctx, claimAnalyticsContext(journey, "profile", "on"), milestone);
  });
  await user.mutation(api.analyticsPreferences.set, { choice: "off", policyVersion: "2026-11-10" });
  const pending = await t.run(async (ctx) => ctx.db.query("analyticsDeletionRequests").collect());
  assert.equal(pending.length, 1);
  assert.equal(pending[0].state, "blocked_authorization");
  const health = await t.query(internal.claimAnalytics.deliveryOperationalHealth, { now: Date.now() });
  assert.equal(health.blockedDeletionCount, 1);
  assert.equal(JSON.stringify(health).includes(pending[0].analyticsId), false);
  await user.mutation(api.analyticsPreferences.set, { choice: "off", policyVersion: "2026-11-10" });
  assert.equal((await t.run(async (ctx) => ctx.db.query("analyticsDeletionRequests").collect())).length, 1);
  await t.run(async (ctx) => {
    const stored = await ctx.db.query("users").withIndex("clerkUserId", (q) => q.eq("clerkUserId", "generation-user")).unique();
    await ctx.db.patch(stored!._id, { analyticsPreference: { ...stored!.analyticsPreference!, changedAt: Date.now() - 60_001 } });
  });
  await user.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" });
  assert.equal((await t.mutation(internal.claimAnalytics.claimNextForDelivery, {})).row, null);
  await user.run(async (ctx) => {
    await enqueueClaimAnalyticsEvent(ctx, claimAnalyticsContext(journey, "profile", "on"), { ...milestone, event: "claim_resolved" });
    assert.equal((await ctx.db.query("claimAnalyticsOutbox").collect()).length, 1);
  });
});

it("a client-supplied journey never borrows another account's consent or identity", async () => {
  process.env.POSTHOG_DEPLOYMENT_CATEGORY = "staging";
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { clerkUserId: "journey-a" });
    await ctx.db.insert("users", { clerkUserId: "journey-b" });
  });
  const a = t.withIdentity({ subject: "journey-a" });
  const b = t.withIdentity({ subject: "journey-b" });
  await a.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" });
  await b.mutation(api.analyticsPreferences.set, { choice: "off", policyVersion: "2026-11-10" });
  const context = claimAnalyticsContext("abde12ef-abcd-4123-8abc-abcdef123456", "profile", "on");
  const milestone = { event: "claim_attempt_created", profileType: "person", method: "discord", occurredAt: Date.now() } as const;
  await a.run(async (ctx) => enqueueClaimAnalyticsEvent(ctx, context, milestone));
  await b.run(async (ctx) => enqueueClaimAnalyticsEvent(ctx, context, { ...milestone, event: "claim_resolved" }));
  assert.equal((await t.run(async (ctx) => ctx.db.query("claimAnalyticsOutbox").collect())).length, 1);
});

it("continuing in a restricted browser terminally suppresses an existing journey", async () => {
  process.env.POSTHOG_DEPLOYMENT_CATEGORY = "staging";
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { clerkUserId: "continuing-user" });
    await ctx.db.insert("users", { clerkUserId: "other-user" });
  });
  const user = t.withIdentity({ subject: "continuing-user" });
  await user.mutation(api.analyticsPreferences.set, { choice: "on", policyVersion: "2026-11-10" });
  const context = claimAnalyticsContext("abde12ef-abcd-4123-8abc-abcdef123457", "profile", "on");
  const milestone = { event: "claim_attempt_created", profileType: "person", method: "discord", occurredAt: Date.now() } as const;
  await user.run(async (ctx) => enqueueClaimAnalyticsEvent(ctx, context, milestone));
  await t.withIdentity({ subject: "other-user" }).mutation(internal.claimAnalytics.restrictBrowserJourney, { journeyId: context.journeyId });
  await user.mutation(internal.claimAnalytics.restrictBrowserJourney, { journeyId: context.journeyId });
  assert.equal((await t.run(async (ctx) => ctx.db.query("claimAnalyticsOutbox").first()))?.state, "pending");
  await user.mutation(internal.claimAnalytics.restrictBrowserJourney, { journeyId: context.journeyId, browserRestriction: "off" });
  await user.run(async (ctx) => enqueueClaimAnalyticsEvent(ctx, context, { ...milestone, event: "claim_resolved" }));
  assert.equal((await t.run(async (ctx) => ctx.db.query("claimAnalyticsOutbox").collect())).length, 1);
  assert.equal((await t.mutation(internal.claimAnalytics.claimNextForDelivery, {})).row, null);
});
