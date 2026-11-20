import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { requireHostedSmokeFixture } from "./_previewPersistence";
import { coverageStateValidator, DEFAULT_PUBLIC_TELEMETRY_SETTINGS } from "./_communityTelemetry";
import { getActiveProfileOwner, grantProfileOwner } from "./_profileOwnership";
import type { Id } from "./_generated/dataModel";

const marker = "sandbox-bitrate-design-snapshot-v1";
const point = v.object({ at: v.number(), population: v.number(), userCount: v.optional(v.number()), queueSize: v.optional(v.number()), platforms: v.optional(v.record(v.string(), v.number())), coverageState: coverageStateValidator });
const snapshot = v.object({
  sourceCommunityId: v.literal("m5787kgxnvgygm02jjvp4gdfd58bacb2"),
  displayName: v.literal("BITRATE"), headline: v.optional(v.string()),
  events: v.array(v.object({
    sourceId: v.string(), slug: v.string(), title: v.string(), startAt: v.number(), endAt: v.optional(v.number()), timezone: v.optional(v.string()), posterImageUrl: v.optional(v.string()), sessionIds: v.array(v.string()),
    slots: v.array(v.object({ startAt: v.number(), endAt: v.optional(v.number()), displayLabel: v.string(), roleLabel: v.string() })),
  })),
  sessions: v.array(v.object({
    sourceId: v.string(), providerInstanceId: v.string(), providerLocation: v.string(), vrchatWorldId: v.string(), worldName: v.optional(v.string()), openedAt: v.number(), lastObservedAt: v.number(), closedAt: v.optional(v.number()), state: v.union(v.literal("open"), v.literal("closed")), points: v.array(point),
  })),
  coverage: v.array(v.object({ state: coverageStateValidator, startedAt: v.number(), endedAt: v.optional(v.number()), observedThroughAt: v.optional(v.number()) })),
});

export const importBitrate = internalMutation({
  args: { expectedDeploymentUrl: v.string(), ownerUserId: v.id("users"), snapshot },
  handler: async (ctx, args) => {
    requireHostedSmokeFixture();
    if (process.env.VRDEX_DEPLOYMENT_ENV !== "preview" || process.env.CONVEX_CLOUD_URL !== args.expectedDeploymentUrl) throw new Error("Import requires the exact sandbox preview.");
    const data = args.snapshot;
    if (data.events.length > 5 || !data.sessions.length || data.sessions.length > 5 || data.coverage.length > 100 || data.events.some(e => e.slots.length > 80) || data.sessions.some(s => s.points.length > 2000)) throw new Error("Snapshot exceeds the design-copy bounds.");
    if (!await ctx.db.get(args.ownerUserId)) throw new Error("Sign in to sandbox first.");
    const existing = await ctx.db.query("profiles").withIndex("by_slug", q => q.eq("slug", "bitrate")).unique();
    if (existing) {
      const owner = await getActiveProfileOwner(ctx.db, existing._id);
      if (existing.publicSurfacingReason !== marker || owner?.userId !== args.ownerUserId) throw new Error("Refusing to overwrite an existing community.");
      const sessions = await ctx.db.query("instanceSessions").withIndex("by_communityProfileId_openedAt", q => q.eq("communityProfileId", existing._id)).collect();
      return { profileId: existing._id, sessionIds: sessions.map(s => s._id), alreadyImported: true };
    }
    const sourceSessions = new Set(data.sessions.map(s => s.sourceId));
    if (sourceSessions.size !== data.sessions.length || new Set(data.events.map(e => e.slug)).size !== data.events.length || data.events.some(e => e.sessionIds.some(id => !sourceSessions.has(id)))) throw new Error("Snapshot references are inconsistent.");
    for (const e of data.events) {
      if (await ctx.db.query("events").withIndex("by_slug", q => q.eq("slug", e.slug)).first()) throw new Error("An event slug is already in use.");
    }
    const now = Date.now();
    const profileId = await ctx.db.insert("profiles", {
      slug: "bitrate", displayName: data.displayName, sortName: "bitrate", headline: data.headline,
      profileType: "community", aliases: [], tags: [], community: { categoryTags: [] },
      claimState: "claimed_verified", publicationState: "published", publicSurfacingState: "opted_out", publicSurfacingReason: marker, creationSource: "moderator", updatedAt: now,
    });
    await grantProfileOwner(ctx.db, { profileId, userId: args.ownerUserId, now });
    const epoch = Math.min(...data.sessions.map(s => s.openedAt));
    const integrationId = await ctx.db.insert("communityVrchatIntegrations", {
      communityProfileId: profileId, collectionScope: { kind: "managed", communityProfileId: profileId }, publicationPolicy: "managed_categories",
      vrchatGroupId: "grp_ef380aca-118b-4325-9eaf-011a3bdf4c9c", groupVisibility: "public", joinPolicy: "free", state: "active",
      enabledFeatures: ["analytics"], namedMembershipCollectionEnabled: false, killSwitchEnabled: true,
      requestsPerMinute: 4, leaseGeneration: 0, consecutiveFailures: 0, publicMetrics: { ...DEFAULT_PUBLIC_TELEMETRY_SETTINGS }, telemetryEpochStartedAt: epoch, createdAt: epoch, updatedAt: now,
    });
    const sessions = new Map<string, Id<"instanceSessions">>();
    for (const source of data.sessions) {
      const worldId = source.worldName ? await ctx.db.insert("worlds", {
        slug: `sandbox-bitrate-${sessions.size + 1}`, displayName: source.worldName, sortName: source.worldName.toLowerCase(), vrchatWorldId: source.vrchatWorldId,
        tags: [], visibilityStatus: "public", platformCompatibility: [], media: [], creatorAttributions: [], outboundLinks: [], publicationState: "published", creationSource: "moderator", updatedAt: now,
      }) : undefined;
      const sessionId = await ctx.db.insert("instanceSessions", {
        integrationId, communityProfileId: profileId, worldId, providerInstanceId: source.providerInstanceId, providerLocation: source.providerLocation, vrchatWorldId: source.vrchatWorldId,
        state: source.state, openedAt: source.openedAt, lastObservedAt: source.lastObservedAt, closedAt: source.closedAt, source: "first_party", consecutiveMisses: 0, updatedAt: source.lastObservedAt,
      });
      sessions.set(source.sourceId, sessionId);
      for (const [index, p] of source.points.entries()) {
        await ctx.db.insert("instancePopulationObservations", {
          integrationId, sessionId, providerInstanceId: source.providerInstanceId, vrchatWorldId: source.vrchatWorldId,
          idempotencyKey: `${marker}:${source.sourceId}:${index}`, observedAt: p.at, population: p.population, userCount: p.userCount, queueSize: p.queueSize, platforms: p.platforms, coverageState: p.coverageState, source: "first_party", collectorVersion: marker, fencingToken: 0,
        });
      }
    }
    for (const window of data.coverage) await ctx.db.insert("collectionCoverageWindows", { ...window, integrationId, source: "first_party", collectorVersion: marker, updatedAt: now });
    for (const source of data.events) {
      const eventId = await ctx.db.insert("events", {
        communityProfileId: profileId, slug: source.slug, title: source.title, sortTitle: source.title.toLowerCase(), startAt: source.startAt, endAt: source.endAt, timezone: source.timezone, posterImageUrl: source.posterImageUrl,
        sourceType: "manual", sourceLabel: marker, publicationState: "published", eventStatus: "scheduled", publishedAt: now, updatedAt: now,
      });
      for (const [position, slot] of source.slots.entries()) await ctx.db.insert("eventSlots", { ...slot, eventId, position, reviewState: "confirmed", confidence: 1, sourceType: "manual", sourceLabel: marker, updatedAt: now });
      for (const sourceId of source.sessionIds) await ctx.db.insert("eventInstanceAssociations", { communityProfileId: profileId, eventId, sessionId: sessions.get(sourceId)!, source: "manual", confidence: 1, state: "confirmed", reviewedAt: now, createdAt: now, updatedAt: now });
    }
    return { profileId, sessionIds: [...sessions.values()], alreadyImported: false };
  },
});
