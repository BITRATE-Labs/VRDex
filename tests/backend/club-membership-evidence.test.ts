import assert from "node:assert/strict";
import { test } from "node:test";
import { recoverEvidence, recoveryWindow, recoveryProgress } from "../../convex/_clubMembershipRecovery";
const core = { auditId: "a", eventType: "group.member.role.assign", occurredAt: 1000, targetUserId: "usr_target" };
const roleId = "grol_00000000-0000-0000-0000-000000000001";
test("recovered evidence supplements only exact immutable events", () => {
  assert.deepEqual(recoverEvidence(core, { ...core, roleId, roleName: "Moderator" }), { roleId, roleName: "Moderator" });
  for (const mismatch of [{ auditId: "b" }, { eventType: "group.member.role.unassign" }, { occurredAt: 1001 }, { targetUserId: "other" }]) {
    assert.equal(recoverEvidence(core, { ...core, ...mismatch, roleId }), null);
  }
  assert.equal(recoverEvidence({ ...core, roleName: "Recorded" }, { ...core, roleId, roleName: "Current" }), null);
  assert.equal(recoverEvidence(core, { ...core, roleId, roleName: "Current" }, { roleName: "Prior" }), null);
  assert.deepEqual(recoverEvidence(core, { ...core, actorUserId: "bad", actorDisplayName: "Nobody", roleId: "bad", roleName: "\u0000bad" }), {});
  assert.deepEqual(recoverEvidence({ ...core, eventType: "group.member.join" }, { ...core, eventType: "group.member.join", roleId }), {});
});
test("recovery window intersects the current epoch with exactly thirty days", () => {
  const now = 40 * 86400_000;
  assert.deepEqual(recoveryWindow(1, now), { startAt: 10 * 86400_000, endAt: now });
  assert.deepEqual(recoveryWindow(now - 1000, now), { startAt: now - 1000, endAt: now });
  for (const epoch of [now, now + 1, Infinity, NaN, -1]) assert.throws(() => recoveryWindow(epoch, now));
});
test("raw entries and page caps produce honest partial results", () => {
  assert.deepEqual(recoveryProgress({ nextOffset: 9900, pages: 99 }, 100, false), { nextOffset: 10000, pages: 100, state: "partial" });
  assert.deepEqual(recoveryProgress({ nextOffset: 9900, pages: 99 }, 100, true), { nextOffset: 10000, pages: 100, state: "complete" });
  assert.deepEqual(recoveryProgress({ nextOffset: 99, pages: 99 }, 1, false), { nextOffset: 100, pages: 100, state: "partial" });
  assert.deepEqual(recoveryProgress({ nextOffset: 0, pages: 0 }, 0, true), { nextOffset: 0, pages: 1, state: "complete" });
  for (const count of [-1, 101, NaN, 0.5]) assert.throws(() => recoveryProgress({ nextOffset: 0, pages: 0 }, count, false));
  assert.throws(() => recoveryProgress({ nextOffset: 0, pages: 0 }, 0, false));
  assert.throws(() => recoveryProgress({ nextOffset: 10000, pages: 100 }, 1, true));
});
