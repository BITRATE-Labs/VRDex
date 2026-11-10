import { parseVrcdnStreamLinks } from "../../../../convex/_vrcdnLinks";
export type BroadcastProvider = "vrcdn" | "twitch" | "custom";
export const broadcastServers = {vrcdn:"rtmp://ingest.vrcdn.live/live",twitch:"rtmps://live.twitch.tv:443/app",custom:""};
export function checkBroadcastServer(value:string) {
  const message = "Enter a valid server URL starting with rtmp:// or rtmps://.";
  if (!URL.canParse(value.trim())) throw Error(message);
  const url = new URL(value.trim());
  if (!["rtmp:","rtmps:"].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw Error(message);
  return url.href;
}
export function broadcastPlaybackLinks(value:string) {
  const stream = parseVrcdnStreamLinks(value.trim());
  if (stream && !stream.directVideoUrl) return [{platform:"pc",label:"PC URL",url:stream.pcUrl},{platform:"quest",label:"Quest URL",url:stream.questUrl}];
  const message = "Enter a valid playback URL starting with https:// or rtspt://.";
  if (!URL.canParse(value.trim())) throw Error(message);
  const url = new URL(value.trim());
  if (!["https:","rtspt:"].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw Error(message);
  return [{platform:"web",label:"World URL",url:url.href}];
}
