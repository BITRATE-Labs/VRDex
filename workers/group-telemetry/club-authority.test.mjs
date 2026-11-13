import assert from "node:assert/strict";
import { test } from "node:test";
import { refreshClubAuthority } from "./club-authority.mjs";
import { RequestBudget } from "./runtime.mjs";

const groupId = "grp_00000000-0000-0000-0000-000000000001";
const userId = "usr_00000000-0000-0000-0000-000000000001";
function setup(granted = true) {
  const sends = [], reads = [];
  const args = {
    assignment: { state: "active", integrationId: "integration", epochStartedAt: 100, fencingToken: 7, vrchatGroupId: groupId },
    expectedUserId: userId, clock: () => 1000,
    accountBudget: new RequestBudget(10), integrationBudget: new RequestBudget(10),
    control: { async send(operation, body) { sends.push({ operation, body }); return operation === "club_authority" ? { recorded: true } : { granted }; } },
    provider: { async request(path) {
      reads.push(path);
      return path === "/auth/user" ? { id: userId } : {
        id: groupId, ownerId: userId, name: "Private club name", roles: [],
        myMember: { groupId, userId, permissions: ["group-audit-view"], membershipStatus: "member", roleIds: [] },
      };
    } },
  };
  return { args, sends, reads };
}
test("authority refresh reserves requests and transmits only scoped permission evidence", async () => {
  const { args, sends, reads } = setup();
  assert.equal((await refreshClubAuthority(args)).refreshed, true);
  assert.equal(reads.length, 2);
  assert.equal(args.accountBudget.remaining(1000), 8);
  assert.equal(sends[0].operation, "budget");
  assert.equal(sends[1].operation, "club_authority");
  assert.equal(sends[1].body.fencingToken, 7);
  assert.equal(sends[1].body.epochStartedAt, 100);
  assert.deepEqual(sends[1].body.authority, { groupId, userId, ownerUserId: userId, membershipStatus: "member", permissions: ["group-audit-view"], observedAt: 1000 });
});
test("denied shared or local budgets and inactive assignments perform no provider request", async () => {
  for (const mode of ["shared", "local", "inactive"]) {
    const { args, reads, sends } = setup(mode !== "shared");
    if (mode === "local") args.accountBudget.tryConsume(10, 1000);
    if (mode === "inactive") args.assignment.state = "disconnecting";
    assert.deepEqual(await refreshClubAuthority(args), { refreshed: false, ...(mode === "local" ? { retryAt: 61000 } : {}) });
    assert.equal(reads.length, 0);
    assert.equal(sends.some(item => item.operation === "club_authority"), false);
  }
});

test("an impossible two-read local budget stops without a retry for either limit", async () => {
  for (const budget of ["accountBudget", "integrationBudget"]) {
    const { args, sends, reads } = setup();
    args[budget] = new RequestBudget(1);
    assert.deepEqual(await refreshClubAuthority(args), { refreshed: false }, budget);
    assert.equal(sends.length, 0);
    assert.equal(reads.length, 0);
  }
});

test("rejected snapshot recording cannot be reported as refreshed authority", async () => {
  const { args } = setup();
  args.control.send = async operation => operation === "budget" ? { granted: true } : { recorded: false };
  assert.deepEqual(await refreshClubAuthority(args), { refreshed: false });
});
test("authority refresh retries only current explicit shared budget deferrals", async () => {
  for (const reason of ["budget_exhausted", "unavailable", "unknown", "past", "invalid"]) {
    const { args, reads } = setup();
    args.control.send = async () => ({ granted: false, reason: ["past", "invalid"].includes(reason) ? "budget_exhausted" : reason,
      retryAt: reason === "past" ? 1000 : reason === "invalid" ? Infinity : 2000 });
    assert.deepEqual(await refreshClubAuthority(args), { refreshed: false, ...(reason === "budget_exhausted" ? { retryAt: 2000 } : {}) });
    assert.equal(reads.length, 0);
  }
});
for (const reason of ["budget_deadline", "budget_shutdown", "first_read_deadline", "first_read_shutdown"]) {
  test(`authority refresh stops before its next provider read after ${reason}`, async () => {
    const { args, sends, reads } = setup();
    let now = 1000, stopping = false;
    args.clock = () => now;
    args.deadline = 2000;
    args.shouldStop = () => stopping;
    const crossBoundary = () => { if (reason.endsWith("deadline")) now = 2000; else stopping = true; };
    const send = args.control.send;
    args.control.send = async (op, body) => {
      const result = await send(op, body);
      if (op === "budget" && reason.startsWith("budget")) crossBoundary();
      return result;
    };
    const request = args.provider.request;
    args.provider.request = async path => {
      const result = await request(path);
      if (path === "/auth/user" && reason.startsWith("first_read")) crossBoundary();
      return result;
    };
    assert.deepEqual(await refreshClubAuthority(args), { refreshed: false });
    assert.equal(reads.length, reason.startsWith("budget") ? 0 : 1);
    assert.equal(sends.some(item => item.operation === "club_authority"), false);
    assert.equal(args.accountBudget.remaining(now), 8);
    assert.equal(args.integrationBudget.remaining(now), 8);
  });
}
test("authority sends validated role labels from the same two reads without forwarding permissions", async () => {
  const { args, sends, reads } = setup();
  const request = args.provider.request;
  const roleId = "grol_00000000-0000-0000-0000-000000000001";
  args.provider.request = async path => {
    const value = await request(path);
    return path === "/auth/user" ? value : { ...value, roles: [{ id: roleId, name: "Moderators", permissions: ["*"], description: "Private metadata" }] };
  };
  await refreshClubAuthority(args);
  assert.equal(reads.length, 2);
  assert.deepEqual(sends[1].body.roles, [{ roleId, name: "Moderators" }]);
  assert.deepEqual(sends[1].body.authority.permissions, ["group-audit-view"]);
});
