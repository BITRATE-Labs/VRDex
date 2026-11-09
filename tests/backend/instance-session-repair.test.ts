import assert from "node:assert/strict";
import { it } from "node:test";
import { convexTest } from "convex-test";
import schemaModule from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { defaultClubVisibility } from "../../convex/_clubModel";
import {
  mergeSeriesSegments,
  summarizeSeries,
} from "../../convex/_clubAnalyticsMath";
const schema =
  (schemaModule as unknown as { default?: typeof schemaModule }).default ??
  schemaModule;
const modules = {
  "../../convex/instanceSessionRepair.ts": () =>
    import("../../convex/instanceSessionRepair"),
  "../../convex/clubAnalytics.ts": () => import("../../convex/clubAnalytics"),
  "../../convex/communityTelemetry.ts": () =>
    import("../../convex/communityTelemetry"),
  "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"),
};
const ranges = [
  [1794100442561, 1794149886224],
  [1794150752770, 1794154581395],
  [1794155356517, 1794158059503],
  [1794158793947, 1794175662105],
  [1794176438086, 1794179362750],
  [1794180096495, 1794191892463],
  [1794192607273, 1794193414476],
];
const counts = [299, 23, 18, 93, 19, 65, 6];
const epoch = ranges[0]![0]! - 1000;
const owner = {
  subject: "user_owner",
  issuer: "https://test.clerk.accounts.dev",
  tokenIdentifier: "https://test.clerk.accounts.dev|user_owner",
};
async function setup() {
  process.env.CONVEX_CLOUD_URL = "http://127.0.0.1:3430";
  const t = convexTest({ schema, modules });
  const data = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkUserId: owner.subject });
    const communityProfileId = await ctx.db.insert("profiles", {
      slug: "repair",
      displayName: "Repair",
      sortName: "repair",
      profileType: "community",
      community: { categoryTags: [] },
      aliases: [],
      tags: [],
      claimState: "claimed_verified",
      publicationState: "published",
      publicSurfacingState: "public",
      creationSource: "self",
      updatedAt: epoch,
    });
    await ctx.db.insert("profileOwners", {
      profileId: communityProfileId,
      userId,
      roleKey: "owner",
      state: "active",
      grantedAt: epoch,
      updatedAt: epoch,
    });
    const integrationId = await ctx.db.insert("communityVrchatIntegrations", {
      communityProfileId,
      vrchatGroupId: "grp_repair",
      groupVisibility: "public",
      joinPolicy: "free",
      state: "active",
      killSwitchEnabled: false,
      requestsPerMinute: 30,
      leaseGeneration: 1,
      publicMetrics: {
        currentPopulation: false,
        populationHistory: false,
        groupMemberCount: false,
        groupMemberGrowth: false,
        eventRecaps: false,
      },
      consecutiveFailures: 0,
      createdAt: epoch,
      telemetryEpochStartedAt: epoch,
      updatedAt: epoch,
    });
    const sessionIds = [];
    for (let i = 0; i < 7; i++) {
      const [openedAt, lastObservedAt] = ranges[i]!;
      const id = await ctx.db.insert("instanceSessions", {
        integrationId,
        communityProfileId,
        providerInstanceId: "same",
        providerLocation: "wrld_repair:same",
        vrchatWorldId: "wrld_repair",
        source: "first_party",
        state: "closed",
        openedAt: openedAt!,
        lastObservedAt: lastObservedAt!,
        closedAt: lastObservedAt! + 120000,
        consecutiveMisses: 2,
        updatedAt: lastObservedAt! + 120000,
      });
      sessionIds.push(id);
      for (let n = 0; n < counts[i]!; n++) {
        const at =
          openedAt! +
          Math.floor(((lastObservedAt! - openedAt!) * n) / (counts[i]! - 1));
        await ctx.db.insert("instancePopulationObservations", {
          integrationId,
          sessionId: id,
          idempotencyKey: `instance-${i}-${n}`,
          providerInstanceId: "same",
          vrchatWorldId: "wrld_repair",
          population: n % 103,
          observedAt: at,
          source: "first_party",
          collectorVersion: "test",
          coverageState: "observed",
          fencingToken: 1,
        });
        await ctx.db.insert("communityPopulationObservations", {
          integrationId,
          idempotencyKey: `group-${i}-${n}`,
          totalPopulation: n % 103,
          activeInstanceCount: 1,
          worldDistribution: [],
          observedAt: at,
          source: "first_party",
          collectorVersion: "test",
          coverageState: "observed",
          fencingToken: 1,
        });
      }
    }
    return { integrationId, communityProfileId, sessionIds, epoch };
  });
  const request = {
    deploymentUrl: "http://127.0.0.1:3430",
    integrationId: data.integrationId,
    sessionIds: data.sessionIds,
    epoch: data.epoch,
  };
  const preview = () =>
    t.query(internal.instanceSessionRepair.preview, request);
  return { t, ...data, request, preview, actor: t.withIdentity(owner) };
}
async function raw(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => ({
    sessions: await ctx.db.query("instanceSessions").collect(),
    observations: await ctx.db
      .query("instancePopulationObservations")
      .collect(),
    aggregate: await ctx.db.query("communityPopulationObservations").collect(),
  }));
}
it("previews without writes, atomically consolidates 523 observations, preserves aliases and rolls back", async () => {
  const s = await setup(),
    before = await raw(s.t),
    p = await s.preview();
  assert.deepEqual(await raw(s.t), before);
  assert.equal(p.observationCount, 523);
  assert.equal(p.reassignedCount, 224);
  assert.equal(p.canonicalSessionId, s.sessionIds[0]);
  const args = { ...s.request, expectedFingerprint: p.fingerprint };
  const [a, b] = await Promise.all([
    s.t.mutation(internal.instanceSessionRepair.apply, args),
    s.t.mutation(internal.instanceSessionRepair.apply, args),
  ]);
  assert.equal(a.repairId, b.repairId);
  const after = await raw(s.t);
  assert.deepEqual(after.aggregate, before.aggregate);
  assert.deepEqual(
    after.observations.map(({ sessionId, ...o }) => o),
    before.observations.map(({ sessionId, ...o }) => o),
  );
  assert(after.observations.every((o) => o.sessionId === p.canonicalSessionId));
  const page = await s.actor.query(api.clubAnalytics.listInstances, {
    communitySlug: "repair",
    kind: "history",
    paginationOpts: { cursor: null, numItems: 3 },
  });
  assert.equal(page.isDone, true);
  assert.equal(page.page.length, 1);
  assert.equal(page.page[0]!.id, p.canonicalSessionId);
  assert.equal(page.page[0]!.closedAt, null);
  assert.equal(page.page[0]!.liveObservedAt, null);
  for (const id of s.sessionIds) {
    const detail = await s.actor.query(api.clubAnalytics.getInstance, {
      communitySlug: "repair",
      sessionId: id,
    });
    assert.equal(detail?.id, p.canonicalSessionId);
  }
  const series = await s.actor.query(api.clubAnalytics.getInstanceSeries, {
    communitySlug: "repair",
    sessionId: s.sessionIds[6]!,
    startAt: epoch,
    endAt: ranges[6]![1]! + 1,
    paginationOpts: { cursor: null, numItems: 500 },
  });
  assert.equal(series.page.length, 500);
  assert.equal(series.isDone, false);
  const tail = await s.actor.query(api.clubAnalytics.getInstanceSeries, {
    communitySlug: "repair",
    sessionId: s.sessionIds[6]!,
    startAt: epoch,
    endAt: ranges[6]![1]! + 1,
    paginationOpts: { cursor: series.continueCursor, numItems: 500 },
  });
  assert.equal(tail.page.length, 23);
  assert.equal(tail.isDone, true);
  const points = (rows: typeof before.observations) =>
    rows.map((o) => ({
      at: o.observedAt,
      value: o.population,
      coverage: o.coverageState,
    }));
  assert.deepEqual(
    summarizeSeries(points(after.observations), epoch, ranges[6]![1]! + 1),
    summarizeSeries(points(before.observations), epoch, ranges[6]![1]! + 1),
  );
  const summaryArgs = {
    communitySlug: "repair",
    sessionId: s.sessionIds[6]!,
    startAt: epoch,
    endAt: ranges[6]![1]! + 1,
  };
  const summaryHead = await s.actor.query(
    api.clubAnalytics.getInstanceSummaryPage,
    { ...summaryArgs, paginationOpts: { cursor: null, numItems: 500 } },
  );
  assert.equal(summaryHead.isDone, false);
  const summaryTail = await s.actor.query(
    api.clubAnalytics.getInstanceSummaryPage,
    {
      ...summaryArgs,
      paginationOpts: { cursor: summaryHead.continueCursor, numItems: 500 },
    },
  );
  assert.equal(summaryTail.isDone, true);
  const combined = mergeSeriesSegments(
    [...summaryHead.page, ...summaryTail.page],
    epoch,
    summaryArgs.endAt,
  );
  const expected = summarizeSeries(
    points(before.observations),
    epoch,
    summaryArgs.endAt,
  );
  assert.equal(combined.peak, expected.peak);
  assert(Math.abs(combined.playerHours! - expected.playerHours!) < 1e-9);
  assert(Math.abs(combined.coverageRatio - expected.coverageRatio) < 1e-12);
  await assert.rejects(
    s.t.query(api.clubAnalytics.getInstance, {
      communitySlug: "repair",
      sessionId: s.sessionIds[6]!,
    }),
    /access/,
  );
  await s.t.mutation(internal.instanceSessionRepair.rollback, {
    repairId: a.repairId,
    expectedAfterFingerprint: a.afterFingerprint,
  });
  assert.deepEqual(await raw(s.t), before);
  await s.t.mutation(internal.instanceSessionRepair.rollback, {
    repairId: a.repairId,
    expectedAfterFingerprint: a.afterFingerprint,
  });
  await assert.rejects(
    s.t.mutation(internal.instanceSessionRepair.apply, args),
    /rolled back/,
  );
});
it("rejects stale previews without changing records", async () => {
  const s = await setup(),
    p = await s.preview();
  await s.t.run((ctx) => ctx.db.patch(s.sessionIds[2]!, { updatedAt: 1 }));
  const before = await raw(s.t);
  await assert.rejects(
    s.t.mutation(internal.instanceSessionRepair.apply, {
      ...s.request,
      expectedFingerprint: p.fingerprint,
    }),
    /changed/,
  );
  assert.deepEqual(await raw(s.t), before);
  assert.deepEqual(
    await s.t.run((ctx) => ctx.db.query("instanceSessionRepairs").collect()),
    [],
  );
});
it("blocks explicit closure, foreign identity, new epoch, duplicate observations and active reuse", async () => {
  for (const change of ["closure", "world", "epoch", "duplicate", "active"]) {
    const s = await setup();
    await s.preview();
    await s.t.run(async (ctx) => {
      if (change === "closure")
        await ctx.db.patch(s.sessionIds[2]!, { consecutiveMisses: 0 });
      if (change === "world")
        await ctx.db.patch(s.sessionIds[2]!, { vrchatWorldId: "wrld_foreign" });
      if (change === "epoch")
        await ctx.db.patch(s.integrationId, {
          telemetryEpochStartedAt: epoch + 1,
        });
      if (change === "active") {
        const row = await ctx.db.get(s.sessionIds[2]!);
        assert(row);
        const { _id, _creationTime, ...fields } = row;
        await ctx.db.insert("instanceSessions", {
          ...fields,
          state: "open",
          openedAt: ranges[6]![1]! + 1,
        });
      }
      if (change === "duplicate") {
        const row = await ctx.db
          .query("instancePopulationObservations")
          .first();
        assert(row);
        const { _id, _creationTime, ...fields } = row;
        await ctx.db.insert("instancePopulationObservations", fields);
      }
    });
    await assert.rejects(s.preview());
  }
});
it("blocks rollback after later ingestion and prevents alias chains or cross-scope reads", async () => {
  const s = await setup(),
    p = await s.preview();
  const applied = await s.t.mutation(internal.instanceSessionRepair.apply, {
    ...s.request,
    expectedFingerprint: p.fingerprint,
  });
  await s.t.run((ctx) =>
    ctx.db.patch(p.canonicalSessionId, { lastObservedAt: ranges[6]![1]! + 1 }),
  );
  const before = await raw(s.t);
  await assert.rejects(
    s.t.mutation(internal.instanceSessionRepair.rollback, {
      repairId: applied.repairId,
      expectedAfterFingerprint: applied.afterFingerprint,
    }),
    /changed/,
  );
  assert.deepEqual(await raw(s.t), before);
  await s.t.run((ctx) =>
    ctx.db.patch(s.sessionIds[5]!, { mergedIntoSessionId: s.sessionIds[6]! }),
  );
  assert.equal(
    await s.actor.query(api.clubAnalytics.getInstance, {
      communitySlug: "repair",
      sessionId: s.sessionIds[5]!,
    }),
    null,
  );
  await s.t.run(async (ctx) => {
    const integration = await ctx.db.get(s.integrationId);
    assert(integration);
    const { _id, _creationTime, ...fields } = integration;
    const foreignId = await ctx.db.insert("communityVrchatIntegrations", {
      ...fields,
      vrchatGroupId: "grp_foreign",
      state: "disconnected",
    });
    await ctx.db.patch(s.sessionIds[6]!, { integrationId: foreignId });
  });
  assert.equal(
    await s.actor.query(api.clubAnalytics.getInstance, {
      communitySlug: "repair",
      sessionId: s.sessionIds[6]!,
    }),
    null,
  );
});

it("rolls back writes when post-write fingerprinting fails", async (test) => {
  const s = await setup(),
    p = await s.preview(),
    before = await raw(s.t);
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  test.mock.method(
    crypto.subtle,
    "digest",
    async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
      if (new TextDecoder().decode(data).includes('"mergedIntoSessionId"'))
        throw Error("injected post-write failure");
      return digest(algorithm, data);
    },
  );
  await assert.rejects(
    s.t.mutation(internal.instanceSessionRepair.apply, {
      ...s.request,
      expectedFingerprint: p.fingerprint,
    }),
    /injected post-write failure/,
  );
  assert.deepEqual(await raw(s.t), before);
  assert.deepEqual(
    await s.t.run((ctx) => ctx.db.query("instanceSessionRepairs").collect()),
    [],
  );
});
it("rejects an inventory beyond the atomic observation budget without truncating it", async () => {
  const s = await setup();
  await s.preview();
  await s.t.run(async (ctx) => {
    const original = await ctx.db
      .query("instancePopulationObservations")
      .first();
    assert(original);
    const { _id, _creationTime, ...fields } = original;
    for (let n = 0; n < 478; n++)
      await ctx.db.insert("instancePopulationObservations", {
        ...fields,
        idempotencyKey: "overflow-" + n,
        observedAt: fields.observedAt + n + 1,
      });
  });
  await assert.rejects(s.preview(), /budget/);
});

it("blocks new event associations and recap jobs before repair", async () => {
  for (const dependency of ["association", "recap"]) {
    const s = await setup();
    await s.preview();
    await s.t.run(async (ctx) => {
      const eventId = await ctx.db.insert("events", {
        title: "Repair",
        sortTitle: "repair",
        communityProfileId: s.communityProfileId,
        startAt: epoch,
        endAt: ranges[6]![1]!,
        sourceType: "manual",
        sourceLabel: "test",
        eventStatus: "scheduled",
        publicationState: "published",
        updatedAt: epoch,
      });
      if (dependency === "association")
        await ctx.db.insert("eventInstanceAssociations", {
          eventId,
          sessionId: s.sessionIds[2]!,
          communityProfileId: s.communityProfileId,
          source: "manual",
          confidence: 1,
          state: "confirmed",
          createdAt: epoch,
          updatedAt: epoch,
        });
      else
        await ctx.db.insert("communityTelemetryEventRecapJobs", {
          eventId,
          communityProfileId: s.communityProfileId,
          integrationId: s.integrationId,
          bucketStartAt: epoch,
          bucketEndAt: ranges[6]![1]!,
          pendingTotal: 0,
          pendingHasValid: false,
          pendingSessions: [s.sessionIds[2]!],
          peakConcurrency: 0,
          playerMinutes: 0,
          measuredMs: 0,
          activeInstanceCount: 0,
          worldDistribution: [],
          computedAt: epoch,
        });
    });
    await assert.rejects(s.preview(), /dependency|association/);
  }
});
it("preserves staff category restrictions and epoch boundaries through old aliases", async () => {
  const s = await setup(),
    p = await s.preview();
  await s.t.mutation(internal.instanceSessionRepair.apply, {
    ...s.request,
    expectedFingerprint: p.fingerprint,
  });
  const staff = {
    subject: "user_staff",
    issuer: owner.issuer,
    tokenIdentifier: owner.issuer + "|user_staff",
  };
  await s.t.run(async (ctx) => {
    await ctx.db.insert("users", { clerkUserId: staff.subject });
    await ctx.db.insert("communityAuthorities", {
      communityProfileId: s.communityProfileId,
      subjectTokenIdentifier: staff.tokenIdentifier,
      subject: staff,
      capabilities: ["manage_events"],
      roleKey: "legacy",
      roleLabel: "Staff",
      state: "active",
      grantedAt: epoch,
      updatedAt: epoch,
    });
    const categories = defaultClubVisibility();
    categories.instance_history = { audience: "owner", staffRoleIds: null };
    await ctx.db.insert("communityDataVisibility", {
      communityProfileId: s.communityProfileId,
      categories,
      updatedAt: epoch,
    });
  });
  assert.equal(
    await s.t.withIdentity(staff).query(api.clubAnalytics.getInstance, {
      communitySlug: "repair",
      sessionId: s.sessionIds[6]!,
    }),
    null,
  );
  await assert.rejects(
    s.t.withIdentity(staff).query(api.clubAnalytics.getInstanceSeries, {
      communitySlug: "repair",
      sessionId: s.sessionIds[6]!,
      startAt: epoch,
      endAt: ranges[6]![1]! + 1,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
    /restricted|access/,
  );
  await s.t.run((ctx) =>
    ctx.db.patch(s.integrationId, {
      telemetryEpochStartedAt: ranges[6]![1]! + 1,
    }),
  );
  assert.equal(
    await s.actor.query(api.clubAnalytics.getInstance, {
      communitySlug: "repair",
      sessionId: s.sessionIds[6]!,
    }),
    null,
  );
});
it("ingestion matches canonical closed rows, then retains genuine same-locator reuse", async () => {
  const s = await setup(),
    p = await s.preview();
  const receipt = await s.t.mutation(internal.instanceSessionRepair.apply, {
    ...s.request,
    expectedFingerprint: p.fingerprint,
  });
  const aliases = (await raw(s.t)).sessions.filter(
    (row) => row.mergedIntoSessionId,
  );
  const now = ranges[6]![1]! + 3600000;
  const collectorAccountId = await s.t.mutation(
    internal.communityTelemetry.registerCollectorAccount,
    {
      vrchatUserId: "usr_00000000-0000-4000-8000-000000000001",
      accountAlias: "repair-test",
      secretRef:
        "arn:aws:secretsmanager:us-east-1:000000000000:secret:repair-test",
      workerKeyHash: "a".repeat(64),
      capacity: 3,
      reservedHeadroom: 1,
      requestsPerMinute: 30,
      now,
    },
  );
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.integrationId, {
      assignedCollectorAccountId: collectorAccountId,
      nextPollAt: now,
    });
    await ctx.db.patch(p.canonicalSessionId, {
      state: "closed",
      closedAt: ranges[6]![1]! + 1000,
    });
  });
  const [claim] = (
    await s.t.mutation(internal.communityTelemetry.claimDueAssignments, {
      collectorAccountId,
      workerId: "repair-worker",
      now,
    })
  ).assignments;
  assert(claim);
  const poll = {
    integrationId: s.integrationId,
    collectorAccountId,
    workerId: "repair-worker",
    fencingToken: claim.fencingToken,
    collectorVersion: "test",
    source: "first_party" as const,
    groupMemberCount: 50,
    nextPollAt: now + 60000,
  };
  const instance = {
    providerInstanceId: "same",
    providerLocation: "wrld_repair:same",
    vrchatWorldId: "wrld_repair",
    population: 1,
  };
  await s.t.mutation(internal.communityTelemetry.ingestAggregatePoll, {
    ...poll,
    pollId: "closed",
    now,
    observedAt: now,
    instances: [{ ...instance, closedAt: now - 1000 }],
  });
  assert.deepEqual(
    (await raw(s.t)).sessions.filter((row) => row.mergedIntoSessionId),
    aliases,
  );
  assert.equal(
    (await s.t.run((ctx) => ctx.db.get(p.canonicalSessionId)))!.lastObservedAt,
    now,
  );
  await s.t.mutation(internal.communityTelemetry.ingestAggregatePoll, {
    ...poll,
    pollId: "reused",
    now: now + 1000,
    observedAt: now + 1000,
    instances: [instance],
  });
  const rows = (await raw(s.t)).sessions;
  assert.equal(rows.length, 8);
  assert.equal(
    rows.filter((row) => !row.mergedIntoSessionId && row.state === "open")
      .length,
    1,
  );
  await assert.rejects(
    s.t.mutation(internal.instanceSessionRepair.rollback, {
      repairId: receipt.repairId,
      expectedAfterFingerprint: receipt.afterFingerprint,
    }),
    /changed|reused/,
  );
});

it("binds preview and mutation to the selected deployment", async () => {
  const s = await setup();
  const p = await s.preview();
  const wrong = { ...s.request, deploymentUrl: "https://wrong.convex.cloud" };
  await assert.rejects(
    s.t.query(internal.instanceSessionRepair.preview, wrong),
    /deployment/,
  );
  await assert.rejects(
    s.t.mutation(internal.instanceSessionRepair.apply, {
      ...wrong,
      expectedFingerprint: p.fingerprint,
    }),
    /deployment/,
  );
});

it("rejects an oversized atomic snapshot before writes", async () => {
  const s = await setup();
  await s.preview();
  await s.t.run(async (ctx) => {
    const row = await ctx.db.query("instancePopulationObservations").first();
    assert(row);
    await ctx.db.patch(row._id, { collectorVersion: "x".repeat(900000) });
  });
  await assert.rejects(s.preview(), /byte budget/);
});
