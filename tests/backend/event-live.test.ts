import assert from "node:assert/strict";
import { test, before, after, mock } from "node:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../convex/_generated/api";
import schemaModule from "../../convex/schema";
import type { Doc } from "../../convex/_generated/dataModel";
const schema = (schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule;
const modules = { "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"), "../../convex/eventLive.ts": () => import("../../convex/eventLive"), "../../convex/eventLiveActions.ts": () => import("../../convex/eventLiveActions") };
const previous = process.env.EVENT_LIVE_ENABLED;
before(() => { process.env.EVENT_LIVE_ENABLED = "true"; });
after(() => { if (previous === undefined) delete process.env.EVENT_LIVE_ENABLED; else process.env.EVENT_LIVE_ENABLED = previous; });
const person = { slug: "aurora", displayName: "Aurora", sortName: "aurora", profileType: "person", person: { roleTags: [] }, aliases: [], tags: [], claimState: "unclaimed", creationSource: "self", publicationState: "published", publicSurfacingState: "public", updatedAt: 1,
  outboundLinks: [{ type: "vrcdn", label: "Stream", url: "vrcdn:aurora", source: "owner_authored" }] } satisfies Omit<Doc<"profiles">, "_id" | "_creationTime">;
async function fixture(count = 1) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ({ db }) => {
    const profileId = await db.insert("profiles", person);
    const events = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const eventId = await db.insert("events", { slug: `night-${i}`, title: "Night", sortTitle: "night", startAt: now - 1000, endAt: now + 600_000, eventStatus: "scheduled", publicationState: "published", sourceType: "community", sourceLabel: "Fixture", updatedAt: now });
      const slotId = await db.insert("eventSlots", { eventId, personProfileId: profileId, position: 0, startAt: now - 1000, displayLabel: "Aurora", roleLabel: "DJ", sourceType: "community", sourceLabel: "Fixture", confidence: 1, reviewState: "confirmed", updatedAt: now });
      events.push({ eventId, slotId });
    }
    return { profileId, events };
  });
  return { t, ...ids };
}
async function recordLive(t: ReturnType<typeof convexTest>) {
  const claim = await t.mutation(internal.eventLive.claimRefresh, {});
  assert.ok(claim);
  const starts = await t.query(internal.eventLive.refreshCandidates, { phase: "starts", cursor: claim.startsCursor });
  const ends = await t.query(internal.eventLive.refreshCandidates, { phase: "ends", cursor: claim.endsCursor });
  const page = await t.query(internal.eventLive.selectSources, { candidates: [...starts.candidates, ...ends.candidates] });
  await t.mutation(internal.eventLive.finishRefresh, { token: claim.token, startsCursor: starts.cursor, endsCursor: ends.cursor, candidates: page.candidates, observations: page.sources.map(source => ({ source, status: "live" as const, observedAt: Date.now() })) });
  return page;
}
test("multiple events sharing a current source require one provider observation", async () => {
  const { t } = await fixture(2);
  const page = await recordLive(t);
  assert.equal(page.sources.length, 1);
  assert.equal(page.candidates.length, 2);
  const entries = await t.query(api.eventLive.listPublic, {});
  assert.equal(entries.length, 2);
  assert.equal(entries[0].performer?.slug, "aurora");
  assert.equal(await t.query(api.eventLive.forPerformer, { slug: "aurora" }), null, "do not guess an event association");
});
test("source changes, hidden performers and unpublished events invalidate fresh cached entries", async () => {
  const { t, profileId, events } = await fixture();
  await recordLive(t);
  assert.equal((await t.query(api.eventLive.listPublic, {})).length, 1);
  await t.run(ctx => ctx.db.patch(profileId, { outboundLinks: [{ type: "vrcdn", label: "Other", url: "vrcdn:replacement", source: "owner_authored" }] }));
  assert.deepEqual(await t.query(api.eventLive.listPublic, {}), []);
  await t.run(ctx => ctx.db.patch(profileId, { outboundLinks: person.outboundLinks }));
  assert.equal((await t.query(api.eventLive.listPublic, {})).length, 1);
  await t.run(ctx => ctx.db.patch(profileId, { publicSurfacingState: "suppressed" }));
  assert.deepEqual(await t.query(api.eventLive.listPublic, {}), []);
  await t.run(ctx => ctx.db.patch(profileId, { publicSurfacingState: "public" }));
  await t.run(ctx => ctx.db.patch(events[0].eventId, { publicationState: "draft_private" }));
  assert.deepEqual(await t.query(api.eventLive.listPublic, {}), []);
});
test("lease excludes overlapping refreshes, recovers expiry, and rejects a stale writer", async () => {
  const { t } = await fixture();
  const first = await t.mutation(internal.eventLive.claimRefresh, {});
  assert.ok(first);
  assert.equal(await t.mutation(internal.eventLive.claimRefresh, {}), null);
  await t.run(async ctx => { const state = await ctx.db.query("eventLiveRefresh").unique(); assert.ok(state); await ctx.db.patch(state._id, { leaseUntil: 0 }); });
  const second = await t.mutation(internal.eventLive.claimRefresh, {});
  assert.ok(second);
  assert.notEqual(first.token, second.token);
  await t.mutation(internal.eventLive.finishRefresh, { token: first.token, startsCursor: null, endsCursor: null, candidates: [], observations: [] });
  const state = await t.run(ctx => ctx.db.query("eventLiveRefresh").unique());
  assert.equal(state?.token, second.token);
  assert.ok(state!.leaseUntil > Date.now());
});
test("expired or unavailable observations never appear live", async () => {
  const { t } = await fixture();
  await recordLive(t);
  await t.run(async ctx => { const row = await ctx.db.query("eventLiveObservations").unique(); assert.ok(row); await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 }); });
  assert.deepEqual(await t.query(api.eventLive.listPublic, {}), []);
  await t.run(async ctx => { const row = await ctx.db.query("eventLiveObservations").unique(); assert.ok(row); await ctx.db.patch(row._id, { expiresAt: Date.now() + 90_000, status: "unavailable" }); });
  assert.deepEqual(await t.query(api.eventLive.listPublic, {}), []);
});
test("refresh remains inert and browse data hidden until explicitly enabled", async () => {
  const { t } = await fixture();
  await recordLive(t);
  delete process.env.EVENT_LIVE_ENABLED;
  try {
    assert.equal(await t.mutation(internal.eventLive.claimRefresh, {}), null);
    assert.deepEqual(await t.query(api.eventLive.listPublic, {}), []);
    await t.action(internal.eventLiveActions.refresh, {});
  } finally { process.env.EVENT_LIVE_ENABLED = "true"; }
});
test("anonymous clients cannot write observations through internal functions", async () => {
  const { t } = await fixture();
  const functions = await import("../../convex/eventLive");
  assert.equal(functions.claimRefresh.isInternal, true);
  assert.equal(functions.finishRefresh.isInternal, true);
  assert.deepEqual(await t.query(api.eventLive.listPublic, {}), []);
});



test("a full scheduled cycle deduplicates, caps concurrency, and rotates excess sources", async () => {
  const { t, events } = await fixture(25);
  await t.run(async ctx => {
    for (let i = 0; i < events.length; i++) {
      const profileId = await ctx.db.insert("profiles", { ...person, slug: `performer-${i}`, outboundLinks: [{ ...person.outboundLinks[0], url: `vrcdn:stream${i}` }] });
      await ctx.db.patch(events[i].slotId, { personProfileId: profileId });
    }
  });
  let calls = 0, active = 0, peak = 0, cancelled = 0;
  const fetcher = mock.method(globalThis, "fetch", async () => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 200 });
  });
  try {
    await t.action(internal.eventLiveActions.refresh, {});
    assert.equal(calls, 20);
    assert.equal(cancelled, 20);
    assert.ok(peak <= 4);
    await t.action(internal.eventLiveActions.refresh, {});
    assert.equal(calls, 25, "the next bounded page covers the five remaining sources");
    assert.equal((await t.run(ctx => ctx.db.query("eventLiveObservations").collect())).length, 25);
  } finally { fetcher.mock.restore(); }
});

test("Twitch app tokens stay encrypted and reused; missing credentials never trigger provider I/O", async () => {
  const { t, events } = await fixture();
  await t.run(ctx => ctx.db.patch(events[0].eventId, { watchSurfaceEnabled: true, watchMode: "event_stream", mediaLinks: [{ type: "watch", label: "Twitch", url: "https://twitch.tv/aurora", presentation: "open" }] }));
  const original = { id: process.env.TWITCH_CLIENT_ID, secret: process.env.TWITCH_CLIENT_SECRET, key: process.env.VRDEX_CONNECTOR_TOKEN_KEY };
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
  let tokenCalls = 0, streamCalls = 0;
  const fetcher = mock.method(globalThis, "fetch", async input => {
    if (String(input).startsWith("https://id.twitch.tv/")) { tokenCalls++; return Response.json({ access_token: "SYNTHETIC_TOKEN", expires_in: 3600 }); }
    streamCalls++;
    return Response.json({ data: [{ user_login: "aurora", title: "Set", started_at: "2026-11-12T00:00:00Z", game_name: "Music", viewer_count: 1 }] });
  });
  try {
    await t.action(internal.eventLiveActions.refresh, {});
    assert.equal(tokenCalls + streamCalls, 0);
    assert.deepEqual(await t.query(api.eventLive.listPublic, {}), []);
    process.env.TWITCH_CLIENT_ID = "SYNTHETIC_CLIENT";
    process.env.TWITCH_CLIENT_SECRET = "SYNTHETIC_SECRET";
    process.env.VRDEX_CONNECTOR_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
    await t.action(internal.eventLiveActions.refresh, {});
    await t.action(internal.eventLiveActions.refresh, {});
    assert.equal(tokenCalls, 1);
    assert.equal(streamCalls, 2);
    const stored = await t.run(ctx => ctx.db.query("eventLiveRefresh").unique());
    assert.ok(stored?.twitchToken?.cipher.startsWith("v1:"));
    assert.ok(!JSON.stringify(stored).includes("SYNTHETIC_TOKEN"));
    assert.ok(!JSON.stringify(await t.query(api.eventLive.listPublic, {})).includes("cipher"));
  } finally {
    fetcher.mock.restore();
    for (const [name, value] of [["TWITCH_CLIENT_ID", original.id], ["TWITCH_CLIENT_SECRET", original.secret], ["VRDEX_CONNECTOR_TOKEN_KEY", original.key]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  }
});

test("bounded discovery never guesses a unique DJ association from a truncated cache", async () => {
  const { t } = await fixture(25);
  await recordLive(t);
  await recordLive(t);
  assert.equal((await t.query(api.eventLive.listPublic, {})).length, 24);
  assert.equal(await t.query(api.eventLive.forPerformer, { slug: "aurora" }), null);
});

test("browse expiry stops at the current performer boundary before provider TTL", async () => {
  const { t, events } = await fixture();
  const boundary = Date.now() + 5000;
  await t.run(ctx => ctx.db.patch(events[0].slotId, { endAt: boundary }));
  await recordLive(t);
  const entries = await t.query(api.eventLive.listPublic, {});
  assert.equal(entries.length, 1);
  assert.equal(entries[0].expiresAt, boundary);
});
