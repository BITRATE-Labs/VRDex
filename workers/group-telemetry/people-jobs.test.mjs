import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPeople, resolvePersonName } from "./people-jobs.mjs";

const id = "usr_11111111-1111-1111-1111-111111111111";
test("exact user lookup retains only a validated name and never fetches artwork", async () => {
  const paths = [];
  const result = await resolvePersonName(id, { request: async (path) => {
    paths.push(path);
    return { id, displayName: "Mira", iconUrl: "https://api.vrchat.cloud/api/1/file/private", bio: "private" };
  } });
  assert.deepEqual(paths, [`/users/${id}`]);
  assert.deepEqual(result, { status: "resolved", userId: id, displayName: "Mira" });
  assert.deepEqual(await resolvePersonName(id, { request: async () => ({ id: "usr_other", displayName: "Wrong" }) }), { status: "transient" });
});
test("worker claims one reserved request after heartbeat and stops on account faults", async () => {
  for (const category of ["authentication", "rate_limit"]) {
    const calls = [];
    const count = await checkPeople({
      control: { send: async (op) => { calls.push(op); return op === "people_claim" ? { jobs: [{ personId: "person", leaseToken: "lease", userId: id }] } : { cooldownRecorded: true }; } },
      provider: { request: async () => { calls.push("GET"); throw Object.assign(new Error("provider"), { category, retryAfterMs: 90000 }); } },
      accountBudget: { retryAfterMs: () => 0, tryConsume: () => true },
      heartbeat: async () => calls.push("heartbeat"), isStopping: () => false,
      reportDeadSession: async () => calls.push("dead"), pauseWithHeartbeats: async () => calls.push("pause"),
    });
    assert.equal(count, 1);
    assert.deepEqual(calls.slice(0, 3), ["heartbeat", "people_claim", "GET"]);
    assert.equal(calls.at(-1), category === "authentication" ? "dead" : "pause");
    assert.equal(calls.filter(c => c === "GET").length, 1);
  }
});

test("denied budgets, shutdown and failed control calls never perform an unreserved GET", async () => {
  for (const mode of ["budget", "denied", "shutdown", "control"]) {
    const calls = [];
    let claimed = false;
    const run = () => checkPeople({
      control: { send: async op => {
        calls.push(op);
        if (mode === "control") throw new Error("offline");
        if (op === "people_claim") { claimed = true; return { jobs: mode === "denied" ? [] : [{ personId: "person", leaseToken: "lease", userId: id }] }; }
        return {};
      } },
      provider: { request: async () => { throw new Error("unexpected GET"); } },
      accountBudget: { retryAfterMs: () => mode === "budget" ? 1 : 0 }, heartbeat: async () => {},
      isStopping: () => mode === "shutdown" && claimed,
    });
    if (mode === "control") await assert.rejects(run, /offline/); else assert.equal(await run(), 0);
    if (mode === "shutdown") assert.deepEqual(calls, ["people_claim", "people_release"]);
    if (mode === "budget") assert.deepEqual(calls, []);
  }
});

test("negative responses and transient failures are distinct and long Retry-After reaches shared control", async () => {
  for (const status of [403, 404, 410, 503]) {
    assert.deepEqual(await resolvePersonName(id, { request: async () => { throw { status }; } }), { status: status === 503 ? "transient" : "unavailable" });
  }
  let outcome, pause;
  await checkPeople({
    control: { send: async (op, body) => {
      if (op === "people_claim") return { jobs: [{ personId: "person", leaseToken: "lease", userId: id }] };
      outcome = body.result; return { cooldownRecorded: true };
    } },
    provider: { request: async () => { throw { status: 429, retryAfterMs: 3600000 }; } },
    accountBudget: { retryAfterMs: () => 0, tryConsume: () => true }, heartbeat: async () => {}, isStopping: () => false,
    pauseWithHeartbeats: async ms => { pause = ms; },
  });
  assert.deepEqual(outcome, { status: "transient", retryAfterMs: 3600000, rateLimited: true });
  assert.equal(pause, 3600000);
});
