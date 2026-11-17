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
