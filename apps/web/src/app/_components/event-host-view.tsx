"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex-generated-api";

import { Card } from "@/components/ui/card";
import { EntityImage } from "@/components/ui/entity-image";
import { buttonVariants } from "@/components/ui/button";
import { CopyValueRow } from "@/components/ui/copy-value-row";
import { PageContainer, PageShell } from "@/components/ui/page-shell";
import { eventDjTarget, type DjTarget } from "@/lib/event-dj-target";
import { publicEventPath } from "@/lib/event-path";
import {
  parseSourceObservations,
  reportedSourceState,
  type SourceObservation,
} from "@/lib/event-source-observations";
import { eventLineupForDisplay, type PublicEvent } from "./event-public-page";
import { ViewerLocalEventTimeRange } from "./viewer-local-event-times";
import { EventOperatorPreview } from "./event-operator-preview";
import { VrcdnStreamPlayer } from "./vrcdn-stream-player";

export function EventHostView({ event: initialEvent }: { event: PublicEvent }) {
  const projection = useQuery(api.events.getHostBySlug, { slug: initialEvent.slug, communitySlug: initialEvent.communitySlug ?? '' });
  const event = projection === undefined ? initialEvent : projection;
  return event ? <EventHostContent event={event} /> : null;
}

function performerTargets(performer: PublicEvent["slots"][number]["performer"]) {
  return [...new Map((performer?.outboundLinks ?? []).flatMap(link => {
    const target = eventDjTarget(link.url);
    return target ? [[target.key, target] as const] : [];
  })).values()];
}

type HostSourceProps = {
  target: DjTarget;
  observation?: SourceObservation;
  now: number;
  selected: boolean;
  previewing: boolean;
  onPreview: () => void;
};

function HostSource({ target, observation, now, selected, previewing, onPreview }: HostSourceProps) {
  const state = reportedSourceState(observation, now);
  const status = state === "live" ? "Live now" : state === "offline" ? "Offline" : state === "unavailable" ? "Unavailable" : "Unknown";
  const previewUrl = target.questUrl;
  const twitchChannel = target.key.startsWith("twitch:") ? target.key.slice(7) : undefined;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium [overflow-wrap:anywhere]">
          {target.pcUrl ? `VRCDN · ${target.label}` : target.label}
          {selected ? " · Selected source" : ""}
        </span>
        <span className={state === "live" ? "text-success" : state === "unavailable" ? "text-warning" : "text-muted"} title={observation ? new Date(observation.observedAt).toISOString() : undefined}>
          {status}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {target.pcUrl && target.questUrl ? (
          <>
            <CopyValueRow actionOnly label="PC" value={target.pcUrl} />
            <CopyValueRow actionOnly label="Quest" value={target.questUrl} />
          </>
        ) : <CopyValueRow actionOnly label={target.label} value={target.url} />}
        {previewUrl || twitchChannel ? (
          <button className={buttonVariants({ size: "sm", variant: "ghost" })} type="button" onClick={onPreview}>
            {previewing ? "Close preview" : "Preview"}
          </button>
        ) : (
          <a className={buttonVariants({ size: "sm", variant: "ghost" })} href={target.url} target="_blank" rel="noreferrer">Open</a>
        )}
        <details className="min-w-0 text-sm">
          <summary className="w-fit cursor-pointer text-muted">URLs</summary>
          <div className="mt-2 grid gap-2 [overflow-wrap:anywhere]">
            {target.pcUrl && target.questUrl ? (
              <><code className="text-xs">PC: {target.pcUrl}</code><code className="text-xs">Quest: {target.questUrl}</code></>
            ) : <code className="text-xs">{target.url}</code>}
          </div>
        </details>
      </div>
      {previewing && twitchChannel ? <EventOperatorPreview source={{input:{kind:"twitch",channel:twitchChannel},label:target.label,publicUrl:target.url}} onClose={onPreview}/> : null}
      {previewing && previewUrl ? (
        <div className="mt-4 overflow-hidden rounded-control border border-border">
          <VrcdnStreamPlayer src={previewUrl} title={target.label} initialMuted initialStarted />
        </div>
      ) : null}
    </div>
  );
}

export function EventHostContent({ event }: { event: PublicEvent }) {
  const [observations, setObservations] = useState<Record<string, SourceObservation>>({});
  const [now, setNow] = useState(0);
  const [preview, setPreview] = useState<{
    slotKey: string;
    sourceKey: string;
    performer: PublicEvent["slots"][number]["performer"];
  } | null>(null);
  const path = publicEventPath(event);
  const lineup = eventLineupForDisplay(event);

  const next = now > 0 ? lineup.filter(row => row.startAt !== undefined && row.startAt > now)
    .sort((a, b) => a.startAt! - b.startAt! || a.position - b.position)[0] : undefined;
  const nextSlot = next ? event.slots.find(slot => slot.playbackKey === next.key) : undefined;
  const nextTargets = performerTargets(next?.performer);
  const nextSource = nextTargets.find(target => target.key === (nextSlot?.stream ? `vrcdn:${nextSlot.stream.streamId}` : undefined))
    ?? nextTargets.find(target => target.pcUrl) ?? nextTargets[0];
  const nextState = nextSource ? reportedSourceState(observations[nextSource.key], now) : undefined;

  const previewKey=preview?.sourceKey;
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      setNow(Date.now());
      try {
        const response = await fetch(`${path}/host/status${previewKey?`?sources=${encodeURIComponent(previewKey)}`:""}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (response.ok) {
          const data = parseSourceObservations(await response.json());
          if (!cancelled) setObservations(data);
        }
      } catch { /* Links remain usable during provider failures. */ }
      finally { if (!cancelled) timer = setTimeout(() => void refresh(), 30_000); }
    };
    void refresh();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [path,previewKey]);

  return (
    <PageShell>
      <PageContainer className="gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Host view</h1>
            <p className="mt-2 text-muted">{event.title}</p>
          </div>
          <Link className={buttonVariants({ variant: "secondary" })} href={path ?? "/events"}>Event page</Link>
        </header>
        {next ? (
          <Card padding="sm" aria-label="Up next" className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm text-muted">Up next</h2>
              <p className="mt-1 font-semibold [overflow-wrap:anywhere]">{next.performer ? <Link className="hover:underline focus-visible:underline" href={`/${next.performer.slug}`}>{next.performer.displayName}</Link> : next.displayLabel}</p>
              <div className="mt-1 text-sm text-muted"><ViewerLocalEventTimeRange startAt={next.startAt!} endAt={next.endAt} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {nextSource ? (
                <>
                  <span className={`mr-2 text-sm ${nextState === "live" ? "text-success" : "text-muted"}`}>Source: {nextState}</span>
                  {nextSource.pcUrl && nextSource.questUrl ? <>
                    <CopyValueRow actionOnly label="Next PC" value={nextSource.pcUrl} />
                    <CopyValueRow actionOnly label="Next Quest" value={nextSource.questUrl} />
                  </> : <CopyValueRow actionOnly label="Next link" value={nextSource.url} />}
                </>
              ) : <span className="text-sm text-muted">No links</span>}
            </div>
          </Card>
        ) : null}
        <Card padding="none" aria-label="Lineup" className="overflow-hidden">
          <div aria-hidden="true" className="hidden grid-cols-[9rem_14rem_minmax(0,1fr)] gap-5 border-b border-border bg-surface-strong px-5 py-3 text-xs font-medium text-muted lg:grid">
            <span>Set</span><span>Performer</span><span>Sources</span>
          </div>
          {lineup.map(row => {
            const slot = event.slots.find(slot => slot.playbackKey === row.key);
            const targets = performerTargets(row.performer);
            const selectedKey = slot?.stream ? `vrcdn:${slot.stream.streamId}` : undefined;
            const primary = targets.find(target => target.key === selectedKey) ?? targets.find(target => target.pcUrl) ?? targets[0];
            const alternatives = targets.filter(target => target.key !== primary?.key);
            const scheduleEnd = row.endAt ?? lineup.find(next => next.position > row.position && next.startAt !== undefined)?.startAt ?? event.endAt;
            const scheduled = now > 0 && row.startAt !== undefined && row.startAt <= now && scheduleEnd !== undefined && now < scheduleEnd;
            const renderSource = (target: DjTarget) => {
              const previewing = preview?.slotKey === row.key && preview.sourceKey === target.key && preview.performer === row.performer;
              return (
                <HostSource
                  key={target.key}
                  target={target}
                  observation={observations[target.key]}
                  now={now}
                  selected={target.key === selectedKey}
                  previewing={previewing}
                  onPreview={() => setPreview(previewing ? null : {
                    slotKey: row.key, sourceKey: target.key, performer: row.performer,
                  })}
                />
              );
            };

            return (
              <section key={row.key} aria-label={row.performer?.displayName ?? row.displayLabel} className="grid min-w-0 gap-4 border-b border-border p-4 last:border-b-0 sm:p-5 lg:grid-cols-[9rem_14rem_minmax(0,1fr)] lg:gap-5">
                <div className="text-sm">
                  {row.startAt !== undefined ? <ViewerLocalEventTimeRange startAt={row.startAt} endAt={row.endAt} /> : <span className="text-muted">Time TBA</span>}
                  {scheduled ? <p className="mt-1 text-xs text-accent">Scheduled now</p> : null}
                </div>
                <div className="flex min-w-0 items-start gap-3">
                  <EntityImage label={row.performer?.displayName ?? row.displayLabel} src={row.performer?.imageUrl} className="size-10 rounded-control" sizes="40px" />
                  <div className="min-w-0">
                    <h2 className="font-semibold [overflow-wrap:anywhere]">{row.performer ? <Link className="hover:underline focus-visible:underline" href={`/${row.performer.slug}`}>{row.performer.displayName}</Link> : row.displayLabel}</h2>
                    {row.roleLabel ? <p className="mt-1 text-xs text-muted">{row.roleLabel}</p> : null}
                  </div>
                </div>
                <div className="min-w-0">
                  {primary ? renderSource(primary) : <span className="text-sm text-muted">No links</span>}
                  {alternatives.length ? (
                    <details className="mt-3 border-t border-border pt-3" onToggle={event => {
                      if (!event.currentTarget.open && preview?.slotKey === row.key && alternatives.some(target => target.key === preview.sourceKey)) setPreview(null);
                    }}>
                      <summary className="cursor-pointer text-sm text-muted">Other links</summary>
                      <div className="mt-3 grid gap-4">{alternatives.map(renderSource)}</div>
                    </details>
                  ) : null}
                </div>
              </section>
            );
          })}
        </Card>
      </PageContainer>
    </PageShell>
  );
}
