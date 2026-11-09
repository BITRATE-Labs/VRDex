import {disableSourceControl} from "./_eventBroadcastControl";
import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActiveBrowserSessionSubject } from "./_browserSessionAuthority";
import { getMediaManageableEventBySlug, getOrCreateEventMediaProgram, recordEventMediaAuditEvent } from "./events";
import { EVENT_BROADCAST_MAX_SOURCES } from "./_eventBroadcastInputs";
import { parseBroadcastInputUrl, broadcastInputPublicUrl, listUsableEventMediaSources } from "./_eventBroadcastSources";
import { normalizeProfileInlineText } from "./_profileSubmissions";

function sourceLabel(value: string): string {
  const label = normalizeProfileInlineText(value);
  if (label.length < 1 || label.length > 120) throw new Error("Source label must be 1 to 120 characters.");
  return label;
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

async function insertSource(ctx: MutationCtx, args: { currentSlug: string; label: string; url: string; sourceId?: Id<"eventMediaSources">; idempotencyKey?:string } & SourceExpectation) {
  const { subject: actor } = await requireActiveBrowserSessionSubject(ctx);
  const { event } = await getMediaManageableEventBySlug(ctx, args.currentSlug, actor);
  const input = parseBroadcastInputUrl(args.url);
  const label = sourceLabel(args.label);
  const previous = args.sourceId === undefined ? undefined : (await sourceAuthority(ctx, args.currentSlug, args.sourceId, args)).source;
  if (previous?.state === "disabled") throw new Error("Event source is disabled.");
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
    type: input.kind === "vrcdn" ? "vrcdn_link" : "twitch_watch", purpose: "program", state: "ready", label, input, revision,
    publicUrl: broadcastInputPublicUrl(input), createdAt: now, updatedAt: now,
  });
  await recordEventMediaAuditEvent(ctx.db, { programId, eventId: event._id, sourceId, actor, action: previous ? "source_replaced" : "source_created", privateSummary: previous ? `Replaces ${previous._id}.` : undefined, createdAt: now });
  return { sourceId, revision, key, input, publicUrl:broadcastInputPublicUrl(input), label };
}

export const create = mutation({ args: { currentSlug: v.string(), label: v.string(), url: v.string(), idempotencyKey:v.optional(v.string()) }, handler: insertSource });
export const replace = mutation({ args: {...sourceExpectationArgs, currentSlug: v.string(), sourceId: v.id("eventMediaSources"), label: v.string(), url: v.string() }, handler: insertSource });
export const rename = mutation({
  args: { currentSlug: v.string(), sourceId: v.id("eventMediaSources"), label: v.string() },
  handler: async (ctx, args) => {
    const { actor, event, source } = await sourceAuthority(ctx, args.currentSlug, args.sourceId, args);
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
    await disableSourceControl(ctx.db,source,program);
    const now = Date.now();
    await ctx.db.patch(source._id, { state: "disabled", updatedAt: now });
    await recordEventMediaAuditEvent(ctx.db, { programId: source.programId, eventId: event._id, sourceId: source._id, actor, action: "source_removed", createdAt: now });
  },
});
