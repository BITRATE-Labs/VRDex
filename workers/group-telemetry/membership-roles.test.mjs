import assert from "node:assert/strict";
import { test } from "node:test";
import { membershipRoleObservations } from "./membership-roles.mjs";
test("role observations retain only exact IDs and labels, never permission metadata", () => {
  const id = "grol_00000000-0000-0000-0000-00000000000a";
  assert.deepEqual(membershipRoleObservations([
    { id: id.toUpperCase(), name: "  Moderator  ", permissions: ["*"] },
    { id, name: "Duplicate" }, { id: "invalid", name: "Invalid" }, { id, name: "\u0000Invalid" },
  ]), [{ roleId: id, name: "Moderator" }]);
  assert.deepEqual(membershipRoleObservations(new Array(101).fill({ id, name: "Too many" })), []);
});
