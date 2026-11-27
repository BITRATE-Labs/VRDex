import type { PublicVerifiedConnection } from "@vrdex/api-contracts";
import { mergeVerifiedVrchatLinks, isVerifiedVrchatLink } from "@/lib/profile-link-verification";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { profileLinkHasCustomLabel,profileLinkPresentation,type ProfileLinkDestinationMetadata } from "../../../../../convex/_profileLinkPresentation";
import { parseProfileLinkDestination } from "../../../../../convex/_profileLinkDestination";
import { Fragment, type CSSProperties, type ReactNode } from "react";

import { EventPreviewCard, type PublicEventPreview } from "./event-public-page";
import { PublicMediaAssetCard } from "./public-media-asset-card";
import { EntityImage } from "@/components/ui/entity-image";
import { ProfileAvatarImage } from "./profile-avatar-image";
import { HomeLiveNow } from "./home-live-now";
import { ProfileVrcdnStreams } from "./profile-vrcdn-streams";
import streamStyles from "./profile-vrcdn-streams.module.css";
import { ProfilePrivateRecord } from "./profile-private-record";
import { PublicGroupMembershipChart, type GroupMembership } from "./public-group-membership-chart";
import { CommunityPopulationHistory } from "./public-group-population-chart";
import { CommunityActivityDetails, CommunityActivitySection, CommunityActivitySummary } from "./community-activity-layout";
import type { PopulationSeries } from "@/lib/public-group-statistics";
import { buttonVariants } from "@/components/ui/button";
import { Card, Eyebrow, SectionHeading, SectionTitle } from "@/components/ui/card";
import { PageContainer, PageShell } from "@/components/ui/page-shell";
import { VerifiedTrustMark } from "@/components/ui/verified-trust-mark";
import { avatarFrameStyle, defaultAvatarAppearance, type AvatarAppearance } from "@/lib/avatar-appearance";
import { cn } from "@/lib/cn";
import { uniqueProfileIdentityItems } from "@/lib/profile-identity-items";
import { profileClaimPath } from "@/lib/profile-claim";
import { hasRenderableProfileMediaKit } from "@/lib/profile-media-kit";
import { safeImageBackground, safeImageUrl } from "@/lib/safe-image";
import type { TwitchLiveState } from "@/lib/server/twitch-live";
import type { VrcdnLiveState } from "@/lib/vrcdn-live";
import { twitchLinkForLiveClaim, twitchLoginFromUrl } from "@/lib/twitch-url";
import { parseVrcdnStreamLinks, vrcdnPlaybackHref } from "../../../../../convex/_vrcdnLinks";

type ProfileTrustLabel =
  | "community_submitted"
  | "unclaimed"
  | "claimed_unverified"
  | "claimed_verified";
type ProfileLinkType =
  | "vrchat_profile"
  | "vrcdn"
  | "discord"
  | "soundcloud"
  | "mixcloud"
  | "twitch"
  | "youtube"
  | "spotify"
  | "bandcamp"
  | "instagram"
  | "linktree"
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
type LinkSource = "owner_authored" | "reviewed" | "partner_provided" | "community_submitted";
type LinkPresentation = "icon" | "copy";
type WorldCreatorRole =
  | "world_author"
  | "builder"
  | "venue_operator"
  | "community_operator"
  | "media_credit"
  | "storefront_owner";

type PublicProfileGenre = {
  slug: string;
  displayName: string;
  displayLabel?: string;
  featured?: boolean;
};

type PublicProfileAsset = {
  assetId: string;
  label?: string;
  caption?: string;
  altText?: string;
  credit?: string;
  creditUrl?: string;
  detailsUrl?: string;
  mimeType: string;
  byteSize: number;
  downloadMimeType?: string;
  downloadByteSize?: number;
  sourcePreserved?: boolean;
  imageUrl: string;
  downloadUrl: string;
};

type PublicProfileMediaKit = {
  profileImage?: PublicProfileAsset;
  banner?: PublicProfileAsset;
  featuredAsset?: PublicProfileAsset;
  primaryLogo?: PublicProfileAsset;
  additionalLogos: PublicProfileAsset[];
  logos: PublicProfileAsset[];
  assets: PublicProfileAsset[];
  galleryAssets?: PublicProfileAsset[];
  logoZipUrl?: string;
  compactDisplay: "profile_image" | "logo";
  avatarAppearance?: PublicProfileAvatarAppearance;
};

type PublicProfileAvatarAppearance = AvatarAppearance;
type ProfilePublicSectionKey = "about" | "events" | "links" | "media_kit" | "worlds" | "details";
type PublicProfileAppearance = {
  sectionOrder: ProfilePublicSectionKey[];
  showMemberCount?: boolean;
  showMemberHistory?: boolean;
};

type PublicProfileBase = {
  id?: string;
  profileType: "person" | "community";
  slug: string;
  displayName: string;
  aliases: string[];
  tags: string[];
  genres: PublicProfileGenre[];
  headline?: string;
  bio?: string;
  about?: string;
  avatarImageUrl?: string;
  bannerImageUrl?: string;
  region?: string;
  timezone?: string;
  trustLabel: ProfileTrustLabel;
  updatedAt?: number;
  source?: {
    sourceType: "community";
    label: string;
    submittedAt?: number;
  };
  verifiedConnections?: PublicVerifiedConnection[];
  outboundLinks: Array<{
    type: ProfileLinkType;
    label: string;
    labelMode?: "automatic" | "custom";
    destination?: ProfileLinkDestinationMetadata;
    url: string;
    handle?: string;
    presentation?: LinkPresentation;
    source: LinkSource;
  }>;
  worldCredits: Array<{
    slug: string;
    displayName: string;
    roles: WorldCreatorRole[];
    heroImageUrl?: string;
    tags: string[];
    summary?: string;
    sourceLabel?: string;
  }>;
  upcomingEvents: PublicEventPreview[];
  hostedEvents: PublicEventPreview[];
  appearance?: PublicProfileAppearance;
  mediaKit?: PublicProfileMediaKit;
  twitchLive?: TwitchLiveState;
  vrcdnLive?: Record<string, VrcdnLiveState>;
};

type PublicPersonProfile = PublicProfileBase & {
  profileType: "person";
  person: {
    pronouns?: string;
    roleTags: string[];
  };
};

type PublicCommunityProfile = PublicProfileBase & {
  profileType: "community";
  community: {
    subtype?: string;
    categoryTags: string[];
  };
  groupMembership?: GroupMembership;
  telemetry?: {
    publicationPolicy?: "automatic_aggregate" | "managed_categories";
    populationSeries?: PopulationSeries;
    freshness: "current" | "stale";
    observedAt?: number;
    currentPopulation?: { value: number; activeInstanceCount: number; observedAt: number };
    populationHistory?: Array<{ startAt: number; currentPopulation?: number; peakConcurrency: number; coverageRatio: number }>;
    groupMemberCount?: { value: number; observedAt: number };
    groupMemberGrowth?: { value: number; startAt: number; endAt: number };
    instanceHistory?: Array<{
      world: { slug: string; displayName: string } | null;
      openedAt: number;
      lastObservedAt: number;
      closedAt?: number;
    }>;
    eventRecaps?: Array<{
      event?: { slug: string; title: string };
      startAt: number;
      peakConcurrency: number;
      playerHours: number;
      durationMinutes: number;
      coverageRatio: number;
    }>;
  };
};

export type PublicProfile = PublicPersonProfile | PublicCommunityProfile;

function initialsFor(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "VR";
}

const profileSectionKeys: ProfilePublicSectionKey[] = [
  "about",
  "events",
  "links",
  "media_kit",
  "worlds",
  "details",
];
const defaultProfileSectionOrder: ProfilePublicSectionKey[] = [...profileSectionKeys];

function normalizeProfileSectionOrder(input: readonly ProfilePublicSectionKey[] | undefined): ProfilePublicSectionKey[] {
  const seen = new Set<ProfilePublicSectionKey>();
  const normalized: ProfilePublicSectionKey[] = [];

  for (const section of input ?? []) {
    if (!profileSectionKeys.includes(section) || seen.has(section)) {
      continue;
    }

    seen.add(section);
    normalized.push(section);
  }

  for (const section of defaultProfileSectionOrder) {
    if (!seen.has(section)) {
      normalized.push(section);
    }
  }

  return normalized;
}

function safeHttpsUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}

function roleLabel(role: WorldCreatorRole): string {
  return role
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function CommunityActivity({ profile }: { profile: PublicCommunityProfile }) {
  const { telemetry, groupMembership } = profile;
  const showCount = profile.appearance?.showMemberCount !== false;
  const showHistory = profile.appearance?.showMemberHistory !== false;
  if (telemetry?.populationSeries) return <CommunityPopulationHistory
    key={profile.slug}
    slug={profile.slug}
    initialActivity={{ telemetry, groupMembership, showCount, showHistory }}
    now={telemetry.populationSeries.endAt}
  />;
  const memberCount = showCount ? groupMembership?.latest ?? telemetry?.groupMemberCount : undefined;
  const automatic = telemetry?.publicationPolicy === "automatic_aggregate";
  const membershipHistory = showHistory && groupMembership ? <div className="mt-6"><PublicGroupMembershipChart membership={groupMembership} /></div> : null;
  const instanceHistory = automatic ? undefined : telemetry?.instanceHistory;
  const eventRecaps = automatic ? undefined : telemetry?.eventRecaps;
  const history = telemetry?.populationHistory ?? [];
  const historyMax = Math.max(1, ...history.map((point) => point.peakConcurrency));
  const hasPopulation = telemetry?.currentPopulation || history.length > 0;
  if (!hasPopulation && !memberCount && !telemetry?.groupMemberGrowth && !membershipHistory && !instanceHistory?.length && !eventRecaps?.length) return null;
  return (
    <CommunityActivitySection freshness={hasPopulation ? telemetry?.freshness : undefined}>
      <CommunityActivitySummary currentPopulation={telemetry?.currentPopulation} memberCount={memberCount} memberGrowth={telemetry?.groupMemberGrowth} />
      {membershipHistory}
      {history.length > 0 ? <div className="mt-6" aria-label="Hourly peak population history. Missing buckets are blank." role="img">
        <div className="flex h-32 items-end gap-1 border-b border-border" aria-hidden="true">
          {history.map((point) => {
            const missing = point.currentPopulation === undefined || point.coverageRatio <= 0;
            return <span className={cn("min-w-1 flex-1", missing ? "bg-transparent" : "bg-accent", !missing && (point.coverageRatio < 0.5 ? "opacity-30" : "opacity-85"))} key={point.startAt} style={{ height: missing ? 0 : `${Math.max(3, (point.peakConcurrency / historyMax) * 100)}%` }} />;
          })}
        </div>
        <p className="mt-2 text-xs text-muted">Hourly peak population · gaps remain unfilled</p>
      </div> : null}
      <CommunityActivityDetails instanceHistory={instanceHistory} eventRecaps={eventRecaps} />
    </CommunityActivitySection>
  );
}

export function ProfileBackendNotice({ kind }: { kind: "missing-url" | "error" }) {
  return (
    <PageShell className="py-10">
      <PageContainer max="3xl">
      <Card className="shadow-panel" padding="lg">
        <Eyebrow>Public profile</Eyebrow>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
          {kind === "missing-url" ? "Convex URL not configured" : "Profile read failed"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
          {kind === "missing-url"
            ? "Run the local backend bootstrap before loading public profile pages from this worktree."
            : "Start the local Convex backend and reload this page once the profile query is reachable."}
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

export function ProfilePublicPage({ profile, mediaKitGalleryEnabled, embedded = false }: { profile: PublicProfile; mediaKitGalleryEnabled: boolean; embedded?: boolean }) {
  const isPerson = profile.profileType === "person";
  const bannerStyle = safeImageBackground(profile.bannerImageUrl);
  const avatarImageUrl = safeImageUrl(profile.avatarImageUrl);
  const mediaKit = profile.mediaKit ?? {
    additionalLogos: [],
    logos: [],
    assets: [],
    galleryAssets: [],
    compactDisplay: "profile_image" as const,
  };
  const avatarAppearance = mediaKit.avatarAppearance ?? defaultAvatarAppearance;
  const avatarStyle: CSSProperties = avatarFrameStyle(undefined, avatarAppearance);
  const eventPreviews = isPerson ? profile.upcomingEvents : profile.hostedEvents;
  const canClaim = profile.trustLabel === "community_submitted" || profile.trustLabel === "unclaimed";
  // Owner-authored personalization wins when present; the factual/community
  // bio remains the fallback instead of rendering two competing About blocks.
  // An unclaimed record has no owner yet, so its longer community narrative is
  // not treated as owner-authored personalization.
  const aboutCopy = canClaim
    ? profile.bio?.trim()
    : profile.about?.trim() || profile.bio?.trim();
  const focusItems = uniqueProfileIdentityItems(
    isPerson
      ? [...profile.person.roleTags, ...profile.tags]
      : [profile.community.subtype, ...profile.community.categoryTags, ...profile.tags].filter(
          (item): item is string => Boolean(item),
        ),
  );
  const visibleLinks = mergeVerifiedVrchatLinks(profile.outboundLinks, profile.verifiedConnections ?? [])
    .map(link => ({ ...link, type: link.type ?? "website", source: link.source ?? "owner_authored" }));
  const validLinks = visibleLinks
    // VRCDN resolved before the HTTPS filter, because its stored value is an
    // identifier rather than an address and `safeHttpsUrl` drops it. Filtering
    // first took the stream back out of `vrcdnStreams` below, which is the whole
    // watch and copy surface for a creator whose only link is their stream.
    .map((link) => ({ link, href: vrcdnPlaybackHref(link.url) ?? safeHttpsUrl(link.url) }))
    .filter(
      (item): item is { link: (typeof visibleLinks)[number]; href: string } =>
        item.href !== null && item.href !== undefined,
    );
  // Use the same channel for the live probe and the rendered link.
  const selectedTwitchLink = twitchLinkForLiveClaim(visibleLinks);
  const twitchLink =
    (selectedTwitchLink && validLinks.find(({ link }) => link === selectedTwitchLink)) ??
    validLinks.find(({ link }) => link.type === "twitch" && twitchLoginFromUrl(link.url));
  const discordHandles = validLinks.flatMap((item) => {
    if (item.link.type !== "discord" || parseProfileLinkDestination(item.link)?.kind === "discord_guild") {
      return [];
    }

    const handle = ("handle" in item.link && typeof item.link.handle === "string" ? item.link.handle : undefined) ?? item.link.label.replace(/^Discord\s*:?\s*/i, "").trim();
    return handle && handle.toLowerCase() !== "discord" ? [{ handle, item }] : [];
  });
  const vrcdnStreams = validLinks.flatMap((item) => {
    const { link } = item;
    if (link.type !== "vrcdn") {
      return [];
    }

    const providerUrl = new URL(link.url);
    const stream = providerUrl.search || providerUrl.hash ? null : parseVrcdnStreamLinks(link.url);
    return stream ? [{ item, label: link.label, stream }] : [];
  });
  const creatorLinks = validLinks.filter(
    (item) =>
      !discordHandles.some((discord) => discord.item === item) &&
      !vrcdnStreams.some((vrcdn) => vrcdn.item === item),
  );
  const aliases = profile.aliases.slice(0, 3);
  const remainingAliases = profile.aliases.slice(3);
  const metadata = uniqueProfileIdentityItems([
    isPerson ? profile.person.pronouns : profile.community.subtype,
    profile.region,
    ...(profile.headline ? [] : focusItems.slice(0, 4)),
  ]);
  const galleryAssets = mediaKit.galleryAssets ?? [];
  const galleryAssetIds = new Set([
    ...galleryAssets.map((asset) => asset.assetId),
    ...(mediaKit.featuredAsset ? [mediaKit.featuredAsset.assetId] : []),
  ]);
  const remainingLogos = mediaKit.logos.filter((asset) => !galleryAssetIds.has(asset.assetId));
  const hasMediaKit = hasRenderableProfileMediaKit({
    additionalLogoCount: mediaKit.additionalLogos.length,
    galleryAssetCount: galleryAssets.length,
    galleryEnabled: mediaKitGalleryEnabled,
    hasPrimaryLogo: mediaKit.primaryLogo !== undefined,
    logoCount: mediaKit.logos.length,
  });
  const profileBasePath = `/${profile.slug}`;
  const sectionOrder = normalizeProfileSectionOrder(profile.appearance?.sectionOrder);
  const secondaryOrder = sectionOrder.filter((section) => section === "events" || section === "media_kit" || section === "worlds");
  const hasDefaultAppearance = mediaKit.compactDisplay === "profile_image"
    && Object.entries(defaultAvatarAppearance).every(([key, value]) => avatarAppearance[key as keyof AvatarAppearance] === value)
    && sectionOrder.every((section, index) => section === defaultProfileSectionOrder[index]);
  const hasSparseIdentity = !embedded && canClaim && hasDefaultAppearance
    && !avatarImageUrl && !bannerStyle && !mediaKit.profileImage && !mediaKit.banner
    && !profile.headline?.trim() && !profile.about?.trim() && !aboutCopy && !profile.timezone?.trim()
    && aliases.length === 0 && focusItems.length === 0 && metadata.length === 0 && profile.genres.length === 0
    && !profile.verifiedConnections?.length
    && !hasMediaKit && !mediaKit.featuredAsset && mediaKit.assets.length === 0 && galleryAssets.length === 0
    && eventPreviews.length === 0 && profile.worldCredits.length === 0;
  const groupDestination = creatorLinks.length === 1 ? parseProfileLinkDestination(creatorLinks[0].link) : null;
  const hasPrimaryGroupLink = groupDestination?.kind === "vrchat_group";
  const useCompactCommunity = !isPerson && hasSparseIdentity && !profile.telemetry && !profile.groupMembership
    && (visibleLinks.length === 0 || (visibleLinks.length === 1 && hasPrimaryGroupLink));
  const useCompactIdentity = useCompactCommunity || (isPerson && hasSparseIdentity && visibleLinks.length === 0);
  const isRichPublicCommunity = !isPerson && !embedded && !useCompactIdentity;
  const hasSingleCommunityEvent = isRichPublicCommunity && eventPreviews.length === 1;
  const hasCommunityEventShortcut = isRichPublicCommunity && eventPreviews.length > 0;
  const isRichPublicPerson = isPerson && !embedded && !useCompactIdentity;
  const useSideBySideMobileIdentity = isRichPublicCommunity || isRichPublicPerson;
  const moveOwnershipBelowContent = !embedded && (!isPerson || isRichPublicPerson);
  const visitorDestinations = {
    links: { id: "profile-links", label: "Links", available: creatorLinks.length > 0 || discordHandles.length > 0 },
    streams: { id: "profile-streams", label: "VRCDN", available: vrcdnStreams.length > 0 },
    events: { id: "profile-events", label: "Upcoming events", available: eventPreviews.length > 0 },
    media_kit: { id: "profile-media-kit", label: "Media kit", available: hasMediaKit },
    worlds: { id: "profile-worlds", label: "Worlds", available: profile.worldCredits.length > 0 },
  };
  const linksColumnSection = isRichPublicPerson && visitorDestinations.links.available && visitorDestinations.streams.available
    ? secondaryOrder.find((section) => visitorDestinations[section].available)
    : undefined;
  const visitorLinks = isRichPublicPerson
    ? (["links", "streams", ...secondaryOrder] as const)
      .map((section) => visitorDestinations[section])
      .filter(({ available }) => available)
    : [];
  function visitorHeading(section: "events" | "media_kit" | "worlds") {
    const { id, label } = visitorDestinations[section];
    return isRichPublicPerson ? (
      <SectionTitle className="scroll-mt-24 focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-accent" id={id} tabIndex={-1}>
        {label}
      </SectionTitle>
    ) : <SectionHeading>{label}</SectionHeading>;
  }
  const quietContributionStyle = "!text-muted underline decoration-border-strong underline-offset-4 hover:decoration-current";
  const ownershipActionClassName = cn("shrink-0 whitespace-nowrap max-sm:min-h-11", useCompactCommunity && quietContributionStyle);
  const secondarySections: Partial<Record<ProfilePublicSectionKey, ReactNode>> = {
    events: eventPreviews.length > 0 || !isPerson ? (
      <section className={cn(
        "border-t border-border",
        useCompactCommunity ? "pb-4 pt-5 lg:pt-3" : "py-8",
        isRichPublicCommunity && "max-sm:py-5",
        hasSingleCommunityEvent && "lg:grid lg:grid-cols-2 lg:gap-x-3",
      )}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {isPerson
            ? visitorHeading("events")
            : (
              <SectionTitle
                className={cn(
                  useCompactCommunity ? "text-xl" : "max-sm:text-xl",
                  hasCommunityEventShortcut && "scroll-mt-24 focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-accent [@media(scripting:none)]:scroll-mt-32",
                )}
                id={hasCommunityEventShortcut ? "profile-events" : undefined}
                tabIndex={hasCommunityEventShortcut ? -1 : undefined}
              >
                Hosted events
              </SectionTitle>
            )}
          {!isPerson ? (
            <Link
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 shrink-0 whitespace-nowrap", quietContributionStyle)}
              href={`/events/new?community=${encodeURIComponent(profile.slug)}`}
            >
              Add event
            </Link>
          ) : null}
        </div>
        {eventPreviews.length > 0 ? (
          <div className={cn(
            "mt-5 grid gap-3",
            isRichPublicCommunity && "max-sm:mt-3",
            hasSingleCommunityEvent && "lg:col-start-1",
            !hasSingleCommunityEvent && linksColumnSection !== "events" && "lg:grid-cols-2",
          )}>
            {eventPreviews.map((event) => (
              <EventPreviewCard event={event} key={`${event.slug ?? event.title}-${event.startAt}`} variant={isRichPublicCommunity ? "community" : undefined} />
            ))}
          </div>
        ) : useCompactCommunity ? <p className="mt-2 text-sm font-medium text-foreground">No events</p> : null}
      </section>
    ) : null,
    media_kit: hasMediaKit ? (
      <section className="border-t border-border py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {visitorHeading("media_kit")}
          {mediaKit.logoZipUrl ? (
            <a className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "max-sm:min-h-11")} download href={mediaKit.logoZipUrl}>
              Download logos
            </a>
          ) : null}
        </div>
        {mediaKitGalleryEnabled && mediaKit.featuredAsset ? (
          <div className="mt-5">
            <PublicMediaAssetCard asset={mediaKit.featuredAsset} featured label="Featured media" />
          </div>
        ) : null}
        <div className={cn("mt-5 grid gap-3 sm:grid-cols-2", linksColumnSection !== "media_kit" && "lg:grid-cols-3")}>
          {mediaKitGalleryEnabled ? (
            galleryAssets
              .filter((asset) => asset.assetId !== mediaKit.featuredAsset?.assetId)
              .map((asset, index) => (
                <PublicMediaAssetCard asset={asset} compactOnMobile key={asset.assetId} label={`Media ${index + 1}`} />
              ))
          ) : (
            <>
              {mediaKit.primaryLogo ? <PublicMediaAssetCard asset={mediaKit.primaryLogo} label="Primary logo" /> : null}
              {mediaKit.additionalLogos.map((asset, index) => (
                <PublicMediaAssetCard asset={asset} key={asset.assetId} label={`Logo ${index + 2}`} />
              ))}
            </>
          )}
          {mediaKitGalleryEnabled
            ? remainingLogos.map((asset, index) => (
                <PublicMediaAssetCard asset={asset} compactOnMobile key={asset.assetId} label={`Logo ${index + 1}`} />
              ))
            : null}
        </div>
      </section>
    ) : null,
    worlds: profile.worldCredits.length > 0 ? (
      <section className="border-t border-border py-8">
        {visitorHeading("worlds")}
        <div className={cn("mt-5 grid gap-3", linksColumnSection !== "worlds" && "lg:grid-cols-2")}>
          {profile.worldCredits.map((world) => (
            <Link
              className="flex min-w-0 items-start gap-4 rounded-card border border-border bg-surface-strong p-4 text-sm transition hover:border-border-strong"
              href={`/${world.slug}`}
              key={world.slug}
            >
              <EntityImage label={world.displayName} src={world.heroImageUrl} className="h-16 w-24 rounded-control" sizes="96px" />
              <span className="min-w-0">
              <span className="block text-lg font-semibold">{world.displayName}</span>
              <span className="mt-1 block text-muted">{world.roles.map(roleLabel).join(", ")}</span>
              {world.summary ? <span className="mt-3 line-clamp-2 block leading-6 text-muted">{world.summary}</span> : null}
              </span>
            </Link>
          ))}
        </div>
      </section>
    ) : null,
  };

  const profileLinks = (
    <ProfileVrcdnStreams
      compactLinks={useCompactCommunity}
      compactMobileSpacing={isRichPublicCommunity}
      linksHeadingId={isRichPublicPerson ? visitorDestinations.links.id : undefined}
      streamsSectionId={isRichPublicPerson ? visitorDestinations.streams.id : undefined}
      linksColumnContent={linksColumnSection ? secondarySections[linksColumnSection] : undefined}
      discordHandles={discordHandles.map(({ handle, item }) => ({
        handle,
        key: item.link.url,
      }))}
      initialLiveStates={profile.vrcdnLive}
      links={creatorLinks.map(({ link, href }) => {
        const connection = link.verifiedAt === undefined ? undefined : profile.verifiedConnections?.find(connection =>
          isVerifiedVrchatLink(link.url, [{ ...connection, verified: true }]));
        const display = profileLinkPresentation(link, connection?.assetExternalId);
        const hideCaption = useCompactCommunity && !profileLinkHasCustomLabel(link)
          && (display.label === profile.displayName || (groupDestination?.locator.startsWith("grp_")
            && display.label === profileLinkPresentation({ type: link.type, url: link.url }).label));
        return {
          href, type: link.type, key: `${link.type}-${link.url}`, ...display,
          hideCaption,
          platform: link.type === "twitch" ? "Twitch" : display.platform,
          label: link.type === "twitch" ? twitchLoginFromUrl(link.url) ?? display.label : connection && !profileLinkHasCustomLabel(link)
            ? connection.displayName || display.label : display.label,
          live: link === twitchLink?.link && profile.twitchLive?.status === "live",
          verifiedAt: link.verifiedAt,
        };
      })}
      profileSlug={profile.slug}
      profileId={profile.id}
      displayName={profile.displayName}
      streams={vrcdnStreams.map(({ item, label, stream }) => ({
        claimable: true,
        communitySubmitted: item.link.source === "community_submitted",
        key: `${item.link.type}-${item.link.url}`,
        label,
        pcUrl: stream.pcUrl,
        questUrl: stream.questUrl,
        directVideoUrl: stream.directVideoUrl,
        streamId: stream.streamId,
      }))}
    />
  );
  const communityEventShortcut = hasCommunityEventShortcut ? (
    <a
      className={cn(
        "-mt-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control text-sm font-medium underline decoration-current/50 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 sm:hidden",
        hasPrimaryGroupLink ? "text-accent-strong focus-visible:outline-accent" : "text-white focus-visible:outline-white",
      )}
      href="#profile-events"
    >
      Hosted events
      <ArrowDown aria-hidden="true" className="size-3.5" />
    </a>
  ) : null;
  const stackOwnershipPrompt = !embedded && isPerson && !useCompactIdentity;
  const profileOwnership = canClaim ? (
    <aside
      aria-label="Profile ownership"
      className={useCompactIdentity
        ? cn("grid gap-2 border-t border-border py-4", useCompactCommunity ? "lg:py-2" : "px-4 sm:px-6")
        : cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-2", moveOwnershipBelowContent && "border-t border-border pt-4")}
    >
      {!moveOwnershipBelowContent
        ? <p className={useCompactIdentity ? "text-sm font-medium text-foreground" : "text-sm text-muted"}>Unclaimed</p>
        : null}
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", stackOwnershipPrompt && "basis-full sm:basis-auto")}>
        <p className={cn("text-sm text-muted", (useCompactIdentity || stackOwnershipPrompt) && "basis-full sm:basis-auto")}>
          {isPerson ? "Is this your profile?" : "Manage this community?"}
        </p>
        <Link
          className={cn(buttonVariants({ size: "sm", variant: useCompactCommunity ? "ghost" : "secondary" }), ownershipActionClassName)}
          href={profileClaimPath(profile.slug, "profile")}
        >
          Claim profile
        </Link>
        {/* Offered to every reader of an unclaimed profile rather than
            only to those who could act on it: this page is server
            rendered with no viewer, and the editor handles sign-in. */}
        <Link
          className={cn(buttonVariants({ size: "sm", variant: "ghost" }), ownershipActionClassName)}
          href={`${profileBasePath}/edit`}
        >
          Suggest an edit
        </Link>
      </div>
    </aside>
  ) : null;
  const Shell = embedded ? Fragment : PageShell;
  return (
    <Shell {...(isRichPublicPerson && visitorDestinations.links.available ? { className: "max-sm:pt-6" } : {})}>
      <PageContainer className={cn(
        useCompactCommunity && "max-w-2xl lg:gap-4",
        isRichPublicCommunity && "max-sm:gap-3",
        isRichPublicPerson && streamStyles.profile,
      )}>

        <div className={useCompactIdentity ? cn("mx-auto w-full max-w-2xl rounded-panel border border-border-strong bg-surface-strong", !useCompactCommunity && "shadow-panel") : "contents"}>
          <section
            aria-labelledby={`profile-title-${profile.slug}`}
            className={useCompactIdentity ? undefined : cn(
              "overflow-hidden rounded-card border border-border bg-media shadow-panel",
              isRichPublicPerson && "max-sm:[html[data-theme=light]_&]:shadow-sm",
            )}
          >
            <div
              className={useCompactIdentity ? "p-4 sm:p-6" : "relative bg-media bg-cover bg-center p-5 text-white sm:p-6"}
              style={bannerStyle}
            >
              {bannerStyle ? <span aria-hidden="true" className="absolute inset-0 bg-black/60" /> : null}
              <div
                className={cn(
                  "relative grid gap-7",
                  (isRichPublicCommunity || visitorLinks.length > 0) && "max-sm:gap-4",
                  aboutCopy ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-center" : undefined,
                )}
              >
                <div className={cn(
                  "flex min-w-0",
                  useCompactIdentity ? "items-center gap-3 sm:gap-4" : "flex-col gap-6 sm:flex-row sm:items-center",
                  useSideBySideMobileIdentity && "max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-0",
                )}>
                  <div className="relative w-fit shrink-0">
                    <div
                      className={cn(
                        "relative flex items-center justify-center overflow-hidden font-semibold",
                        useCompactIdentity
                          ? "size-14 rounded-control border border-border-strong bg-surface-elevated text-xl text-foreground sm:size-16"
                          : "size-24 bg-white/20 text-3xl shadow-panel",
                        useSideBySideMobileIdentity && "max-sm:size-14 max-sm:text-xl",
                      )}
                      style={useCompactIdentity ? undefined : avatarStyle}
                    >
                      <ProfileAvatarImage
                        alt={`${profile.displayName} display image`}
                        fallback={initialsFor(profile.displayName)}
                        src={avatarImageUrl}
                      />
                    </div>
                    {profile.trustLabel === "claimed_verified" ? (
                      <VerifiedTrustMark className="verified-trust-mark--avatar" />
                    ) : null}
                  </div>
                  <div className={cn("min-w-0", useSideBySideMobileIdentity && "max-sm:contents")}>
                    <div className="min-w-0">
                      <h1
                        className={cn(
                          "break-words font-semibold",
                          useCompactIdentity ? "text-3xl leading-tight sm:text-4xl" : "text-4xl leading-none sm:text-5xl",
                          useSideBySideMobileIdentity && "max-sm:text-2xl max-sm:leading-tight",
                        )}
                        id={`profile-title-${profile.slug}`}
                      >
                        {profile.displayName}
                      </h1>
                      {canClaim && moveOwnershipBelowContent ? (
                        <p className={cn("mt-1 text-sm font-semibold", useCompactCommunity ? "text-foreground" : "text-white/75")}>Unclaimed</p>
                      ) : null}
                    </div>
                    <div className={useSideBySideMobileIdentity ? "max-sm:col-span-2" : undefined}>
                      {aliases.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-white/75">
                          <span>AKA {aliases.join(", ")}</span>
                          {remainingAliases.length > 0 ? (
                            <details>
                              <summary className="cursor-pointer">+{remainingAliases.length} more</summary>
                              <span className="mt-1 block">{remainingAliases.join(", ")}</span>
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                      {profile.headline ? <p className="mt-3 max-w-2xl text-base leading-7 text-white/85">{profile.headline}</p> : null}
                      {metadata.length > 0 ? <p className="mt-2 text-sm text-white/70">{metadata.join(" / ")}</p> : null}
                    </div>
                  </div>
                </div>
                {visitorLinks.length > 0 ? (
                  <nav
                    aria-label="Profile sections"
                    className={cn(
                      "flex flex-wrap gap-x-1 max-sm:justify-center max-sm:rounded-control max-sm:px-1 max-sm:ring-1 max-sm:ring-white/20 max-sm:ring-inset",
                      aboutCopy && "lg:col-span-2 lg:row-start-2",
                    )}
                  >
                    {visitorLinks.map(({ id, label }) => {
                      const streamShortcut = id === visitorDestinations.streams.id && vrcdnStreams[0]?.item.link.source !== "community_submitted";
                      const link = (
                        <a
                          className={cn(
                            "inline-flex min-h-11 items-center rounded-control px-2 text-sm font-medium text-white underline decoration-white/50 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-white max-sm:min-w-11 max-sm:justify-center max-sm:px-1",
                            streamShortcut && streamStyles.streamShortcut,
                          )}
                          href={"#" + id}
                          key={id}
                        >
                          {label}
                        </a>
                      );

                      return streamShortcut ? (
                        <span className="relative flex" key={id}>
                          {link}
                          <span className={streamStyles.shortcutStatus}>Live now</span>
                        </span>
                      ) : link;
                    })}
                  </nav>
                ) : null}
                {aboutCopy ? (
                  <div className="border-white/20 lg:border-l lg:pl-7">
                    <h2 className="text-sm font-semibold text-white/70">About</h2>
                    <p className="mt-2 max-w-xl text-base leading-7 text-white/88">{aboutCopy}</p>
                  </div>
                ) : null}
                {!hasPrimaryGroupLink ? communityEventShortcut : null}
              </div>
            </div>
            {useCompactCommunity && creatorLinks.length > 0 ? profileLinks : null}
          </section>

          {!moveOwnershipBelowContent ? profileOwnership : null}
        </div>

        {profile.profileType === "person" && <HomeLiveNow key={profile.slug} performerSlug={profile.slug} />}
        {!useCompactCommunity ? profileLinks : null}
        {hasPrimaryGroupLink ? communityEventShortcut : null}

        {!isPerson ? <CommunityActivity profile={profile} /> : null}

        {secondaryOrder.map((section) => {
          const content = section === linksColumnSection ? null : secondarySections[section];
          return content ? <Fragment key={section}>{content}</Fragment> : null;
        })}

        {moveOwnershipBelowContent ? profileOwnership : null}

        {!embedded ? <ProfilePrivateRecord profilePath={profileBasePath} slug={profile.slug} community={!isPerson} profileId={profile.id as Id<"profiles"> | undefined} /> : null}
      </PageContainer>
    </Shell>
  );
}
