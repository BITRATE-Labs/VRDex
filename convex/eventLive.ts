import type { Doc } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery, query, type DatabaseReader } from "./_generated/server";
import { getPublicEventBySlug } from "./_eventPublic";
import { eventLiveSource, dueLiveSources, LIVE_FRESHNESS_MS, LIVE_SCAN_LIMIT, LIVE_SOURCE_LIMIT, sourceValidator, liveStatus } from "./_eventLive";
import { UNKNOWN_EVENT_END_WINDOW_MS } from "./_eventRuntime";
import { eventPathForSlugs } from "./_eventPaths";

const cursor = v.union(v.string(), v.null());
export const twitchTokenValidator = v.object({ cipher: v.string(), expiresAt: v.number(), fingerprint: v.string() });
const candidate = v.object({ eventId: v.id("events"), source: sourceValidator });
const identity = v.object({ slug: v.string(), displayName: v.string() });
export const liveEntryValidator = v.object({
  eventId: v.id("events"), eventSlug: v.string(), href: v.string(), title: v.string(), sourceKey: v.string(), expiresAt: v.number(),
  imageUrl: v.optional(v.string()), host: v.optional(identity), hostName: v.optional(v.string()),
  performer: v.optional(identity), performerLabel: v.optional(v.string()),
});
export type LiveEntry = Infer<typeof liveEntryValidator>;
export const enabled = () => process.env.EVENT_LIVE_ENABLED === "true";

export const claimRefresh = internalMutation({
  args: {}, returns: v.union(v.null(), v.object({ token: v.string(), startsCursor: cursor, endsCursor: cursor, twitchRetryAt: v.optional(v.number()), twitchToken: v.optional(twitchTokenValidator) })),
  handler: async ctx => {
    if (!enabled()) return null;
    const now = Date.now();
    const state = await ctx.db.query("eventLiveRefresh").withIndex("by_key", q => q.eq("key", "home")).unique();
    if (state && state.leaseUntil > now) return null;
    const token = crypto.randomUUID();
    const next = { token, leaseUntil: now + 55_000 };
    if (state) await ctx.db.patch(state._id, next);
    else await ctx.db.insert("eventLiveRefresh", { key: "home", startsCursor: null, endsCursor: null, ...next });
    for (const table of ["eventLiveEntries", "eventLiveObservations"] as const) {
      const expired = await ctx.db.query(table).withIndex("by_expiresAt", q => q.lt("expiresAt", now - 86_400_000)).take(100);
      for (const row of expired) await ctx.db.delete(row._id);
    }
    return { token, startsCursor: state?.startsCursor ?? null, endsCursor: state?.endsCursor ?? null, ...(state?.twitchRetryAt === undefined ? {} : { twitchRetryAt: state.twitchRetryAt }), ...(state?.twitchToken ? { twitchToken: state.twitchToken } : {}) };
  },
});
export const refreshCandidates = internalQuery({
  args: { phase: v.union(v.literal("starts"), v.literal("ends")), cursor }, returns: v.object({ candidates: v.array(candidate), cursor }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const source = args.phase === "starts"
      ? ctx.db.query("events").withIndex("by_publicationState_eventStatus_startAt", q => q.eq("publicationState", "published").eq("eventStatus", "scheduled").gte("startAt", now - UNKNOWN_EVENT_END_WINDOW_MS).lte("startAt", now))
      : ctx.db.query("events").withIndex("by_publicationState_eventStatus_endAt", q => q.eq("publicationState", "published").eq("eventStatus", "scheduled").gte("endAt", now));
    const page = await source.paginate({ cursor: args.cursor, numItems: LIVE_SCAN_LIMIT, maximumRowsRead: LIVE_SCAN_LIMIT });
    const candidates = [];
    for (const event of page.page) {
      if (event.startAt === undefined || event.startAt > now) continue;
      const projected = await getPublicEventBySlug(ctx.db, event, { includeAssociationMediaKits: false, playbackOnly: true });
      const selected = projected && eventLiveSource(projected, now);
      if (selected) candidates.push({ eventId: event._id, source: { key: selected.key, provider: selected.provider, identity: selected.identity } });
    }
    return { candidates, cursor: page.isDone ? null : page.continueCursor };
  },
});
export const selectSources = internalQuery({
  args: { candidates: v.array(candidate) }, returns: v.object({ candidates: v.array(candidate), sources: v.array(sourceValidator) }),
  handler: async (ctx, args) => {
    if (args.candidates.length > 2 * LIVE_SCAN_LIMIT) throw new Error("Live refresh exceeds its scan budget");
    const candidates = [...new Map(args.candidates.map(candidate => [candidate.eventId, candidate])).values()];
    const observed = new Map<string, number>();
    for (const { source } of candidates) {
      if (observed.has(source.key)) continue;
      const entry = await ctx.db.query("eventLiveObservations").withIndex("by_sourceKey", q => q.eq("sourceKey", source.key)).unique();
      if (entry) observed.set(source.key, entry.observedAt);
    }
    const sources = dueLiveSources(candidates.map(c => c.source), observed);
    const selected = new Set(sources.map(s => s.key));
    return { candidates: candidates.filter(c => selected.has(c.source.key)), sources };
  },
});
export const finishRefresh = internalMutation({
  args: { token: v.string(), startsCursor: cursor, endsCursor: cursor, twitchRetryAt: v.optional(v.number()), twitchToken: v.optional(v.union(v.null(), twitchTokenValidator)), candidates: v.array(candidate), observations: v.array(v.object({ source: sourceValidator, status: liveStatus, observedAt: v.number() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("eventLiveRefresh").withIndex("by_key", q => q.eq("key", "home")).unique();
    if (!state || state.token !== args.token || state.leaseUntil < Date.now()) return null;
    if (args.observations.length > LIVE_SOURCE_LIMIT || args.candidates.length > 2 * LIVE_SCAN_LIMIT) throw new Error("Live refresh exceeds its budget");
    const expires = new Map<string, number>();
    for (const observation of args.observations) {
      if (!Number.isFinite(observation.observedAt) || observation.observedAt > Date.now() || observation.observedAt < Date.now() - 55_000) throw new Error("Invalid live observation time");
      const existing = await ctx.db.query("eventLiveObservations").withIndex("by_sourceKey", q => q.eq("sourceKey", observation.source.key)).unique();
      const record = { sourceKey: observation.source.key, provider: observation.source.provider, identity: observation.source.identity,
        status: observation.status, observedAt: observation.observedAt, expiresAt: observation.observedAt + LIVE_FRESHNESS_MS };
      if (existing) await ctx.db.patch(existing._id, record); else await ctx.db.insert("eventLiveObservations", record);
      expires.set(record.sourceKey, record.expiresAt);
    }
    for (const { eventId, source } of args.candidates) {
      const expiresAt = expires.get(source.key);
      if (expiresAt === undefined) continue;
      const existing = await ctx.db.query("eventLiveEntries").withIndex("by_eventId", q => q.eq("eventId", eventId)).unique();
      if (existing) await ctx.db.patch(existing._id, { sourceKey: source.key, expiresAt });
      else await ctx.db.insert("eventLiveEntries", { eventId, sourceKey: source.key, expiresAt });
    }
    await ctx.db.patch(state._id, { startsCursor: args.startsCursor, endsCursor: args.endsCursor, leaseUntil: 0, ...(args.twitchRetryAt === undefined ? {} : { twitchRetryAt: args.twitchRetryAt }), ...(args.twitchToken === undefined ? {} : { twitchToken: args.twitchToken ?? undefined }) });
    return null;
  },
});
async function publicEntries(db: DatabaseReader) {
  if (!enabled()) return { entries: [], complete: true };
  const now = Date.now();
  const entries = await db.query("eventLiveEntries").withIndex("by_expiresAt", q => q.gt("expiresAt", now)).order("desc").take(101);
  const result = [];
  const observations = new Map<string, Doc<"eventLiveObservations"> | null>();
  let complete = entries.length <= 100;
  let projections = 0;
  for (const entry of entries.slice(0, 100)) {
    let observation = observations.get(entry.sourceKey);
    if (observation === undefined) {
      observation = await db.query("eventLiveObservations").withIndex("by_sourceKey", q => q.eq("sourceKey", entry.sourceKey)).unique();
      observations.set(entry.sourceKey, observation);
    }
    if (!observation || observation.status !== "live" || observation.expiresAt <= now || observation.observedAt > now) continue;
    if (projections >= 24) { complete = false; break; }
    projections++;
    const event = await getPublicEventBySlug(db, await db.get(entry.eventId), { includeAssociationMediaKits: false, playbackOnly: true });
    const selected = event && eventLiveSource(event, now);
    if (!event || !selected || selected.key !== entry.sourceKey || selected.validUntil <= now) continue;
    const slot = event.slots.find(slot => slot.playbackKey === selected.slotKey);
    result.push({ eventId: entry.eventId, eventSlug: event.slug, href: event.communitySlug ? eventPathForSlugs(event.communitySlug, event.slug) : `/events/${event.slug}`,
      title: event.title, sourceKey: selected.key, expiresAt: Math.min(entry.expiresAt, observation.expiresAt, selected.validUntil),
      ...(event.thumbnailImageUrl || event.posterImageUrl || event.communityImageUrl ? { imageUrl: event.thumbnailImageUrl ?? event.posterImageUrl ?? event.communityImageUrl } : {}),
      ...(event.communitySlug && event.communityName ? { host: { slug: event.communitySlug, displayName: event.communityName } } : {}),
      ...(event.communityName ? { hostName: event.communityName } : {}),
      ...(slot?.performer ? { performer: { slug: slot.performer.slug, displayName: slot.performer.displayName } } : {}),
      ...(slot ? { performerLabel: slot.displayLabel } : {}),
    });
  }
  return { entries: result.sort((a, b) => a.title.localeCompare(b.title) || a.eventId.localeCompare(b.eventId)), complete };
}
export const listPublic = query({ args: {}, returns: v.array(liveEntryValidator), handler: async ctx => (await publicEntries(ctx.db)).entries });
export const forPerformer = query({ args: { slug: v.string() }, returns: v.union(v.null(), liveEntryValidator), handler: async (ctx, args) => {
  const projection = await publicEntries(ctx.db);
  if (!projection.complete) return null;
  const entries = projection.entries.filter(entry => entry.performer?.slug === args.slug);
  return entries.length === 1 ? entries[0] : null;
} });
