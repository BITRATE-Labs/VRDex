"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { HomeSearchPage } from "../../_components/home-search-page";
import { HomeLiveNow } from "../../_components/home-live-now";
import { EventPlaybackInline } from "../../_components/event-playback-inline";
import { useEventPlayback } from "../../_components/event-playback-provider";
import { eventPlaybackRequest } from "@/lib/event-playback-request";
import { previewEvent } from "../event-editor/preview";
import type { PublicEvent } from "../../_components/event-public-page";
import type { LiveEntry } from "../../../../../../convex/eventLive";
import type { Id } from "../../../../../../convex/_generated/dataModel";

function setup() {
  const now = Date.now();
  const event: PublicEvent = { ...previewEvent, id: "home-live-fixture", slug: "home-live-fixture", title: "Harbor Sessions", startAt: now - 60_000, doorsOpenAt: now - 60_000, endAt: now + 3600_000,
    watchSurfaceEnabled: false, watchMode: "performer_sequence", lineup: undefined, slots: [{ ...previewEvent.slots[0], playbackKey: "current", position: 0, startAt: now - 60_000, endAt: now + 1800_000, displayLabel: "Aurora",
      performer: { ...previewEvent.slots[0].performer!, slug: "aurora", displayName: "Aurora" }, stream: { streamId: "fixture", pcUrl: "http://127.0.0.1:6799/audible.live.ts", questUrl: "http://127.0.0.1:6799/audible.live.ts" } }] };
  const entry: LiveEntry = { eventId: "home-live-fixture" as Id<"events">, eventSlug: event.slug, title: event.title, href: "/playwright/home-live-now?view=event", sourceKey: "vrcdn:fixture", expiresAt: now + 90_000,
    imageUrl: "/seed/fixture-avatar-luma.svg", host: { slug: "afterglow", displayName: "Afterglow" }, performer: { slug: "aurora", displayName: "Aurora" }, performerLabel: "Aurora" };
  let entries: LiveEntry[] = [entry];
  let mode = "live";
  const listeners = new Set<() => void>();
  const readEvent = () => mode === "removed" ? { ...event, slots: event.slots.map(slot => ({ ...slot, stream: undefined })) } : event;
  const client = { query: async (query: FunctionReference<"query">) => {
    const name = getFunctionName(query);
    if (name === "events:getPublicBySlug") return readEvent();
    if (name === "eventTimeline:listPublic" || name === "eventTimeline:listPublicRoster") return { items: [], performers: [], cursor: null, complete: true };
    if (name === "eventTimeline:resolveSaved") return [];
    throw new Error(`Unexpected fixture query ${name}`);
  }, watchQuery: (query: FunctionReference<"query">) => {
    const name = getFunctionName(query);
    if (name === "eventLive:listPublic" || name === "eventLive:forPerformer") return {
      localQueryResult: () => name === "eventLive:listPublic" ? entries : entries.length === 1 ? entries[0] : null,
      onUpdate: (callback: () => void) => { listeners.add(callback); return () => listeners.delete(callback); }, journal: () => undefined,
    };
    return { localQueryResult: () => ({ items: [], cursor: null, complete: true }), onUpdate: () => () => {}, journal: () => undefined };
  } } as unknown as ConvexReactClient;
  return { event, entry, client, readEvent, change(next: string, at: number) {
    mode = next;
    entries = mode === "empty" ? [] : mode === "many" ? Array.from({ length: 5 }, (_, i) => ({ ...entry, eventId: `home-live-${i}` as Id<"events">, title: `Harbor Sessions ${i + 1}` })) : mode === "expiring" ? [
      { ...entry, expiresAt: at + 1000 },
      { ...entry, eventId: "later-fixture" as Id<"events">, title: "Later event", expiresAt: at + 2200 },
    ] : [{ ...entry, ...(mode === "broken-image" ? { imageUrl: "/test-media/missing-live-art.png" } : {}), expiresAt: mode === "expired" ? at - 1 : entry.expiresAt }];
    listeners.forEach(listener => listener());
  } };
}
export default function Fixture() {
  const [fixture] = useState(setup);
  const owner = useEventPlayback();
  const params = useSearchParams();
  const view = params.get("view") ?? "home";
  const [{ mode }, setScenario] = useState({ mode: "live", at: fixture.entry.expiresAt - 90_000 });
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (typeof input === "string" && new URL(input, location.href).pathname === "/api/query" && typeof init?.body === "string" && JSON.parse(init.body).path === "events:getPublicBySlug") return new Response(JSON.stringify({ status: "success", value: fixture.readEvent() }), { headers: { "Content-Type": "application/json" } });
      return original(input, init);
    };
    return () => { window.fetch = original; };
  }, [fixture]);
  if (!owner) return null;
  const row = <HomeLiveNow performerSlug={view === "dj" ? "aurora" : undefined} />;
  const request = eventPlaybackRequest(fixture.event);
  return <ConvexProvider client={fixture.client}>
    <div className="flex flex-wrap gap-4 p-4 text-sm"><span>Live now fixture</span><label>State <select aria-label="Fixture state" value={mode} onChange={event => { const mode = event.target.value, at = Date.now(); fixture.change(mode, at); setScenario({ mode, at }); }}>
      <option value="live">Live</option><option value="many">Several live events</option><option value="broken-image">Image unavailable</option><option value="expiring">Expiring entries</option><option value="empty">Empty</option><option value="expired">Expired</option><option value="removed">Source removed before Play</option>
    </select></label><Link href="/playwright/home-live-now">Home view</Link><Link href="/playwright/home-live-now?view=event">Event view</Link><Link href="/playwright/home-live-now?view=dj">DJ view</Link></div>
    {view === "home" ? <HomeSearchPage beforeSchedule={row} /> : <main className="mx-auto w-full max-w-5xl p-6"><h1>{view === "dj" ? "Aurora" : "Harbor Sessions"}</h1>{row}{request && <EventPlaybackInline owner={owner} request={request} />}</main>}
  </ConvexProvider>;
}
