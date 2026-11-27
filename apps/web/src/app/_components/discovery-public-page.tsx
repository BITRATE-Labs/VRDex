import Link from "next/link";
import { publicScheduleStatus } from "../../../../../convex/_eventRuntime";

import { DiscoveryFeatureGate, DiscoverySearchForm, TrackedDiscoveryLink } from "./discovery-analytics";
import { HomeActiveWorldsSection, type PublicActiveWorld } from "./home-active-worlds";
import { searchHref, type SearchResultFilter } from "./search-view-state";
import { SearchViewShell } from "./search-view-shell";
import { PublicSearchResultDetails } from "./public-search-result-details";
import type { PublicEventPreview } from "./event-public-page";
import { ViewerLocalEventDateTime, ViewerLocalEventTime } from "./viewer-local-event-times";
import { buttonVariants } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { EntityImage } from "@/components/ui/entity-image";
import { EventSchedule, EventScheduleRow } from "@/components/ui/event-schedule";
import { ProfileAvatarImage } from "@/components/ui/profile-avatar-image";
import type { PublicSearchResult } from "@/lib/public-search";
import { PageContainer, PageShell } from "@/components/ui/page-shell";
import { VerifiedTrustMark } from "@/components/ui/verified-trust-mark";
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

function ResultImage({ result }: { result: PublicSearchResult }) {
  const primaryImageUrl = result.entityType === "profile"
    ? result.profileImageUrl ?? result.imageUrl
    : result.imageUrl;

  if (result.entityType !== "profile") {
    return (
      <EntityImage
        className="size-14 rounded-card bg-[linear-gradient(135deg,var(--canvas-muted),var(--surface-raised))] text-lg text-foreground"
        label={result.title}
        sizes="56px"
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
            className="size-14 rounded-card border border-border bg-surface-strong text-xs"
            fallback="Logo"
            imageClassName="!object-contain p-1"
            label={`${result.title} logo`}
            sizes="56px"
            src={primaryImageUrl}
          />
        ) : (
          <ProfileAvatarImage
            appearance={result.avatarAppearance}
            className="size-14 rounded-card bg-[linear-gradient(135deg,var(--canvas-muted),var(--surface-raised))] text-lg text-foreground"
            label={result.title}
            sizes="56px"
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
    <span className="grid shrink-0 grid-cols-2 gap-1">
      <span className="relative">
        <ProfileAvatarImage
          appearance={result.avatarAppearance}
          className="size-14 rounded-card bg-[linear-gradient(135deg,var(--canvas-muted),var(--surface-raised))] text-lg text-foreground"
          label={result.title}
          sizes="56px"
          src={result.profileImageUrl}
        />
        {result.trustLabel === "claimed_verified" ? (
          <VerifiedTrustMark className="verified-trust-mark--avatar" />
        ) : null}
      </span>
      <EntityImage
        className="size-14 rounded-card border border-border bg-surface-strong text-xs"
        fallback="Logo"
        imageClassName="!object-contain p-1"
        label={`${result.title} logo`}
        sizes="56px"
        src={result.logoImageUrl}
        title="Logo"
      />
    </span>
  );
}

function DiscoveryEventSchedule({ events, now }: { events: PublicEventPreview[]; now: number }) {
  return (
    <section className="min-w-0 border-t border-border pt-6">
      <SectionTitle>Upcoming events</SectionTitle>
      <Link href="/events/new" className="text-sm font-medium underline underline-offset-4">Add event</Link>
      <EventSchedule className="mt-5" empty="No events">
        {events.map((event) => (
          <EventScheduleRow
            details={[
              event.communityName,
              event.worlds[0]?.displayName,
            ].filter(Boolean).join(" · ") || undefined}
            key={event.slug ?? `${event.title}:${event.startAt}`}
            metadata={event.nextSlots && event.nextSlots.length > 0 ? (
              <ul className="grid gap-1.5 text-sm text-muted">
                {event.nextSlots.map((slot) => (
                  <li className="flex flex-wrap items-baseline gap-x-2" key={`${slot.startAt}:${slot.displayLabel}`}>
                    <ViewerLocalEventTime className="font-mono text-xs text-foreground" timestamp={slot.startAt} />
                    {slot.performer ? (
                      <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={`/${slot.performer.slug}`}>
                        {slot.performer.displayName}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{slot.displayLabel}</span>
                    )}
                    <span>{slot.roleLabel}</span>
                  </li>
                ))}
              </ul>
            ) : undefined}
            status={publicScheduleStatus(event, now)}
            summary={event.summary}
            time={<ViewerLocalEventDateTime timestamp={event.startAt} eventDate={event.eventDate} scheduleKind={event.scheduleKind} />}
            title={publicEventPath(event) ? (
              <TrackedDiscoveryLink
                className="rounded-control text-section text-foreground underline decoration-transparent underline-offset-4 transition hover:text-accent-strong hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                eventName="event_card_clicked"
                href={publicEventPath(event)!}
                properties={{ entity_type: "event", surface: "upcoming_events" }}
              >
                {event.title}
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

  return (
    <TrackedDiscoveryLink
      className="group flex gap-4 rounded-panel border border-border bg-surface px-4 py-4 transition hover:-translate-y-1 hover:border-border-strong hover:bg-surface-strong hover:shadow-panel"
      eventName={result.entityType === "event" ? "event_card_clicked" : "search_result_clicked"}
      href={result.routePath}
      properties={{
        entity_type: result.entityType,
        profile_type: result.profileType,
        surface,
      }}
    >
      <ResultImage result={result} />
      <span className="flex min-w-0 flex-col gap-2">
        {result.startsAt === undefined && result.eventDate === undefined ? null : <ViewerLocalEventDateTime className="text-sm font-medium text-accent-strong" timestamp={result.startsAt} eventDate={result.eventDate} scheduleKind={result.scheduleKind} />}
        <span className="text-xl font-semibold group-hover:text-accent-strong">
          {result.title}
        </span>
        {subtitle ? <span className="text-sm text-muted">{subtitle}</span> : null}
        {result.summary ? <span className="line-clamp-2 text-sm leading-6 text-muted">{result.summary}</span> : null}
      </span>
    </TrackedDiscoveryLink>
  );
}

function SearchResultCard({ result }: { result: PublicSearchResult }) {
  const subtitle = resultSubtitle(result);
  const roleLabels = result.person
    ? [...new Set([...result.person.roleTags, ...result.person.tags])].slice(0, 3)
    : [];

  return (
    <div className="rounded-panel border border-border bg-surface transition hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-strong hover:shadow-panel">
      <TrackedDiscoveryLink
        className="group flex gap-4 rounded-panel p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-strong"
        eventName={result.entityType === "event" ? "event_card_clicked" : "search_result_clicked"}
        href={result.routePath}
        properties={{
          entity_type: result.entityType,
          profile_type: result.profileType,
          surface: "search_results",
        }}
      >
        <ResultImage result={result} />
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex flex-col gap-1">
            <span className="text-xl font-semibold text-accent-strong underline decoration-accent/50 underline-offset-4 group-hover:decoration-current [overflow-wrap:anywhere]">
              {result.title}
            </span>
            <span className="text-sm text-muted">{entityLabel(result)}</span>
          </span>
          {subtitle ? <span className="text-sm text-muted">{subtitle}</span> : null}
          {result.startsAt === undefined && result.eventDate === undefined ? null : <ViewerLocalEventDateTime className="text-sm text-accent-strong" timestamp={result.startsAt} eventDate={result.eventDate} scheduleKind={result.scheduleKind} />}
          {result.summary ? <span className="line-clamp-2 text-sm leading-6 text-muted">{result.summary}</span> : null}
          {roleLabels.length > 0 ? <span className="text-xs text-muted">{roleLabels.join(" · ")}</span> : null}
        </span>
      </TrackedDiscoveryLink>
      {result.person ? <PublicSearchResultDetails person={result.person} /> : null}
      {result.claimEntryPath ? (
        <div className="border-t border-border px-4">
          <Link
            className="inline-flex min-h-11 items-center rounded-control text-sm font-medium text-muted underline decoration-border-strong underline-offset-4 hover:text-accent-strong hover:decoration-current focus-visible:outline-2 focus-visible:outline-accent-strong"
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
  empty,
  columns = "responsive",
  results,
  surface,
}: {
  title: string;
  empty: string;
  columns?: "responsive" | "single";
  results: PublicSearchResult[];
  surface: DiscoveryAnalyticsSurface;
}) {
  return (
    <section className="min-w-0 border-t border-border pt-6">
      <SectionTitle>{title}</SectionTitle>
      {surface === "upcoming_events" ? <Link href="/events/new" className="text-sm font-medium underline underline-offset-4">Add event</Link> : null}
      <div className={cn("mt-5 grid gap-4", columns === "responsive" ? "lg:grid-cols-2" : undefined)}>
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

export function DiscoveryBackendNotice({ kind }: { kind: "missing-url" | "error" }) {
  return (
    <div className="rounded-panel border border-dashed border-white/25 bg-white/14 px-5 py-4 text-sm leading-6 text-white/78">
      {kind === "missing-url" ? "Discovery data is not available in this environment yet." : "Discovery data is temporarily unavailable."}
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
    { title: "People", results: data.people, empty: "No people are discoverable yet." },
    { title: "Communities", results: data.communities, empty: "No communities are discoverable yet." },
    { title: "Worlds", results: data.worlds, empty: "No worlds are discoverable yet." },
  ];
  const populatedDirectory = directory.filter(({ results }) => results.length > 0);
  const directorySections = populatedDirectory.length > 0 ? populatedDirectory : directory;

  return (
    <PageShell>
      <PageContainer className="gap-8" max="7xl">

        <section className="grid gap-6 border-b border-border py-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end lg:py-12">
          <div>
            <h1 className="max-w-md text-4xl leading-none font-semibold sm:text-5xl">
              Discover VR
            </h1>
          </div>
          <DiscoverySearchForm className="w-full" surface="home" tone="default" />
        </section>

        {status === "live" ? null : <DiscoveryBackendNotice kind={status} />}

        {data.eventSchedule && data.eventSchedule.length > 0 ? (
          <DiscoveryEventSchedule events={data.eventSchedule} now={now} />
        ) : status === "live" && data.upcomingEvents.length === 0 ? (
          <section className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <SectionTitle className="text-lg tracking-tight">Upcoming events</SectionTitle>
              <p className="text-sm leading-6 text-muted">No events</p>
            </div>
            <Link href="/events/new" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">Add event</Link>
          </section>
        ) : (
          <DiscoverySection
            empty="No events"
            results={data.upcomingEvents}
            surface="upcoming_events"
            title="Upcoming events"
          />
        )}

        {activeWorlds.length > 0 || activeWorldStatus !== "live" ? (
          <HomeActiveWorldsSection status={activeWorldStatus} worlds={activeWorlds} />
        ) : null}

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

        <section className={cn("grid gap-5", directorySections.length === 3 ? "xl:grid-cols-3" : directorySections.length === 2 ? "xl:grid-cols-2" : undefined)}>
          {directorySections.map(({ title, results, empty }) => (
            <DiscoverySection key={title} columns="single" empty={empty} results={results} surface="home" title={title} />
          ))}
        </section>
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
  results,
  status,
}: {
  activeFilter: SearchResultFilter;
  query: string;
  results: PublicSearchResult[];
  status: DiscoveryStatus;
}) {
  const hasQuery = Boolean(query.trim());
  const filters: SearchResultFilter[] = ["all", "event", "person", "community", "world"];

  return (
    <SearchViewShell
      activeView="standard"
      searchControl={<DiscoverySearchForm className="max-w-3xl" defaultQuery={query} filter={activeFilter} surface="search" tone="default" />}
    >
        {activeFilter === "event" ? <Link className={buttonVariants({ variant: "primary" })} href="/events/new">Add event</Link> : null}
        {hasQuery ? (
          <section aria-label="Search results" className="space-y-5">
            <h2 className="line-clamp-2 text-2xl font-semibold tracking-[-0.03em] [overflow-wrap:anywhere]">Results for {query}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <nav aria-label="Entity type" className="flex flex-wrap gap-x-0.5 gap-y-2 sm:gap-x-2">
                {filters.map((filter) => {
                  const active = filter === activeFilter;

                  return (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        buttonVariants({ size: "sm", variant: active ? "primary" : "secondary" }),
                        "min-h-11 min-w-11 px-1 sm:px-3",
                      )}
                      href={searchHref({ filter, query })}
                      key={filter}
                    >
                      {filterLabel(filter)}
                    </Link>
                  );
                })}
              </nav>
            </div>

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
              <Card surface="dashed">
                <p className="text-pretty font-medium">No public results matched that search yet.</p>
                <p className="mt-2 text-pretty text-sm leading-6 text-muted">
                  Try a community name, DJ alias, world name, event title, genre, or scene term.
                </p>
              </Card>
            ) : (
              <div className="grid gap-4">
                {results.map((result) => <SearchResultCard key={`${result.entityType}-${result.slug}`} result={result} />)}
              </div>
            )}
          </section>
        ) : null}
    </SearchViewShell>
  );
}
