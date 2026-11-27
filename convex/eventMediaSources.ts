import {disableSourceControl, sourceForSlot} from "./_eventBroadcastControl";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireActiveBrowserSessionSubject } from "./_browserSessionAuthority";
import { eventOutputConfigurationLocked, getLatestEventMediaProgram, getMediaManageableEventBySlug, getOpenEventMediaSession, getOrCreateEventMediaProgram, recordEventMediaAuditEvent } from "./events";
import { EVENT_BROADCAST_MAX_SOURCES } from "./_eventBroadcastInputs";
import { eventMediaSourceBroadcastInput, eventProfileBroadcastInputChoices, parseBroadcastInputUrl, broadcastInputPublicUrl, listUsableEventMediaSources, resolveBroadcastInput } from "./_eventBroadcastSources";
import { normalizeProfileInlineText } from "./_profileSubmissions";

function sourceLabel(value: string): string {
  const label = normalizeProfileInlineText(value);
  if (label.length < 1 || label.length > 120) throw new Error("Source label must be 1 to 120 characters.");
  return label;
}

async function requireUnassignedSource(ctx: MutationCtx, sourceId: Id<"eventMediaSources">) {
  for await (const row of ctx.db.query("eventMediaSources")
    .withIndex("by_assignedFromSourceId", q => q.eq("assignedFromSourceId", sourceId))) {
    if (row.state === "disabled" || !row.eventSlotId) continue;
    const slot = await ctx.db.get(row.eventSlotId);
    if (slot?.eventId === row.eventId) throw new ConvexError("Clear or reassign the lineup slots using this input first.");
  }
}

const sourceExpectationArgs = {expectedSourceRevision:v.optional(v.number()),expectedSessionId:v.optional(v.id("eventMediaSessions")),expectedIntentSequence:v.optional(v.number())};
type SourceExpectation = {expectedSourceRevision?:number; expectedSessionId?:Id<"eventMediaSessions">; expectedIntentSequence?:number};
async function sourceAuthority(ctx: MutationCtx, currentSlug: string, sourceId: Id<"eventMediaSources">, expected:SourceExpectation = {}) {
  const { subject: actor } = await requireActiveBrowserSessionSubject(ctx);
  const { event } = await getMediaManageableEventBySlug(ctx, currentSlug, actor);
  const source = await ctx.db.get(sourceId);
  if (!source || source.eventId !== event._id) throw new Error("Event source was not found.");
  const program = await ctx.db.get(source.programId);
  if (!program || program.eventId !== event._id || source.profileProjection || source.sourceProfileId || source.eventSlotId) throw new Error("Only custom event sources can be edited.");
  if (source.state !== "disabled") {
    if (expected.expectedSourceRevision !== undefined && expected.expectedSourceRevision !== (source.revision ?? 1)) throw Error("Source changed. Confirm the action again.");
    if (expected.expectedSessionId !== undefined && program.activeSessionId !== expected.expectedSessionId) throw Error("Broadcast session changed. Confirm the action again.");
    if (expected.expectedIntentSequence !== undefined) {
      const session = program.activeSessionId ? await ctx.db.get(program.activeSessionId) : null;
      if (session?.intentSequence !== expected.expectedIntentSequence) throw Error("Broadcast changed. Confirm the action again.");
    }
  }
  return { actor, event, source, program };
}

async function insertSource(ctx: MutationCtx, args: { currentSlug: string; label: string; url: string; sourceId?: Id<"eventMediaSources">; idempotencyKey?:string; temporary?:boolean } & SourceExpectation) {
  const { subject: actor } = await requireActiveBrowserSessionSubject(ctx);
  const { event } = await getMediaManageableEventBySlug(ctx, args.currentSlug, actor);
  const input = parseBroadcastInputUrl(args.url);
  const label = sourceLabel(args.label);
  const previous = args.sourceId === undefined ? undefined : (await sourceAuthority(ctx, args.currentSlug, args.sourceId, args)).source;
  if (previous?.state === "disabled") throw new Error("Event source is disabled.");
  if (previous) await requireUnassignedSource(ctx, previous._id);
  const now = Date.now();
  const programId = await getOrCreateEventMediaProgram(ctx.db, event, now);
  if (args.idempotencyKey !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.idempotencyKey))
    throw Error("Invalid source idempotency key.");
  const key = `custom-${args.idempotencyKey ?? crypto.randomUUID()}`;
  const existing = args.idempotencyKey ? await ctx.db.query("eventMediaSources").withIndex("by_programId_key", q=>q.eq("programId",programId).eq("key",key)).unique() : null;
  if (existing) {
    if (existing.state === "disabled" || existing.label !== label || existing.publicUrl !== broadcastInputPublicUrl(input)) throw Error("Source idempotency payload changed.");
    return {sourceId:existing._id,revision:existing.revision ?? 1,key:existing.key,input,publicUrl:broadcastInputPublicUrl(input),label};
  }
  if (previous && previous.programId !== programId) throw new Error("Event source belongs to an old program.");
  const sources = await listUsableEventMediaSources(ctx.db, programId, EVENT_BROADCAST_MAX_SOURCES + 1);
  if (sources.length >= EVENT_BROADCAST_MAX_SOURCES) throw new Error("Event broadcast source limit reached.");
  const revision = (previous?.revision ?? (previous ? 1 : 0)) + 1;
  const sourceId = await ctx.db.insert("eventMediaSources", {
    programId, eventId: event._id, key, position: sources.reduce((max, source) => Math.max(max, source.position + 1), 0),
    type: input.kind === "vrcdn" ? "vrcdn_link" : input.kind === "twitch" ? "twitch_watch" : "hls_url", purpose: "program", state: "ready", label, input, revision,
    publicUrl: broadcastInputPublicUrl(input), createdAt: now, updatedAt: now,
    ...(args.temporary ? { temporaryExpiresAt: now + 30 * 60_000 } : {}),
  });
  if (args.temporary) await ctx.scheduler.runAfter(30 * 60_000, internal.eventMediaSources.expireTemporary, { sourceId });
  await recordEventMediaAuditEvent(ctx.db, { programId, eventId: event._id, sourceId, actor, action: previous ? "source_replaced" : "source_created", privateSummary: previous ? `Replaces ${previous._id}.` : undefined, createdAt: now });
  return { sourceId, revision, key, input, publicUrl:broadcastInputPublicUrl(input), label };
}

export const create = mutation({ args: { currentSlug: v.string(), label: v.string(), url: v.string(), idempotencyKey:v.optional(v.string()), temporary:v.optional(v.boolean()) }, handler: insertSource });
export const assignToSlot = mutation({
  args: {
    currentSlug: v.string(),
    slotId: v.id("eventSlots"),
    sourceId: v.union(v.id("eventMediaSources"), v.null()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, { currentSlug, slotId, sourceId, url }) => {
    const { subject: actor } = await requireActiveBrowserSessionSubject(ctx);
    const { event } = await getMediaManageableEventBySlug(ctx, currentSlug, actor);
    const slot = await ctx.db.get(slotId);
    if (slot?.eventId !== event._id) throw Error("Lineup slot was not found.");
    const savedProgram = await getLatestEventMediaProgram(ctx.db, event._id);
    const program = savedProgram ?? (url === undefined ? null :
      await ctx.db.get(await getOrCreateEventMediaProgram(ctx.db, event, Date.now())));
    if (!program) throw Error("Broadcast program was not found.");

    const key = `override-${slotId}`;
    const existing = await ctx.db.query("eventMediaSources")
      .withIndex("by_programId_key", q => q.eq("programId", program._id).eq("key", key)).unique();
    const clearing = sourceId === null && url === undefined;
    if (sourceId !== null && url !== undefined) throw Error("Choose one lineup input.");
    if (await eventOutputConfigurationLocked(ctx.db, program)) {
      const session = await getOpenEventMediaSession(ctx.db, program);
      if (!session || session.status === "stopping" || session.stopRequestedAt !== undefined) {
        throw new ConvexError("Wait for the broadcast to stop before changing lineup inputs.");
      }
      if (clearing && existing && existing.state !== "disabled") {
        const pending = session.pendingControlCommandId ? await ctx.db.get(session.pendingControlCommandId) : null;
        if (session.currentSourceId === existing._id ||
            (session.committedIntent?.kind === "manual" && session.committedIntent.sourceId === existing._id) ||
            (pending?.controlTarget?.kind === "source" && pending.controlTarget.source.sourceId === existing._id)) {
          throw new ConvexError("Switch away from this input before clearing it.");
        }
      }
      if (!clearing) {
        const profile = slot.personProfileId ? await ctx.db.get(slot.personProfileId) : null;
        const profileInput = profile && resolveBroadcastInput({
          choices: eventProfileBroadcastInputChoices(profile),
          explicitInput: slot.broadcastInput,
          legacySelectedStreamId: slot.selectedStreamId,
        });
        if ((existing && existing.state !== "disabled") || profileInput ||
            await sourceForSlot(ctx.db, session, slot)) {
          throw new ConvexError("This slot already has an input. Stop the broadcast before replacing it.");
        }
      }
    }
    const now = Date.now();
    if (clearing) {
      if (!existing || existing.state === "disabled") return;
      await ctx.db.patch(existing._id, { state: "disabled", updatedAt: now });
      await recordEventMediaAuditEvent(ctx.db, { programId: program._id, eventId: event._id, sourceId: existing._id, actor, action: "lineup_input_cleared", createdAt: now });
      return;
    }

    const source = sourceId ? await ctx.db.get(sourceId) : null;
    if (sourceId !== null && (!source || source.eventId !== event._id || source.programId !== program._id ||
        source.state === "disabled" || source.temporaryExpiresAt !== undefined || source.eventSlotId !== undefined ||
        source.profileProjection || source.sourceProfileId !== undefined)) {
      throw Error("Choose a saved input for this event.");
    }
    const input = url !== undefined ? parseBroadcastInputUrl(url) : source && eventMediaSourceBroadcastInput(source);
    if (!input) throw Error("Choose a valid lineup input.");
    if ((!existing || existing.state === "disabled") &&
        (await listUsableEventMediaSources(ctx.db, program._id, EVENT_BROADCAST_MAX_SOURCES)).length >= EVENT_BROADCAST_MAX_SOURCES) {
      throw Error("Event broadcast source limit reached.");
    }
    const assignment = {
      eventSlotId: slotId, assignedFromSourceId: sourceId ?? undefined, position: slot.position, label: slot.displayLabel,
      type: input.kind === "vrcdn" ? "vrcdn_link" as const : input.kind === "twitch" ? "twitch_watch" as const : "hls_url" as const,
      purpose: "program" as const, state: "ready" as const,
      input, publicUrl: broadcastInputPublicUrl(input), updatedAt: now,
      revision: existing ? (existing.revision ?? 1) + 1 : 1,
    };
    if (existing) await ctx.db.patch(existing._id, assignment);
    const assignedId = existing?._id ?? await ctx.db.insert("eventMediaSources", {
      ...assignment, key, eventId: event._id, programId: program._id, createdAt: now,
    });
    await recordEventMediaAuditEvent(ctx.db, { programId: program._id, eventId: event._id, sourceId: assignedId, actor, action: "lineup_input_assigned", createdAt: now });
  },
});

export const expireTemporary = internalMutation({
  args: { sourceId: v.id("eventMediaSources") },
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source?.temporaryExpiresAt || source.state === "disabled") return;
    const program = await ctx.db.get(source.programId);
    const session = program?.activeSessionId ? await ctx.db.get(program.activeSessionId) : null;
    const pending = session?.pendingControlCommandId ? await ctx.db.get(session.pendingControlCommandId) : null;
    const protectedSource = session && !["ended", "error"].includes(session.status) && (
      session.currentSourceId === sourceId || session.resumeSource?.sourceId === sourceId ||
      (session.committedIntent?.kind === "manual" && session.committedIntent.sourceId === sourceId) ||
      (pending?.controlTarget?.kind === "source" && pending.controlTarget.source.sourceId === sourceId));
    if (protectedSource || Date.now() < source.temporaryExpiresAt) {
      await ctx.scheduler.runAfter(Math.max(5 * 60_000, source.temporaryExpiresAt - Date.now()), internal.eventMediaSources.expireTemporary, { sourceId });
      return;
    }
    await ctx.db.patch(sourceId, { state: "disabled", updatedAt: Date.now() });
  },
});
export const replace = mutation({ args: {...sourceExpectationArgs, currentSlug: v.string(), sourceId: v.id("eventMediaSources"), label: v.string(), url: v.string() }, handler: insertSource });
export const rename = mutation({
  args: { currentSlug: v.string(), sourceId: v.id("eventMediaSources"), label: v.string() },
  handler: async (ctx, args) => {
    const { actor, event, source } = await sourceAuthority(ctx, args.currentSlug, args.sourceId);
    if (source.state === "disabled") throw new Error("Event source is disabled.");
    const now = Date.now();
    await ctx.db.patch(source._id, { label: sourceLabel(args.label), updatedAt: now });
    await recordEventMediaAuditEvent(ctx.db, { programId: source.programId, eventId: event._id, sourceId: source._id, actor, action: "source_renamed", createdAt: now });
  },
});

export const remove = mutation({
  args: {...sourceExpectationArgs, currentSlug: v.string(), sourceId: v.id("eventMediaSources") },
  handler: async (ctx, args) => {
    const { actor, event, source, program } = await sourceAuthority(ctx, args.currentSlug, args.sourceId, args);
    if (source.state === "disabled") return;
    await requireUnassignedSource(ctx, source._id);
    await disableSourceControl(ctx.db,source,program);
    const now = Date.now();
    await ctx.db.patch(source._id, { state: "disabled", updatedAt: now });
    await recordEventMediaAuditEvent(ctx.db, { programId: source.programId, eventId: event._id, sourceId: source._id, actor, action: "source_removed", createdAt: now });
  },
});
