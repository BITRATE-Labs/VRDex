import assert from "node:assert/strict";
import { it, afterEach } from "node:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schemaModule from "../../convex/schema";

const schema =
  (schemaModule as unknown as { default?: typeof schemaModule }).default ??
  schemaModule;
const modules = {
  "../../convex/e2eClubStaff.ts": () => import("../../convex/e2eClubStaff"),
  "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"),
};
const ref = (op: string) =>
  makeFunctionReference<"mutation">(`e2eClubStaff:${op}`);
const keys = [
  "CONVEX_CLOUD_URL",
  "VRDEX_ENABLE_E2E_HELPERS",
  "VRDEX_ENABLE_E2E_AUTH_HELPERS",
  "VRDEX_E2E_CONVEX_SECRET",
  "VRDEX_ENABLE_E2E_ANALYTICS_HELPERS",
];
const initial = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const key of keys) {
    if (initial[key] === undefined) delete process.env[key];
    else process.env[key] = initial[key];
  }
});
function enable() {
  process.env.CONVEX_CLOUD_URL = "http://127.0.0.1:13210";
  process.env.VRDEX_ENABLE_E2E_HELPERS = "true";
  process.env.VRDEX_ENABLE_E2E_AUTH_HELPERS = "true";
  process.env.VRDEX_E2E_CONVEX_SECRET = "test-only-secret";
}
it("refuses non-allowlisted deployment even with valid helper credentials", async () => {
  enable();
  process.env.CONVEX_CLOUD_URL = "https://production.convex.cloud";
  const t = convexTest({ schema, modules });
  await assert.rejects(
    t.mutation(ref("seed"), {
      secret: "test-only-secret",
      runId: "unit",
      ownerClerkUserId: "user_test",
    }),
    /unavailable/,
  );
});
it("requires both flags and the secret for every fixture operation", async () => {
  enable();
  const t = convexTest({ schema, modules });
  for (const op of ["seed", "lookup"])
    await assert.rejects(
      t.mutation(ref(op), {
        secret: "wrong",
        runId: "unit",
        ...(op === "seed" ? { ownerClerkUserId: "user_test" } : {}),
      }),
      /unavailable/,
    );
  process.env.VRDEX_ENABLE_E2E_AUTH_HELPERS = "false";
  await assert.rejects(
    t.mutation(ref("lookup"), { secret: "test-only-secret", runId: "unit" }),
    /unavailable/,
  );
});
it("requires disposable ownership and exact run provenance for expiry and cleanup", async () => {
  enable();
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkUserId: "user_real",
      email: "real@example.com",
    });
    await ctx.db.insert("users", {
      clerkUserId: "user_test",
      email: "unit+clerk_test@e2e.vrdex.net",
    });
  });
  const base = { secret: "test-only-secret", runId: "unit" };
  await assert.rejects(
    t.mutation(ref("seed"), { ...base, ownerClerkUserId: "user_real" }),
    /Disposable/,
  );
  const fixture = await t.mutation(ref("seed"), {
    ...base,
    ownerClerkUserId: "user_test",
  });
  assert.deepEqual(await t.mutation(ref("lookup"), base), fixture);
  await assert.rejects(
    t.mutation(ref("cleanup"), {
      ...base,
      runId: "wrong",
      profileId: fixture.profileId,
    }),
    /Exact/,
  );
  const foreign = await t.mutation(ref("seed"), {
    ...base,
    runId: "foreign",
    ownerClerkUserId: "user_test",
  });
  const invitationId = await t.run((ctx) =>
    ctx.db.insert("communityStaffInvitations", {
      communityProfileId: foreign.profileId,
      tokenHash: "hash",
      roleIds: [],
      createdBySubject: {
        tokenIdentifier: "test|owner",
        issuer: "test",
        subject: "owner",
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      state: "pending",
    }),
  );
  await assert.rejects(
    t.mutation(ref("expireInvitation"), {
      ...base,
      profileId: fixture.profileId,
      invitationId,
    }),
    /Exact/,
  );
  await t.mutation(ref("cleanup"), { ...base, profileId: fixture.profileId });
  assert.equal(await t.mutation(ref("lookup"), base), null);
  assert.ok(await t.mutation(ref("lookup"), { ...base, runId: "foreign" }));
});

it("isolates synthetic analytics behind local opt-in and preserves unexpected rows", async () => {
  enable();
  const t = convexTest({ schema, modules });
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkUserId: "user_test",
      email: "analytics+clerk_test@e2e.vrdex.net",
    }),
  );
  const base = { secret: "test-only-secret", runId: "analytics" };
  const fixture = await t.mutation(ref("seed"), {
    ...base,
    ownerClerkUserId: "user_test",
  });
  const args = { ...base, profileId: fixture.profileId };
  await assert.rejects(t.mutation(ref("seedAnalytics"), args), /unavailable/);
  process.env.VRDEX_ENABLE_E2E_ANALYTICS_HELPERS = "true";
  process.env.CONVEX_CLOUD_URL = "https://scrupulous-corgi-247.convex.cloud";
  await assert.rejects(t.mutation(ref("seedAnalytics"), args), /unavailable/);
  process.env.CONVEX_CLOUD_URL = "http://127.0.0.1:13210";
  const data = await t.mutation(ref("seedAnalytics"), args);
  await assert.rejects(t.mutation(ref("cleanup"), args), /unrelated activity/);
  await t.run(async (ctx) => {
    const observations = await ctx.db.query("instancePopulationObservations").withIndex("by_sessionId_observedAt", q => q.eq("sessionId", data.sessionId)).collect();
    assert.ok(data.endAt > observations.at(-1)!.observedAt);
    assert.equal(observations.at(-1)?.queueSize, 7);
    assert.equal(observations.at(-1)?.userCount, 24);
    assert.deepEqual(observations.at(-1)?.platforms, { standalonewindows: 20, android: 4 });
    const alias = await ctx.db.get(data.aliasId);
    assert.equal(alias?.mergedIntoSessionId, data.sessionId);
    const session = await ctx.db.get(data.sessionId);
    assert.ok(session!.closedAt! < session!.lastObservedAt);
    const row = await ctx.db.get(data.integrationId);
    assert.equal(row!.state, "blocked");
    assert.equal(row!.killSwitchEnabled, true);
    assert.equal(row!.assignedCollectorAccountId, undefined);
    await ctx.db.patch(data.integrationId, { vrchatGroupId: "foreign" });
  });
  await assert.rejects(
    t.mutation(ref("cleanupAnalytics"), args),
    /Exact inactive/,
  );
  await t.run((ctx) =>
    ctx.db.patch(data.integrationId, {
      vrchatGroupId: "e2e-analytics:analytics",
    }),
  );
  await t.mutation(ref("cleanupAnalytics"), args);
  const remaining = await t.run(ctx => ctx.db.query("instanceSessions").withIndex("by_integrationId_state", q => q.eq("integrationId", data.integrationId)).collect());
  assert.deepEqual(remaining, []);
  await t.mutation(ref("cleanup"), args);
  assert.equal(await t.mutation(ref("lookup"), base), null);
});
