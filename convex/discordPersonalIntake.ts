import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./_identity";
import { DISCORD_SNOWFLAKE, resolveDiscordUserId } from "./_discordIntake";
import { getActorIntakeDraft, saveIntakeDraft, EVENT_INTAKE_DRAFT_TTL_MS } from "./_eventIntake";
import { eventPathForRecord } from "./_eventPaths";
import { EVENT_POSTER_MAX_BYTES } from "../packages/api-contracts/src/event-intake";

const attachment = v.object({ id: v.string(), url: v.string(), contentType: v.string(), byteLength: v.number() });
export const selectedMessageArgs = {
  interactionId: v.string(), invokerDiscordUserId: v.string(), channelId: v.string(), guildId: v.optional(v.string()),
  message: v.object({ messageId: v.string(), authorId: v.optional(v.string()), editedAt: v.optional(v.number()), sourceText: v.string(), attachments: v.array(attachment) }),
};
export const captureSelectedMessage = internalMutation({
  args: selectedMessageArgs,
  handler: async (ctx, input) => {
    const ids = [input.interactionId, input.invokerDiscordUserId, input.channelId, input.guildId, input.message.messageId, input.message.authorId].filter((id): id is string => id !== undefined);
    if (ids.some(id => !DISCORD_SNOWFLAKE.test(id)) || input.message.sourceText.length > 12_000 || input.message.attachments.length > 10) throw new ConvexError({ code: "DISCORD_INTAKE_INVALID" });
    for (const item of input.message.attachments) {
      let url: URL;
      try { url = new URL(item.url); } catch { throw new ConvexError({ code: "DISCORD_INTAKE_INVALID" }); }
      if (!DISCORD_SNOWFLAKE.test(item.id) || url.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) || !url.pathname.startsWith("/attachments/") || url.username || url.password || url.port
        || !["image/png", "image/jpeg", "image/webp"].includes(item.contentType) || !Number.isSafeInteger(item.byteLength) || item.byteLength < 1 || item.byteLength > EVENT_POSTER_MAX_BYTES) throw new ConvexError({ code: "DISCORD_INTAKE_INVALID" });
    }
    const actorUserId = await resolveDiscordUserId(ctx, input.invokerDiscordUserId);
    if (!actorUserId) return { kind: "link_required" as const };
    if (!input.message.sourceText.trim() && !input.message.attachments.length) return { kind: "unavailable" as const };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input.message)));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const prior = await ctx.db.query("discordPersonalIntakeSubmissions").withIndex("by_actor_source", q => q.eq("actorUserId", actorUserId).eq("channelId", input.channelId).eq("messageId", input.message.messageId)).unique();
    if (prior) {
      if (prior.eventId) {
        const event = await ctx.db.get(prior.eventId);
        if (event?.publicationState === "published" && event.eventStatus !== "cancelled" && event.moderationRemovedAt === undefined) return { kind: "event" as const, eventPath: await eventPathForRecord(ctx.db, event), changed: prior.fingerprint !== fingerprint };
        return { kind: "unavailable" as const };
      }
      const draft = prior.draftId ? await ctx.db.get(prior.draftId) : null;
      if (!draft || draft.expiresAt <= Date.now() || draft.resolvedAt) return { kind: "unavailable" as const };
      return { kind: "draft" as const, draftId: draft._id, changed: prior.fingerprint !== fingerprint };
    }
    const now = Date.now();
    const submissionId = await ctx.db.insert("discordPersonalIntakeSubmissions", {
      actorUserId, discordUserId: input.invokerDiscordUserId, channelId: input.channelId, messageId: input.message.messageId, interactionId: input.interactionId,
      fingerprint, ...(input.message.authorId ? { authorId: input.message.authorId } : {}), ...(input.guildId ? { guildId: input.guildId } : {}),
      attachments: input.message.attachments, preparationStatus: "pending", createdAt: now, updatedAt: now, expiresAt: now + EVENT_INTAKE_DRAFT_TTL_MS,
    });
    const { draftId } = await saveIntakeDraft(ctx.db, actorUserId, { patch: { sourceText: input.message.sourceText } }, now, { personalSubmissionId: submissionId });
    await ctx.db.patch(submissionId, { draftId });
    return { kind: "draft" as const, draftId, changed: false };
  },
});

async function ownSubmission(ctx: Pick<QueryCtx, "db">, actorUserId: Id<"users">, draftId: Id<"eventIntakeDrafts">) {
  const draft = await getActorIntakeDraft(ctx.db, actorUserId, draftId);
  const submission = draft.personalSubmissionId ? await ctx.db.get(draft.personalSubmissionId) : null;
  if (!submission || submission.actorUserId !== actorUserId || submission.draftId !== draftId || submission.preparationStatus === "resolved") throw new Error("DRAFT_ACCESS");
  return { draft, submission };
}
const prepareArgs = { actorUserId: v.id("users"), draftId: v.id("eventIntakeDrafts"), expectedVersion: v.number() };
const tokenArgs = { ...prepareArgs, token: v.string() };
async function preparation(ctx: Pick<QueryCtx, "db">, args: { actorUserId: Id<"users">; draftId: Id<"eventIntakeDrafts">; expectedVersion: number; token: string }) {
  const { draft, submission } = await ownSubmission(ctx, args.actorUserId, args.draftId);
  if (submission.preparationStatus !== "processing" || submission.preparationToken !== args.token || (submission.preparationExpiresAt ?? 0) <= Date.now()) throw new Error("PREPARATION_EXPIRED");
  if (draft.version !== args.expectedVersion || submission.preparationVersion !== args.expectedVersion) throw new ConvexError({ code: "VERSION_CONFLICT" });
  return { draft, submission };
}

export const getSubmission = query({
  args: { draftId: v.id("eventIntakeDrafts") },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const { submission } = await ownSubmission(ctx, userId, args.draftId);
    return { status: submission.preparationStatus, attachments: submission.attachments.map((item, index) => ({ id: item.id, url: item.url, label: `Poster ${index + 1}` })) };
  },
});

export const claimPreparation = internalMutation({
  args: { ...prepareArgs, attachmentId: v.optional(v.string()), skipPoster: v.optional(v.boolean()), retry: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { draft, submission } = await ownSubmission(ctx, args.actorUserId, args.draftId);
    if (draft.version !== args.expectedVersion) throw new ConvexError({ code: "VERSION_CONFLICT" });
    if (submission.preparationStatus === "ready" || (submission.preparationStatus === "failed" && !args.retry)) return { kind: submission.preparationStatus, version: draft.version };
    if (submission.preparationStatus === "processing" && (submission.preparationExpiresAt ?? 0) > Date.now()) return { kind: "processing" as const, version: draft.version };
    if (!args.skipPoster && submission.attachments.length > 1 && !args.attachmentId) return { kind: "choose_poster" as const, version: draft.version };
    const selected = args.skipPoster ? undefined : args.attachmentId ? submission.attachments.find(item => item.id === args.attachmentId) : submission.attachments[0];
    if (args.attachmentId && !selected && !args.skipPoster) throw new Error("POSTER_NOT_FOUND");
    const token = crypto.randomUUID();
    await ctx.db.patch(submission._id, { preparationStatus: "processing", preparationToken: token, preparationVersion: draft.version, preparationExpiresAt: Date.now() + 300_000 });
    return { kind: "run" as const, token, version: draft.version, sourceText: draft.fields.sourceText, posterSourceId: draft.fields.posterSourceId, ...(selected ? { attachment: selected } : {}) };
  },
});
export const checkPreparation = internalQuery({ args: tokenArgs, handler: async (ctx, args) => { await preparation(ctx, args); return null; } });

export const adoptPreparedPoster = internalMutation({
  args: { ...tokenArgs, posterAssetId: v.id("eventPosterSources"), completedVersion: v.number() },
  handler: async (ctx, args) => {
    const { draft, submission } = await ownSubmission(ctx, args.actorUserId, args.draftId);
    const artwork = draft.artworkAssetId ? await ctx.db.get(draft.artworkAssetId) : null;
    if (submission.preparationToken !== args.token || submission.preparationStatus !== "processing" || (submission.preparationExpiresAt ?? 0) <= Date.now()) throw new Error("PREPARATION_EXPIRED");
    if (submission.preparationVersion !== args.expectedVersion || draft.version !== args.completedVersion || args.completedVersion !== args.expectedVersion + 1
      || artwork?.sourceId !== args.posterAssetId || artwork.appliedDraftVersion !== draft.version || draft.fields.posterSourceId === null) throw new ConvexError({ code: "VERSION_CONFLICT" });
    const saved = await saveIntakeDraft(ctx.db, args.actorUserId, { draftId: args.draftId, expectedVersion: draft.version, patch: { posterSourceId: args.posterAssetId } }, Date.now(), { preparationToken: args.token });
    return saved;
  },
});
export const finishPreparation = internalMutation({
  args: { ...tokenArgs, patch: v.any() },
  handler: async (ctx, args) => {
    const { submission } = await preparation(ctx, args);
    // Only suggestions can come from preparation, never accepted event fields.
    const keys = Object.keys(args.patch ?? {});
    if (keys.some(key => !["tentative", "evidence", "questions"].includes(key))) throw new Error("INVALID_PREPARATION_PATCH");
    const saved = await saveIntakeDraft(ctx.db, args.actorUserId, { draftId: args.draftId, expectedVersion: args.expectedVersion, patch: args.patch }, Date.now(), { preparationToken: args.token });
    await ctx.db.patch(submission._id, { preparationStatus: "ready", preparationToken: undefined, preparationExpiresAt: undefined, attachments: [] });
    return saved;
  },
});
export const failPreparation = internalMutation({
  args: { actorUserId: v.id("users"), draftId: v.id("eventIntakeDrafts"), token: v.string() },
  handler: async (ctx, args) => {
    const { submission } = await ownSubmission(ctx, args.actorUserId, args.draftId);
    if (submission.preparationToken === args.token) await ctx.db.patch(submission._id, { preparationStatus: "failed", preparationToken: undefined, preparationExpiresAt: undefined });
    return null;
  },
});
export const discard = mutation({
  args: { draftId: v.id("eventIntakeDrafts"), expectedVersion: v.number() },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const { draft, submission } = await ownSubmission(ctx, userId, args.draftId);
    if (draft.version !== args.expectedVersion) throw new ConvexError({ code: "VERSION_CONFLICT" });
    await resolvePersonalSubmission(ctx, draft._id, submission._id);
    return null;
  },
});
export async function resolvePersonalSubmission(ctx: Pick<MutationCtx, "db">, draftId: Id<"eventIntakeDrafts">, submissionId: Id<"discordPersonalIntakeSubmissions">, eventId?: Id<"events">) {
  await ctx.db.patch(submissionId, { ...(eventId ? { eventId } : {}), attachments: [], preparationStatus: "resolved", preparationToken: undefined, preparationExpiresAt: undefined, updatedAt: Date.now() });
  const draft = await ctx.db.get(draftId);
  if (draft) {
    const { sourceText: _text, tentative: _tentative, evidence: _evidence, questions: _questions, posterDeclaration: _declaration, ...fields } = draft.fields;
    await ctx.db.patch(draftId, { fields, resolvedAt: Date.now() });
  }
}
