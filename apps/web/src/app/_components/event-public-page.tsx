"use client";
import { inferLineupEnds } from "@vrdex/api-contracts";
import { useQuery } from "convex/react";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex-generated-api";
import { EventContributionControls } from "../events/event-contribution-controls";

import { actionCardVariants, actionLabelClassName, actionMetaClassName, inlineActionClassName } from "@/components/ui/action-card";
import { buttonVariants } from "@/components/ui/button";
import { CopyValueRow } from "@/components/ui/copy-value-row";
import { Card, Eyebrow } from "@/components/ui/card";
import { EntityImage } from "@/components/ui/entity-image";
import { PageContainer, PageShell } from "@/components/ui/page-shell";
import { cn } from "@/lib/cn";
import { safeImageBackground } from "@/lib/safe-image";
import { publicEventPath } from "@/lib/event-path";
import { avatarFrameStyle, type AvatarAppearance } from "@/lib/avatar-appearance";
import { EventWatchForEvent } from "./event-live-watch";
import { EventPublicHero } from "./event-public-hero";
import styles from "./event-public-page.module.css";
import { parseVrcdnStreamLinks } from "../../../../../convex/_vrcdnLinks";
import { ViewerLocalEventDateTime, ViewerLocalEventTime, ViewerLocalEventTimeRange } from "./viewer-local-event-times";

type EventSourceType = "manual" | "community" | "partner" | "import" | "ai_suggested" | "contributor";
type EventMediaLinkType =
  | "event_page"
  | "watch"
  | "stream"
  | "vrcdn"
  | "discord"
  | "ticket"
  | "other";
type EventMediaLinkPresentation = "open" | "copy";
type ProfileTrustLabel =
  | "community_submitted"
  | "unclaimed"
  | "claimed_unverified"
  | "claimed_verified";

type ProjectedEvent = NonNullable<FunctionReturnType<typeof api.events.getPublicBySlug>>;
export type EventOutboundLinks = ProjectedEvent["participants"][number]["outboundLinks"];

type DiscordTimestampSet = {
  shortTime: string;
  longTime: string;
  shortDate: string;
  longDate: string;
  shortDateTime: string;
  longDateTime: string;
  relative: string;
};

export type PublicEventPreview = {
  slug?: string;
  title: string;
  startAt?: number;
  scheduleKind?: "timed" | "date_only";
  eventDate?: string;
  doorsOpenAt?: number;
  endAt?: number;
  timezone?: string;
  status?: "scheduled" | "cancelled";
  communityName?: string;
  communitySlug?: string;
  summary?: string;
  posterImageUrl?: string;
  bannerImageUrl?: string;
  thumbnailImageUrl?: string;
  communityImageUrl?: string;
  communityAvatarAppearance?: AvatarAppearance;
  source: {
    sourceType: EventSourceType;
    label: string;
    url?: string;
  };
  worlds: Array<{
    slug: string;
    displayName: string;
  }>;
  participantCount: number;
  slotCount: number;
  nextSlots?: Array<{
    startAt: number;
    endAt?: number;
    displayLabel: string;
    roleLabel: string;
    performer?: {
      slug: string;
      displayName: string;
    };
  }>;
};

export type PublicEvent = Omit<PublicEventPreview, "worlds"> & {
  venueLabel?: string;
  lineup?: PublicEventLineupEntry[];
  id: string;
  slug: string;
  seriesId?: string;
  watchSurfaceEnabled: boolean;
  watchMode?: ProjectedEvent["watchMode"];
  authoredBannerImageUrl?: string;
  authoredThumbnailImageUrl?: string;
  authoredMediaLinks: Array<{
    type: EventMediaLinkType;
    label: string;
    url: string;
    presentation: EventMediaLinkPresentation;
  }>;
  mediaLinks: Array<{
    type: EventMediaLinkType;
    label: string;
    url: string;
    presentation: EventMediaLinkPresentation;
  }>;
  worlds: Array<{
    slug: string;
    displayName: string;
    tags: string[];
    summary?: string;
    heroImageUrl?: string;
    association: {
      sourceType: EventSourceType;
      confirmationState: "confirmed" | "unconfirmed";
      confirmedAt?: number;
    };
  }>;
  participants: Array<{
    slug: string;
    displayName: string;
    roleLabel: string;
    outboundLinks?: EventOutboundLinks;
    trustLabel: ProfileTrustLabel;
    imageUrl?: string;
    avatarAppearance?: AvatarAppearance;
    source: {
      sourceType: EventSourceType;
      label: string;
      url?: string;
    };
  }>;
  slots: Array<{
    playbackKey?: string;
    stream?: ProjectedEvent["slots"][number]["stream"];
    position: number;
    startAt: number;
    endAt?: number;
    displayLabel: string;
    roleLabel: string;
    discord: DiscordTimestampSet;
    performer?: {
      slug: string;
      displayName: string;
      outboundLinks?: EventOutboundLinks;
      trustLabel: ProfileTrustLabel;
      imageUrl?: string;
      avatarAppearance?: AvatarAppearance;
    };
    source: {
      sourceType: EventSourceType;
      label: string;
      url?: string;
    };
  }>;
};

const eventPosterOverlay = "linear-gradient(135deg, color-mix(in srgb, var(--media) 72%, transparent), color-mix(in srgb, var(--accent) 12%, transparent))";

function safeHttpsUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function initialsFor(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "V";
}

function EventAvatar({
  appearance,
  imageUrl,
  label,
}: {
  appearance?: AvatarAppearance;
  imageUrl?: string;
  label: string;
}) {
  return (
    <EntityImage
      alt=""
      className="size-14 rounded-control border border-accent/20 bg-accent/10 text-xs text-accent-strong"
      fallback={initialsFor(label)}
      label={label}
      sizes="56px"
      src={imageUrl}
      style={appearance ? avatarFrameStyle(undefined, appearance) : undefined}
    />
  );
}

export function EventPreviewCard({
  event,
  variant = "default",
  seriesSummary,
}: {
  event: PublicEventPreview;
  variant?: "default" | "series";
  seriesSummary?: string;
}) {
  const titleId = useId();
  const dateId = titleId + "-date";
  const sourceUrl = safeHttpsUrl(event.source.url);
  const thumbnailStyle = safeImageBackground(event.thumbnailImageUrl, eventPosterOverlay);
  const details = event.worlds.map((world) => world.displayName);
  const eventPath = publicEventPath(event);
  const isSeries = variant === "series";
  const hasDate = event.startAt !== undefined || (event.scheduleKind === "date_only" && event.eventDate !== undefined);
  const hasSeriesDate = isSeries && hasDate;
  const hasDatedTitle = hasSeriesDate && Boolean(eventPath);
  const summary = isSeries && event.summary === seriesSummary ? undefined : event.summary;
  const dateTime = <ViewerLocalEventDateTime timestamp={event.startAt} eventDate={event.eventDate} scheduleKind={event.scheduleKind} />;
  const useThemeColors = !thumbnailStyle;
  const compactWithoutArtwork = !isSeries && useThemeColors;

  return (
    <article className={cn(
      "group overflow-hidden rounded-card border border-border bg-surface-strong text-sm transition hover:-translate-y-0.5",
      compactWithoutArtwork && "self-start",
    )}>
      <div
        className={cn(
          "px-4",
          !compactWithoutArtwork && "bg-[linear-gradient(135deg,var(--canvas-muted),var(--surface-raised))] bg-cover bg-center",
          isSeries ? "py-3" : compactWithoutArtwork ? "pt-4" : "min-h-28 py-4",
          useThemeColors ? "text-foreground" : "text-white",
        )}
        style={thumbnailStyle}
      >
        {(!compactWithoutArtwork || hasDate) ? (
          <div className={cn(
            "flex flex-wrap items-center text-sm font-medium",
            isSeries || compactWithoutArtwork ? "gap-x-3 gap-y-1" : "gap-x-4 gap-y-1",
            useThemeColors ? "text-muted" : "text-white/84",
          )}>
            {hasSeriesDate ? (
              <span className={cn("text-lg font-semibold leading-tight", useThemeColors ? "text-foreground" : "text-white")} id={hasDatedTitle ? dateId : undefined}>
                {dateTime}
              </span>
            ) : dateTime}
            {event.startAt !== undefined && event.doorsOpenAt !== undefined && event.doorsOpenAt < event.startAt ? (
              <span className={compactWithoutArtwork ? "sm:border-s sm:border-border-strong sm:ps-3" : undefined}>
                Doors <ViewerLocalEventTime timestamp={event.doorsOpenAt} />
              </span>
            ) : null}
            {!compactWithoutArtwork && event.communityName ? (
              <span className={isSeries ? undefined : "min-w-0 font-normal [overflow-wrap:anywhere]"}>{event.communityName}</span>
            ) : null}
          </div>
        ) : null}
        <h3 className={cn(
          isSeries
            ? "mt-2 text-base font-medium [overflow-wrap:anywhere]"
            : "font-semibold tracking-[-0.04em]",
          !isSeries && (compactWithoutArtwork ? "text-xl sm:text-2xl" : "text-2xl"),
          compactWithoutArtwork && "break-words",
          compactWithoutArtwork && hasDate && "mt-2",
          !isSeries && !compactWithoutArtwork && "mt-4",
        )}>
          {eventPath ? (
            <Link
              className={cn(
                "rounded-sm underline decoration-1 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current",
                compactWithoutArtwork ? "underline-offset-[6px]" : "underline-offset-4",
              )}
              href={eventPath}
              id={hasDatedTitle ? titleId : undefined}
              aria-labelledby={hasDatedTitle ? titleId + " " + dateId : undefined}
            >
              {event.title}
            </Link>
          ) : event.title}
        </h3>
        {compactWithoutArtwork && event.communityName ? <p className="mt-2 break-words text-sm font-medium text-muted">{event.communityName}</p> : null}
      </div>
      <div className={cn(
        "grid px-4",
        isSeries ? "gap-2 py-2.5" : compactWithoutArtwork ? "gap-2 pb-4 pt-3" : "gap-3 py-4",
      )}>
        {summary ? <p className="leading-6 text-muted">{summary}</p> : null}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {details.map((detail) => (
            <span key={detail}>{detail}</span>
          ))}
          {sourceUrl ? (
            <a
              className={cn(
                "inline-flex min-w-0 items-center gap-1 font-medium text-accent-strong underline decoration-accent/35 underline-offset-4 [overflow-wrap:anywhere]",
                compactWithoutArtwork && "min-h-6 text-sm",
              )}
              href={sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {event.source.label}
              <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
            </a>
          ) : (
            <span>{event.source.label}</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function EventBackendNotice({ kind }: { kind: "missing-url" | "error" }) {
  return (
    <PageShell className="py-10">
      <PageContainer max="3xl">
      <Card className="shadow-panel" padding="lg">
        <Eyebrow>Event page</Eyebrow>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
          {kind === "missing-url" ? "Convex URL not configured" : "Event read failed"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
          {kind === "missing-url"
            ? "Run the local backend bootstrap before loading public event pages from this worktree."
            : "Start the local Convex backend and reload this page once the event query is reachable."}
        </p>
        <Link
          className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "mt-6")}
          href="/"
        >
          Back to homepage
        </Link>
      </Card>
      </PageContainer>
    </PageShell>
  );
}

export type PublicEventLineupEntry = {
  key: string;
  position: number;
  displayLabel: string;
  roleLabel?: string;
  startAt?: number;
  endAt?: number;
  performer?: PublicEvent["slots"][number]["performer"];
};

/** Legacy payloads remain usable while the backend and web deploy separately. */
export function eventLineupForDisplay(event: PublicEvent): PublicEventLineupEntry[] {
  if (event.lineup !== undefined) return inferLineupEnds(event.lineup, event.endAt);
  const slots = event.scheduleKind === "date_only" ? [] : event.slots;
  const represented = new Set(slots.flatMap(slot => slot.performer ? [slot.performer.slug] : []));
  return inferLineupEnds<PublicEventLineupEntry>([
    ...slots.map(slot => ({ ...slot, key: slot.playbackKey ?? `slot-${slot.position}-${slot.startAt}` })),
    ...event.participants.filter(person => !represented.has(person.slug)).map((person, index) => ({
      key: `person-${person.slug}`, position: slots.length + index, displayLabel: person.displayName,
      roleLabel: person.roleLabel, performer: person,
    })),
  ], event.endAt);
}

export function EventPublicPage({ event: initialEvent }: { event: PublicEvent }) {
  const projection = useQuery(api.events.getPublicBySlug, { slug: initialEvent.slug });
  const event = projection === undefined ? initialEvent : projection;
  return event ? <EventPublicPageContent event={event} /> : null;
}

function EventPublicPageContent({ event }: { event: PublicEvent }) {
  const [reportOpen, setReportOpen] = useState(false);
  const canHost = useQuery(api.events.getHostAccess, event.communitySlug ? { slug: event.slug, communitySlug: event.communitySlug } : "skip");
  const lineup = eventLineupForDisplay(event);
  const bannerStyle = safeImageBackground(event.bannerImageUrl, eventPosterOverlay);
  const sourceUrl = safeHttpsUrl(event.source.url);
  const seriesPath = event.seriesId && event.communitySlug ? `/${event.communitySlug}/series/${event.seriesId}` : null;
  const publicLinks = event.mediaLinks.filter((link) => parseVrcdnStreamLinks(link.url) === null);
  const eventPath = publicEventPath(event);
  const standaloneHost = Boolean(event.communitySlug || event.communityName)
    && !bannerStyle && !event.posterImageUrl && !event.watchSurfaceEnabled
    && event.worlds.length === 0 && lineup.length === 0 && event.slots.length === 0
    && !seriesPath && !sourceUrl && event.mediaLinks.length === 0;
  const locationLinkClassName = cn(
    actionCardVariants({ padding: "sm" }),
    "w-full min-w-0 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-auto",
  );

  const hostDetails = event.communitySlug ? (
    <Link
      className={cn(
        actionCardVariants({ variant: standaloneHost ? "surface" : "accent" }),
        "flex items-center gap-3",
        standaloneHost && "max-w-full justify-self-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      )}
      href={`/${event.communitySlug}`}
    >
      <EventAvatar appearance={event.communityAvatarAppearance} imageUrl={event.communityImageUrl} label={event.communityName ?? "Community profile"} />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className={actionLabelClassName}>
          {event.communityName ?? "Community profile"}
        </span>
        <span className={actionMetaClassName}>Host</span>
      </span>
    </Link>
  ) : event.communityName ? (
    <div className={cn(
      "rounded-control border border-border bg-surface px-4 py-3 font-medium",
      standaloneHost && "max-w-full justify-self-start [overflow-wrap:anywhere]",
    )}>
      {event.communityName}
    </div>
  ) : (
    <p className="leading-6 text-muted">No host listed.</p>
  );

  return (
    <PageShell className="py-5 sm:py-6 lg:py-7" tone="event">
      <PageContainer className="gap-5">
        <EventPublicHero
          bannerStyle={bannerStyle}
          canHost={canHost === true}
          event={event}
          eventPath={eventPath}
          onReport={() => setReportOpen(true)}
        />

        {event.source.sourceType === "contributor" ? <p className="text-sm text-muted">{event.source.label}</p> : null}
        <EventContributionControls eventId={event.id} reportOpen={reportOpen} onReportClose={() => setReportOpen(false)} />
        <section className={cn(styles.media, "grid grid-cols-[minmax(0,1fr)] items-start gap-4")}>
          <div className={styles.lead}>
            <div className={styles.watch}><EventWatchForEvent event={event} /></div>
            {event.worlds.length > 0 || sourceUrl ? (
              <div className={cn(styles.locationLinks, "flex flex-wrap gap-2")}>
                {event.worlds.map((world) => (
                  <Link className={locationLinkClassName} href={`/${world.slug}`} key={world.slug}>
                    <span className={actionLabelClassName}>{world.displayName}</span>
                    <span className={actionMetaClassName}>World</span>
                  </Link>
                ))}
                {sourceUrl ? (
                  <a className={locationLinkClassName} href={sourceUrl} rel="noreferrer" target="_blank">
                    <span className="flex items-start gap-2">
                      <span className={actionLabelClassName}>{event.source.label}</span>
                      <ExternalLink aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-accent-strong" />
                    </span>
                    <span className={actionMetaClassName}>Reference link</span>
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
          {event.posterImageUrl ? (
            <div className={cn(styles.poster, "lg:sticky lg:top-6")}>
              <a href={event.posterImageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-card border border-border bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.posterImageUrl} alt={event.title + " poster"} className="h-auto w-full object-contain" />
              </a>
            </div>
          ) : null}

          {standaloneHost ? hostDetails : (
            <Card className={cn(styles.details, "text-sm")} surface="white">
              {hostDetails}
            </Card>
          )}
        </section>

        {lineup.length > 0 ? (
          <Card surface="white">
            <h2 className="text-xl font-semibold tracking-tight">Lineup</h2>
            <ol className="mt-5 divide-y divide-border">
              {lineup.map((row) => (
                <li className="flex min-w-0 items-center gap-4 py-4 first:pt-0 last:pb-0" key={row.key}>
                  <EventAvatar appearance={row.performer?.avatarAppearance} imageUrl={row.performer?.imageUrl} label={row.displayLabel} />
                  <div className="min-w-0">
                    {row.performer ? (
                      <Link className={cn(inlineActionClassName, "[overflow-wrap:anywhere]")} href={`/${row.performer.slug}`}>{row.displayLabel}</Link>
                    ) : <span className="font-semibold [overflow-wrap:anywhere]">{row.displayLabel}</span>}
                    {row.roleLabel && row.roleLabel.trim().toLowerCase() !== "participant" ? <div className="mt-1 text-sm text-muted">{row.roleLabel}</div> : null}
                    {row.startAt !== undefined ? <ViewerLocalEventTimeRange className="mt-1 block text-sm text-muted" endAt={row.endAt} startAt={row.startAt} /> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {seriesPath || publicLinks.length > 0 ? (
          <Card surface="white">
            <Eyebrow>Links</Eyebrow>
            <div className="mt-4 grid gap-3">
              {seriesPath ? <Link className={actionCardVariants({ variant: "accent" })} href={seriesPath}>
                <span className={actionLabelClassName}>Upcoming nights</span>
              </Link> : null}
              {publicLinks.map((link) => link.presentation === "copy" ? (
                <CopyValueRow compact key={`${link.type}-${link.url}`} label={link.label} value={link.url} />
              ) : (
                <a className={actionCardVariants({ variant: "accent" })} href={link.url} key={`${link.type}-${link.url}`} rel="noreferrer" target="_blank">
                  <span className={actionLabelClassName}>
                    {link.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    Open link
                  </span>
                </a>
              ))}
            </div>
          </Card>
        ) : null}
      </PageContainer>
    </PageShell>
  );
}
