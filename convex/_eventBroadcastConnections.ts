import { v } from "convex/values";
import { parseVrcdnStreamLinks } from "./_vrcdnLinks";
export const connectionProvider = v.union(v.literal("vrcdn"), v.literal("twitch"), v.literal("custom"));
export const managedConnectionValidator = v.object({ communityProfileId: v.id("profiles"), provider: connectionProvider, serverUrl: v.string(), revision: v.number(), requestId: v.string(), testState: v.union(v.literal("not_tested"), v.literal("passed"), v.literal("failed")) });
export function managedSecretName(community: string, event: string, request: string) {
  if (![community, event].every(x => /^[a-zA-Z0-9]{1,64}$/.test(x)) || !/^[a-f0-9-]{36}$/.test(request)) throw Error("Invalid connection request.");
  return `vrdex/broadcast/${community}/${event}/${request}`;
}
export function managedSecretRefAllowed(ref: string, community: string, event: string, request: string) {
  const prefix = process.env.VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX;
  return !!prefix && /^arn:aws[a-z-]*:secretsmanager:[a-z0-9-]+:\d{12}:secret:$/.test(prefix) && new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${managedSecretName(community, event, request)}-[A-Za-z0-9]{6}$`).test(ref);
}
export function normalizeConnection(input: { provider: "vrcdn" | "twitch" | "custom"; serverUrl: string; playbackUrl: string }) {
  if(input.serverUrl.length>2048||input.playbackUrl.length>2048)throw Error("Connection URL is too long.");
  let server: URL; try { server = new URL(input.serverUrl); } catch { throw Error("Enter a valid stream server URL."); }
  if (!["rtmp:", "rtmps:"].includes(server.protocol) || server.username || server.password || server.search || server.hash || !server.hostname || (server.port && !["1935", "443"].includes(server.port))) throw Error("Enter a valid RTMP or RTMPS server URL.");
  if (input.provider === "vrcdn" && (!/^(?:[a-z0-9-]+\.)?ingest\.vrcdn\.live$/.test(server.hostname) || server.pathname !== "/live")) throw Error("Enter a VRCDN ingest server URL.");
  if (input.provider === "twitch" && (!/^(?:[a-z0-9-]+\.)?live\.twitch\.tv$/.test(server.hostname) || server.pathname !== "/app")) throw Error("Enter a Twitch ingest server URL.");
  const stream = parseVrcdnStreamLinks(input.playbackUrl);
  let playback: URL; try { playback = new URL(stream && !stream.directVideoUrl ? stream.hlsUrl : input.playbackUrl); } catch { throw Error("Enter a valid playback URL."); }
  if (playback.protocol !== "https:" || playback.username || playback.password || playback.hash || playback.search) throw Error("Enter an HTTPS playback URL.");
  return { serverUrl: server.toString().replace(/\/$/, ""), playbackUrl: playback.toString() };
}
