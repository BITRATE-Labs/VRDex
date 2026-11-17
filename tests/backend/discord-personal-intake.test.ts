import assert from "node:assert/strict";
import { it } from "node:test";
import { api, internal } from "../../convex/_generated/api";
import { clerkTestIdentity } from "./_clerkTestIdentity";
import { newClerkUserId } from "./_clerkTestIdentity";
import { AUTHOR_A, CHANNEL, M1, seedDiscordIntake } from "./helpers/discord-intake";

const capture = { interactionId: "400000000000000001", invokerDiscordUserId: AUTHOR_A, channelId: CHANNEL,
  message: { messageId: M1, authorId: "200000000000000002", sourceText: "Harbor Sessions Friday 22:00 UTC", attachments: [] } };
async function fixture() {
  const seeded = await seedDiscordIntake();
  await seeded.t.run(ctx => ctx.db.insert("discordVerificationWatermarks", { userId: seeded.authorityUserId, discordUserId: AUTHOR_A, issuedGeneration: 1, appliedGeneration: 1, appliedAt: Date.now(), issuedAt: Date.now(), updatedAt: Date.now() }));
  return seeded;
}

it("unlinked capture stores no private message or draft", async () => {
  const { t } = await seedDiscordIntake();
  const result = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, capture);
  assert.equal(result.kind, "link_required");
  assert.equal((await t.run(ctx => ctx.db.query("eventIntakeDrafts").collect())).length, 0);
  assert.equal((await t.run(ctx => ctx.db.query("discordPersonalIntakeSubmissions").collect())).length, 0);
});

it("selection replay preserves accepted edits and keeps the source private", async () => {
  const { t, authorityUserId, clerkUserId } = await fixture();
  const first = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, capture);
  assert.equal(first.kind, "draft");
  if (first.kind !== "draft") throw new Error("Expected private draft");
  const actor = t.withIdentity(clerkTestIdentity(clerkUserId));
  await actor.mutation(api.eventIntake.saveEventIntakeDraft, { draftId: first.draftId, expectedVersion: 1, patch: { title: "My corrected title" } });
  const second = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, { ...capture, interactionId: "400000000000000002", message: { ...capture.message, sourceText: "Updated announcement" } });
  if (second.kind !== "draft") throw new Error("Expected same private draft");
  assert.equal(second.draftId, first.draftId);
  assert.equal(second.changed, true);
  const draft = await actor.query(api.eventIntake.getEventIntakeDraft, { draftId: first.draftId });
  assert.equal(draft.actorUserId, authorityUserId);
  assert.equal(draft.fields.title, "My corrected title");
  assert.equal(draft.fields.sourceText, capture.message.sourceText);
  assert.equal(draft.connectorId, undefined);
  const extraction = await t.mutation(internal.eventIntakeSources.authorizeExtraction, { actorUserId: authorityUserId, draftId: first.draftId, reserveQuota: false });
  assert.equal(extraction.privateSource, true);
  assert.equal((await t.run(ctx => ctx.db.query("eventIntakeDrafts").collect())).length, 1);
});

it("poster-only capture needs no fabricated title or hash and consumes the ordinary quota", async () => {
  const { t } = await fixture();
  const input = { ...capture, message: { messageId: M1, sourceText: "", attachments: [{ id: "500000000000000001", url: "https://cdn.discordapp.com/attachments/100000000000000002/500000000000000001/poster.png", contentType: "image/png", byteLength: 1234 }] } };
  const first = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, input);
  if (first.kind !== "draft") throw new Error("Expected poster draft");
  const draft = await t.run(ctx => ctx.db.get(first.draftId));
  assert.equal(draft!.fields.title, undefined);
  assert.equal(draft!.fields.posterDeclaration, undefined);
  for (let index = 1; index < 20; index++) await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, { ...capture, message: { ...capture.message, messageId: String(300000000000000100n + BigInt(index)) } });
  await assert.rejects(t.mutation(internal.discordPersonalIntake.captureSelectedMessage, { ...capture, message: { ...capture.message, messageId: "300000000000000999" } }), /DRAFT_QUOTA/);
});

it("ambiguous verified identity refuses capture without recording private input", async () => {
  const { t } = await fixture();
  await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { clerkUserId: newClerkUserId() });
    await ctx.db.insert("discordVerificationWatermarks", { userId, discordUserId: AUTHOR_A, issuedGeneration: 1, appliedGeneration: 1, appliedAt: Date.now(), issuedAt: Date.now(), updatedAt: Date.now() });
  });
  assert.equal((await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, capture)).kind, "link_required");
  assert.equal((await t.run(ctx => ctx.db.query("eventIntakeDrafts").collect())).length, 0);
});

it("the same source selected by two actors produces separate actor-private drafts", async () => {
  const { t, clerkUserId } = await fixture();
  const discordUserId = "200000000000000003";
  await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { clerkUserId: newClerkUserId() });
    await ctx.db.insert("discordVerificationWatermarks", { userId, discordUserId, issuedGeneration: 1, appliedGeneration: 1, appliedAt: Date.now(), issuedAt: Date.now(), updatedAt: Date.now() });
  });
  const first = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, capture);
  const second = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, { ...capture, invokerDiscordUserId: discordUserId });
  if (first.kind !== "draft" || second.kind !== "draft") throw new Error("Expected isolated drafts");
  assert.notEqual(first.draftId, second.draftId);
  assert.equal(await t.withIdentity(clerkTestIdentity(clerkUserId)).query(api.eventIntake.getEventIntakeDraft, { draftId: second.draftId }), null);
});

it("HTTP capture requires the existing service gate and validates the selected-message envelope", async () => {
  const { t } = await fixture();
  process.env.VRDEX_DISCORD_INTAKE_ENABLED = "true";
  process.env.DISCORD_INTAKE_SECRET = "selected-message-test-secret";
  process.env.SITE_URL = "https://vrdex.test";
  const request = (body: unknown, token = "selected-message-test-secret") => t.fetch("/discord-intake/selected-message", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await request(capture, "wrong")).status, 401);
  assert.equal((await request({ ...capture, actorUserId: "forged" })).status, 400);
  const response = await request(capture);
  assert.equal(response.status, 200);
  assert.match((await response.json()).url, /^https:\/\/vrdex.test\/events\/new\?draft=/);
});

it("preparation is actor-bound, runs once, and refuses a late result after manual edits", async () => {
  const { t, authorityUserId, clerkUserId } = await fixture();
  const result = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, capture);
  if (result.kind !== "draft") throw new Error("Expected draft");
  const args = { actorUserId: authorityUserId, draftId: result.draftId, expectedVersion: 1 };
  const claim = await t.mutation(internal.discordPersonalIntake.claimPreparation, args);
  assert.equal(claim.kind, "run");
  assert.equal((await t.mutation(internal.discordPersonalIntake.claimPreparation, args)).kind, "processing");
  await t.withIdentity(clerkTestIdentity(clerkUserId)).mutation(api.eventIntake.saveEventIntakeDraft, { draftId: result.draftId, expectedVersion: 1, patch: { title: "Keep my correction" } });
  await assert.rejects(t.mutation(internal.discordPersonalIntake.finishPreparation, { ...args, token: claim.token, patch: { tentative: { title: "Late model suggestion" } } }), /VERSION_CONFLICT|PREPARATION_EXPIRED/);
  const draft = await t.run(ctx => ctx.db.get(result.draftId));
  assert.equal(draft!.fields.title, "Keep my correction");
  assert.equal(draft!.fields.tentative, undefined);
});

it("an abandoned preparation becomes retryable after its lease expires", async () => {
  const { t, authorityUserId, clerkUserId } = await fixture();
  const captured = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, capture);
  if (captured.kind !== "draft") throw new Error("Expected draft");
  const args = { actorUserId: authorityUserId, draftId: captured.draftId, expectedVersion: 1 };
  const first = await t.mutation(internal.discordPersonalIntake.claimPreparation, args);
  await t.run(async ctx => {
    const source = await ctx.db.query("discordPersonalIntakeSubmissions").withIndex("by_draftId", q => q.eq("draftId", captured.draftId)).unique();
    await ctx.db.patch(source!._id, { preparationExpiresAt: Date.now() - 1 });
  });
  const actor = t.withIdentity(clerkTestIdentity(clerkUserId));
  assert.equal((await actor.query(api.discordPersonalIntake.getSubmission, { draftId: captured.draftId })).status, "failed");
  const retry = await t.mutation(internal.discordPersonalIntake.claimPreparation, { ...args, retry: true });
  assert.equal(retry.kind, "run");
  assert.notEqual(retry.token, first.token);
});

it("retrying after explicit poster removal does not require or restore a captured image", async () => {
  const { t, authorityUserId, clerkUserId } = await fixture();
  const images = ["500000000000000001", "500000000000000002"].map(id => ({ id, url: `https://cdn.discordapp.com/attachments/${CHANNEL}/${id}/poster.png`, contentType: "image/png", byteLength: 1234 }));
  const captured = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, { ...capture, message: { ...capture.message, attachments: images } });
  if (captured.kind !== "draft") throw new Error("Expected draft");
  await t.withIdentity(clerkTestIdentity(clerkUserId)).mutation(api.eventIntake.saveEventIntakeDraft, { draftId: captured.draftId, expectedVersion: 1, patch: { posterSourceId: null } });
  const claim = await t.mutation(internal.discordPersonalIntake.claimPreparation, { actorUserId: authorityUserId, draftId: captured.draftId, expectedVersion: 2, retry: true });
  assert.equal(claim.kind, "run");
  assert.equal(claim.attachment, undefined);
});

it("completed preparation is replayed without another extraction and discard clears private input", async () => {
  const { t, authorityUserId, clerkUserId } = await fixture();
  const result = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, capture);
  if (result.kind !== "draft") throw new Error("Expected draft");
  const args = { actorUserId: authorityUserId, draftId: result.draftId, expectedVersion: 1 };
  const claim = await t.mutation(internal.discordPersonalIntake.claimPreparation, args);
  await t.mutation(internal.discordPersonalIntake.finishPreparation, { ...args, token: claim.token, patch: { tentative: { title: "Extracted" }, evidence: [], questions: [] } });
  assert.equal((await t.mutation(internal.discordPersonalIntake.claimPreparation, { ...args, expectedVersion: 2 })).kind, "ready");
  const actor = t.withIdentity(clerkTestIdentity(clerkUserId));
  await actor.mutation(api.discordPersonalIntake.discard, { draftId: result.draftId, expectedVersion: 2 });
  assert.equal(await actor.query(api.eventIntake.getEventIntakeDraft, { draftId: result.draftId }), null);
  const draft = await t.run(ctx => ctx.db.get(result.draftId));
  assert.equal(draft!.fields.sourceText, undefined);
  assert.equal(draft!.fields.tentative, undefined);
});

async function ownedDraft() {
  const context = await fixture();
  await context.t.run(ctx => ctx.db.insert("profileOwners", { profileId: context.communityProfileId, userId: context.authorityUserId, roleKey: "owner", state: "active", grantedAt: Date.now(), updatedAt: Date.now() }));
  const captured = await context.t.mutation(internal.discordPersonalIntake.captureSelectedMessage, capture);
  if (captured.kind !== "draft") throw new Error("Expected draft");
  const actor = context.t.withIdentity(clerkTestIdentity(context.clerkUserId));
  const saved = await actor.mutation(api.eventIntake.saveEventIntakeDraft, { draftId: captured.draftId, expectedVersion: 1,
    patch: { communitySlug: "night-club", title: "Harbor Sessions", eventDate: "2026-12-01", timezone: "Etc/UTC", start: { time: "22:00" }, lineup: [{ clientKey: "set-ivy", position: 0, performerLabel: "JustIvy" }] } });
  return { ...context, actor, draftId: captured.draftId, version: saved.version };
}

it("owner publication uses official commands, is idempotent and clears private text without contribution receipts", async () => {
  const { t, actor, draftId, version } = await ownedDraft();
  const args = { draftId, expectedVersion: version, idempotencyKey: "owner-create-1", operation: { kind: "owner_create" as const, communitySlug: "night-club" } };
  const first = await actor.mutation(api.discordPersonalIntake.publishReviewedDraft, args);
  assert.deepEqual(await actor.mutation(api.discordPersonalIntake.publishReviewedDraft, args), first);
  const event = await t.run(ctx => ctx.db.get(first.eventId));
  assert.equal(event!.sourceType, "community");
  assert.equal(event!.sourceUrl, undefined);
  assert.equal((await t.run(ctx => ctx.db.query("eventContributionReceipts").collect())).length, 0);
  assert.equal((await t.run(ctx => ctx.db.query("events").collect())).length, 1);
  assert.equal((await t.run(ctx => ctx.db.get(draftId)))!.fields.sourceText, undefined);
  await assert.rejects(actor.mutation(api.discordPersonalIntake.publishReviewedDraft, { ...args, operation: { ...args.operation, communitySlug: "other" } }), /IDEMPOTENCY_CONFLICT/);
});

it("revoked owner authority stops publication instead of downgrading it to a contribution", async () => {
  const { t, actor, draftId, version } = await ownedDraft();
  await t.run(async ctx => { for (const owner of await ctx.db.query("profileOwners").collect()) await ctx.db.delete(owner._id); });
  await assert.rejects(actor.mutation(api.discordPersonalIntake.publishReviewedDraft, { draftId, expectedVersion: version, idempotencyKey: "revoked-create", operation: { kind: "owner_create", communitySlug: "night-club" } }), /permission/);
  await assert.rejects(actor.action(api.eventIntake.publishEventIntake, { draftId, expectedVersion: version, idempotencyKey: "forbidden-fallback" }), /OWNER_OPERATION_REQUIRED/);
  assert.equal((await t.run(ctx => ctx.db.query("events").collect())).length, 0);
  assert.equal((await t.run(ctx => ctx.db.query("eventContributionReceipts").collect())).length, 0);
});

it("changing a role in a reviewed lineup retains the existing private person association", async () => {
  const { t, actor, draftId, version } = await ownedDraft();
  const original = await actor.mutation(api.events.createCommunityEvent, { communitySlug: "night-club", title: "Private lineup event", startAt: Date.UTC(2026, 11, 1, 22), timezone: "Etc/UTC", published: true, lineup: [{ clientKey: "private-row", position: 0, performerLabel: "Private DJ" }] });
  const personId = await t.run(async ctx => {
    const personId = await ctx.db.insert("profiles", { slug: "private-person", displayName: "Private DJ", sortName: "private dj", profileType: "person", person: { roleTags: [] }, aliases: [], tags: [], claimState: "claimed_verified", publicationState: "draft_private", publicSurfacingState: "public", creationSource: "community", updatedAt: Date.now() });
    const row = await ctx.db.query("eventLineupEntries").withIndex("by_eventId_position", q => q.eq("eventId", original.eventId)).first();
    await ctx.db.patch(row!._id, { personProfileId: personId });
    await ctx.db.insert("eventParticipants", { eventId: original.eventId, personProfileId: personId, roleLabel: "DJ", sourceType: "community", sourceLabel: "Original", confirmationState: "unconfirmed", eventPublicationState: "published", eventStatus: "scheduled", updatedAt: Date.now() });
    return personId;
  });
  const event = await t.run(ctx => ctx.db.get(original.eventId));
  await actor.mutation(api.discordPersonalIntake.publishReviewedDraft, { draftId, expectedVersion: version, idempotencyKey: "private-lineup-update", operation: { kind: "owner_update", eventId: original.eventId, expectedUpdatedAt: event!.updatedAt, artwork: "keep", patch: { lineup: [{ clientKey: "private-row", position: 0, performerLabel: "Private DJ", roleLabel: "Host" }] } } });
  const row = await t.run(ctx => ctx.db.query("eventLineupEntries").withIndex("by_eventId_position", q => q.eq("eventId", original.eventId)).first());
  assert.equal(row!.personProfileId, personId);
  assert.equal(row!.roleLabel, "Host");
  const participant = await t.run(ctx => ctx.db.query("eventParticipants").withIndex("by_eventId", q => q.eq("eventId", original.eventId)).first());
  assert.equal(participant!.confirmationState, "unconfirmed");
});

it("reviewed partial owner update preserves existing lineup and source labels and rejects a stale event", async () => {
  const { t, actor, draftId, version } = await ownedDraft();
  const original = await actor.mutation(api.events.createCommunityEvent, { communitySlug: "night-club", title: "Existing event", startAt: Date.UTC(2026, 11, 1, 22), timezone: "Etc/UTC", published: true, sourceLabel: "Original organizer", lineup: [{ clientKey: "original-set", position: 0, performerLabel: "Original DJ" }] });
  const event = await t.run(ctx => ctx.db.get(original.eventId));
  const lineup = await t.run(ctx => ctx.db.query("eventLineupEntries").withIndex("by_eventId_position", q => q.eq("eventId", original.eventId)).collect());
  const standalone = await t.run(async ctx => {
    const personProfileId = await ctx.db.insert("profiles", { slug: "legacy-person", displayName: "Legacy DJ", sortName: "legacy dj", profileType: "person", person: { roleTags: [] }, aliases: [], tags: [], claimState: "claimed_verified", publicationState: "draft_private", publicSurfacingState: "public", creationSource: "community", updatedAt: Date.now() });
    return ctx.db.insert("eventParticipants", { eventId: original.eventId, personProfileId, roleLabel: "DJ", sourceType: "community", sourceLabel: "Original", confirmationState: "unconfirmed", eventPublicationState: "published", eventStatus: "scheduled", updatedAt: Date.now() });
  });
  const operation = { kind: "owner_update" as const, eventId: original.eventId, expectedUpdatedAt: event!.updatedAt, patch: { venueLabel: "New room" }, artwork: "keep" as const };
  await assert.rejects(actor.mutation(api.discordPersonalIntake.publishReviewedDraft, { draftId, expectedVersion: version, idempotencyKey: "update-stale", operation: { ...operation, expectedUpdatedAt: event!.updatedAt - 1 } }), /VERSION_CONFLICT/);
  await actor.mutation(api.discordPersonalIntake.publishReviewedDraft, { draftId, expectedVersion: version, idempotencyKey: "update-good", operation });
  const updated = await t.run(ctx => ctx.db.get(original.eventId));
  assert.equal(updated!.venueLabel, "New room");
  assert.equal(updated!.title, "Existing event");
  assert.equal(updated!.sourceLabel, "Original organizer");
  assert.deepEqual(await t.run(ctx => ctx.db.query("eventLineupEntries").withIndex("by_eventId_position", q => q.eq("eventId", original.eventId)).collect()), lineup);
  // Use a fresh private draft because the first one has already been published.
  const captured = await t.mutation(internal.discordPersonalIntake.captureSelectedMessage, { ...capture, message: { ...capture.message, messageId: "123456789012345679" }, interactionId: "123456789012345680" });
  if (captured.kind !== "draft") throw new Error("Expected draft");
  await actor.mutation(api.discordPersonalIntake.publishReviewedDraft, { draftId: captured.draftId, expectedVersion: 1, idempotencyKey: "lineup-legacy", operation: { kind: "owner_update", eventId: original.eventId, expectedUpdatedAt: updated!.updatedAt, artwork: "keep", patch: { lineup: [{ clientKey: "original-set", position: 0, performerLabel: "Original DJ", roleLabel: "Host" }] } } });
  assert.ok(await t.run(ctx => ctx.db.get(standalone)), "participant-only performer must survive a lineup edit");
});

it("selecting an update target saves its baseline and clears accepted fields absent from that event", async () => {
  const { t, actor, draftId, version } = await ownedDraft();
  const created = await actor.mutation(api.events.createCommunityEvent, { communitySlug: "night-club", title: "Canonical baseline", startAt: Date.UTC(2026, 11, 2, 22), timezone: "Etc/UTC", published: true });
  const authored = await actor.mutation(api.eventIntake.saveEventIntakeDraft, { draftId, expectedVersion: version, patch: { summary: "Previously accepted import" } });
  const selected = await actor.mutation(api.discordPersonalIntake.selectUpdateTarget, { draftId, expectedVersion: authored.version, eventId: created.eventId });
  const draft = await actor.query(api.eventIntake.getEventIntakeDraft, { draftId });
  assert.equal(draft.version, selected.version);
  assert.equal(draft.fields.title, "Canonical baseline");
  assert.equal(draft.fields.summary, undefined);
  const submission = await actor.query(api.discordPersonalIntake.getSubmission, { draftId });
  assert.equal(submission.target!.eventId, created.eventId);
  assert.equal(submission.target!.baseline.title, "Canonical baseline");
  assert.equal((await t.run(ctx => ctx.db.get(created.eventId)))!.title, "Canonical baseline");
});
