import assert from "node:assert/strict";
import { test } from "node:test";
import { hasEventOwnerMode } from "../../convex/_accountFeatures";
import type { Id } from "../../convex/_generated/dataModel";
import type { DatabaseReader } from "../../convex/_generated/server";

test("owner mode requires a current super-admin grant, community and expiration", async () => {
  const user = "operator" as Id<"users">;
  const community = "one" as Id<"profiles">;
  const other = "other" as Id<"profiles">;
  let mode: { communityProfileId: Id<"profiles">; expiresAt: number } | undefined;
  let admin = true;
  let publicCommunity = true;
  const db = {
    get: async (id: string) => id === community
      ? { profileType: "community", publicationState: "published", publicSurfacingState: publicCommunity ? "public" : "suppressed" }
      : { eventOwnerMode: mode },
    query: () => ({
      withIndex: () => ({
        collect: async () => admin ? [{ feature: "super_admin", state: "active" }] : [],
      }),
    }),
  } as unknown as DatabaseReader;
  assert.equal(await hasEventOwnerMode(db, user, community, 100), false);
  mode = { communityProfileId: community, expiresAt: 110 };
  assert.equal(await hasEventOwnerMode(db, user, community, 100), true);
  assert.equal(await hasEventOwnerMode(db, user, other, 100), false);
  assert.equal(await hasEventOwnerMode(db, user, community, 110), false);
  assert.equal(await hasEventOwnerMode(db, null, community, 100), false);
  publicCommunity = false;
  assert.equal(await hasEventOwnerMode(db, user, community, 100), false);
  publicCommunity = true;
  admin = false;
  assert.equal(await hasEventOwnerMode(db, user, community, 100), false);
});
