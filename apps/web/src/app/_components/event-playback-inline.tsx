"use client";
import { useEffect } from "react";
import type { EventPlaybackOwner, PlaybackRequest } from "@/lib/event-playback-owner";
import { useEventPlaybackSnapshot } from "./event-playback-provider";
import { useCurrentTimestamp } from "./event-watch-surface";
import { canStartEventPlayback } from "@/lib/event-playback-request";
import { WatchPlayPoster } from "./vrcdn-stream-player";

/** Presentation-only. There is deliberately no video, iframe, or transport mount here. */
export function EventPlaybackInline({ owner, request }: { owner: EventPlaybackOwner; request: Extract<PlaybackRequest,{eventId:string}> }) {
  const state = useEventPlaybackSnapshot(owner);
  const active = state.request?.eventId === request.eventId;
  const recovery = state.status === "unavailable" || (state.status === "blocked" && request.kind !== "twitch");
  const now = useCurrentTimestamp(request.kind === "performer_sequence" ? request.event.slots.flatMap(slot => slot.endAt === undefined ? [slot.startAt] : [slot.startAt, slot.endAt]) : []);
  useEffect(() => { owner.update(request); }, [owner, request]);
  if (!active && !canStartEventPlayback(request, now)) return null;
  return <div className="overflow-hidden rounded-card border border-border bg-media text-white" data-event-playback-inline={request.eventId}>
    {active ? recovery ? <div aria-hidden="true" style={{ height: "var(--event-playback-recovery-height, 196px)" }} /> : <div aria-hidden="true"><div className={request.kind === "twitch" ? "h-[300px]" : "aspect-video"} /><div className={request.kind === "twitch" ? "h-[104px]" : "h-[152px]"} />{request.kind === "performer_sequence" && <div className="h-14" />}</div> : <>
      <button type="button" aria-label={`Play ${request.title}`} className="block w-full" onClick={() => {
        void owner.play(request);
        requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-event-id] button")?.focus({ preventScroll: true }));
      }}><WatchPlayPoster /></button>
      {request.kind === "twitch" && request.sourceId.startsWith("https://") && <a className="block px-4 py-3" href={request.sourceId} target="_blank" rel="noreferrer">Open stream</a>}
    </>}
  </div>;
}
