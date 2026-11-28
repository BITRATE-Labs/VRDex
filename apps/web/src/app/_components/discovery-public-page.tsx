import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { authoredEventSchedule, publicScheduleStatus } from "../../../../../convex/_eventRuntime";

import { DiscoveryFeatureGate, DiscoverySearchForm, TrackedDiscoveryLink } from "./discovery-analytics";
import { HomeActiveWorldsSection, type PublicActiveWorld } from "./home-active-worlds";
import { EditPublicSearchLink } from "./public-search-control";
import { searchHref, type SearchResultFilter } from "./search-view-state";
import { SearchViewShell } from "./search-view-shell";
import { PublicSearchResultDetails } from "./public-search-result-details";
import { DiscoveryResultFocus } from "./discovery-result-focus";
import { EventScheduleRefresh } from "./discovery-schedule-refresh";
import { SearchResultsHistory } from "./search-results-history";
import styles from "./discovery-public-page.module.css";
import type { PublicEventPreview } from "./event-public-page";
import { ViewerLocalEventDateTime, ViewerLocalEventTime } from "./viewer-local-event-times";
import { buttonVariants } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EntityImage } from "@/components/ui/entity-image";
import { Notice } from "@/components/ui/notice";
import { EventSchedule, EventScheduleRow } from "@/components/ui/event-schedule";
import { ProfileAvatarImage } from "@/components/ui/profile-avatar-image";
import type { PublicSearchResult } from "@/lib/public-search";
import { PageContainer, PageShell } from "@/components/ui/page-shell";
import { VerifiedTrustMark } from "@/components/ui/verified-trust-mark";
import { defaultAvatarAppearance, type AvatarAppearance } from "@/lib/avatar-appearance";
import { cn } from "@/lib/cn";
import { publicEventPath } from "@/lib/event-path";
import { FEATURED_DISCOVERY_UI_FLAG, type DiscoveryAnalyticsSurface } from "@/lib/posthog";

export type { SearchResultFilter } from "./search-view-state";
export type { PublicSearchResult } from "@/lib/public-search";

export type PublicDiscoveryData = {
  featured: PublicSearchResult[];
  upcomingEvents: PublicSearchResult[];
  people: PublicSearchResult[];
  communities: PublicSearchResult[];
  worlds: PublicSearchResult[];
  terms: Array<{
    scope: string;
    key: string;
    label: string;
    usageCount: number;
  }>;
  eventSchedule?: PublicEventPreview[];
};

type DiscoveryStatus = "live" | "missing-url" | "error";

function entityLabel(result: PublicSearchResult): string {
  if (result.entityType === "profile") {
    return result.profileType === "community" ? "Community" : "Person";
  }

  return result.entityType === "event" ? "Event" : "World";
}

function resultSubtitle(result: PublicSearchResult): string | undefined {
  const subtitle = result.subtitle?.trim();

  if (!subtitle) {
    return undefined;
  }

  const label = entityLabel(result).toLowerCase();
  const redundantLabels = [label, `${label} profile`];

  return redundantLabels.includes(subtitle.toLowerCase()) ? undefined : subtitle;
}

function ResultImage({ result, quietFallback = false }: { result: PublicSearchResult; quietFallback?: boolean }) {
  const size = "size-10 sm:size-14";
  const sizes = "(min-width: 640px) 56px, 40px";
  const primaryImageUrl = result.entityType === "profile"
    ? result.profileImageUrl ?? result.imageUrl
    : result.imageUrl;
  const appearance = result.avatarAppearance;
  const useQuietFallback = quietFallback && !primaryImageUrl && (
    !appearance || Object.entries(defaultAvatarAppearance).every(([key, value]) => appearance[key as keyof AvatarAppearance] === value)
  );

  if (result.entityType !== "profile") {
    return (
      <EntityImage
        className={cn(size, "rounded-card bg-[linear-gradient(135deg,var(--canvas-muted),var(--surface-raised))] text-lg text-foreground")}
        label={result.title}
        sizes={sizes}
        src={primaryImageUrl}
      />
    );
  }

  if (
    !result.logoImageUrl ||
    !result.profileImageUrl ||
    result.logoImageUrl === result.profileImageUrl
  ) {
    const imageIsLogoOnly = !result.profileImageUrl && Boolean(result.logoImageUrl);

    return (
      <span className="relative shrink-0">
        {imageIsLogoOnly ? (
          <EntityImage
            className={cn(size, "rounded-card border border-border bg-surface-strong text-xs")}
            fallback="Logo"
            imageClassName="!object-contain p-1"
            label={`${result.title} logo`}
            sizes={sizes}
            src={primaryImageUrl}
          />
        ) : useQuietFallback ? (
          <EntityImage
            alt=""
            className={cn(size, "rounded-card border border-border bg-surface-strong font-semibold text-foreground")}
            label={result.title}
          />
        ) : (
          <ProfileAvatarImage
            appearance={result.avatarAppearance}
            className={cn(size, "rounded-card bg-[linear-gradient(135deg,var(--canvas-muted),var(--surface-raised))] text-lg text-foreground")}
            label={result.title}
            sizes={sizes}
            src={primaryImageUrl}
          />
        )}
        {result.trustLabel === "claimed_verified" ? (
          <VerifiedTrustMark className="verified-trust-mark--avatar" />
        ) : null}
      </span>
    );
  }

  return (
    <span className="relative grid shrink-0 grid-cols-1 sm:grid-cols-2 sm:gap-1">
      <span className="relative">
        <ProfileAvatarImage
          appearance={result.avatarAppearance}
          className={cn(size, "rounded-card bg-[linear-gradient(135deg,var(--canvas-muted),var(--surface-raised))] text-lg text-foreground")}
          label={result.title}
          sizes={sizes}
          src={result.profileImageUrl}
        />
        {result.trustLabel === "claimed_verified" ? (
          <VerifiedTrustMark className="verified-trust-mark--avatar" />
        ) : null}
      </span>
      <EntityImage
        className="size-5 rounded-control border border-border bg-surface-strong text-xs max-sm:absolute max-sm:-bottom-1 max-sm:-left-1 max-sm:text-[0.45rem] sm:size-14 sm:rounded-card"
        fallback="Logo"
        imageClassName="!object-contain p-0.5 sm:p-1"
        label={`${result.title} logo`}
        sizes="(min-width: 640px) 56px, 20px"
        src={result.logoImageUrl}
        title="Logo"
      />
    </span>
  );
}

function DiscoveryEventsHeading({ title }: { title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SectionTitle className="max-sm:text-xl">{title}</SectionTitle>
      <Link
        className={cn(
          buttonVariants({ size: "sm", variant: "ghost" }),
          "min-h-11 shrink-0 whitespace-nowrap !text-muted underline decoration-border-strong underline-offset-4 hover:decoration-current",
        )}
        href="/events/new"
      >
        Add event
      </Link>
    </div>
  );
}

function DiscoveryEventSchedule({ events, now }: { events: PublicEventPreview[]; now: number }) {
  const rows = events.map((event) => {
    const { startAt } = event;
    const hasStart = event.scheduleKind !== "date_only" && event.status !== "cancelled"
      && startAt !== undefined && Number.isFinite(startAt);
    const { scheduledNow, nextTransition } = authoredEventSchedule(event, now);
    const status = publicScheduleStatus(event, now);

    return {
      event,
      scheduledNow,
      status: status === "now" && !scheduledNow ? "later" as const : status,
      hasStarted: hasStart && startAt <= now,
      nextTransition: nextTransition ?? (hasStart && startAt > now ? startAt : undefined),
    };
  });
  const nextTransition = Math.min(...rows.map((row) => row.nextTransition ?? Infinity));
  return (
    <section className="min-w-0 border-t border-border pt-3 sm:pt-6">
      {Number.isFinite(nextTransition) ? <EventScheduleRefresh nextTransition={nextTransition} serverNow={now} /> : null}
      <DiscoveryEventsHeading title={rows.some((row) => row.hasStarted) ? "Events" : "Upcoming events"} />
      <EventSchedule className="mt-2 sm:mt-5" empty="No events">
        {rows.map(({ event, scheduledNow, status }) => (
          <EventScheduleRow
            className="[overflow-wrap:anywhere] max-sm:gap-1 max-sm:p-3 sm:grid-cols-[minmax(var(--spacing-schedule-gutter),max-content)_minmax(0,1fr)]"
            details={event.communityName || event.worlds[0] ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                {event.communityName ? <span>{event.communityName}</span> : null}
                {event.worlds[0] ? (
                  <span className="inline-flex min-w-0 items-baseline gap-1">
                    <MapPin aria-hidden="true" className="size-3.5 shrink-0 self-center" />
                    <span><span className="sr-only">World: </span>{event.worlds[0].displayName}</span>
                  </span>
                ) : null}
              </div>
            ) : undefined}
            key={event.slug ?? `${event.title}:${event.startAt}`}
            metadata={event.nextSlots?.length || event.summary ? (
              <div className="grid gap-1 sm:gap-3">
                {event.nextSlots?.length ? (
                  <ul className="grid text-sm text-muted sm:gap-1.5">
                    {event.nextSlots.map((slot) => (
                      <li className="flex flex-wrap items-center gap-x-2 sm:items-baseline" key={`${slot.startAt}:${slot.displayLabel}`}>
                        <ViewerLocalEventTime className="font-mono text-xs text-foreground" timestamp={slot.startAt} />
                        {slot.performer ? (
                          <Link className="rounded-control font-medium text-accent-strong underline decoration-accent/65 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-accent-strong max-sm:inline-flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center" href={`/${slot.performer.slug}`}>
                            {slot.performer.displayName}
                          </Link>
                        ) : (
                          <span className="font-medium text-foreground">{slot.displayLabel}</span>
                        )}
                        <span>{slot.roleLabel}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {event.summary ? (
                  <p className="line-clamp-3 text-body-sm text-muted sm:line-clamp-2">{event.summary}</p>
                ) : null}
              </div>
            ) : undefined}
            status={status}
            statusLabel={scheduledNow ? "Now" : undefined}
            time={<ViewerLocalEventDateTime className="text-xs font-medium text-foreground" groupTime timestamp={event.startAt} eventDate={event.eventDate} scheduleKind={event.scheduleKind} />}
            title={publicEventPath(event) ? (
              <TrackedDiscoveryLink
                className="rounded-control text-section font-semibold text-accent-strong underline decoration-accent/55 underline-offset-4 transition hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring max-sm:flex max-sm:min-h-11 max-sm:min-w-11 max-sm:items-center sm:text-xl"
                eventName="event_card_clicked"
                data-discovery-result={`upcoming_events:${publicEventPath(event)}`}
                href={publicEventPath(event)!}
                properties={{ entity_type: "event", surface: "upcoming_events" }}
              >
                <span>{event.title}</span>
              </TrackedDiscoveryLink>
            ) : event.title}
          />
        ))}
      </EventSchedule>
    </section>
  );
}

function DiscoveryCard({
  result,
  surface,
}: {
  result: PublicSearchResult;
  surface: DiscoveryAnalyticsSurface;
}) {
  const subtitle = resultSubtitle(result);
  const spreadSummary = result.profileType === "community" && Boolean(result.summary);
  const summary = result.summary ? (
    <span className={cn(
      styles.directorySummary,
      "line-clamp-2 text-sm leading-6 text-muted wrap-anywhere",
      spreadSummary && "col-start-2 row-start-2 max-[360px]:col-span-full max-[360px]:line-clamp-3",
    )}>
      {result.summary}
    </span>
  ) : null;

  return (
    <TrackedDiscoveryLink
      className={cn(
        styles.directoryCard,
        "group flex min-w-0 items-center gap-3 rounded-panel border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-accent-strong sm:p-4",
        result.profileType === "community" && "max-sm:items-start",
        spreadSummary && "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-y-1 max-[360px]:gap-y-2 [&>*:first-child]:row-span-2 max-[360px]:[&>*:first-child]:row-span-1",
      )}
      data-discovery-result={`${surface}:${result.routePath}`}
      eventName={result.entityType === "event" ? "event_card_clicked" : "search_result_clicked"}
      href={result.routePath}
      properties={{
        entity_type: result.entityType,
        profile_type: result.profileType,
        surface,
      }}
    >
      <ResultImage result={result} quietFallback />
      <span className={cn(
        styles.directoryDetails,
        "flex min-w-0 flex-1 flex-col gap-1",
        result.profileType === "community" && "max-sm:min-h-10 max-sm:justify-center",
        spreadSummary && "col-start-2 row-start-1 self-end max-[360px]:self-center",
      )}>
        {result.startsAt === undefined && result.eventDate === undefined ? null : <ViewerLocalEventDateTime className="text-sm font-medium text-accent-strong" timestamp={result.startsAt} eventDate={result.eventDate} scheduleKind={result.scheduleKind} />}
        <span className="text-lg font-semibold group-hover:text-accent-strong [overflow-wrap:anywhere]">
          {result.title}
        </span>
        {subtitle ? <span className="text-sm text-muted wrap-anywhere">{subtitle}</span> : null}
        {!spreadSummary ? summary : null}
      </span>
      <ChevronRight aria-hidden="true" className={cn(
        styles.directoryArrow,
        "size-4 shrink-0 self-center text-muted group-hover:text-accent-strong",
        result.profileType === "community" && (subtitle || result.summary) && "max-sm:mt-1.5 max-sm:self-start",
        spreadSummary && "col-start-3 row-span-2 row-start-1 max-[360px]:row-span-1",
      )} />
      {spreadSummary ? summary : null}
    </TrackedDiscoveryLink>
  );
}

function SearchResultImage({ result }: { result: PublicSearchResult }) {
  const src = result.imageUrl ?? result.profileImageUrl ?? result.logoImageUrl;
  const logo = Boolean(src && src === result.logoImageUrl && src !== result.profileImageUrl);
  const appearance = result.avatarAppearance;
  const customAppearance = appearance && Object.entries(defaultAvatarAppearance).some(
    ([key, value]) => appearance[key as keyof AvatarAppearance] !== value,
  );
  const imageProps = {
    alt: "",
    className: "size-10 rounded-card border border-border bg-surface-strong text-foreground sm:size-14",
    label: result.title,
    sizes: "(min-width: 640px) 56px, 40px",
    src,
  };

  return (
    <span className="relative shrink-0">
      {result.entityType === "profile" && !logo && (src || customAppearance) ? (
        <ProfileAvatarImage {...imageProps} appearance={appearance} />
      ) : (
        <EntityImage {...imageProps} imageClassName={logo ? "!object-contain p-1" : undefined} />
      )}
      {result.entityType === "profile" && result.trustLabel === "claimed_verified" ? (
        <VerifiedTrustMark className="verified-trust-mark--avatar" />
      ) : null}
    </span>
  );
}

function SearchResultCard({ referenceTime, result }: { referenceTime: number; result: PublicSearchResult }) {
  const { endAt, startsAt } = result;
  const hasTimedRange = result.entityType === "event" && result.scheduleKind !== "date_only"
    && startsAt !== undefined && Number.isFinite(startsAt)
    && endAt !== undefined && Number.isFinite(endAt)
    && endAt > startsAt;
  const eventStatus = hasTimedRange
    ? endAt < referenceTime ? "Ended" : startsAt > referenceTime ? "Upcoming" : "In progress"
    : undefined;
  const subtitle = resultSubtitle(result);
  const trustLabel = result.trustLabel === "community_submitted"
    ? "Community submitted"
    : result.trustLabel === "unclaimed" ? "Unclaimed" : undefined;
  const shownLabels = [subtitle, result.summary].flatMap((text) =>
    text?.toLowerCase().split(/[|·•\n]/u).map((part) => part.trim()) ?? [],
  );
  const roleLabels = [...new Set([...(result.person?.roleTags ?? []), ...(result.person?.tags ?? [])])]
    .filter((label) => !shownLabels.includes(label.trim().toLowerCase()))
    .slice(0, 3);
  const spreadSummary = result.entityType === "event" && Boolean(result.summary);
  const summary = result.summary ? (
    <span className={cn(
      "line-clamp-2 text-sm leading-5 text-muted [overflow-wrap:anywhere]",
      spreadSummary && "col-start-2 row-start-2 [@media(max-width:360px)]:col-span-full [@media(max-width:360px)]:line-clamp-3 [@media(max-width:360px)]:text-[0.8125rem]",
    )}>
      {result.summary}
    </span>
  ) : null;

  return (
    <div className="rounded-panel border border-border bg-surface transition-colors hover:border-border-strong">
      <TrackedDiscoveryLink
        className={cn(
          "group flex min-h-11 items-start gap-3 rounded-panel p-3 transition-colors hover:bg-surface-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong sm:p-4",
          spreadSummary && "grid grid-cols-[auto_minmax(0,1fr)] gap-y-1 [&>*:first-child]:row-span-2 [@media(max-width:360px)]:[&>*:first-child]:row-span-1 [@media(max-width:360px)]:py-2.5",
          (result.person?.genres.length || result.person?.outboundLinks.length) && "pb-1 sm:pb-2",
          result.claimEntryPath && "pb-2 sm:pb-2",
        )}
        data-search-result=""
        eventName={result.entityType === "event" ? "event_card_clicked" : "search_result_clicked"}
        href={result.routePath}
        properties={{
          entity_type: result.entityType,
          profile_type: result.profileType,
          surface: "search_results",
        }}
      >
        <SearchResultImage result={result} />
        <span className="flex min-w-0 flex-1 flex-col gap-1 [overflow-wrap:anywhere]">
          <span className="text-xl leading-tight font-semibold text-accent-strong underline decoration-accent/55 underline-offset-4 group-hover:decoration-current">
            {result.title}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0 text-xs text-muted sm:text-sm">
            <span className="font-medium text-foreground">{entityLabel(result)}</span>
            {eventStatus ? (
              <span className={cn(
                "rounded-control border px-1.5 py-0.5 text-xs leading-4 font-semibold",
                eventStatus === "Ended"
                  ? "border-border-strong bg-surface-elevated text-muted"
                  : "border-accent/40 bg-accent-muted text-accent-strong",
              )}>
                {eventStatus}
              </span>
            ) : null}
            {trustLabel ? <span className="text-xs sm:border-s sm:border-border sm:ps-2">{trustLabel}</span> : null}
            {subtitle ? <span>{subtitle}</span> : null}
            {startsAt === undefined && result.eventDate === undefined ? null : (
              <ViewerLocalEventDateTime
                className={cn("text-sm", eventStatus === "Ended" ? "text-muted" : "text-accent-strong")}
                timestamp={startsAt}
                eventDate={result.eventDate}
                scheduleKind={result.scheduleKind}
              />
            )}
          </span>
          {!spreadSummary ? summary : null}
          {roleLabels.length > 0 ? <span className="text-xs font-semibold text-foreground">{roleLabels.join(" · ")}</span> : null}
        </span>
        {spreadSummary ? summary : null}
      </TrackedDiscoveryLink>
      {result.person ? <PublicSearchResultDetails person={result.person} slug={result.slug} /> : null}
      {result.claimEntryPath ? (
        <div className="ml-16 w-fit pb-3 pr-3 sm:ml-[5.25rem] sm:pr-4">
          <Link
            className="inline-flex min-h-11 items-center rounded-control pr-3 text-sm font-medium text-muted underline decoration-current/50 underline-offset-4 hover:text-foreground hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
            href={result.claimEntryPath}
          >
            Claim this profile
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function FeaturedProfileCard({ result }: { result: PublicSearchResult }) {
  const imageIsLogo =
    Boolean(result.logoImageUrl) &&
    result.imageUrl === result.logoImageUrl &&
    result.logoImageUrl !== result.profileImageUrl;

  return (
    <TrackedDiscoveryLink
      className="group grid h-full min-h-72 min-w-0 overflow-hidden rounded-hero border border-border bg-canvas text-white shadow-hero lg:grid-cols-[18rem_minmax(0,1fr)]"
      eventName="featured_card_clicked"
      href={result.routePath}
      properties={{ entity_type: result.entityType, surface: "featured" }}
    >
      <span className="relative">
        {imageIsLogo ? (
          <EntityImage
            className="aspect-square h-auto w-full rounded-none border border-border bg-surface-strong text-4xl lg:size-72"
            fallback="Logo"
            imageClassName="!object-contain p-4"
            label={`${result.title} logo`}
            sizes="(min-width: 1024px) 288px, (min-width: 768px) 50vw, 100vw"
            src={result.imageUrl}
          />
        ) : (
          <ProfileAvatarImage
            appearance={result.avatarAppearance}
            className="aspect-square h-auto w-full rounded-none bg-media text-4xl text-white lg:size-72"
            label={result.title}
            sizes="(min-width: 1024px) 288px, (min-width: 768px) 50vw, 100vw"
            src={result.imageUrl}
          />
        )}
        {result.trustLabel === "claimed_verified" ? (
          <VerifiedTrustMark className="verified-trust-mark--avatar" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col justify-end bg-[linear-gradient(145deg,var(--background),var(--surface-raised))] p-5">
        <span className="block text-3xl font-semibold">{result.title}</span>
        {result.summary ? <span className="mt-3 line-clamp-3 block text-sm leading-6 text-white/76">{result.summary}</span> : null}
      </span>
    </TrackedDiscoveryLink>
  );
}

function PosterCard({ result }: { result: PublicSearchResult }) {
  if (result.entityType === "profile") {
    return <FeaturedProfileCard result={result} />;
  }

  return (
    <TrackedDiscoveryLink
      className="group relative grid aspect-[4/3] min-h-72 min-w-0 overflow-hidden rounded-hero border border-border bg-media text-white shadow-hero"
      eventName="featured_card_clicked"
      href={result.routePath}
      properties={{ entity_type: result.entityType, surface: "featured" }}
    >
      <EntityImage className="absolute inset-0 size-full rounded-none bg-media text-4xl text-white" label={result.title} sizes="(min-width: 768px) 50vw, 100vw" src={result.imageUrl} />
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--media)_18%,transparent),color-mix(in_srgb,var(--media)_94%,transparent))]" />
      <span className="relative flex flex-col justify-end self-stretch p-5">
        <span className="block text-3xl font-semibold">{result.title}</span>
        {result.summary ? <span className="mt-3 line-clamp-3 block text-sm leading-6 text-white/76">{result.summary}</span> : null}
      </span>
    </TrackedDiscoveryLink>
  );
}

function DiscoverySection({
  title,
  headingId,
  empty,
  columns = "responsive",
  results,
  surface,
}: {
  title: string;
  headingId?: string;
  empty: string;
  columns?: "responsive" | "single" | "single-xl";
  results: PublicSearchResult[];
  surface: DiscoveryAnalyticsSurface;
}) {
  return (
    <section className={cn(styles.directory, "min-w-0 border-t border-border pt-4 sm:pt-6")}>
      {surface === "upcoming_events" ? (
        <DiscoveryEventsHeading title={title} />
      ) : (
        <SectionTitle
          className={cn(styles.directoryTitle, "wrap-anywhere", headingId && "scroll-mt-24 focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-accent")}
          id={headingId}
          tabIndex={headingId ? -1 : undefined}
        >
          {title}
        </SectionTitle>
      )}
      <div className={cn(
        "mt-3 grid grid-cols-1 gap-4 sm:mt-5",
        columns !== "single" && "lg:grid-cols-2",
        columns === "single-xl" && "xl:grid-cols-1",
      )}>
        {results.length === 0 ? (
          <p className="text-sm leading-6 text-muted">{empty}</p>
        ) : (
          results.map((result) => (
            <DiscoveryCard
              key={`${result.entityType}-${result.slug}`}
              result={result}
              surface={surface}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DiscoveryRetryLink() {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- Retry needs a fresh document request for the same URL.
    <a className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "min-h-11 shrink-0")} href="/discovery">
      Retry
    </a>
  );
}

export function DiscoveryBackendNotice({
  hasFeaturedWorlds,
  kind,
}: {
  hasFeaturedWorlds: boolean;
  kind: "missing-url" | "error";
}) {
  const message = kind === "missing-url"
    ? "Discovery data is not available in this environment yet."
    : hasFeaturedWorlds ? "Directory unavailable" : "Discovery data is temporarily unavailable.";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-border bg-surface px-4 py-3 text-sm leading-6 text-foreground">
      <span>{message}</span>
      {kind === "error" ? <DiscoveryRetryLink /> : null}
    </div>
  );
}

export function DiscoveryLandingPage({
  activeWorldStatus,
  activeWorlds,
  data,
  now,
  status,
}: {
  activeWorldStatus: DiscoveryStatus;
  activeWorlds: PublicActiveWorld[];
  data: PublicDiscoveryData;
  now: number;
  status: DiscoveryStatus;
}) {
  const directory = [
    { headingId: "people", title: "People", results: data.people, empty: "No people are discoverable yet." },
    { headingId: "communities", title: "Communities", results: data.communities, empty: "No communities are discoverable yet." },
    { headingId: "worlds", title: "Worlds", results: data.worlds, empty: "No worlds are discoverable yet." },
  ];
  const populatedDirectory = directory.filter(({ results }) => results.length > 0);
  const directorySections = populatedDirectory.length > 0 ? populatedDirectory : directory;
  const showDirectoryShortcuts = populatedDirectory.length > 1;
  const singleDirectory = status === "live" && activeWorldStatus === "live"
    && !data.eventSchedule?.length && data.upcomingEvents.length === 0
    && activeWorlds.length === 0 && directorySections.length === 1;

  const eventSchedule = data.eventSchedule?.length ? data.eventSchedule : undefined;
  const upcomingCount = eventSchedule?.length ?? data.upcomingEvents.length;
  const pairUpcomingAndWorld = status === "live" && activeWorldStatus === "live"
    && upcomingCount === 1 && activeWorlds.length === 1;
  const singleUpcomingEventPath = status === "live" && upcomingCount === 1
    ? eventSchedule ? publicEventPath(eventSchedule[0]) : data.upcomingEvents[0].routePath
    : undefined;
  const upcoming = eventSchedule ? (
    <DiscoveryEventSchedule events={eventSchedule} now={now} />
  ) : upcomingCount === 0 ? (
    <section className={cn(
      "flex flex-wrap items-center justify-between gap-x-3 sm:justify-start sm:gap-x-5",
      singleDirectory && "max-sm:rounded-panel max-sm:border max-sm:border-border-strong max-sm:bg-surface max-sm:px-3 max-sm:py-0.5 lg:justify-between lg:rounded-panel lg:border lg:border-border-strong lg:bg-surface lg:px-4 lg:py-1.5",
    )}>
      <div className={singleDirectory ? "sm:flex sm:items-baseline sm:gap-3 lg:block" : "sm:flex sm:items-baseline sm:gap-3"}>
        <SectionTitle className="text-lg leading-6 tracking-tight">Upcoming events</SectionTitle>
        <p className="text-sm font-medium leading-5 text-foreground">No events</p>
      </div>
      <Link
        className={cn(
          buttonVariants({ size: "sm", variant: "ghost" }),
          "min-h-11 whitespace-nowrap !text-muted underline decoration-border-strong underline-offset-4 hover:decoration-current max-sm:self-start max-sm:items-start max-sm:py-0",
          singleDirectory && "max-sm:self-center max-sm:items-center",
        )}
        href="/events/new"
      >
        Add event
      </Link>
    </section>
  ) : (
    <DiscoverySection
      columns={pairUpcomingAndWorld ? "single-xl" : undefined}
      empty="No events"
      results={data.upcomingEvents}
      surface="upcoming_events"
      title="Upcoming events"
    />
  );
  const featuredWorlds = activeWorlds.length > 0 || (status === "live" && activeWorldStatus !== "live") ? (
    <HomeActiveWorldsSection
      paired={pairUpcomingAndWorld}
      singleUpcomingEventPath={singleUpcomingEventPath}
      worlds={activeWorlds}
    />
  ) : null;

  return (
    <PageShell className="max-sm:py-5">
      <PageContainer className={cn("gap-4 sm:gap-6", singleDirectory && "lg:max-w-[40rem]")} data-discovery-results max={singleDirectory ? "3xl" : "7xl"}>
        <DiscoveryResultFocus />

        <section className={cn(styles.intro, "grid grid-cols-1 gap-4 pb-1 sm:gap-5 lg:items-center", singleDirectory ? "lg:grid-cols-[auto_minmax(0,1fr)] lg:py-3" : "lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:py-6")}>
          <div>
            <h1 className={cn(styles.introTitle, "max-w-md text-4xl leading-none font-semibold wrap-anywhere sm:text-5xl")}>
              Discover VR
            </h1>
          </div>
          <DiscoverySearchForm className={cn(styles.searchForm, "w-full")} compact iconSubmit placeholder="Search VRDex" surface="home" tone="default" />
        </section>

        {showDirectoryShortcuts ? (
          <nav aria-label="Discovery categories" className="-mt-3 -mb-2 flex flex-wrap gap-x-1 xl:hidden">
            {populatedDirectory.map(({ headingId, title }) => (
              <a
                className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "min-h-11 underline decoration-border-strong underline-offset-4 hover:decoration-current")}
                href={`#${headingId}`}
                key={headingId}
              >
                {title}
              </a>
            ))}
          </nav>
        ) : null}

        {status === "error" || (status === "missing-url" && activeWorlds.length === 0) ? (
          <DiscoveryBackendNotice hasFeaturedWorlds={activeWorlds.length > 0} kind={status} />
        ) : null}

        {pairUpcomingAndWorld ? (
          <div className="contents xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-6">
            {upcoming}
            {featuredWorlds}
          </div>
        ) : (
          <>
            {status === "live" ? upcoming : null}
            {featuredWorlds}
          </>
        )}

        {data.featured.length > 0 ? (
          <DiscoveryFeatureGate flag={FEATURED_DISCOVERY_UI_FLAG}>
            <section className="min-w-0 border-t border-border pt-6">
              <SectionTitle>Featured</SectionTitle>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {data.featured.slice(0, 2).map((result) => <PosterCard key={`${result.entityType}-${result.slug}`} result={result} />)}
              </div>
            </section>
          </DiscoveryFeatureGate>
        ) : null}

        {status === "live" ? <section className={cn("grid gap-4 sm:gap-5", directorySections.length === 3 ? "xl:grid-cols-3" : directorySections.length === 2 ? "xl:grid-cols-2" : undefined)}>
          {directorySections.map(({ headingId, title, results, empty }) => (
            <DiscoverySection
              key={headingId}
              columns="single"
              empty={empty}
              headingId={showDirectoryShortcuts ? headingId : undefined}
              results={results}
              surface="home"
              title={title}
            />
          ))}
        </section> : status === "missing-url" && activeWorlds.length > 0 ? (
          <section className="min-w-0 border-t border-border pt-3 sm:pt-6">
            <SectionTitle className="max-sm:text-xl">Directory</SectionTitle>
            <Notice className="mt-3 sm:mt-6" variant="dashed">Unavailable</Notice>
          </section>
        ) : null}
      </PageContainer>
    </PageShell>
  );
}

function filterLabel(filter: SearchResultFilter): string {
  switch (filter) {
    case "event":
      return "Events";
    case "person":
      return "People";
    case "community":
      return "Communities";
    case "world":
      return "Worlds";
    default:
      return "All";
  }
}

export function SearchResultsPage({
  activeFilter,
  query,
  referenceTime,
  results,
  status,
}: {
  activeFilter: SearchResultFilter;
  query: string;
  referenceTime: number;
  results: PublicSearchResult[];
  status: DiscoveryStatus;
}) {
  const hasQuery = Boolean(query.trim());
  const inputId = "standard-search-query";
  const filters: SearchResultFilter[] = ["all", "event", "person", "community", "world"];

  return (
    <SearchViewShell
      activeView="standard"
      className="max-sm:py-5"
      hasQuery={hasQuery}
      searchControl={<DiscoverySearchForm compact defaultQuery={query} filter={activeFilter} inputId={inputId} placeholder="Search VRDex" surface="search" tone="default" />}
    >
        {hasQuery ? (
          <SearchResultsHistory>
            <nav aria-label="Entity type" className="flex flex-wrap gap-x-0.5 border-b border-border sm:gap-x-2">
              {filters.map((filter) => {
                const active = filter === activeFilter;

                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      buttonVariants({ size: "sm", variant: "ghost" }),
                      styles.searchFilter,
                      "min-h-11 min-w-11 rounded-none border-b-2 border-transparent px-1 max-sm:text-xs sm:px-3",
                      active ? "border-accent-strong !text-accent-strong" : "!text-muted hover:!text-foreground",
                    )}
                    href={searchHref({ filter, query })}
                    key={filter}
                  >
                    {filterLabel(filter)}
                  </Link>
                );
              })}
            </nav>
            <p className="sr-only wrap-anywhere text-sm font-medium text-muted group-has-[[data-search-draft]]/search-view:not-sr-only group-has-[[data-search-draft]]/search-view:pb-2" id="search-results-query">
              Results for <span className="font-semibold text-foreground">{query}</span>
            </p>
            {status !== "live" ? (
              <Card className="flex flex-wrap items-center justify-between gap-3" surface="dashed">
                <p className="text-pretty font-medium" role="status">
                  {status === "missing-url" ? "Search data is not available in this environment yet." : "Search data is temporarily unavailable."}
                </p>
                {status === "error" ? (
                  // Retry needs a fresh request for the same URL.
                  <a className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "min-h-11")} href={searchHref({ filter: activeFilter, query })}>Retry</a>
                ) : null}
              </Card>
            ) : results.length === 0 ? (
              <Card className="grid justify-items-start gap-2" surface="strong">
                {activeFilter === "all" ? (
                  <>
                    <p className="text-pretty font-semibold">No public results matched that search yet.</p>
                    <p className="text-pretty text-sm leading-6 text-muted">
                      Try a community name, DJ alias, world name, event title, genre, or scene term.
                    </p>
                    <EditPublicSearchLink inputId={inputId} />
                  </>
                ) : (
                  <>
                    <p className="font-semibold">No {filterLabel(activeFilter).toLowerCase()}</p>
                    <Link className={cn(buttonVariants({ size: "sm", variant: "primary" }), "min-h-11")} href={searchHref({ filter: "all", query })}>
                      Search all
                    </Link>
                  </>
                )}
              </Card>
            ) : (
              <div className="grid gap-2.5 sm:gap-4">
                {results.map((result) => <SearchResultCard key={`${result.entityType}-${result.slug}`} referenceTime={referenceTime} result={result} />)}
              </div>
            )}
          </SearchResultsHistory>
        ) : null}
        {activeFilter === "event" ? (
          <Link
            className="inline-flex min-h-11 w-fit items-center rounded-control text-sm font-medium text-muted underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-strong"
            href="/events/new"
          >
            Add event
          </Link>
        ) : null}
    </SearchViewShell>
  );
}
