"use client";

import type { PlaybackStatus } from "@/lib/event-playback-owner";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePostHog } from "posthog-js/react";

import { WatchPlayPoster } from "./vrcdn-stream-player";
import { useEventPlayback } from "./event-playback-provider";
import { LinkTypeIcon, hostLabel } from "./public-profile-links";
import { ProfileDestinationArtwork } from "./profile-destination-artwork";
import { buttonVariants } from "@/components/ui/button";
import { ConnectionVerification } from "@/components/ui/connection-verification";
import { Card, SectionHeading } from "@/components/ui/card";
import { CopyValueRow } from "@/components/ui/copy-value-row";
import { cn } from "@/lib/cn";
import {
  parseVrcdnLiveStates,
  type VrcdnLiveStates,
} from "@/lib/vrcdn-live";
import { VrcdnLiveHeartbeat } from "@/lib/vrcdn-live-heartbeat";
import {
  applyVrcdnLiveStates,
  createVrcdnLiveLifecycles,
  type VrcdnLiveLifecycles,
} from "@/lib/vrcdn-live-lifecycle";
import { captureProductEvent } from "@/lib/posthog";

export type ProfileVrcdnStream = {
  claimable: boolean;
  key: string;
  label: string;
  pcUrl: string;
  questUrl: string;
  directVideoUrl?: string;
  streamId: string;
};

const profileLinkCardClassName = "h-full min-h-20 w-full justify-start gap-3 whitespace-normal rounded-card px-4 py-3 text-left text-sm";
const profileLinkIconClassName = "flex size-12 shrink-0 items-center justify-center [&>span]:bg-transparent";

type ProfileVrcdnLink = {
  type?: Parameters<typeof LinkTypeIcon>[0]["type"];
  verifiedAt?: number;
  live?: boolean;
  href: string;
  key: string;
  label: string;
  platform?: string;
  kind?: "vrchat_user" | "vrchat_group" | "discord_guild";
  artworkUrl?: string;
};

type ProfileDiscordHandle = {
  handle: string;
  key: string;
};

type ProfileVrcdnStreamsProps = {
  discordHandles: ProfileDiscordHandle[];
  initialLiveStates?: VrcdnLiveStates;
  links: ProfileVrcdnLink[];
  profileSlug: string;
  profileId?: string;
  displayName?: string;
  streams: ProfileVrcdnStream[];
};

function responseStates(value: unknown): VrcdnLiveStates | null {
  if (typeof value !== "object" || value === null || !("states" in value)) {
    return null;
  }

  return parseVrcdnLiveStates(value.states);
}

export function ProfileVrcdnStreams({
  discordHandles,
  initialLiveStates,
  links,
  profileSlug,
  profileId,
  displayName,
  streams,
}: ProfileVrcdnStreamsProps) {
  const posthog = usePostHog();
  const playback = useEventPlayback();
  const claimableStreamIds = useMemo(() => [
    ...new Set(streams.filter(({ claimable }) => claimable).map(({ streamId }) => streamId)),
  ], [streams]);
  const streamIdentity = claimableStreamIds.join("\u0000");
  const [lifecycles, setLifecycles] = useState<VrcdnLiveLifecycles>(() =>
    createVrcdnLiveLifecycles(claimableStreamIds, initialLiveStates ?? {}, Date.now()),
  );
  const lifecyclesRef = useRef(lifecycles);
  const heartbeatRef = useRef<VrcdnLiveHeartbeat>(null);
  const [activePlaybackStreamIds, setActivePlaybackStreamIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [retained, setRetained] = useState<{ streamId: string; status: PlaybackStatus }>();
  const conflictEpisodesRef = useRef(new Set<string>());

  useEffect(() => {
    if (claimableStreamIds.length === 0) {
      return;
    }

    const heartbeat = new VrcdnLiveHeartbeat({
      probe: async (signal) => {
        let states: VrcdnLiveStates = {};

        try {
          const response = await fetch(
            `/api/profile-live/${encodeURIComponent(profileSlug)}/vrcdn`,
            { cache: "no-store", signal },
          );

          if (response.ok) {
            const parsed = responseStates(await response.json());
            if (parsed !== null) {
              states = parsed;
            }
          }
        } catch {
          if (signal.aborted) {
            return { hasUnavailable: false };
          }
        }

        const result = applyVrcdnLiveStates(
          lifecyclesRef.current,
          claimableStreamIds,
          states,
          Date.now(),
        );
        lifecyclesRef.current = result.lifecycles;
        setLifecycles(result.lifecycles);

        return {
          hasUnavailable: result.hasUnavailable,
          ...(result.pendingOfflineDelayMs === undefined
            ? {}
            : { pendingOfflineDelayMs: result.pendingOfflineDelayMs }),
        };
      },
    });
    heartbeatRef.current = heartbeat;
    heartbeat.start();

    return () => {
      if (heartbeatRef.current === heartbeat) {
        heartbeatRef.current = null;
      }
      heartbeat.stop();
    };
  }, [claimableStreamIds, profileSlug, streamIdentity]);

  useEffect(() => {
    heartbeatRef.current?.setPlaybackActive(activePlaybackStreamIds.size > 0);
  }, [activePlaybackStreamIds]);

  useEffect(() => {
    for (const streamId of claimableStreamIds) {
      const lifecycle = lifecycles[streamId];
      const playbackActive = activePlaybackStreamIds.has(streamId);
      const conflict = lifecycle?.presentation === "offline" && playbackActive;

      if (conflict && !conflictEpisodesRef.current.has(streamId)) {
        conflictEpisodesRef.current.add(streamId);
        captureProductEvent(posthog, "media_state_anomaly_detected", {
          anomaly_kind: "confirmed_offline_while_playing",
          provider: "vrcdn",
          surface: "profile",
        });
      } else if (lifecycle?.presentation === "live" || !playbackActive) {
        conflictEpisodesRef.current.delete(streamId);
      }
    }
  }, [activePlaybackStreamIds, claimableStreamIds, lifecycles, posthog]);

  useEffect(() => {
    if (!playback) return;
    const sync=()=>{
      const state=playback.getSnapshot();
      const active=state.request;
      const streamId=active && "profileId" in active && active.profileId===profileId ? active.sourceId : undefined;
      setRetained(previous => previous?.streamId === streamId && previous?.status === state.status ? previous : streamId ? { streamId, status: state.status } : undefined);
      setActivePlaybackStreamIds(previous=>{
        const next=streamId && state.status==="playing" ? streamId : undefined;
        if(previous.size===(next?1:0) && (!next || previous.has(next)))return previous;
        return new Set(next?[next]:[]);
      });
      if(streamId && state.status==="unavailable")heartbeatRef.current?.requestSanityCheck();
    };
    sync();return playback.subscribe(sync);
  },[playback,profileId]);

  const hasLinks = links.length > 0 || discordHandles.length > 0;
  const hasWatchSurface = streams.length > 0;

  return (
    <div className={cn("grid min-w-0 grid-cols-1 gap-x-10", hasWatchSurface ? "lg:grid-cols-[minmax(0,1fr)_24rem]" : undefined)}>
      <div>
        {hasLinks ? (
          <section className="py-8">
            <SectionHeading>Links</SectionHeading>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {links.map((link) => {
                const vrchat = link.kind === "vrchat_user" || link.kind === "vrchat_group" || link.type === "vrchat_profile";
                const service = vrchat ? link.platform ?? "VRChat" : link.type === "twitch" ? "Twitch" : null;
                const label = vrchat ? link.label.replace(/^VRChat\s*:\s*/i, "").trim() || link.label : link.label;
                return (
                  <a className={cn(buttonVariants({ variant: "secondary" }), profileLinkCardClassName)} href={link.href} key={link.key} rel="noreferrer" target="_blank">
                    <span aria-hidden="true" className={cn(profileLinkIconClassName, vrchat ? "[&>svg]:size-10" : "[&>svg]:size-6")}>
                      {link.kind && link.artworkUrl ? <ProfileDestinationArtwork kind={link.kind} src={link.artworkUrl} /> : <LinkTypeIcon type={link.kind === "discord_guild" ? "discord" : vrchat ? "vrchat_profile" : link.type ?? "website"} />}
                    </span>
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      <span className="block font-medium">{service ?? label}</span>
                      {service ? <span className="mt-0.5 block text-xs font-normal text-muted">{label}</span> : null}
                      {link.live ? <span className="mt-0.5 block text-xs font-normal text-success">Live now</span> : null}
                      {link.verifiedAt !== undefined ? <ConnectionVerification at={link.verifiedAt} group={link.kind === "vrchat_group"} /> : !service ? <span className="mt-0.5 block text-xs font-normal text-muted">{link.platform ?? hostLabel(link.href)}</span> : null}
                    </span>
                    <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                  </a>
                );
              })}
              {discordHandles.map(({ handle, key }) => (
                <CopyValueRow actionOnly className={profileLinkCardClassName} key={key} label="Discord" value={handle}>
                  <span aria-hidden="true" className={cn(profileLinkIconClassName, "[&>svg]:size-6")}><LinkTypeIcon type="discord" /></span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="block font-medium">Discord</span>
                    <span className="mt-0.5 block text-xs font-normal text-muted">{handle}</span>
                  </span>
                </CopyValueRow>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {hasWatchSurface ? (
        <aside className="min-w-0 space-y-3 py-8">
          {streams.map(({ claimable, key, label, pcUrl, questUrl, directVideoUrl, streamId }) => {
            const lifecycle = lifecycles[streamId];
            const live = claimable && lifecycle?.presentation === "live";
            const playbackActive = activePlaybackStreamIds.has(streamId);
            const showPlayer = claimable && (
              live || lifecycle?.status === "pending_offline" || playbackActive || retained?.streamId === streamId
            );
            const title = streams.length > 1 ? `${label} ${streamId}` : label;

            return (
              <Card className="min-w-0" padding="sm" aria-label={title} key={key}>
                <div className="flex items-center gap-3 pb-2">
                  <p className="font-medium">{label}</p>
                  {live ? <span className="text-sm font-medium text-success">Live now</span> : null}
                </div>

                <div>
                  <CopyValueRow className="grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 border-0 py-1 [&_code]:truncate [&_code]:break-normal" label="Quest" value={questUrl} />
                  <CopyValueRow className="grid-cols-[3rem_minmax(0,1fr)] items-center gap-2 border-0 py-1 [&_code]:truncate [&_code]:break-normal" label="PC" value={pcUrl} />
                </div>
                {showPlayer ? (
                  <div className="mt-3 overflow-hidden rounded-control border border-border">
                    <div data-event-playback-inline={`profile:${profileId}:${streamId}`}>
                      {retained?.streamId === streamId ? <div aria-hidden="true"><div className="aspect-video" /><div className="h-[152px]" />{(retained.status === "blocked" || retained.status === "unavailable") && <div className="h-11" />}</div> : <button type="button" aria-label={`Play ${title}`} className="block w-full" disabled={!playback || !profileId}
                        onClick={()=>{if(playback && profileId)void playback.play({kind:"vrcdn",profileId,profileSlug,title:`${displayName ?? profileSlug} - VRDex`,href:`/${profileSlug}`,sourceId:streamId,src:directVideoUrl??questUrl,transport:directVideoUrl?"video":"mpegts"});}}><WatchPlayPoster /></button>}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </aside>
      ) : null}
    </div>
  );
}
