import { internal } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { candidatePatch } from "../event-intake-source";
import { convexAdminHttpClient } from "./convex-http";
import { createDiscordPosterBridge } from "./discord-intake-posters";
import { createEventIntakeExtractor } from "./event-intake-agent";
import { createEventPosterHandlers } from "./event-poster-storage";

export type PersonalPreparationInput = { draftId: string; expectedVersion: number; attachmentId?: string; skipPoster?: boolean; retry?: boolean };
export async function preparePersonalDiscordSource(actorUserId: Id<"users">, input: PersonalPreparationInput) {
  const admin = convexAdminHttpClient();
  const args = { ...input, draftId: input.draftId as Id<"eventIntakeDrafts">, actorUserId };
  const claim = await admin.mutation(internal.discordPersonalIntake.claimPreparation, args);
  const read = async (preparationStatus: string) => ({ ...(await admin.query(internal.eventIntake.getActorDraft, { actorUserId, draftId: args.draftId })), preparationStatus });
  if (claim.kind !== "run") return read(claim.kind);
  let version = claim.version;
  const token = claim.token!;
  let posterAssetId = claim.posterSourceId as Id<"eventPosterSources"> | undefined;
  try {
    if (claim.attachment && !posterAssetId) {
      const bridge = createDiscordPosterBridge({ admin, authorize: async () => { await admin.query(internal.discordPersonalIntake.checkPreparation, { actorUserId, draftId: args.draftId, expectedVersion: version, token }); } });
      const stored = await bridge.store({ actorUserId, draftId: args.draftId, ...claim.attachment, expectedVersion: version });
      if (stored.version === undefined) throw new Error("ARTWORK_NOT_READY");
      const saved = await admin.mutation(internal.discordPersonalIntake.adoptPreparedPoster, { actorUserId, draftId: args.draftId, expectedVersion: version, token, posterAssetId: stored.posterAssetId, completedVersion: stored.version });
      version = saved.version;
      posterAssetId = stored.posterAssetId;
    }
    const posters = createEventPosterHandlers({ authority: async () => ({ actorUserId }), admin });
    const extract = createEventIntakeExtractor({ authority: async () => ({ actorUserId }), admin, readPoster: id => posters.readPoster(id as Id<"eventPosterSources">), trigger: "web" });
    if (!claim.sourceText?.trim() && !posterAssetId) {
      await admin.mutation(internal.discordPersonalIntake.finishPreparation, { actorUserId, draftId: args.draftId, expectedVersion: version, token, patch: {} });
      return read("ready");
    }
    const candidate = await extract({ draftId: args.draftId, ...(claim.sourceText ? { sourceText: claim.sourceText } : {}), ...(posterAssetId ? { posterAssetId } : {}) });
    if (candidate.questions.some(question => question.fieldPath === "source")) throw new Error("EXTRACTION_UNAVAILABLE");
    // Discord links remain private evidence, even when a model suggests one as a public source.
    candidate.event.sourceUrl = null;
    await admin.mutation(internal.discordPersonalIntake.finishPreparation, { actorUserId, draftId: args.draftId, expectedVersion: version, token, patch: candidatePatch(candidate) });
    return read("ready");
  } catch (error) {
    await admin.mutation(internal.discordPersonalIntake.failPreparation, { actorUserId, draftId: args.draftId, token }).catch(() => undefined);
    throw error;
  }
}
