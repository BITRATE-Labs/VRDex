import { canonicalDirectMediaUrl } from "./_directMediaUrl";
import { parseVrcdnStreamLinks, createVrcdnStreamLinks } from "./_vrcdnLinks";
import { twitchLoginFromUrl } from "./_twitchLinks";
import type { BroadcastInputRef } from "./_eventBroadcastSources";

export function parseBroadcastInputUrl(value: string): BroadcastInputRef {
  const channel = twitchLoginFromUrl(value);
  if (channel !== null) return { kind: "twitch", channel };
  const stream = parseVrcdnStreamLinks(value);
  if (stream !== null && stream.directVideoUrl === undefined) return { kind: "vrcdn", streamId: stream.streamId };
  return { kind: "direct_media", url: canonicalDirectMediaUrl(value) };
}

export function normalizeBroadcastInput(input: BroadcastInputRef): BroadcastInputRef {
  const normalized = parseBroadcastInputUrl(input.kind === "vrcdn" ? `vrcdn:${input.streamId}` : input.kind === "twitch" ? `https://www.twitch.tv/${input.channel}` : input.url);
  if (broadcastInputKey(normalized) !== broadcastInputKey(input)) {
    throw new Error("Broadcast input reference must be canonical.");
  }
  return normalized;
}

export function broadcastInputKey(input: BroadcastInputRef): string {
  return input.kind === "vrcdn" ? `vrcdn:${input.streamId}` : input.kind === "twitch" ? `twitch:${input.channel}` : `direct_media:${input.url}`;
}

export function broadcastInputPublicUrl(input: BroadcastInputRef): string {
  const canonical = normalizeBroadcastInput(input);
  if (canonical.kind === "twitch") return `https://www.twitch.tv/${canonical.channel}`;
  if (canonical.kind === "direct_media") return canonical.url;
  const stream = createVrcdnStreamLinks(canonical.streamId);
  if (stream === null) throw new Error("Invalid VRCDN stream.");
  return stream.questUrl;
}

