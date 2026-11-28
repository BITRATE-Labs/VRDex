"use client";
import { inferLineupEnds } from "@vrdex/api-contracts";
import { useQuery } from "convex/react";
import { ArrowUp, ChevronRight, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useId, useState } from "react";
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
import { useEventLineupReturn } from "./event-lineup-return";
import styles from "./event-public-page.module.css";
import { parseVrcdnStreamLinks } from "../../../../../convex/_vrcdnLinks";
import { ViewerLocalEventDateTime, ViewerLocalEventTimeRange } from "./viewer-local-event-times";

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

const eventPosterOverlay = "linear-gradient(135deg, color-mix(in srgb, var(--media) 72%, transparent), color-mix(in srgb, var(--media) 72%, transparent))";
const eventPreviewOverlay = "linear-gradient(135deg, color-mix(in srgb, var(--media) 72%, transparent), color-mix(in srgb, var(--media) 69%, transparent))";
const watchArtScrim = "linear-gradient(180deg, rgb(0 0 0 / 36%), rgb(0 0 0 / 68%))";

function parseHttpsUrl(url: string | undefined): URL | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed : null;
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

export function EventScheduleNowLabel({ onArtwork = false }: { onArtwork?: boolean }) {
  return (
    <span className={cn(
      "inline-block rounded-control border px-1.5 py-0.5 text-xs font-semibold leading-4 sm:px-2 sm:text-sm sm:leading-5",
      onArtwork ? "border-white/45 bg-white/15 text-white" : "border-accent/45 bg-accent-muted text-accent-strong",
    )}>
      Now
    </span>
  );
}

export function EventPreviewCard({
  event,
  variant = "default",
  seriesSummary,
  scheduledNow = false,
  yearReferenceAt,
}: {
  event: PublicEventPreview;
  variant?: "default" | "series" | "community";
  seriesSummary?: string;
  scheduledNow?: boolean;
  yearReferenceAt?: number;
}) {
  const titleId = useId();
  const dateId = titleId + "-date";
  const sourceUrl = parseHttpsUrl(event.source.url)?.href;
  const thumbnailStyle = safeImageBackground(event.thumbnailImageUrl, eventPreviewOverlay);
  const details = event.worlds.map((world) => world.displayName);
  const eventPath = publicEventPath(event);
  const isSeries = variant === "series";
  const hasDate = event.startAt !== undefined || (event.scheduleKind === "date_only" && event.eventDate !== undefined);
  const hasSeriesDate = isSeries && hasDate;
  const hasDatedTitle = hasSeriesDate && Boolean(eventPath);
  const summary = isSeries && event.summary === seriesSummary ? undefined : event.summary;
  const dateTime = (
    <ViewerLocalEventDateTime
      timestamp={event.startAt}
      eventDate={event.eventDate}
      scheduleKind={event.scheduleKind}
      yearReferenceAt={yearReferenceAt}
    />
  );
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
          useThemeColors ? "text-foreground" : "bg-media text-white",
        )}
        style={thumbnailStyle}
      >
        {(!compactWithoutArtwork || hasDate) ? (
          <div className={cn(
            "flex flex-wrap items-center text-sm font-medium",
            isSeries || compactWithoutArtwork ? "gap-x-3 gap-y-1" : "gap-x-4 gap-y-1",
            useThemeColors ? "text-muted" : "text-white/84",
          )}>
            {scheduledNow ? <EventScheduleNowLabel onArtwork={!useThemeColors} /> : null}
            {hasSeriesDate ? (
              <span className={cn("text-lg font-semibold leading-tight", useThemeColors ? "text-foreground" : "text-white")} id={hasDatedTitle ? dateId : undefined}>
                {dateTime}
              </span>
            ) : dateTime}
            {event.startAt !== undefined && event.doorsOpenAt !== undefined && event.doorsOpenAt < event.startAt ? (
              <span className={compactWithoutArtwork ? "sm:border-s sm:border-border-strong sm:ps-3" : undefined}>
                Doors <ViewerLocalEventDateTime timestamp={event.doorsOpenAt} compactRelativeTo={event.startAt} />
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
                variant === "default" && "sm:block",
                !isSeries && "max-sm:flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center max-sm:[overflow-wrap:anywhere]",
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
        <div className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted", variant === "community" && "max-sm:items-center")}>
          {details.map((detail) => (
            <span key={detail}>{detail}</span>
          ))}
          {sourceUrl ? (
            <a
              className={cn(
                "inline-flex min-w-0 items-center gap-1 font-medium text-accent-strong underline decoration-accent/35 underline-offset-4 [overflow-wrap:anywhere]",
                compactWithoutArtwork && "min-h-6 text-sm",
                variant === "community" && "max-sm:min-h-11 max-sm:min-w-11",
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
  const lineupMetadataId = useId();
  const canHost = useQuery(api.events.getHostAccess, event.communitySlug ? { slug: event.slug, communitySlug: event.communitySlug } : "skip");
  const lineup = eventLineupForDisplay(event);
  const { listRef, posterRef, rememberLineupRow } = useEventLineupReturn(event.slug, event.posterImageUrl);
  const bannerStyle = safeImageBackground(event.bannerImageUrl, eventPosterOverlay);
  const watchBannerArt = safeImageBackground(event.bannerImageUrl, watchArtScrim);
  const watchPosterArt = safeImageBackground(event.posterImageUrl, watchArtScrim);
  const watchArt = watchBannerArt ?? watchPosterArt;
  const desktopWatchArt = watchBannerArt && watchBannerArt.backgroundImage !== watchPosterArt?.backgroundImage
    ? watchBannerArt
    : undefined;
  const sourceUrl = parseHttpsUrl(event.source.url)?.href;
  const seriesPath = event.seriesId && event.communitySlug ? `/${event.communitySlug}/series/${event.seriesId}` : null;
  const publicLinks = event.mediaLinks.filter((link) => parseVrcdnStreamLinks(link.url) === null);
  const isOpenMediaLink = (link: PublicEvent["mediaLinks"][number]) =>
    link.presentation === "open" && (link.type === "watch" || link.type === "stream");
  const hasMediaLinks = publicLinks.some(isOpenMediaLink);
  const linksLabel = hasMediaLinks ? "Media links" : publicLinks.length > 0 ? "Links" : undefined;
  const linksHeading = hasMediaLinks && (seriesPath || !publicLinks.every(isOpenMediaLink)) ? "Event links" : linksLabel;
  const eventPath = publicEventPath(event);
  const hasWorlds = event.worlds.length > 0;
  const hasLocationLinks = hasWorlds || Boolean(sourceUrl);
  const showHostBeforePoster = !hasLocationLinks && !event.watchSurfaceEnabled && Boolean(event.posterImageUrl && event.communitySlug);
  const hasCompactHost = showHostBeforePoster || (hasLocationLinks && Boolean(event.communitySlug || event.communityName));
  const standaloneHost = Boolean(event.communitySlug || event.communityName)
    && !bannerStyle && !event.posterImageUrl && !event.watchSurfaceEnabled
    && event.worlds.length === 0 && lineup.length === 0 && event.slots.length === 0
    && !seriesPath && !sourceUrl && event.mediaLinks.length === 0;
  const locationLinkClassName = cn(
    actionCardVariants({ padding: "sm" }),
    "min-h-11 min-w-0 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus max-sm:flex-1 max-sm:basis-32 max-sm:px-2 max-sm:py-1.5 max-sm:leading-4",
  );

  const hostDetails = event.communitySlug ? (
    <Link
      className={cn(
        actionCardVariants({ variant: standaloneHost ? "surface" : "accent" }),
        "flex items-center gap-3",
        showHostBeforePoster && "max-sm:border-accent/50",
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
      {showHostBeforePoster ? <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-accent-strong sm:hidden" /> : null}
    </Link>
  ) : event.communityName ? (
    <div className={cn(
      "rounded-control border border-border bg-surface px-4 py-3 font-medium",
      standaloneHost && "max-w-full justify-self-start [overflow-wrap:anywhere]",
    )}>
      {event.communityName}
    </div>
  ) : (
    <Card surface="white"><p className="leading-6 text-muted">No host listed.</p></Card>
  );

  return (
    <PageShell className={cn(styles.page, "pt-[var(--event-mobile-space,0.75rem)] pb-3 sm:py-6 lg:py-7")} tone="event">
      <PageContainer className="gap-[var(--event-mobile-space,0.75rem)] sm:gap-5">
        <EventPublicHero
          bannerStyle={bannerStyle}
          canHost={canHost === true}
          event={event}
          eventPath={eventPath}
          hasLineup={lineup.length > 0}
          linksLabel={linksLabel}
          seriesPath={seriesPath}
          onReport={() => setReportOpen(true)}
        />

        {event.source.sourceType === "contributor" ? <p className="text-sm text-muted">{event.source.label}</p> : null}
        <EventContributionControls eventId={event.id} reportOpen={reportOpen} onReportClose={() => setReportOpen(false)} />
        <div className={styles.eventBody}>
          <section className={cn(styles.media, "grid grid-cols-[minmax(0,1fr)] items-start gap-4")}>
            <div className={styles.lead}>
              <div
                aria-label="Watch"
                className={cn(styles.watch, "scroll-mt-24 focus-visible:rounded-card focus-visible:outline-2 focus-visible:outline-accent max-sm:scroll-mt-[4.5rem]")}
                id="event-watch"
                role="region"
                tabIndex={-1}
                style={watchArt ? {
                  "--event-watch-art": watchArt.backgroundImage,
                  "--event-watch-desktop-art": desktopWatchArt?.backgroundImage,
                } as CSSProperties : undefined}
              >
                <EventWatchForEvent event={event} />
              </div>
              {hasLocationLinks ? (
                <div className={cn(styles.locationLinks, "flex flex-wrap gap-2")}>
                  {event.worlds.map((world) => (
                    <Link className={cn(locationLinkClassName, styles.worldLink, "border-accent/50 bg-accent/10 hover:bg-accent/15")} href={`/${world.slug}`} key={world.slug}>
                      <span className={cn(actionLabelClassName, "font-semibold")}>{world.displayName}</span>
                      <span className={cn(actionMetaClassName, "flex items-center gap-1 max-sm:mt-0.5")}>
                        <MapPin aria-hidden="true" className="size-3 shrink-0 text-accent-strong" />
                        World
                      </span>
                    </Link>
                  ))}
                  {sourceUrl ? (
                    <a className={locationLinkClassName} href={sourceUrl} rel="noreferrer" target="_blank">
                      <span className="flex items-start gap-2">
                        <span className={cn(actionLabelClassName, hasWorlds && "text-foreground decoration-border-strong")}>{event.source.label}</span>
                        <ExternalLink aria-hidden="true" className={cn("mt-0.5 size-3.5 shrink-0", hasWorlds ? "text-muted" : "text-accent-strong")} />
                      </span>
                      <span className={cn(actionMetaClassName, "max-sm:mt-0.5")}>Reference link</span>
                    </a>
                  ) : null}
                </div>
              ) : null}
              {hasCompactHost ? <div className={cn(styles.mobileHost, "mt-2 sm:hidden")}>{hostDetails}</div> : null}
            </div>
            {event.posterImageUrl ? (
              <div className={cn(styles.poster, "lg:sticky lg:top-6")}>
                <a href={event.posterImageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-card border border-border bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img ref={posterRef} src={event.posterImageUrl} alt={event.title + " poster"} className="h-auto w-full object-contain" />
                </a>
              </div>
            ) : null}

            {standaloneHost ? hostDetails : (
              <div className={cn(styles.details, "text-sm", hasCompactHost && "max-sm:hidden")}>
                {hostDetails}
              </div>
            )}
          </section>

          {lineup.length > 0 ? (
            <Card className={styles.lineup} surface="white">
              <div className="flex items-center justify-between gap-2 sm:justify-start sm:gap-4">
                <h2
                  className={cn(styles.lineupTitle, "scroll-mt-24 text-xl font-semibold tracking-tight")}
                  id="event-lineup"
                  tabIndex={-1}
                >
                  Lineup
                </h2>
                <a
                  className={cn(styles.watchReturn, buttonVariants({ variant: "secondary", size: "sm" }), "min-h-11 min-w-11 shrink-0 gap-1.5 border-border-strong py-0 sm:min-h-7")}
                  href="#event-watch"
                >
                  <ArrowUp aria-hidden="true" className="size-3.5" />
                  Watch
                </a>
              </div>
              <ol ref={listRef} className="mt-5 divide-y divide-border">
                {lineup.map((row, index) => {
                  const hasMetadata = Boolean(row.roleLabel) || row.startAt !== undefined;
                  const metadataId = row.performer && hasMetadata ? `${lineupMetadataId}-${index}` : undefined;
                  const content = (
                    <>
                      <EventAvatar appearance={row.performer?.avatarAppearance} imageUrl={row.performer?.imageUrl} label={row.displayLabel} />
                      <div className="min-w-0">
                        <span className={cn(
                          "font-semibold [overflow-wrap:anywhere]",
                          row.performer && inlineActionClassName,
                          row.performer && "group-hover:decoration-accent",
                        )}>{row.displayLabel}</span>
                        {hasMetadata ? (
                          <div className="flow-root" id={metadataId}>
                            {row.roleLabel ? <div className="mt-1 text-sm text-muted">{row.roleLabel}</div> : null}
                            {row.startAt !== undefined ? <ViewerLocalEventTimeRange className="mt-1 block text-sm text-muted" disambiguateOffset endAt={row.endAt} startAt={row.startAt} /> : null}
                          </div>
                        ) : null}
                      </div>
                    </>
                  );
                  const rowClassName = "flex min-w-0 items-center gap-4";

                  return (
                    <li className="min-w-0 py-4 first:pt-0 last:pb-0" data-lineup-row={row.key} key={row.key}>
                      {row.performer ? (
                        <Link
                          aria-label={row.displayLabel}
                          aria-describedby={metadataId}
                          className={cn(rowClassName, "group rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:min-h-11 sm:w-fit")}
                          href={`/${row.performer.slug}`}
                          onNavigate={() => rememberLineupRow(row.key)}
                        >
                          {content}
                          <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted group-hover:text-accent-strong sm:hidden" />
                        </Link>
                      ) : <div className={rowClassName}>{content}</div>}
                    </li>
                  );
                })}
              </ol>
            </Card>
          ) : null}
        </div>

        {linksHeading ? (
          <Card aria-labelledby="event-links" surface="white">
            <h2
              className="w-fit scroll-mt-24 text-xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current max-sm:scroll-mt-[4.5rem]"
              id="event-links"
              tabIndex={-1}
            >
              {linksHeading}
            </h2>
            <div className="mt-4 grid gap-3">
              {publicLinks.map((link) => {
                const key = `${link.type}-${link.url}`;
                if (link.presentation === "copy") {
                  return <CopyValueRow compact key={key} label={link.label} value={link.url} />;
                }
                const hostname = parseHttpsUrl(link.url)?.hostname;
                return (
                  <a
                    className={cn(actionCardVariants({ variant: "accent" }), (link.type === "watch" || link.type === "stream") && styles.externalStreamLink)}
                    href={link.url}
                    key={key}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className={actionLabelClassName}>
                      {link.label}
                    </span>
                    {hostname ? (
                      <span className={cn(actionMetaClassName, styles.openLinkLabel, "[overflow-wrap:anywhere]")}>
                        {hostname}
                      </span>
                    ) : null}
                    <ExternalLink aria-hidden="true" className={cn(styles.outboundIcon, "size-3.5 shrink-0 text-muted")} />
                  </a>
                );
              })}
            </div>
          </Card>
        ) : null}
      </PageContainer>
    </PageShell>
  );
}
