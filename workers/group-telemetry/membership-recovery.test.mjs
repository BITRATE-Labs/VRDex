import assert from "node:assert/strict";
import { test } from "node:test";
import { recoverMembershipPage } from "./membership-recovery.mjs";
import { RequestBudget } from "./runtime.mjs";

const groupId = "grp_00000000-0000-0000-0000-000000000001";
const userId = "usr_00000000-0000-0000-0000-000000000001";
function fixture() {
  const sends = [], reads = [];
  const job = { recoveryId: "recovery", revision: 2, startAt: 1000, endAt: 3000, nextOffset: 100, pages: 1 };
  const args = {
    assignment: { integrationId: "integration", fencingToken: 7, epochStartedAt: 1000, vrchatGroupId: groupId, enabledFeatures: ["analytics"] },
    authority: { groupId, userId, membershipStatus: "member", observedAt: 100000, permissions: ["group-audit-view"] },
    expectedUserId: userId, clock: () => 100000,
    accountBudget: new RequestBudget(10), integrationBudget: new RequestBudget(10),
    control: { async send(op, body) {
      sends.push({ op, body });
      if (op === "membership_recovery_claim") return job;
      if (op === "membership_recovery_check") return { current: true };
      return { granted: true, accepted: true };
    } },
    provider: { async request(path) {
      reads.push(path);
      return { results: [{ id: "audit1", groupId, created_at: new Date(2000).toISOString(), eventType: "group.member.join", targetId: userId }], hasNext: false };
    } },
  };
  return { args, sends, reads, job };
}
test("recovery reads one durable page after reservation and a current-job check", async () => {
  const { args, sends, reads } = fixture();
  assert.deepEqual(await recoverMembershipPage(args), { recovered: true });
  assert.equal(reads.length, 1);
  assert.match(reads[0], /offset=100/);
  assert.deepEqual(sends.map(x => x.op), ["membership_recovery_claim", "budget", "membership_recovery_check", "membership_recovery_page"]);
  const page = sends.at(-1).body;
  assert.equal(page.expectedRevision, 2);
  assert.equal(page.sourceCount, 1);
  assert.equal(page.exhausted, true);
  assert.equal(page.events[0].targetUserId, userId);
});

test("recovery returns retry times only for genuine local or shared budget deferrals", async () => {
  for (const reason of ["local", "budget_exhausted", "unavailable", "unknown", "past", "invalid"]) {
    const { args, reads } = fixture();
    const send = args.control.send;
    if (reason === "local") args.integrationBudget.tryConsume(10, 100000);
    args.control.send = async (op, body) => op === "budget" ? { granted: false, reason: reason === "past" || reason === "invalid" ? "budget_exhausted" : reason,
      retryAt: reason === "past" ? 100000 : reason === "invalid" ? Infinity : 120000 } : send(op, body);
    assert.deepEqual(await recoverMembershipPage(args), { recovered: false, ...(["local", "budget_exhausted"].includes(reason) ? { retryAt: reason === "local" ? 160000 : 120000 } : {}) }, reason);
    assert.equal(reads.length, 0);
  }
});

test("disabled or stopped recovery, denied budgets and changed authority issue no audit request", async () => {
  for (const reason of ["disabled", "stopped", "budget", "authority", "shutdown", "window", "capacity"]) {
    const { args, sends, reads } = fixture();
    const send = args.control.send;
    let now = 100000, stopped = false;
    args.clock = () => now;
    args.shouldStop = () => stopped;
    args.control.send = async (op, body) => {
      const result = await send(op, body);
      if (reason === "disabled" && op === "membership_recovery_claim") return null;
      if (reason === "stopped" && op === "membership_recovery_check") return { current: false };
      if (op === "budget") {
        if (reason === "budget") return { granted: false };
        if (reason === "authority") now = 160001;
        if (reason === "window") now = 120000;
        if (reason === "shutdown") stopped = true;
        if (reason === "capacity") args.accountBudget.tryConsume(10, now);
      }
      return result;
    };
    assert.deepEqual(await recoverMembershipPage(args), { recovered: false }, reason);
    assert.equal(reads.length, 0, reason);
    assert.equal(sends.some(x => x.op === "membership_recovery_page"), false, reason);
  }
});

test("provider failures checkpoint a partial attempt and still reach account fault handling", async () => {
  for (const category of ["authentication", "rate_limit", "transient", "schema_drift"]) {
    const { args, sends } = fixture();
    const error = Object.assign(new Error("provider failed"), { category, retryAfterMs: 120000 });
    args.provider.request = async () => { throw error; };
    await assert.rejects(recoverMembershipPage(args), e => e === error);
    assert.equal(sends.at(-1).op, "membership_recovery_failure");
    if (category === "rate_limit") assert.deepEqual(sends.at(-1).body, {
      integrationId: "integration", fencingToken: 7, epochStartedAt: 1000, groupId,
      recoveryId: "recovery", expectedRevision: 2, rateLimited: true, retryAfterMs: 120000,
    });
    assert.equal(sends.some(x => x.op === "membership_recovery_page"), false);
  }
});
test("raw progress includes invalid, duplicate and out-of-window rows without inventing evidence", async () => {
  const { args, sends } = fixture();
  const base = { groupId, created_at: new Date(2000).toISOString(), eventType: "group.member.join" };
  args.provider.request = async () => ({ results: [
    { ...base, id: "valid" }, { ...base, id: "invalid", created_at: "bad" }, { ...base, id: "duplicate" },
    { ...base, id: "duplicate" }, { ...base, id: "future", created_at: new Date(4000).toISOString() }, { ...base },
  ], hasNext: false });
  await recoverMembershipPage(args);
  const page = sends.at(-1).body;
  assert.equal(page.sourceCount, 6);
  assert.deepEqual(page.events.map(item => item.auditId), ["valid"]);
  assert.deepEqual(page.rawAuditIds, ["valid", "invalid", "duplicate", "future"]);
});
test("an invalid final raw entry consumes the cap and cannot trigger another provider request", async () => {
  const { args, sends, reads, job } = fixture();
  job.nextOffset = 9999; job.pages = 99;
  const send = args.control.send;
  args.control.send = async (op, body) => {
    const result = await send(op, body);
    if (op === "membership_recovery_page") { job.nextOffset += body.sourceCount; job.pages++; job.revision++; }
    return result;
  };
  args.provider.request = async path => {
    reads.push(path);
    return { results: [{ id: "invalid", groupId, created_at: "invalid", eventType: "group.member.join" }], hasNext: true };
  };
  assert.deepEqual(await recoverMembershipPage(args), { recovered: true });
  assert.match(reads[0], /n=1&offset=9999/);
  assert.equal(sends.at(-1).body.sourceCount, 1);
  assert.deepEqual(sends.at(-1).body.events, []);
  assert.equal(job.nextOffset, 10000);
  assert.deepEqual(await recoverMembershipPage(args), { recovered: false });
  assert.equal(reads.length, 1);
});

test("membership and audit authority are required before touching recovery", async () => {
  for (const reason of ["named", "analytics", "permission", "member", "group", "account", "future", "old"]) {
    const { args, sends } = fixture();
    if (reason === "named") args.assignment.namedMembershipCollectionEnabled = false;
    if (reason === "analytics") args.assignment.enabledFeatures = [];
    if (reason === "permission") args.authority.permissions = [];
    if (reason === "member") args.authority.membershipStatus = "absent";
    if (reason === "group") args.authority.groupId = "other";
    if (reason === "account") args.authority.userId = "other";
    if (reason === "future") args.authority.observedAt = 100001;
    if (reason === "old") args.authority.observedAt = 1;
    assert.deepEqual(await recoverMembershipPage(args), { recovered: false }, reason);
    assert.deepEqual(sends, [], reason);
  }
});
