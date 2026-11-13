import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { RequestBudget, failureDisposition } from "./runtime.mjs";
import { executeClubOperation } from "./club-operation-jobs.mjs";
import { VrchatProviderError } from "./vrchat-client.mjs";
import { collectMembershipPage } from "./membership-collection.mjs";
import { recoverMembershipPage } from "./membership-recovery.mjs";
import { refreshClubAuthority } from "./club-authority.mjs";
const source = readFileSync(
  new URL("./worker.mjs", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");
const collectSource = source.slice(
  source.indexOf("async function collect(assignment)"),
  source.indexOf(
    "/**\n * Hands back",
    source.indexOf("async function collect(assignment)"),
  ),
);
function harness({
  state = "active",
  features = ["analytics", "posts"],
  error,
  ingestError,
  membershipState = "active",
  requestsPerMinute = 100,
  namedMembershipCollectionEnabled,
  publicationPolicy,
} = {}) {
  const calls = [];
  const failures = [];
  let now = 1000000;
  let connection = state;
  const sandbox = {
    Date: { now: () => now },
    RequestBudget,
    failureDisposition,
    integrationBudgets: new Map(),
    attempts: new Map(),
    stopping: false,
    accountBudget: new RequestBudget(100),
    secret: { vrchatUserId: "bot" },
    COLLECTOR_PROTOCOL_VERSION: "test",
    randomPollDelayMs: () => 60000,
    pollId: () => "poll",
    boundedProviderCategory: (x) => x,
    collectorAuthRequiredEvent: () => ({}),
    logEvent: () => {},
    reportDeadSession: async () => {
      sandbox.stopping = true;
    },
    pauseWithHeartbeats: async () => {},
    budgetedClubProvider: () => ({}),
    control: {
      send: async (op, args) => {
        calls.push(op);
        if (op === "membership") connection = args.state;
        if (op === "ingest" && ingestError)
          throw new Error("Control plane 400: malformed snapshot");
        if (op === "failure") {
          failures.push(args);
          if (!args.telemetryOnly) connection = "degraded";
        }
        return { granted: true };
      },
    },
    provider: {
      connectGroup: async () => {
        calls.push("connect");
        return { state: membershipState };
      },
      leaveGroup: async () => {
        calls.push("leave");
      },
      readAggregateSnapshot: async () => {
        calls.push("aggregate");
        if (error) throw error;
        return { observedAt: now, group: { memberCount: 1 }, instances: [] };
      },
    },
    checkClubOperations: async (assignment, budget, deadline) => {
      calls.push("operation");
      assert.equal(assignment.state, "active");
      assert.ok(deadline > now);
      assert.ok(now < 1000000 + 15 * 60000, "work is reached before cutoff");
    },
    checkClubReads: async (assignment) => {
      assert.equal(assignment.state, "active");
      calls.push("read");
    },
    refreshClubAuthority: async ({ assignment }) => {
      assert.equal(assignment.state, "active");
      calls.push("authority");
      return {};
    },
    collectMembershipPage: async () => {
      calls.push("history");
    },
    recoverMembershipPage: args => recoverMembershipPage({ ...args, clock: () => now }),
  };
  const collect = runInNewContext(collectSource + "\ncollect;", sandbox);
  return {
    calls,
    failures,
    sandbox,
    advance: (ms) => {
      now += ms;
    },
    clock: () => now,
    pass: async () => {
      await collect({
        integrationId: "club",
        vrchatGroupId: "grp_00000000-0000-0000-0000-000000000001",
        fencingToken: 1,
        epochStartedAt: 1,
        requestsPerMinute,
        state: connection,
        enabledFeatures: features ?? undefined,
        namedMembershipCollectionEnabled,
        publicationPolicy,
      });
      now += 60000;
    },
  };
}

test("supplemental recovery runs after collection and ordinary repair failures do not downgrade it", async () => {
  for (const category of ["transient", "schema_drift", "authentication", "rate_limit"]) {
    const h = harness();
    h.sandbox.refreshClubAuthority = async () => ({ authority: { groupId: "grp_00000000-0000-0000-0000-000000000001", userId: "bot", membershipStatus: "member", permissions: ["*"], observedAt: h.clock() } });
    h.sandbox.recoverMembershipPage = async () => {
      assert.ok(h.calls.includes("history"));
      throw new VrchatProviderError("repair failed", { category });
    };
    await h.pass();
    assert.equal(h.failures.length, ["authentication", "rate_limit"].includes(category) ? 1 : 0, category);
  }
});

function recoveryPollHarness() {
  const h = harness({ features: ["analytics"], requestsPerMinute: 4 });
  const groupId = "grp_00000000-0000-0000-0000-000000000001";
  const userId = "usr_00000000-0000-0000-0000-000000000001";
  const providerReads = [], recoveryClaims = [];
  const job = { recoveryId: "recovery", revision: 0, startAt: 1, endAt: 900000, nextOffset: 0, pages: 0, state: "pending" };
  const serverBudget = new RequestBudget(4);
  h.sandbox.secret.vrchatUserId = userId;
  h.sandbox.pauseWithHeartbeats = async ms => h.advance(ms);
  h.sandbox.provider.request = async path => {
    providerReads.push(path);
    if (path === "/auth/user") return { id: userId };
    if (path.includes("/auditLogs?")) return { results: [], hasNext: false };
    if (path.endsWith("/instances")) return [];
    return { id: groupId, ownerId: userId, roles: [], myMember: { groupId, userId, membershipStatus: "member", permissions: ["group-audit-view"], roleIds: [] } };
  };
  h.sandbox.provider.readAggregateSnapshot = async () => {
    h.calls.push("aggregate");
    await h.sandbox.provider.request(`/groups/${groupId}`);
    await h.sandbox.provider.request(`/groups/${groupId}/instances`);
    return { observedAt: h.clock(), group: { memberCount: 1 }, instances: [] };
  };
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, body) => {
    await send(op, body);
    if (op === "budget") {
      const granted = serverBudget.tryConsume(body.requestCount, h.clock());
      return { granted, ...(granted ? {} : { reason: "budget_exhausted", retryAt: h.clock() + serverBudget.retryAfterMs(body.requestCount, h.clock()) }) };
    }
    if (op === "club_authority") return { recorded: true };
    if (op === "membership_scan_resume") return { complete: true, endAt: h.clock() - 60000 };
    if (op === "membership_recovery_claim") {
      job.state = "running";
      recoveryClaims.push(h.clock());
      return { ...job };
    }
    if (op === "membership_recovery_check") return { current: true };
    if (op === "membership_recovery_page") { job.pages++; job.nextOffset += body.sourceCount; return { accepted: true }; }
    return { granted: true };
  };
  h.sandbox.refreshClubAuthority = args => refreshClubAuthority({ ...args, clock: h.clock });
  h.sandbox.collectMembershipPage = args => collectMembershipPage({ ...args, clock: h.clock });
  return { h, providerReads, recoveryClaims, job, serverBudget };
}

test("historical recovery progresses after repeated quiet polls at four integration requests per minute", async () => {
  const { h, providerReads, recoveryClaims, job } = recoveryPollHarness();
  for (let poll = 0; poll < 3; poll++) await h.pass();
  assert.equal(h.calls.filter(op => op === "ingest").length, 3);
  assert.equal(h.calls.filter(op => op === "membership_scan_resume").length, 3);
  assert.ok(recoveryClaims.length >= 3);
  assert.equal(job.state, "running");
  assert.deepEqual(h.failures, []);
  const auditReads = providerReads.filter(path => path.includes("/auditLogs?"));
  assert.ok(job.pages > 0, JSON.stringify({ polls: 3, claims: recoveryClaims.length, providerRequests: providerReads.length, auditRequests: auditReads.length, pages: job.pages }));
  assert.equal(auditReads.length, 3);
  assert.equal(job.pages, 3);
  assert.equal(h.calls.filter(op => op === "club_authority").length, 6);
});

test("a short recovery budget wait reuses still-fresh authority without another two reads", async () => {
  const { h, providerReads, job } = recoveryPollHarness();
  const aggregate = h.sandbox.provider.readAggregateSnapshot;
  h.sandbox.provider.readAggregateSnapshot = async () => {
    const result = await aggregate();
    h.advance(45000);
    return result;
  };
  const waits = [];
  h.sandbox.pauseWithHeartbeats = async ms => { waits.push(ms); h.advance(ms); };
  await h.pass();
  assert.deepEqual(waits, [15000]);
  assert.equal(h.calls.filter(op => op === "club_authority").length, 1);
  assert.equal(providerReads.length, 5);
  assert.equal(providerReads.filter(path => path.includes("/auditLogs?")).length, 1);
  assert.equal(h.calls.filter(op => op === "membership_recovery_check").length, 1);
  assert.equal(job.pages, 1);
});

for (const phase of ["catchup", "recovery"]) {
  for (const kind of ["rejected", "control_http", "transport", "timeout"]) {
    test(`${phase} budget waits propagate heartbeat ${kind} failures without further provider calls`, async () => {
      const { h, providerReads, job } = recoveryPollHarness();
      const failure = kind === "control_http" ? new Error("Control plane 503: unavailable")
        : kind === "transport" ? new TypeError("synthetic network failure")
          : kind === "timeout" ? Object.assign(new Error("synthetic timeout"), { name: "TimeoutError" }) : null;
      const events = [];
      Object.assign(h.sandbox, { lastHeartbeatAt: 0, controlFailures: 0, runtimeMetadata: {}, logEvent: event => events.push(event), pause: async ms => h.advance(ms) });
      const heartbeatStart = source.indexOf("async function heartbeat()");
      h.sandbox.heartbeat = runInNewContext(source.slice(heartbeatStart, source.indexOf("/**\n * Prove", heartbeatStart)) + "\nheartbeat;", h.sandbox);
      const pauseStart = source.indexOf("async function pauseWithHeartbeats(ms)");
      h.sandbox.pauseWithHeartbeats = runInNewContext(source.slice(pauseStart, source.indexOf("async function checkClubReads", pauseStart)) + "\npauseWithHeartbeats;", h.sandbox);
      const send = h.sandbox.control.send;
      h.sandbox.control.send = async (op, body) => {
        if (op === "heartbeat") {
          h.calls.push(op);
          if (failure) throw failure;
          return { recorded: false };
        }
        return send(op, body);
      };
      if (phase === "catchup") h.sandbox.collectMembershipPage = async () => ({ collected: false, retryAt: h.clock() + 60000 });
      await assert.rejects(h.pass(), failure ? error => error === failure : /Control plane heartbeat was rejected\./);
      assert.equal(h.calls.filter(op => op === "heartbeat").length, 1);
      assert.equal(providerReads.length, 4);
      assert.equal(job.pages, 0);
      assert.deepEqual(h.failures, []);
      assert.equal(events.some(event => event.event === "membership_recovery_failed"), false);
      assert.ok(h.calls.includes("release"));
    });
  }
}

for (const reason of ["deadline", "shutdown", "permission", "group", "expired_authority", "revoked_scope"]) {
  test(`recovery budget wait cannot dispatch after ${reason}`, async () => {
    const { h, providerReads, job } = recoveryPollHarness();
    let waited = false;
    h.sandbox.pauseWithHeartbeats = async ms => {
      waited = true;
      h.advance(reason === "deadline" ? 240000 : ms);
      if (reason === "shutdown") h.sandbox.stopping = true;
    };
    const request = h.sandbox.provider.request;
    h.sandbox.provider.request = async path => {
      const result = await request(path);
      if (waited && result.myMember) {
        if (reason === "permission") result.myMember.permissions = [];
        if (reason === "group") result.id = "grp_00000000-0000-0000-0000-000000000002";
      }
      return result;
    };
    const send = h.sandbox.control.send;
    h.sandbox.control.send = async (op, body) => {
      const result = await send(op, body);
      if (waited && op === "club_authority" && reason === "expired_authority") h.advance(61000);
      if (waited && op === "membership_recovery_check" && reason === "revoked_scope") return { current: false };
      return result;
    };
    await h.pass();
    assert.equal(waited, true);
    assert.equal(providerReads.filter(path => path.includes("/auditLogs?")).length, 0);
    assert.equal(job.pages, 0);
    if (["deadline", "shutdown"].includes(reason)) assert.equal(providerReads.length, 4);
  });
}

test("shared recovery budget deferral yields when another refresh would exceed background headroom", async () => {
  const { h, providerReads, job, serverBudget } = recoveryPollHarness();
  let denied = false;
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, body) => {
    if (!denied && op === "budget" && body.requestCount === 1) {
      assert.equal(serverBudget.tryConsume(2, h.clock()), true);
      denied = true;
    }
    return send(op, body);
  };
  await h.pass();
  assert.equal(denied, true);
  assert.equal(job.pages, 0);
  assert.equal(providerReads.filter(path => path.includes("/auditLogs?")).length, 0);
  assert.equal(h.calls.filter(op => op === "club_authority").length, 2);
});

test("a deferred two-read authority refresh yields at the shared membership deadline", async () => {
  const { h, providerReads, job, serverBudget } = recoveryPollHarness();
  let waited = false, denied = false;
  h.sandbox.pauseWithHeartbeats = async ms => { waited = true; h.advance(ms); };
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, body) => {
    if (waited && !denied && op === "budget" && body.requestCount === 2) {
      assert.equal(serverBudget.tryConsume(3, h.clock()), true);
      denied = true;
    }
    return send(op, body);
  };
  await h.pass();
  assert.equal(denied, true);
  assert.equal(job.pages, 0);
  assert.equal(providerReads.filter(path => path.includes("/auditLogs?")).length, 0);
  assert.equal(h.calls.filter(op => op === "club_authority").length, 1);
});

for (const reason of ["budget_deadline", "budget_shutdown", "first_read_deadline", "first_read_shutdown"]) {
  test(`post-wait recovery authority starts no further GET after ${reason}`, async () => {
    const { h, providerReads, job } = recoveryPollHarness();
    let waited = false;
    h.sandbox.pauseWithHeartbeats = async ms => { waited = true; h.advance(ms); };
    const crossBoundary = () => { if (reason.endsWith("deadline")) h.advance(30000); else h.sandbox.stopping = true; };
    const send = h.sandbox.control.send;
    h.sandbox.control.send = async (op, body) => {
      const result = await send(op, body);
      if (waited && op === "budget" && body.requestCount === 2 && reason.startsWith("budget")) crossBoundary();
      return result;
    };
    const request = h.sandbox.provider.request;
    h.sandbox.provider.request = async path => {
      const result = await request(path);
      if (waited && path === "/auth/user" && reason.startsWith("first_read")) crossBoundary();
      return result;
    };
    await h.pass();
    assert.equal(waited, true);
    assert.equal(providerReads.length, reason.startsWith("budget") ? 4 : 5);
    assert.equal(providerReads.filter(path => path.includes("/auditLogs?")).length, 0);
    assert.equal(job.pages, 0);
  });
}

test("repeated recovery denials preserve the existing membership allowance and proof headroom", async () => {
  const { h, providerReads, job, serverBudget } = recoveryPollHarness();
  const startedAt = h.clock();
  const waits = [];
  h.sandbox.pauseWithHeartbeats = async ms => { waits.push(ms); h.advance(ms); };
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, body) => {
    if (op === "budget" && body.requestCount === 1) assert.equal(serverBudget.tryConsume(2, h.clock()), true);
    return send(op, body);
  };
  await h.pass();
  assert.deepEqual(waits, [60000, 30000]);
  const returnedAt = h.clock() - 60000;
  assert.equal(returnedAt, startedAt + 90000);
  assert.ok(returnedAt - startedAt < 120000, "background work yields before the proof poll freshness boundary");
  assert.equal(job.pages, 0);
  assert.equal(providerReads.filter(path => path.includes("/auditLogs?")).length, 0);
});

test("normal membership using the allowance does not give recovery a fresh window", async () => {
  const { h, providerReads, recoveryClaims, job } = recoveryPollHarness();
  const startedAt = h.clock();
  const scan = { scanId: "normal", startAt: 1, endAt: 940000, nextOffset: 0, nextPage: 0, phase: "collect", complete: false };
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, body) => {
    if (op === "membership_scan_resume") { h.calls.push(op); return { ...scan }; }
    if (op === "membership_scan_page") { scan.nextOffset += body.sourceCount; scan.nextPage++; }
    return send(op, body);
  };
  const request = h.sandbox.provider.request;
  h.sandbox.provider.request = async path => {
    const result = await request(path);
    if (path.includes("/auditLogs?") && Date.parse(new URL(path, "https://fixture.invalid").searchParams.get("endDate")) === scan.endAt) return { results: Array.from({ length: 100 }, (_, index) => ({ id: `normal-${scan.nextOffset + index}`, groupId: "grp_00000000-0000-0000-0000-000000000001", created_at: new Date(1000).toISOString(), eventType: "group.member.join" })), hasNext: true };
    return result;
  };
  await h.pass();
  assert.equal(h.clock() - 60000, startedAt + 90000);
  assert.equal(scan.nextPage, 2);
  assert.equal(providerReads.filter(path => path.includes("/auditLogs?")).length, 2);
  assert.equal(recoveryClaims.length, 0);
  assert.equal(job.pages, 0);
});

test("a recovery budget reply crossing membership deadline cannot issue its audit GET", async () => {
  const { h, providerReads, job } = recoveryPollHarness();
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, body) => {
    const result = await send(op, body);
    if (op === "budget" && body.requestCount === 1) h.advance(30000);
    return result;
  };
  await h.pass();
  assert.equal(providerReads.filter(path => path.includes("/auditLogs?")).length, 0);
  assert.equal(job.pages, 0);
});

test("missing initial audit authority does not add recovery refreshes or budget waits", async () => {
  const h = harness();
  h.sandbox.pauseWithHeartbeats = async () => assert.fail("No recovery budget deferral was admitted");
  await h.pass();
  assert.equal(h.calls.filter(op => op === "authority").length, 1);
  assert.equal(h.calls.includes("membership_recovery_claim"), false);
});

test("cached provider observations do not put the next poll in the past", async () => {
  const h = harness();
  let nextPollAt;
  h.sandbox.provider.readAggregateSnapshot = async () => ({ observedAt: 820000, group: { memberCount: 1 }, instances: [] });
  h.sandbox.control.send = async (op, args) => { if (op === "ingest") nextPollAt = args.nextPollAt; return { granted: true }; };
  await h.pass();
  assert.equal(nextPollAt, 1060000);
});

test("membership catch-up advances durable pages until caught up in one lease", async () => {
  const h = harness();
  let pages = 0;
  h.sandbox.collectMembershipPage = async ({ provider, requestBudgeted }) => {
    assert.equal(provider, h.sandbox.provider);
    assert.notEqual(requestBudgeted, true, "each page must reserve its own shared budget");
    return { collected: ++pages <= 4 };
  };
  await h.pass();
  assert.equal(pages, 5);
  assert.equal(h.calls.filter(x => x === "aggregate").length, 1);
  assert.deepEqual(h.failures, []);
});

test("membership catch-up completes real audit passes at the default budget and freezes its target", async () => {
  const h = harness({ requestsPerMinute: 4 });
  const userId = "usr_00000000-0000-0000-0000-000000000001";
  let scan = { scanId: "scan", startAt: 1, endAt: 940000, nextOffset: 0, nextPage: 0, phase: "collect", complete: false };
  let requests = 0, reservations = 0, redundantScans = 0;
  let targetPinned = false;
  h.sandbox.secret.vrchatUserId = userId;
  h.sandbox.refreshClubAuthority = async ({ assignment, integrationBudget }) => {
    assert.equal(integrationBudget.tryConsume(2, h.clock()), true);
    h.advance(2000);
    if (!targetPinned) { scan.endAt = h.clock() - 60000; targetPinned = true; }
    return { authority: {
      groupId: assignment.vrchatGroupId, userId, membershipStatus: "member", observedAt: h.clock(), permissions: ["group-audit-view"],
    } };
  };
  h.sandbox.pauseWithHeartbeats = async ms => h.advance(ms);
  h.sandbox.collectMembershipPage = args => collectMembershipPage({ ...args, clock: h.clock });
  h.sandbox.provider.request = async () => { requests++; h.advance(300); return { results: [], hasNext: false }; };
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, args) => {
    if (op.startsWith("membership_scan_") || op === "budget") h.advance(500);
    if (op === "membership_scan_resume") return { ...scan };
    if (op === "membership_scan_begin") redundantScans++;
    if (op === "membership_scan_page") scan.phase = scan.phase === "collect" ? "verify" : "finalize";
    if (op === "membership_scan_finalize") scan.complete = true;
    if (op === "budget" && args.requestCount === 1) reservations++;
    return send(op, args);
  };
  await h.pass();
  assert.equal(scan.complete, true);
  assert.equal(requests, 2);
  assert.equal(reservations, 2);
  assert.equal(redundantScans, 0);
  assert.deepEqual(h.failures, []);
});

test("membership catch-up yields at its page bound, shutdown, and lease deadline", async () => {
  for (const reason of ["bound", "shutdown", "deadline"]) {
    const h = harness();
    let pages = 0;
    h.sandbox.collectMembershipPage = async () => {
      pages++;
      if (reason === "shutdown") h.sandbox.stopping = true;
      if (reason === "deadline") h.advance(240000);
      return { collected: true };
    };
    await h.pass();
    assert.equal(pages, reason === "bound" ? 32 : 1);
    assert.deepEqual(h.failures, []);
  }
});

test("membership backfill yields before ownership proof polling becomes stale", async () => {
  const h = harness();
  let waited = 0;
  h.sandbox.collectMembershipPage = async () => ({ collected: false, retryAt: h.clock() + 600000 });
  h.sandbox.pauseWithHeartbeats = async ms => { waited += ms; h.advance(ms); };
  await h.pass();
  assert.equal(waited, 90000);
  assert.deepEqual(h.failures, []);
});
test("adopted managed poll skips named history despite current audit permission", async () => {
  const h = harness({ features: ["analytics"], namedMembershipCollectionEnabled: false });
  h.sandbox.refreshClubAuthority = async () => ({ authority: { groupId: "grp_00000000-0000-0000-0000-000000000001", userId: "bot", membershipStatus: "member", permissions: ["*"], observedAt: 1000000 } });
  h.sandbox.collectMembershipPage = async () => assert.fail("adoption must not dispatch named audit collection");
  await h.pass();
  assert.ok(h.calls.includes("ingest"));
  assert.deepEqual(h.failures, []);
});
for (const feature of ["posts", "membership_management", "instances"])
  for (const state of [
    "active",
    "connecting",
    "awaiting_approval",
    "awaiting_invite",
    "degraded",
  ]) {
    test(`${feature}-only ${state} skips analytics after effective connection`, async () => {
      const h = harness({ state, features: [feature] });
      await h.pass();
      for (const wanted of ["operation", "read", "authority"])
        assert.ok(h.calls.includes(wanted), wanted);
      for (const forbidden of ["aggregate", "ingest", "history"])
        assert.ok(!h.calls.includes(forbidden), forbidden);
    });
  }
test("repeated aggregate failure cannot starve management before cutoff or force reconnect", async () => {
  const h = harness({
    error: new VrchatProviderError("blocked", {
      status: 403,
      category: "visibility",
    }),
  });
  for (let i = 0; i < 5; i++) await h.pass();
  for (const op of ["operation", "read", "authority"])
    assert.equal(h.calls.filter((x) => x === op).length, 5);
  assert.ok(!h.calls.includes("connect"));
  assert.ok(h.calls.indexOf("operation") < h.calls.indexOf("aggregate"));
});
test("ingest failure occurs after independent management and readiness", async () => {
  const h = harness({ ingestError: true });
  await assert.rejects(h.pass(), /malformed snapshot/);
  for (const op of ["operation", "read", "authority"])
    assert.ok(h.calls.includes(op));
});
test("undefined features retain legacy analytics collection", async () => {
  const h = harness({ features: null });
  await h.pass();
  assert.ok(h.calls.includes("ingest"));
});
for (const category of ["authentication", "rate_limit"])
  test(`${category} remains a shared failure`, async () => {
    const h = harness({
      error: new VrchatProviderError("blocked", {
        status: category === "authentication" ? 401 : 429,
        category,
      }),
    });
    await h.pass();
    assert.ok(!h.failures[0].telemetryOnly);
    assert.equal(h.sandbox.stopping, category === "authentication");
  });
test("waiting membership never dispatches management or analytics", async () => {
  const h = harness({
    state: "connecting",
    membershipState: "awaiting_approval",
  });
  await h.pass();
  assert.ok(!h.calls.includes("operation"));
  assert.ok(!h.calls.includes("aggregate"));
});
test("disconnecting leaves without dispatch", async () => {
  const h = harness({ state: "disconnecting" });
  await h.pass();
  assert.ok(h.calls.includes("leave"));
  assert.ok(!h.calls.includes("operation"));
});

for (const authorized of [true, false])
  test(`actual dispatch after repeated telemetry failures still checks current authority: ${authorized}`, async () => {
    const h = harness({
      error: new VrchatProviderError("aggregate malformed", {
        category: "schema_drift",
      }),
    });
    for (let i = 0; i < 4; i++) await h.pass();
    h.advance(10 * 60000); // Reach the last minute of the original 15-minute window.
    const bot = "usr_00000000-0000-0000-0000-000000000001";
    const group = "grp_00000000-0000-0000-0000-000000000001";
    h.sandbox.secret.vrchatUserId = bot;
    const send = h.sandbox.control.send;
    h.sandbox.control.send = async (op, args) => {
      const result = await send(op, args);
      if (op === "club_operation_claim")
        return {
          operationId: "job",
          nonce: "nonce",
          executeBefore: 1000000 + 15 * 60000,
          payload: {
            kind: "publish_post",
            title: "Due now",
            text: "Reviewed post",
            visibility: "group",
            sendNotification: false,
          },
        };
      if (op === "club_operation_authorize") {
        assert.equal(args.authority.observedAt, h.sandbox.Date.now());
        return { authorized };
      }
      return result;
    };
    h.sandbox.provider.request = async (path, options) => {
      if (options?.method) {
        h.calls.push("provider-write");
        return { id: "post" };
      }
      if (path === "/auth/user") return { id: bot };
      return {
        id: group,
        ownerId: bot,
        roles: [],
        myMember: {
          userId: bot,
          groupId: group,
          membershipStatus: "member",
          permissions: ["*"],
          roleIds: [],
        },
      };
    };
    h.sandbox.checkClubOperations = (assignment, integrationBudget, deadline) =>
      executeClubOperation({
        assignment,
        integrationBudget,
        deadline,
        provider: h.sandbox.provider,
        control: h.sandbox.control,
        expectedUserId: bot,
        accountBudget: h.sandbox.accountBudget,
        pause: async (ms) => h.advance(ms),
        shouldStop: () => h.sandbox.stopping,
        clock: h.sandbox.Date.now,
      });
    await h.pass();
    assert.ok(h.calls.includes("club_operation_authorize"));
    assert.equal(h.calls.includes("provider-write"), authorized);
    if (authorized)
      assert.equal(
        h.calls[h.calls.indexOf("provider-write") - 1],
        "club_operation_authorize",
      );
  });
test("stopping after operation authentication failure prevents later reads", async () => {
  const h = harness();
  h.sandbox.checkClubOperations = async () => {
    h.sandbox.stopping = true;
  };
  await h.pass();
  for (const op of ["read", "authority", "aggregate"])
    assert.ok(!h.calls.includes(op));
});
test("membership failure in aggregate retains connection failure semantics", async () => {
  const h = harness({
    error: new VrchatProviderError("not a member", {
      status: 403,
      category: "membership",
    }),
  });
  await h.pass();
  assert.equal(h.failures[0].telemetryOnly, false);
});

for (const features of [null, ["analytics", "posts"]])
  test(`analytics still polls when readiness shares a two-request budget: ${features}`, async () => {
    const h = harness({ features, requestsPerMinute: 2 });
    h.sandbox.refreshClubAuthority = async ({ integrationBudget }) => {
      h.calls.push("authority");
      return {
        refreshed: integrationBudget.tryConsume(2, h.sandbox.Date.now()),
      };
    };
    await h.pass();
    assert.ok(h.calls.includes("ingest"));
  });

test("aggregate reservation uses time after management waits", async () => {
  const h = harness();
  const budgetTimes = [];
  h.sandbox.checkClubOperations = async () => h.advance(60000);
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, args) => {
    if (op === "budget") budgetTimes.push(args.now);
    return send(op, args);
  };
  await h.pass();
  assert.deepEqual(budgetTimes, [1060000]);
  assert.ok(h.calls.includes("aggregate"));
});
test("a reservation that outlives the bounded pass cannot start aggregate transport", async () => {
  const h = harness();
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, args) => {
    const result = await send(op, args);
    if (op === "budget") h.advance(240000);
    return result;
  };
  await h.pass();
  assert.ok(!h.calls.includes("aggregate"));
});

test("a readiness-only schema failure does not invalidate a successful aggregate poll", async () => {
  const h = harness();
  h.sandbox.refreshClubAuthority = async () => {
    throw new VrchatProviderError("malformed readiness", {
      category: "schema_drift",
    });
  };
  await h.pass();
  assert.ok(h.calls.includes("ingest"));
  assert.ok(!h.calls.includes("failure"));
});

test("adopted managed ingest carries fresh provider eligibility", async () => {
  const h = harness({ features: ["analytics"], namedMembershipCollectionEnabled: false });
  h.sandbox.provider.readAggregateSnapshot = async () => ({ observedAt: 1000000,
    group: { memberCount: 1, groupVisibility: "private", joinPolicy: "invite" }, instances: [] });
  const send = h.sandbox.control.send;
  h.sandbox.control.send = async (op, args) => {
    if (op === "ingest") {
      assert.equal(args.groupVisibility, "private");
      assert.equal(args.joinPolicy, "invite");
    }
    return send(op, args);
  };
  await h.pass();
  assert.deepEqual(h.failures, []);
});

test("automatic publication keeps fresh per-request metadata after named-history opt-in", async () => {
  const h = harness({ namedMembershipCollectionEnabled: true, publicationPolicy: "automatic_aggregate" });
  h.sandbox.provider.readAggregateSnapshot = async (_groupId, options) => {
    assert.equal(typeof options?.authorizeRequest, "function");
    assert.equal(await options.authorizeRequest("metadata"), true);
    return { observedAt: 1000000, group: { memberCount: 1, groupVisibility: "public", joinPolicy: "free" }, instances: [] };
  };
  await h.pass();
  assert.ok(h.calls.includes("history"));
});
