import { v } from "convex/values";
import { joinLineupSlot as joinSlot, inferLineupEnds } from "../packages/api-contracts/src/lineup-timing";
import { isInScheduledWatchWindow, timedEventRuntimeEndAt } from "./_eventRuntime";
import { parseVrcdnStreamLinks } from "./_vrcdnLinks";
import { twitchLoginFromUrl } from "./_twitchLinks";
import type { PublicEvent } from "./_eventPublic";

export const LIVE_SOURCE_LIMIT = 20;
export const LIVE_FRESHNESS_MS = 90_000;
export const LIVE_SCAN_LIMIT = 20;
export const liveProvider = v.union(v.literal("vrcdn"), v.literal("twitch"));
export const liveStatus = v.union(v.literal("live"), v.literal("offline"), v.literal("unavailable"));
export const sourceValidator = v.object({ key: v.string(), provider: liveProvider, identity: v.string() });
export type LiveSource = { key: string; provider: "vrcdn" | "twitch"; identity: string };
type LiveEvent = Pick<PublicEvent, "startAt" | "endAt" | "doorsOpenAt" | "scheduleKind"> & {
  status?: PublicEvent["status"];
  watchMode?: PublicEvent["watchMode"];
  watchSurfaceEnabled?: boolean;
  mediaLinks: Array<Pick<PublicEvent["mediaLinks"][number], "type" | "url">>;
  slots: Array<Pick<PublicEvent["slots"][number], "position" | "startAt" | "endAt" | "stream"> & { playbackKey?: string }>;
};
export function eventLiveSource(event: LiveEvent, now: number): (LiveSource & { slotKey?: string; validUntil: number }) | null {
  if (event.status === "cancelled" || event.scheduleKind === "date_only" || event.startAt === undefined ||
    !isInScheduledWatchWindow({ ...event, startAt: event.startAt, now })) return null;
  const validUntil = timedEventRuntimeEndAt({ startAt: event.startAt, endAt: event.endAt });
  if (event.watchSurfaceEnabled && event.watchMode !== "performer_sequence") {
    const ranks = ["watch", "stream", "vrcdn"];
    const link = event.mediaLinks.filter(link => ranks.includes(link.type)).sort((a, b) => ranks.indexOf(a.type) - ranks.indexOf(b.type))[0];
    if (!link) return null;
    const stream = parseVrcdnStreamLinks(link.url);
    if (stream && !stream.directVideoUrl) return { key: `vrcdn:${stream.streamId}`, provider: "vrcdn", identity: stream.streamId, validUntil };
    const login = twitchLoginFromUrl(link.url);
    return login ? { key: `twitch:${login}`, provider: "twitch", identity: login, validUntil } : null;
  }
  const slot = joinSlot(inferLineupEnds(event.slots.slice().sort((a, b) => a.position - b.position).map(slot => ({ ...slot, key: slot.playbackKey ?? "" })), event.endAt), now);
  return slot?.key && slot.stream ? { key: `vrcdn:${slot.stream.streamId}`, provider: "vrcdn", identity: slot.stream.streamId, slotKey: slot.key, validUntil: Math.min(slot.endAt ?? validUntil, validUntil) } : null;
}
export function dueLiveSources(sources: LiveSource[], observed: ReadonlyMap<string, number>): LiveSource[] {
  return [...new Map(sources.map(source => [source.key, source])).values()]
    .sort((a, b) => (observed.get(a.key) ?? -Infinity) - (observed.get(b.key) ?? -Infinity) || a.key.localeCompare(b.key))
    .slice(0, LIVE_SOURCE_LIMIT);
}
