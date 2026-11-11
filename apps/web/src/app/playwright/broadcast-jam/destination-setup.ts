import { parseVrcdnStreamLinks } from "../../../../../../convex/_vrcdnLinks";

export type BroadcastConnection = {
  label: string;
  provider: "Twitch" | "VRCDN" | "Custom";
  tested: boolean;
  serverUrl: string;
  playback: { label: string; url: string }[];
};

export const serverPresets = {
  Twitch: "rtmp://live.twitch.tv/app",
  VRCDN: "rtmp://ingest.vrcdn.live/live",
  Custom: "",
};

export function checkIngestUrl(value: string) {
  const message = "Enter a valid server URL starting with rtmp:// or rtmps://.";
  if (!URL.canParse(value.trim())) throw Error(message);
  const url = new URL(value.trim());
  if (!["rtmp:", "rtmps:"].includes(url.protocol) || url.username || url.password || url.hash)
    throw Error(message);
  return url;
}

export function setupPlaybackLinks(value: string): BroadcastConnection["playback"] {
  const vrcdn = parseVrcdnStreamLinks(value.trim());
  if (vrcdn && !vrcdn.directVideoUrl) return [{ label: "PC URL", url: vrcdn.pcUrl }, { label: "Quest URL", url: vrcdn.questUrl }];
  const message = "Enter a valid playback URL starting with https:// or rtspt://.";
  if (!URL.canParse(value.trim())) throw Error(message);
  const url = new URL(value.trim());
  if (!["https:", "rtspt:"].includes(url.protocol) || url.username || url.password || url.hash)
    throw Error(message);
  return [{ label: "World URL", url: url.href }];
}

export const demoConnection: BroadcastConnection = {
  label: "World stream",
  provider: "VRCDN",
  tested: true,
  serverUrl: serverPresets.VRCDN,
  playback: setupPlaybackLinks("https://panel.vrcdn.live/preview/afterglow-demo"),
};
