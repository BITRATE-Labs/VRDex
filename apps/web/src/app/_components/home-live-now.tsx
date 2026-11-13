"use client";
import Link from "next/link";
import Image from "next/image";
import { useConvex } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { api } from "@convex-generated-api";
import type { LiveEntry } from "../../../../../convex/eventLive";
import type { PublicEvent } from "./event-public-page";
import { eventLiveSource } from "../../../../../convex/_eventLive";
import type { EventPlaybackOwner } from "@/lib/event-playback-owner";
import { eventPlaybackRequest } from "@/lib/event-playback-request";
import { useEventPlayback, useEventPlaybackSnapshot } from "./event-playback-provider";

// An older public lookup must not replace a later selection in another surface.
const playIntents = new WeakMap<EventPlaybackOwner, symbol>();

export function HomeLiveNow({ initialEntries = [], performerSlug }: { initialEntries?: LiveEntry[]; performerSlug?: string }) {
  const client = useConvex();
  const owner = useEventPlayback();
  const [entries, setEntries] = useState(initialEntries);
  useEffect(() => {
    if (!client) return;
    let unsubscribe = () => {};
    try {
      const watch = performerSlug ? client.watchQuery(api.eventLive.forPerformer, { slug: performerSlug }) : client.watchQuery(api.eventLive.listPublic, {});
      const update = () => { try { const next = watch.localQueryResult(); if (next !== undefined) setEntries((Array.isArray(next) ? next : next ? [next] : []).filter(entry => entry.expiresAt > Date.now())); } catch { setEntries([]); } };
      unsubscribe = watch.onUpdate(update);
      update();
    } catch { /* The optional row cannot break the schedule during backend rollout. */ }
    return unsubscribe;
  }, [client, performerSlug]);
  if (!owner) return null;
  return <LiveNowEntries entries={entries} owner={owner} loadEvent={async slug => client ? client.query(api.events.getPublicBySlug, { slug }) : null} />;
}

/** Cache entries describe discovery; Play independently resolves today's public source. */
export function LiveNowEntries({ entries, owner, loadEvent }: {
  entries: LiveEntry[]; owner: EventPlaybackOwner; loadEvent(slug: string): Promise<PublicEvent | null>;
}) {
  const state = useEventPlaybackSnapshot(owner);
  const [now, setNow] = useState(0);
  const lookup = useRef<symbol | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      const at = Date.now();
      setNow(at);
      const nextExpiry = Math.min(...entries.filter(entry => entry.expiresAt > at).map(entry => entry.expiresAt));
      if (Number.isFinite(nextExpiry)) timer = window.setTimeout(update, Math.max(1, nextExpiry - at + 1));
    };
    timer = window.setTimeout(update, 0);
    return () => window.clearTimeout(timer);
  }, [entries]);
  const fresh = entries.filter(entry => entry.expiresAt > now);
  if (!fresh.length) return null;
  return <section className="home-live-row" aria-label="Live now">
    <h2 className="home-live-heading"><span aria-hidden="true" className="home-live-dot" />Live now</h2>
    <div className="home-live-entries">{fresh.map(entry => {
      const active = state.request?.eventId === entry.eventId;
      const playing = active && (state.status === "playing" || state.status === "loading");
      const actual = active && state.request?.kind === "performer_sequence" ? state.request.event.slots.find(slot => slot.key === state.lineup?.current) : undefined;
      const performerSlug = actual ? actual.performerId : entry.performer?.slug;
      const performerLabel = actual?.label ?? entry.performerLabel ?? entry.performer?.displayName;
      return <article key={entry.eventId} className="home-live-entry" data-active={active || undefined}>
        {entry.imageUrl && <LiveArtwork key={entry.imageUrl} src={entry.imageUrl} />}
        <div className="home-live-identity">
          <Link className="home-live-title" href={entry.href}>{entry.title}</Link>
          {performerLabel && (performerSlug ? <Link className="home-live-performer" href={`/${performerSlug}`}>{performerLabel}</Link> : <span className="home-live-performer">{performerLabel}</span>)}
          {(entry.host?.displayName ?? entry.hostName) && <span className="home-live-host">{entry.host?.displayName ?? entry.hostName}</span>}
        </div>
        <button type="button" className="home-live-play" disabled={pending === entry.eventId} aria-label={`${playing ? "Pause" : "Play"} ${entry.title}`} onClick={async () => {
          const intent = Symbol();
          lookup.current = intent;
          playIntents.set(owner, intent);
          const generation = owner.generation;
          if (playing) { owner.pause(); setPending(null); return; }
          if (entry.expiresAt <= Date.now()) { setPending(null); return; }
          setPending(entry.eventId);
          let deadline: number | undefined;
          try {
            const event = await Promise.race([
              loadEvent(entry.eventSlug),
              new Promise<null>(resolve => { deadline = window.setTimeout(() => resolve(null), 10_000); }),
            ]).finally(() => window.clearTimeout(deadline));
            if (playIntents.get(owner) !== intent || owner.generation !== generation || !event || entry.expiresAt <= Date.now() || eventLiveSource(event, Date.now())?.key !== entry.sourceKey) return;
            const request = eventPlaybackRequest(event);
            if (request) { setPending(null); await owner.play(request); }
          } catch { /* A failed fresh projection cannot authorize playback. */ } finally { if (lookup.current === intent) setPending(null); }
        }}>{playing ? <Pause aria-hidden="true" size={17} fill="currentColor" /> : <Play aria-hidden="true" size={17} fill="currentColor" />}</button>
      </article>;
    })}</div>
  </section>;
}

function LiveArtwork({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <Image unoptimized src={src} alt="" width="64" height="64" className="home-live-artwork" onError={() => setFailed(true)} />;
}
