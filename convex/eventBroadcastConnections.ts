import { mutation, query } from "./_generated/server";
import { sanitizeEventMediaPublicLinks,eventMediaPublicLinkValidator } from "./_eventMediaControl";
import { v } from "convex/values";
import { requireActiveBrowserSessionSubject } from "./_browserSessionAuthority";
import { getMediaManageableEventBySlug, getOrCreateEventMediaProgram, getLatestEventMediaProgram, requireStoppedOutputSessions, eventOutputConfigurationLocked } from "./events";
import { connectionProvider, normalizeConnection, managedSecretName, managedSecretRefAllowed } from "./_eventBroadcastConnections";
import type { DatabaseReader } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { connectionTestProjection, projection as connectionTestValidator } from "./eventBroadcastConnectionTests";
import { parseVrcdnStreamLinks } from "./_vrcdnLinks";
const connectionMetadataValidator=v.union(v.null(),v.object({outputId:v.id("eventMediaOutputs"),revision:v.number(),provider:connectionProvider,serverUrl:v.string(),playbackLinks:v.array(eventMediaPublicLinkValidator),testState:v.union(v.literal("not_tested"),v.literal("passed"),v.literal("failed"))}));
async function primaryOutput(db: DatabaseReader, program: Doc<"eventMediaPrograms"> | null) {
  if (!program) return null;
  const selected = program.currentOutputId ? await db.get(program.currentOutputId) : null;
  if (selected?.programId === program._id && selected.eventId === program.eventId) return selected;
  return db.query("eventMediaOutputs").withIndex("by_programId_key", q => q.eq("programId", program._id).eq("key", "primary")).unique();
}
function metadata(output: Doc<"eventMediaOutputs"> | null) {
  if (!output) return null;
  return { outputId: output._id, revision: output.managedConnection?.revision ?? 0, provider: output.managedConnection?.provider ?? (output.type === "vrcdn" ? "vrcdn" as const : "twitch" as const), serverUrl: output.managedConnection?.serverUrl ?? "", playbackLinks: output.playbackLinks, testState: output.managedConnection?.testState ?? "not_tested" as const };
}
export const getSetup = query({
  args: { currentSlug: v.string() }, returns:v.object({connection:connectionMetadataValidator,activeTest:v.union(v.null(),connectionTestValidator),canConfigure:v.boolean()}),handler: async (ctx, args) => {
    const { subject } = await requireActiveBrowserSessionSubject(ctx);
    const { event } = await getMediaManageableEventBySlug(ctx, args.currentSlug, subject);
    const program = await getLatestEventMediaProgram(ctx.db, event._id);
    const output = await primaryOutput(ctx.db, program);
    const test = await ctx.db.query("eventBroadcastConnectionTests").withIndex("by_eventId_createdAt",q=>q.eq("eventId",event._id)).order("desc").first();
    return { connection: metadata(output), activeTest: test && test.outputId === output?._id && test.revision === output?.managedConnection?.revision ? await connectionTestProjection(ctx,test) : null, canConfigure: !program || !await eventOutputConfigurationLocked(ctx.db, program) };
  }
});
export const prepareConnection = mutation({
  args: { currentSlug: v.string(), provider: connectionProvider, serverUrl: v.string(), playbackUrl: v.string(), expectedRevision: v.number(), requestId: v.string(), replaceKey: v.boolean(), credentialDigest: v.string(), permissionsAccepted: v.boolean() },returns:v.object({grantId:v.id("eventBroadcastConnectionGrants"),secretName:v.string(),credentialRef:v.union(v.null(),v.string()),connection:connectionMetadataValidator}),handler: async (ctx, args) => {
    const { subject } = await requireActiveBrowserSessionSubject(ctx);
    const { event } = await getMediaManageableEventBySlug(ctx, args.currentSlug, subject);
    if (event.eventStatus !== "scheduled" || !event.communityProfileId) throw Error("This event cannot configure a broadcast.");
    if (!/^(?:[a-f0-9]{64})?$/.test(args.credentialDigest) || args.replaceKey !== !!args.credentialDigest) throw Error("Invalid connection request.");
    if (!args.permissionsAccepted) throw Error("Confirm permission to broadcast this content and use this destination.");
    if(!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<0)throw Error("Invalid connection revision.");
    const normalized = normalizeConnection(args);
    const programId = await getOrCreateEventMediaProgram(ctx.db, event, Date.now());
    await requireStoppedOutputSessions(ctx.db, programId);
    const output = await primaryOutput(ctx.db, await ctx.db.get(programId));
    const name = managedSecretName(event.communityProfileId, event._id, args.requestId);
    const old = await ctx.db.query("eventBroadcastConnectionGrants").withIndex("by_event_request", q => q.eq("eventId", event._id).eq("requestId", args.requestId)).unique();
    const payload = JSON.stringify({ ...normalized, currentSlug: args.currentSlug, provider: args.provider, expectedRevision: args.expectedRevision, replaceKey: args.replaceKey, credentialDigest: args.credentialDigest });
    if (old) { if (old.expiresAt < Date.now() && !old.outputId) throw Error("Connection request expired."); if (old.actor !== JSON.stringify(subject) || old.payload !== payload) throw Error("Connection request already used."); return { grantId: old._id, secretName: name, credentialRef: args.replaceKey ? null : output?.credential?.secretRef ?? null, connection: old.outputId ? metadata(await ctx.db.get(old.outputId)) : null }; }
    if ((output?.managedConnection?.revision ?? 0) !== args.expectedRevision) throw Error("Connection changed. Reload and try again.");
    if (!args.replaceKey && (!output?.managedConnection || output.managedConnection.provider !== args.provider || output.managedConnection.serverUrl !== normalized.serverUrl)) throw Error("Enter a stream key for this connection.");
    const grantId = await ctx.db.insert("eventBroadcastConnectionGrants", { eventId: event._id, programId, communityProfileId: event.communityProfileId, actor: JSON.stringify(subject), requestId: args.requestId, payload, provider: args.provider, ...normalized, replaceKey: args.replaceKey, expectedRevision: args.expectedRevision, expiresAt: Date.now() + 120000 });
    return { grantId, secretName: name, credentialRef: args.replaceKey ? null : output?.credential?.secretRef ?? null, connection: null };
  }
});
export const commitConnection = mutation({
  args: { grantId: v.id("eventBroadcastConnectionGrants"), brokerToken: v.string(), credentialRef: v.string() },returns:v.object({connection:connectionMetadataValidator}),handler: async (ctx, args) => {
    const configured = process.env.VRDEX_EVENT_OUTPUT_BROKER_TOKEN;
    if (!configured || configured.length < 32 || args.brokerToken !== configured) throw Error("Connection service unavailable.");
    const { subject } = await requireActiveBrowserSessionSubject(ctx);
    const grant = await ctx.db.get(args.grantId); if (!grant || grant.actor !== JSON.stringify(subject)) throw Error("Connection request unavailable.");
    const event = await ctx.db.get(grant.eventId); if (!event || event.communityProfileId !== grant.communityProfileId || event.eventStatus !== "scheduled") throw Error("Event unavailable.");
    await getMediaManageableEventBySlug(ctx, JSON.parse(grant.payload).currentSlug ?? "", subject);
    if (grant.outputId) return { connection: metadata(await ctx.db.get(grant.outputId)) };
    if (grant.expiresAt < Date.now()) throw Error("Connection request expired.");
    await requireStoppedOutputSessions(ctx.db, grant.programId);
    const output = await primaryOutput(ctx.db, await ctx.db.get(grant.programId));
    if ((output?.managedConnection?.revision ?? 0) !== grant.expectedRevision) throw Error("Connection changed. Reload and try again.");
    if (grant.replaceKey ? !managedSecretRefAllowed(args.credentialRef, grant.communityProfileId, event._id, grant.requestId) : args.credentialRef !== output?.credential?.secretRef) throw Error("Invalid connection credential reference.");
    const stream = parseVrcdnStreamLinks(grant.playbackUrl);
    const playbackLinks = sanitizeEventMediaPublicLinks(stream && !stream.directVideoUrl ? [{platform:"browser",url:stream.hlsUrl},{platform:"pc",url:stream.pcUrl},{platform:"standalone",url:stream.questUrl}] : [{platform:"browser",url:grant.playbackUrl}]);
    const now = Date.now(); const data = { programId: grant.programId, eventId: event._id, key: output?.key ?? "primary", type: grant.provider === "vrcdn" ? "vrcdn" as const : "external_rtmp" as const, accountModel: "operator_owned" as const, state: "ready" as const, label: grant.provider === "vrcdn" ? "VRCDN" : grant.provider === "twitch" ? "Twitch" : "Custom", credential: { storage: "operator_secret_store" as const, secretRef: args.credentialRef, authorizedAt: now, authorizedBy: subject }, managedConnection: { communityProfileId: grant.communityProfileId, provider: grant.provider, serverUrl: grant.serverUrl, revision: grant.expectedRevision + 1, requestId: grant.replaceKey ? grant.requestId : output!.managedConnection!.requestId, testState: "not_tested" as const }, compliance: { sourceConsent: "accepted" as const, destinationAuthority: "accepted" as const, providerRules: "accepted" as const, rightsClearedMedia: "accepted" as const }, playbackLinks, updatedAt: now };
    const outputId = output ? output._id : await ctx.db.insert("eventMediaOutputs", { ...data, createdAt: now }); if (output) await ctx.db.patch(outputId, { ...data, vrcdnSetup: undefined, twitchSetup: undefined });
    await ctx.db.patch(grant._id, { outputId }); await ctx.db.patch(grant.programId, { currentOutputId: outputId, publicLinks: data.playbackLinks, state: "ready", updatedAt: now });
    return { connection: metadata(await ctx.db.get(outputId)) };
  }
});
export const abandonConnection = mutation({
  args: { grantId: v.id("eventBroadcastConnectionGrants"), brokerToken: v.string() },returns:v.object({canDelete:v.boolean()}),handler: async (ctx, args) => {
    const configured = process.env.VRDEX_EVENT_OUTPUT_BROKER_TOKEN;
    if (!configured || configured.length < 32 || args.brokerToken !== configured) throw Error("Connection service unavailable.");
    const { subject } = await requireActiveBrowserSessionSubject(ctx); const grant = await ctx.db.get(args.grantId);
    if (!grant || grant.actor !== JSON.stringify(subject)) throw Error("Connection request unavailable.");
    if (grant.outputId) return { canDelete: false };
    await ctx.db.patch(grant._id, { expiresAt: 0 }); return { canDelete: true };
  }
});
