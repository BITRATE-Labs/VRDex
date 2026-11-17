import assert from "node:assert/strict";
import { it } from "node:test";
import { execFileSync } from "node:child_process";
import { createDiscordPosterBridge } from "../../apps/web/src/lib/server/discord-intake-posters";

it("personal preparation derives its actor from the website session and rejects caller identities or URLs", () => {
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
  import assert from "node:assert/strict";
  import { createWebsiteEventIntakeHandler } from "./apps/web/src/lib/server/event-intake-session.ts";
  const post = input => new Request("https://vrdex.test/api/event-intake", { method: "POST", headers: { origin: "https://vrdex.test", "content-type": "application/json" }, body: JSON.stringify({ operation: "discord_source_prepare", input }) });
  const handler = createWebsiteEventIntakeHandler({ actor: async () => "session-user",
    prepareDiscord: async (actor, input) => ({ actor, ...input, preparationStatus: "ready" }),
  });
  const result = await handler(post({ draftId: "draft-1", expectedVersion: 1 }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).actor, "session-user");
  for (const extra of [{ actorUserId: "other" }, { url: "https://evil.test/image.png" }]) {
    assert.equal((await handler(post({ draftId: "draft-1", expectedVersion: 1, ...extra }))).status, 400);
  }
  assert.equal((await createWebsiteEventIntakeHandler({ actor: async () => null })(post({ draftId: "draft-1", expectedVersion: 1 }))).status, 401);
  `], { encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: "apps/web/tsconfig.json" } });
});

it("poster transfer cancels a streamed response as soon as it exceeds declared bytes", { timeout: 1000 }, async () => {
  let cancelled = false;
  const bridge = createDiscordPosterBridge({ fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(5)); },
    cancel() { cancelled = true; },
  })) });
  await assert.rejects(bridge.store({ actorUserId: "actor" as never, draftId: "draft" as never, url: "https://cdn.discordapp.com/attachments/1/2/image.png", contentType: "image/png", byteLength: 4 }), /POSTER_SOURCE_MISMATCH/);
  assert.equal(cancelled, true);
});
