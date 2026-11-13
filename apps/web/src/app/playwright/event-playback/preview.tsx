"use client";
import { EventOperatorPreview, type PreviewSource } from "@/app/_components/event-operator-preview";
import { EventWatchSurface } from "@/app/_components/event-watch-surface";
import { VrcdnStreamPlayer } from "@/app/_components/vrcdn-stream-player";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useEventPlayback } from "@/app/_components/event-playback-provider";
import { EventPlaybackInline } from "@/app/_components/event-playback-inline";
import { eventPlaybackRequest, profilePlaybackRequest } from "@/lib/event-playback-request";
import { playbackFixtureEvent } from "./fixture-state";
export function PlaybackFixture({ eventId, twitch, nativeTrial = false }: { eventId: "a" | "b"; twitch: boolean; nativeTrial?: boolean }) {
  const owner = useEventPlayback();
  const [operatorPreview,setOperatorPreview]=useState(false);
  const [previewSource, setPreviewSource] = useState<PreviewSource>({
    input: { kind: "twitch", channel: "preview" },
    publicUrl: "https://www.twitch.tv/preview", label: "Operator preview",
  });
  const [startAt] = useState(() => Date.now() - 1000);
  const request = useMemo(() => {
    const playback = eventPlaybackRequest(playbackFixtureEvent(eventId, twitch, startAt));
    if (!playback) throw new Error("Playback fixture must have a public source");
    return { ...playback, href: `/playwright/event-playback?event=${eventId}` };
  }, [eventId, twitch, startAt]);
  if (nativeTrial) {
    const profile = profilePlaybackRequest({ id: "profile", slug: "playwright/event-playback", displayName: "Trial DJ", outboundLinks: [{ type: "vrcdn", url: "https://stream.vrcdn.live/live/Alpha.live.mp4" }] }, "Alpha");
    return <main className="mx-auto w-full max-w-3xl p-6">
      <Link href="/playwright/event-playback?event=b">Browse</Link>
      <div data-event-playback-inline="profile:profile:Alpha">
        <button type="button" onClick={() => { if (owner && profile) void owner.play(profile); }}>Play trial</button>
      </div>
    </main>;
  }
  return <main className="mx-auto w-full max-w-3xl p-6">
    <Link href={`/playwright/event-playback?event=${eventId === "a" ? "b" : "a"}`}>Other event</Link>
    <Link href="/playwright/event-lineup">Browse</Link>
    <EventWatchSurface enabled startAt={startAt} mediaLinks={[{ type: "watch", label: "Legacy", url: "https://youtube.com/watch?v=fixture123", presentation: "open" }]} />
    <EventWatchSurface enabled startAt={startAt} mediaLinks={[{ type: "watch", label: "Clip", url: "https://clips.twitch.tv/Fixture", presentation: "open" }]} />
    <VrcdnStreamPlayer initialMuted src="/preview.live.ts" title="Preview" />
    <VrcdnStreamPlayer src="/profile.live.ts" title="Profile" />
    <button onClick={()=>setOperatorPreview(true)}>Operator preview</button>
    {operatorPreview ? <>
      <button onClick={() => setPreviewSource(current => ({ ...current, label: "Renamed preview" }))}>Rename preview</button>
      <button onClick={() => setPreviewSource(current => ({ ...current, input: { kind: "twitch", channel: "replacement" }, publicUrl: "https://www.twitch.tv/replacement" }))}>Replace preview</button>
      <EventOperatorPreview source={previewSource} onClose={() => setOperatorPreview(false)} />
    </> : null}
    {owner && <EventPlaybackInline owner={owner} request={request} />}
  </main>;
}
