import assert from "node:assert/strict";
import { it } from "node:test";
import { buildSelectedMessage, handlePersonalIntake, personalEventCommand } from "./personalIntake";

const selected = {
  id: "300000000000000001", content: "Harbor Sessions Friday 22:00 UTC", author: { id: "200000000000000002", bot: true },
  editedTimestamp: null, embeds: [{ title: "Lineup", description: "Ivy at 22:00", fields: [] }], attachments: new Map(),
};

it("captures the interaction actor and selected bot announcement in a DM without history access", () => {
  const result = buildSelectedMessage({ id: "400000000000000001", user: { id: "200000000000000001" }, channelId: "100000000000000002", guildId: null, targetMessage: selected });
  assert.equal(result.invokerDiscordUserId, "200000000000000001");
  assert.equal(result.guildId, undefined);
  assert.equal(result.message.authorId, "200000000000000002");
  assert.equal(result.message.sourceText, "Harbor Sessions Friday 22:00 UTC\nLineup\nIvy at 22:00");
});

it("supports user installation in guild, bot DM and private channel contexts", () => {
  const command = personalEventCommand.toJSON();
  assert.equal(command.type, 3);
  assert.deepEqual(command.integration_types, [1]);
  assert.deepEqual(command.contexts, [0, 1, 2]);
});

it("acknowledges privately before capture and never echoes source text", async () => {
  const order: string[] = [];
  let reply: unknown;
  await handlePersonalIntake({
    id: "400000000000000001", user: { id: "200000000000000001" }, channelId: "100000000000000002", guildId: null, targetMessage: selected,
    deferReply: async (options: { flags: number }) => { assert.equal(options.flags, 64); order.push("defer"); },
    editReply: async (options: unknown) => { reply = options; order.push("reply"); },
  }, async () => { order.push("capture"); return { kind: "draft", url: "https://vrdex.test/events/new?draft=draft-1", changed: false }; });
  assert.deepEqual(order, ["defer", "capture", "reply"]);
  assert.match(JSON.stringify(reply), /https:\/\/vrdex.test\/events\/new\?draft=draft-1/);
  assert.doesNotMatch(JSON.stringify(reply), /Harbor|Ivy|300000000000000001/);
});
