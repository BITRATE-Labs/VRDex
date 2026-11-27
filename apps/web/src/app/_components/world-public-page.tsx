import { ArrowDown, ArrowRight } from "lucide-react";
import Link from "next/link";

import { EntityImage } from "@/components/ui/entity-image";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, Eyebrow, SectionTitle } from "@/components/ui/card";
import { PageContainer, PageShell } from "@/components/ui/page-shell";
import { cn } from "@/lib/cn";
import { publicEventPath } from "@/lib/event-path";
import { safeImageBackground, safeImageUrl } from "@/lib/safe-image";
import { ViewerLocalEventDateTime } from "./viewer-local-event-times";

type WorldVisibilityStatus = "unknown" | "private" | "community_labs" | "public";
type PlatformCompatibility = "pc" | "android" | "ios";
type WorldCreatorRole =
  | "world_author"
  | "builder"
  | "venue_operator"
  | "community_operator"
  | "media_credit"
  | "storefront_owner";
type WorldLinkType =
  | "vrchat_world"
  | "website"
  | "gumroad"
  | "jinxxy"
  | "payhip"
  | "woocommerce"
  | "kofi"
  | "patreon"
  | "commissions"
  | "generic_store"
  | "other";
type WorldLinkSource = "owner_authored" | "reviewed" | "partner_provided" | "community_submitted";
type EventSourceType = "manual" | "community" | "partner" | "import" | "ai_suggested" | "contributor";

type PublicWorldEventPreview = {
  slug?: string;
  communitySlug?: string;
  title: string;
  startAt?: number;
  eventDate?: string;
  scheduleKind?: "timed" | "date_only";
  doorsOpenAt?: number;
  endAt?: number;
  timezone?: string;
  communityName?: string;
  summary?: string;
  posterImageUrl?: string;
  bannerImageUrl?: string;
  thumbnailImageUrl?: string;
  mediaLinks: Array<{
    type: "event_page" | "watch" | "stream" | "vrcdn" | "discord" | "ticket" | "other";
    label: string;
    url: string;
    presentation: "open" | "copy";
  }>;
  source: {
    sourceType: EventSourceType;
    label: string;
    url?: string;
  };
  worldAssociation: {
    sourceType: EventSourceType;
    confirmationState: "confirmed";
    confirmedAt?: number;
  };
};

export type PublicWorld = {
  slug: string;
  displayName: string;
  tags: string[];
  summary?: string;
  description?: string;
  vrchatWorldId?: string;
  canonicalVrchatWorldUrl?: string;
  sourceUrl?: string;
  visibilityStatus: WorldVisibilityStatus;
  platformCompatibility: PlatformCompatibility[];
  heroImageUrl?: string;
  media: Array<{
    kind: "image" | "video" | "link";
    url: string;
    label?: string;
    credit?: string;
  }>;
  creatorAttributions: Array<{
    role: WorldCreatorRole;
    displayName: string;
    profileSlug?: string;
    profileType?: "person" | "community";
    sourceLabel?: string;
    imageUrl?: string;
  }>;
  outboundLinks: Array<{
    type: WorldLinkType;
    label: string;
    url: string;
    source: WorldLinkSource;
  }>;
  source?: {
    sourceType: "owner" | "community" | "partner" | "moderator" | "import";
    label: string;
    url?: string;
    confirmedAt?: number;
  };
  eventContext: {
    upcoming: PublicWorldEventPreview[];
    recent: PublicWorldEventPreview[];
  };
};

// Keep event text legible over artwork in either theme.
const worldEventArtworkOverlay =
  "linear-gradient(135deg, var(--surface-strong) 30%, color-mix(in srgb, var(--surface-strong) 88%, transparent))";

function safeHttpsUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function visibilityLabel(status: WorldVisibilityStatus): string {
  if (status === "community_labs") {
    return "Community Labs";
  }

  if (status === "public") {
    return "Public";
  }

  if (status === "private") {
    return "Private";
  }

  return "Unknown";
}

function platformLabel(platform: PlatformCompatibility): string {
  if (platform === "pc") {
    return "PC";
  }

  if (platform === "android") {
    return "Android / Quest";
  }

  return "iOS";
}

function roleLabel(role: WorldCreatorRole): string {
  return role
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function linkSourceLabel(source: WorldLinkSource): string {
  if (source === "owner_authored") {
    return "Owner-authored";
  }

  if (source === "partner_provided") {
    return "Partner-provided";
  }

  // No writer produces community-submitted world links today; the variant is
  // shared with profile links. Named explicitly so it cannot fall through to
  // "Reviewed", which would overstate how the link got here.
  if (source === "community_submitted") {
    return "Community-submitted";
  }

  return "Reviewed";
}

function PillList({ items, onArtwork }: { items: string[]; onArtwork?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge className="text-sm" variant={onArtwork ? "inverse" : "accent"} key={item}>
          {item}
        </Badge>
      ))}
    </div>
  );
}

function WorldEventBucket({ heading, events }: { heading: string; events: PublicWorldEventPreview[] }) {
  return (
    <section className="grid min-w-0 content-start gap-3">
      <h3 className="text-sm font-semibold text-muted">{heading}</h3>
      {events.map((event) => {
        const sourceUrl = event.source.url ? safeHttpsUrl(event.source.url) : null;
        const eventPath = publicEventPath(event);
        const artworkStyle = safeImageBackground(event.thumbnailImageUrl, worldEventArtworkOverlay);

        return (
          <article
            className="min-w-0 rounded-card border border-border bg-surface-strong bg-cover bg-center p-3 text-sm sm:p-4"
            key={`${event.slug ?? event.title}-${event.eventDate ?? event.startAt}`}
            style={artworkStyle}
          >
            <h4 className="break-words text-lg font-semibold leading-snug tracking-[-0.03em]">
              {eventPath ? <Link href={eventPath}>{event.title}</Link> : event.title}
            </h4>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted">
              <ViewerLocalEventDateTime
                className="min-w-0 break-words text-sm font-semibold text-foreground"
                timestamp={event.startAt}
                eventDate={event.eventDate}
                scheduleKind={event.scheduleKind}
              />
              <span>Confirmed venue</span>
            </div>
            {event.communityName ? <p className="mt-1 text-muted">Hosted by {event.communityName}</p> : null}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 break-words text-xs text-muted">
              {sourceUrl ? (
                <a
                  className="min-w-0 text-sm font-medium text-accent-strong underline decoration-accent/35 underline-offset-4"
                  href={sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {event.source.label}
                </a>
              ) : (
                <span>{event.source.label}</span>
              )}
              {event.mediaLinks.length > 0 ? (
                <span>
                  {event.mediaLinks.length} media link{event.mediaLinks.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            {event.summary ? <p className="mt-2 break-words leading-6 text-muted">{event.summary}</p> : null}
          </article>
        );
      })}
    </section>
  );
}

export function WorldBackendNotice({ kind }: { kind: "missing-url" | "error" }) {
  return (
    <PageShell className="py-10">
      <PageContainer max="3xl">
      <Card className="shadow-panel" padding="lg">
        <Eyebrow>World page</Eyebrow>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
          {kind === "missing-url" ? "Convex URL not configured" : "World read failed"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
          {kind === "missing-url"
            ? "Run the local backend bootstrap before loading public world pages from this worktree."
            : "Start the local Convex backend and reload this page once the world query is reachable."}
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

export function WorldPublicPage({ world }: { world: PublicWorld }) {
  const canonicalWorldUrl = world.canonicalVrchatWorldUrl
    ? safeHttpsUrl(world.canonicalVrchatWorldUrl)
    : null;
  const sourceUrl = world.sourceUrl ? safeHttpsUrl(world.sourceUrl) : null;
  const referenceUrl = sourceUrl === canonicalWorldUrl ? null : sourceUrl;
  const heroImageUrl = safeImageUrl(world.heroImageUrl);
  const { upcoming, recent } = world.eventContext;
  const hasEvents = upcoming.length > 0 || recent.length > 0;
  const hasTags = world.tags.length > 0;
  const hasCredits = world.creatorAttributions.length > 0;
  const description = world.description?.trim();
  const outboundLinks = world.outboundLinks.flatMap((link) => {
    const href = safeHttpsUrl(link.url);
    return href ? [{ ...link, href }] : [];
  });
  const hasLinks = referenceUrl || outboundLinks.length > 0;
  const hasDetails = description || hasEvents || hasTags || hasCredits || hasLinks;
  const hasPlatforms = world.platformCompatibility.length > 0;
  const isSparse = !heroImageUrl && !hasDetails && !canonicalWorldUrl
    && !world.vrchatWorldId && !world.summary?.trim()
    && !hasPlatforms && world.media.length === 0;
  const hasLaunchDetails = hasPlatforms && Boolean(canonicalWorldUrl);
  const heroMetaClassName = heroImageUrl ? "text-white/76" : "text-muted";
  const platformDetails = (
    <div>
      <dt className={cn(
        isSparse ? "font-medium" : heroMetaClassName,
        hasLaunchDetails && "max-sm:font-medium max-sm:text-inherit",
      )}>Platforms</dt>
      <dd className={cn("mt-1", isSparse ? "font-semibold" : "font-medium")}>
        {hasPlatforms ? <PillList items={world.platformCompatibility.map(platformLabel)} onArtwork={Boolean(heroImageUrl)} /> : "Unknown"}
      </dd>
    </div>
  );
  const visibilityDetails = (
    <div className={cn(isSparse && "flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:block")}>
      <dt className={heroMetaClassName}>{isSparse ? "World visibility" : "Visibility"}</dt>
      <dd className={cn("font-medium", isSparse ? "sm:mt-1" : "mt-1")}>{visibilityLabel(world.visibilityStatus)}</dd>
    </div>
  );
  const launchAction = canonicalWorldUrl ? (
    <a
      className={cn(
        buttonVariants({ variant: "primary" }),
        hasLaunchDetails && "max-sm:min-h-11",
        heroImageUrl
          ? "focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-media"
          : "focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-strong",
      )}
      href={canonicalWorldUrl}
      rel="noreferrer"
      target="_blank"
    >
      Open VRChat world
    </a>
  ) : null;
  const navigationLinkClassName = "inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm font-medium underline decoration-current/40 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2";
  const actions = launchAction || hasEvents ? (
    <div className={cn(
      "flex flex-wrap items-center gap-x-3 gap-y-1 lg:block",
      hasLaunchDetails ? "mt-3 sm:col-span-2 sm:row-start-4 sm:mt-5 sm:justify-self-start" : "mt-5",
      !launchAction && "lg:hidden",
    )}>
      {launchAction}
      {hasEvents ? (
        <a
          className={cn(navigationLinkClassName, "lg:hidden", heroImageUrl ? "text-white/90 focus-visible:outline-white" : "text-accent-strong focus-visible:outline-accent")}
          href="#world-events"
        >
          Events
          <ArrowDown aria-hidden="true" className="size-3.5" />
        </a>
      ) : null}
    </div>
  ) : null;

  return (
    <PageShell tone="world">
      <PageContainer max={!heroImageUrl && !hasDetails ? "3xl" : undefined}>
        <section className={cn(
          "overflow-hidden rounded-hero border border-border",
          heroImageUrl ? "bg-media text-white shadow-hero" : "bg-surface-strong text-foreground shadow-sm",
        )}>
          <div className={cn(
            "p-6 sm:p-8",
            isSparse && "sm:p-10",
            heroImageUrl && "grid items-center gap-6 lg:grid-cols-[1.1fr_1fr] lg:p-10",
            hasLaunchDetails && "max-sm:p-4",
          )}>
            <div className={cn("min-w-0", hasLaunchDetails && "sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-6")}>
              <h1 className={cn(
                "font-semibold leading-none tracking-[-0.05em] [overflow-wrap:anywhere]",
                heroImageUrl ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl",
                hasLaunchDetails && "sm:col-span-2 sm:row-start-1",
                hasLaunchDetails && heroImageUrl && "max-sm:text-[2.625rem]",
              )}>{world.displayName}</h1>
              {hasLaunchDetails ? (
                <div className="mt-4 sm:contents">
                  <dl className="text-sm sm:col-start-2 sm:row-start-3 sm:mt-5">{platformDetails}</dl>
                  {actions}
                </div>
              ) : null}
              {!isSparse && world.summary ? <p className={cn(
                "mt-4 max-w-2xl text-base leading-7 sm:text-lg",
                hasLaunchDetails && "max-sm:leading-6 sm:col-span-2 sm:row-start-2",
                heroImageUrl ? "text-white/82" : "text-muted",
              )}>{world.summary}</p> : null}
              {isSparse ? (
                <div className="mt-5 text-sm sm:mt-7 sm:grid sm:grid-cols-[2fr_1fr] sm:items-center sm:gap-6">
                  <dl className="grid grid-cols-2 gap-3 rounded-card border border-border bg-surface px-3 py-3 sm:px-4">
                    {platformDetails}
                    <div>
                      <dt className="font-medium">VRChat link</dt>
                      <dd className="mt-1 font-semibold">Not listed</dd>
                    </div>
                  </dl>
                  <dl className="mt-3 border-t border-border pt-3 sm:mt-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                    {visibilityDetails}
                  </dl>
                </div>
              ) : (
                <dl className={cn(
                  "flex flex-wrap items-start gap-x-6 gap-y-3 text-sm",
                  hasLaunchDetails ? "mt-3 sm:col-start-1 sm:row-start-3 sm:mt-5" : "mt-5",
                )}>
                  {visibilityDetails}
                  {hasPlatforms && !hasLaunchDetails ? platformDetails : null}
                </dl>
              )}
              {hasLaunchDetails ? null : actions}
              {isSparse ? (
                <Link className={cn(navigationLinkClassName, "mt-2 text-accent-strong focus-visible:outline-accent sm:hidden [@media(scripting:none)]:hidden")} href="/discovery">
                  Discovery
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              ) : null}
            </div>
            {heroImageUrl ? (
              <EntityImage label={world.displayName} src={heroImageUrl} className="aspect-video w-full rounded-card border border-white/20 text-4xl" sizes="(min-width: 1024px) 45vw, 100vw" priority />
            ) : null}
          </div>
        </section>

        {description ? (
          <Card surface="white">
            <SectionTitle>About this world</SectionTitle>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted sm:text-base">{world.description}</p>
          </Card>
        ) : null}

        {hasEvents ? (
          <Card surface="white" className="max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
            <SectionTitle
              className="scroll-mt-24 focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-accent"
              id="world-events"
              tabIndex={-1}
            >
              Events at this world
            </SectionTitle>
            <div className={cn("mt-4 grid gap-4 sm:mt-6", upcoming.length > 0 && recent.length > 0 && "lg:grid-cols-2")}>
              {upcoming.length > 0 ? (
                <WorldEventBucket heading="Upcoming and active" events={upcoming} />
              ) : null}
              {recent.length > 0 ? (
                <WorldEventBucket heading="Recent" events={recent} />
              ) : null}
            </div>
          </Card>
        ) : null}

        {hasTags || hasCredits ? (
          <section className={cn("grid gap-4", hasTags && hasCredits && "lg:grid-cols-[1fr_2fr]")}>
            {hasTags ? (
              <Card surface="white">
                <Eyebrow>Tags</Eyebrow>
                <div className="mt-4">
                  <PillList items={world.tags} />
                </div>
              </Card>
            ) : null}

            {hasCredits ? (
              <Card surface="white">
                <Eyebrow>Creator attribution</Eyebrow>
                <div className="mt-4 space-y-3">
                  {world.creatorAttributions.map((attribution) => {
                    const href = attribution.profileSlug && attribution.profileType
                      ? `/${attribution.profileSlug}`
                      : null;
                    const content = (
                      <>
                        <EntityImage label={attribution.displayName} src={attribution.imageUrl} className="size-12 rounded-control" sizes="48px" />
                        <span className="min-w-0">
                          <span className="block break-words font-medium">{attribution.displayName}</span>
                          <span className="block text-muted">{roleLabel(attribution.role)}</span>
                        </span>
                      </>
                    );

                    return href ? (
                      <Link
                        className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-sm"
                        href={href}
                        key={`${attribution.role}-${attribution.displayName}`}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div
                        className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-sm"
                        key={`${attribution.role}-${attribution.displayName}`}
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : null}
          </section>
        ) : null}

        {hasLinks ? (
          <section className={cn("grid gap-4", referenceUrl && outboundLinks.length > 0 && "lg:grid-cols-[0.9fr_1.1fr]")}>
            {referenceUrl ? (
              <Card surface="white">
                <Eyebrow>Primary links</Eyebrow>
                <a
                  className={cn(buttonVariants({ variant: "secondary" }), "mt-4")}
                  href={referenceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Reference link
                </a>
              </Card>
            ) : null}

            {outboundLinks.length > 0 ? (
              <Card surface="white">
                <Eyebrow>Creator links</Eyebrow>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {outboundLinks.map((link) => (
                    <a
                      className="rounded-card border border-border bg-surface px-4 py-3 text-sm"
                      href={link.href}
                      key={`${link.type}-${link.url}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="block font-medium">{link.label}</span>
                      <span className="mt-1 block text-xs text-muted">{linkSourceLabel(link.source)}</span>
                    </a>
                  ))}
                </div>
              </Card>
            ) : null}
          </section>
        ) : null}
      </PageContainer>
    </PageShell>
  );
}
