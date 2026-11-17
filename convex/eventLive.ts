import type { Doc, Id } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery, query, type DatabaseReader } from "./_generated/server";
import { getPublicEventBySlug } from "./_eventPublic";
import { eventLiveSource, dueLiveSources, LIVE_FRESHNESS_MS, LIVE_SCAN_LIMIT, LIVE_SOURCE_LIMIT, sourceValidator, liveStatus } from "./_eventLive";
import { UNKNOWN_EVENT_END_WINDOW_MS, timedEventRuntimeEndAt } from "./_eventRuntime";
import { eventPathForSlugs } from "./_eventPaths";

const cursor = v.union(v.string(), v.null());
export const twitchTokenValidator = v.object({ cipher: v.string(), expiresAt: v.number(), fingerprint: v.string() });
const candidate = v.object({ eventId: v.id("events"), source: sourceValidator });
const activeEvent = v.object({ eventId: v.id("events"), endAt: v.number() });
const identity = v.object({ slug: v.string(), displayName: v.string() });
export const liveEntryValidator = v.object({
  eventId: v.id("events"), eventSlug: v.string(), href: v.string(), title: v.string(), sourceKey: v.string(), expiresAt: v.number(),
  imageUrl: v.optional(v.string()), host: v.optional(identity), hostName: v.optional(v.string()),
  performer: v.optional(identity), performerLabel: v.optional(v.string()),
});
export type LiveEntry = Infer<typeof liveEntryValidator>;
export const enabled = () => process.env.EVENT_LIVE_ENABLED === "true";

export const claimRefresh = internalMutation({
  args: {}, returns: v.union(v.null(), v.object({ token: v.string(), startsCursor: cursor, endsCursor: cursor, startsAt: v.number(), endsAt: v.number(), twitchRetryAt: v.optional(v.number()), twitchToken: v.optional(twitchTokenValidator) })),
  handler: async ctx => {
    if (!enabled()) return null;
    const now = Date.now();
    const state = await ctx.db.query("eventLiveRefresh").withIndex("by_key", q => q.eq("key", "home")).unique();
    if (state && state.leaseUntil > now) return null;
    const token = crypto.randomUUID();
    const startsAt = state?.startsCursor && state.startsAt !== undefined ? state.startsAt : now;
    const endsAt = state?.endsCursor && state.endsAt !== undefined ? state.endsAt : now;
    const startsCursor = state?.startsAt === undefined ? null : state.startsCursor;
    const endsCursor = state?.endsAt === undefined ? null : state.endsCursor;
    const next = { token, leaseUntil: now + 55_000, startsAt, endsAt, startsCursor, endsCursor };
    if (state) await ctx.db.patch(state._id, next);
    else await ctx.db.insert("eventLiveRefresh", { key: "home", ...next });
    for (const table of ["eventLiveEntries", "eventLiveObservations"] as const) {
      const expired = await ctx.db.query(table).withIndex("by_expiresAt", q => q.lt("expiresAt", now - 86_400_000)).take(100);
      for (const row of expired) await ctx.db.delete(row._id);
    }
    const expiredCandidates = await ctx.db.query("eventLiveCandidates").withIndex("by_endAt", q => q.lt("endAt", now - 86_400_000)).take(100);
    for (const row of expiredCandidates) await ctx.db.delete(row._id);
    return { token, startsCursor, endsCursor, startsAt, endsAt, ...(state?.twitchRetryAt === undefined ? {} : { twitchRetryAt: state.twitchRetryAt }), ...(state?.twitchToken ? { twitchToken: state.twitchToken } : {}) };
  },
});
async function projectCandidates(db: DatabaseReader, rows: readonly (Doc<"events"> | null)[], now: number) {
  const candidates: Array<Infer<typeof candidate>> = [];
  const events: Array<{ eventId: Id<"events">; endAt: number }> = [];
  for (const event of rows) {
    if (!event || event.publicationState !== "published" || event.eventStatus !== "scheduled" ||
      event.startAt === undefined || event.startAt > now || timedEventRuntimeEndAt({ startAt: event.startAt, endAt: event.endAt }) <= now) continue;
    try {
      const projected = await getPublicEventBySlug(db, event, { includeAssociationMediaKits: false, playbackOnly: true });
      if (!projected || projected.scheduleKind === "date_only") continue;
      events.push({ eventId: event._id, endAt: timedEventRuntimeEndAt({ startAt: event.startAt, endAt: event.endAt }) });
      const selected = eventLiveSource(projected, now);
      if (selected) candidates.push({ eventId: event._id, source: { key: selected.key, provider: selected.provider, identity: selected.identity } });
    } catch { /* One malformed event must not park the discovery page. */ }
  }
  return { candidates, events };
}
export const refreshCandidates = internalQuery({
  args: { phase: v.union(v.literal("starts"), v.literal("ends")), cursor, anchorAt: v.number() }, returns: v.object({ candidates: v.array(candidate), events: v.array(activeEvent), cursor }),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.anchorAt) || args.anchorAt > Date.now()) throw new Error("Invalid discovery window");
    const source = args.phase === "starts"
      ? ctx.db.query("events").withIndex("by_publicationState_eventStatus_startAt", q => q.eq("publicationState", "published").eq("eventStatus", "scheduled").gte("startAt", args.anchorAt - UNKNOWN_EVENT_END_WINDOW_MS).lte("startAt", args.anchorAt))
      : ctx.db.query("events").withIndex("by_publicationState_eventStatus_endAt", q => q.eq("publicationState", "published").eq("eventStatus", "scheduled").gte("endAt", args.anchorAt));
    const page = await source.paginate({ cursor: args.cursor, numItems: LIVE_SCAN_LIMIT, maximumRowsRead: LIVE_SCAN_LIMIT });
    return { ...await projectCandidates(ctx.db, page.page, Date.now()), cursor: page.isDone ? null : page.continueCursor };
  },
});
export const refreshRemembered = internalQuery({
  args: {}, returns: v.object({ candidates: v.array(candidate), events: v.array(activeEvent), visited: v.array(v.id("events")) }),
  handler: async ctx => {
    const remembered = await ctx.db.query("eventLiveCandidates").withIndex("by_checkedAt").take(LIVE_SCAN_LIMIT);
    return { ...await projectCandidates(ctx.db, await Promise.all(remembered.map(row => ctx.db.get(row.eventId))), Date.now()), visited: remembered.map(row => row.eventId) };
  },
});
export const selectSources = internalQuery({
  args: { candidates: v.array(candidate) }, returns: v.object({ candidates: v.array(candidate), sources: v.array(sourceValidator) }),
  handler: async (ctx, args) => {
    if (args.candidates.length > 3 * LIVE_SCAN_LIMIT) throw new Error("Live refresh exceeds its scan budget");
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
  args: { token: v.string(), startsCursor: cursor, endsCursor: cursor, events: v.optional(v.array(activeEvent)), visited: v.optional(v.array(v.id("events"))), twitchRetryAt: v.optional(v.number()), twitchToken: v.optional(v.union(v.null(), twitchTokenValidator)), candidates: v.array(candidate), observations: v.array(v.object({ source: sourceValidator, status: liveStatus, observedAt: v.number() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("eventLiveRefresh").withIndex("by_key", q => q.eq("key", "home")).unique();
    if (!state || state.token !== args.token || state.leaseUntil < Date.now()) return null;
    if (args.observations.length > LIVE_SOURCE_LIMIT || args.candidates.length > 3 * LIVE_SCAN_LIMIT) throw new Error("Live refresh exceeds its budget");
    if ((args.events?.length ?? 0) > 3 * LIVE_SCAN_LIMIT || (args.visited?.length ?? 0) > LIVE_SCAN_LIMIT) throw new Error("Live membership exceeds its budget");
    const active = new Map((args.events ?? []).map(event => [event.eventId, event]));
    const visited = new Set(args.visited ?? []);
    for (const eventId of visited) {
      if (active.has(eventId)) continue;
      const row = await ctx.db.query("eventLiveCandidates").withIndex("by_eventId", q => q.eq("eventId", eventId)).unique();
      if (row) await ctx.db.delete(row._id);
    }
    for (const event of active.values()) {
      if (!Number.isFinite(event.endAt) || event.endAt <= Date.now()) continue;
      const row = await ctx.db.query("eventLiveCandidates").withIndex("by_eventId", q => q.eq("eventId", event.eventId)).unique();
      if (row) await ctx.db.patch(row._id, { endAt: event.endAt, ...(visited.has(event.eventId) ? { checkedAt: Date.now() } : {}) });
      else await ctx.db.insert("eventLiveCandidates", { ...event, checkedAt: Date.now() });
    }
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
  const observations = await db.query("eventLiveObservations").withIndex("by_status_expiresAt", q => q.eq("status", "live").gt("expiresAt", now)).order("desc").take(101);
  const result: LiveEntry[] = [];
  let complete = observations.length <= 100;
  let projections = 0;
  liveSources: for (const observation of observations.slice(0, 100)) {
    if (observation.observedAt > now) continue;
    const entries = await db.query("eventLiveEntries").withIndex("by_sourceKey_expiresAt", q => q.eq("sourceKey", observation.sourceKey).gt("expiresAt", now)).take(101);
    if (entries.length > 100) complete = false;
    for (const entry of entries.slice(0, 100)) {
      if (projections >= 24) { complete = false; break liveSources; }
      projections++;
      try {
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
      } catch { complete = false; }
    }
  }
  return { entries: result.sort((a, b) => a.title.localeCompare(b.title) || a.eventId.localeCompare(b.eventId)), complete };
}
export const listPublic = query({ args: {}, returns: v.object({ entries: v.array(liveEntryValidator), complete: v.boolean() }), handler: async ctx => publicEntries(ctx.db) });
