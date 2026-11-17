import { ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, ContextMenuCommandBuilder, InteractionContextType, MessageFlags } from "discord.js";
import { logFailure, postIntake, requireOk } from "./relay";

export const personalEventCommand = new ContextMenuCommandBuilder().setName("Add event").setType(3)
  .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

type Selection = {
  id: string; user: { id: string }; channelId: string | null; guildId: string | null;
  targetMessage: {
    id: string; content?: string; author?: { id: string }; editedTimestamp?: number | null;
    embeds?: readonly { title?: string | null; description?: string | null; fields?: readonly { name: string; value: string }[] }[];
    attachments: ReadonlyMap<string, { id?: string; url: string; contentType: string | null; size: number }>;
  };
};
export function buildSelectedMessage(interaction: Selection) {
  const message = interaction.targetMessage;
  return {
    interactionId: interaction.id, invokerDiscordUserId: interaction.user.id, channelId: interaction.channelId,
    ...(interaction.guildId ? { guildId: interaction.guildId } : {}),
    message: {
      messageId: message.id, ...(message.author ? { authorId: message.author.id } : {}),
      ...(message.editedTimestamp ? { editedAt: message.editedTimestamp } : {}),
      sourceText: [message.content, ...(message.embeds ?? []).flatMap(embed => [embed.title, embed.description, ...(embed.fields ?? []).map(field => `${field.name}: ${field.value}`)])].filter(Boolean).join("\n"),
      attachments: [...message.attachments.entries()].flatMap(([id, item]) =>
        ["image/png", "image/jpeg", "image/webp"].includes(item.contentType ?? "")
          ? [{ id, url: item.url, contentType: item.contentType!, byteLength: item.size }] : []),
    },
  };
}
type CaptureReply = { kind: "draft" | "event" | "link_required"; url: string; changed?: boolean } | { kind: "unavailable" };
type PersonalInteraction = Selection & {
  deferReply(options: { flags: typeof MessageFlags.Ephemeral }): Promise<unknown>;
  editReply(options: { content: string; components: ActionRowBuilder<ButtonBuilder>[]; allowedMentions: { parse: never[] } }): Promise<unknown>;
};
export async function handlePersonalIntake(interaction: PersonalInteraction, capture = async (input: ReturnType<typeof buildSelectedMessage>): Promise<CaptureReply> => {
  const response = await postIntake("/discord-intake/selected-message", input);
  requireOk(response);
  const body = await response.json() as Record<string, unknown>;
  if (body.kind === "unavailable") return { kind: "unavailable" };
  if (!["draft", "event", "link_required"].includes(String(body.kind)) || typeof body.url !== "string") throw new Error("INVALID_CAPTURE_REPLY");
  const url = new URL(body.url);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("INVALID_CAPTURE_REPLY");
  return { kind: body.kind as "draft" | "event" | "link_required", url: url.toString(), changed: body.changed === true };
}) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await capture(buildSelectedMessage(interaction));
    const label = result.kind === "link_required" ? "Link Discord" : "Review";
    const components = result.kind === "unavailable" ? [] : [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(result.url))];
    await interaction.editReply({ content: result.kind === "unavailable" ? "Unavailable" : result.changed ? "Source changed" : "Add event", components, allowedMentions: { parse: [] } });
  } catch (error) {
    logFailure("discord_personal_intake_failed", error);
    await interaction.editReply({ content: "Unavailable", components: [], allowedMentions: { parse: [] } });
  }
}
