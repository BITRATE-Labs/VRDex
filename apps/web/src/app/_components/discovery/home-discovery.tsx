"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { clearHomeRailPosition, isHomeRailNavigation, readHomeRailPosition, saveHomeRailPosition } from "../home-rail-history";
import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type ReactNode,
  type Ref,
} from "react";
import type { DiscoverySnapshot } from "@/lib/discovery/controller";
import type { FavoriteLineupSnapshot } from "@/lib/discovery/favorite-lineup";
import { togglePlanAction } from "@/lib/timeline/plan-actions";
import { useHomeBrowse } from "../home-browse-provider";
import { useTimelinePreferences } from "../timeline/use-timeline-preferences";
import { useHomeDiscovery } from "./use-home-discovery";
import { useFavoriteLineup } from "./use-favorite-lineup";
import {
  DiscoveryEventCard,
  type DiscoveryEventCardProps,
} from "./discovery-event-card";
import {
  DiscoveryClubCard,
  type DiscoveryClubCardProps,
} from "./discovery-club-card";
import styles from "./discovery.module.css";

type Available = Extract<DiscoverySnapshot, { kind: "available" }>;
export type HomeDiscoveryViewProps = Pick<
  DiscoveryEventCardProps,
  "preferences" | "timeZone" | "hour12" | "onSelect" | "onSave"
> &
  Pick<DiscoveryClubCardProps, "onFavorite"> & {
    snapshot: DiscoverySnapshot;
    retry(): void;
    sectionRef?: Ref<HTMLElement>;
    favoriteLineup?: FavoriteLineupSnapshot;
    liveFavoriteLineup?: boolean;
    restoreRailPosition?: boolean;
    onFocusedEventChange?(eventId: string | null): void;
    onFocusedClubChange?(profileId: string | null): void;
  };

type FocusedCard =
  | { kind: "event"; item: Available["events"][number]; index: number }
  | { kind: "club"; item: Available["clubs"][number]; index: number };
function retainFocused<T extends { id: string }>(
  items: T[],
  focused: { item: T; index: number } | null,
  eligible: readonly string[],
): T[] {
  if (!focused || !eligible.includes(focused.item.id)) return items;
  const current =
    items.find((item) => item.id === focused.item.id) ?? focused.item;
  const result = items.filter((item) => item.id !== current.id);
  result.splice(Math.min(focused.index, result.length), 0, current);
  return result.slice(0, 2);
}

function CardRail({
  children,
  title,
  placeholder = false,
  restoreRailPosition = false,
}: {
  children: ReactNode;
  title: "Events" | "Clubs";
  placeholder?: boolean;
  restoreRailPosition?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const restoredRailPosition = useRef(false);
  const userPanFrom = useRef<number | null>(null);
  const count = Children.count(children);
  const [edges, setEdges] = useState<{ left: boolean; right: boolean }>();
  const group = title === "Clubs" ? "clubs" : "events";
  const headingId = `discovery-${group}-heading`;
  const railId = `discovery-${group}-rail`;
  function updateEdges(rail: HTMLDivElement) {
    const { clientWidth, scrollLeft, scrollWidth } = rail;
    // Snap can advance through the 3px focus gutter at rest.
    const edgeTolerance = 4;
    const left = scrollLeft > edgeTolerance;
    const right = scrollWidth - clientWidth - scrollLeft > edgeTolerance;
    if (!left && !right && controlsRef.current?.contains(document.activeElement)) {
      const wasAtEnd =
        rail.hasAttribute("data-scroll-left") &&
        !rail.hasAttribute("data-scroll-right");
      const card = wasAtEnd ? rail.lastElementChild : rail.firstElementChild;
      card?.querySelector<HTMLAnchorElement>("a[href]")?.focus({
        preventScroll: true,
      });
    }
    setEdges((previous) =>
      previous?.left === left && previous.right === right
        ? previous
        : { left, right },
    );
  }

  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    const observer = new ResizeObserver(() => updateEdges(rail));
    observer.observe(rail);
    return () => observer.disconnect();
  }, [count]);

  useLayoutEffect(() => {
    const rail = ref.current;
    if (!restoreRailPosition || !rail || restoredRailPosition.current) return;
    const saved = readHomeRailPosition();
    if (saved?.rail !== group) return;

    const cards = Array.from(rail.children);
    const index = cards.findIndex((card) => card.getAttribute("data-home-rail-item") === saved.itemId);
    const card = cards[index];
    if (!card) return;

    restoredRailPosition.current = true;
    const left = index === saved.index && rail.clientWidth === saved.width
      ? saved.left
      : card.getBoundingClientRect().left - cards[0].getBoundingClientRect().left;
    rail.scrollTo({ left, behavior: "instant" });
  }, [children, group, restoreRailPosition]);

  function beginUserPan(rail: HTMLDivElement) {
    if (restoreRailPosition && userPanFrom.current === null && readHomeRailPosition()?.rail === group) {
      userPanFrom.current = rail.scrollLeft;
    }
  }

  function move(direction: -1 | 1) {
    const rail = ref.current;
    if (!rail || !edges?.[direction === -1 ? "left" : "right"]) return;
    beginUserPan(rail);
    rail.scrollBy({ left: direction * rail.clientWidth });
  }

  function settleClubRail(rail: HTMLDivElement) {
    if (
      title !== "Clubs" ||
      getComputedStyle(rail).scrollSnapType !== "x mandatory"
    ) return;
    const end = rail.scrollWidth - rail.clientWidth;
    const stop = rail.scrollLeft > end / 2 ? end : 0;
    if (Math.abs(rail.scrollLeft - stop) > 1) rail.scrollTo({ left: stop });
  }

  return (
    <>
      <div className={styles.railHeading}>
        <h3
          id={headingId}
          className={styles.groupHeading}
          tabIndex={!placeholder && title === "Clubs" ? -1 : undefined}
        >
          {title}
        </h3>
        {!placeholder && count > 1 && (edges?.left || edges?.right) && (
          <div
            className={styles.railControls}
            ref={controlsRef}
            onKeyDown={(event) => {
              if (event.key !== "Tab" || event.shiftKey || edges.right) return;
              const link = ref.current?.lastElementChild
                ?.querySelector<HTMLAnchorElement>("a[href]");
              if (!link) return;
              event.preventDefault();
              link.focus({ preventScroll: true });
            }}
          >
            <button
              type="button"
              aria-label={`Previous ${group}`}
              aria-controls={railId}
              aria-disabled={!edges.left}
              tabIndex={edges.left ? 0 : -1}
              onClick={() => move(-1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Next ${group}`}
              aria-controls={railId}
              aria-disabled={!edges.right}
              tabIndex={edges.right ? 0 : -1}
              onClick={() => move(1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div
        id={railId}
        className={
          title === "Clubs" ? `${styles.cards} ${styles.clubRail}` : styles.cards
        }
        data-scroll-left={edges?.left ? "" : undefined}
        data-scroll-right={(edges?.right ?? count > 1) ? "" : undefined}
        ref={ref}
        data-home-rail={restoreRailPosition ? group : undefined}
        onClick={restoreRailPosition ? (event) => {
          // Event titles and artwork can open Quick View instead of following the link.
          if (isHomeRailNavigation(event) && event.target instanceof Element) {
            saveHomeRailPosition(event.target);
          }
        } : undefined}
        onScroll={(event) => {
          const rail = event.currentTarget;
          if (userPanFrom.current !== null && Math.abs(userPanFrom.current - rail.scrollLeft) > 4) {
            userPanFrom.current = null;
            clearHomeRailPosition(group);
          }
          updateEdges(rail);
        }}
        onScrollEnd={(event) => {
          userPanFrom.current = null;
          settleClubRail(event.currentTarget);
        }}
        onTouchMove={(event) => beginUserPan(event.currentTarget)}
        onWheel={(event) => {
          if (event.deltaX !== 0 || (event.shiftKey && event.deltaY !== 0)) beginUserPan(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") beginUserPan(event.currentTarget);
        }}
        onTouchEnd={(event) => {
          if (title !== "Clubs" || event.touches.length > 0) return;
          const rail = event.currentTarget;
          const offset = rail.scrollLeft;
          // Some touch releases end between snaps without a scrollend event.
          requestAnimationFrame(() => {
            if (rail.scrollLeft === offset) settleClubRail(rail);
          });
        }}
      >
        {children}
      </div>
    </>
  );
}

type EventCardsProps = Pick<
  HomeDiscoveryViewProps,
  | "preferences"
  | "timeZone"
  | "hour12"
  | "onSelect"
  | "onSave"
  | "favoriteLineup"
> & {
  events: Available["events"];
  restoreRailPosition?: boolean;
  onFocus(item: Available["events"][number], index: number): void;
  onBlur: FocusEventHandler<HTMLDivElement>;
};
function EventCards({
  events,
  favoriteLineup,
  onFocus,
  onBlur,
  restoreRailPosition,
  ...props
}: EventCardsProps) {
  return (
    <CardRail title="Events" restoreRailPosition={restoreRailPosition}>
      {events.map((event, index) => (
        <div
          key={event.id}
          data-home-rail-item={event.id}
          onFocusCapture={() => onFocus(event, index)}
          onBlurCapture={onBlur}
        >
          <DiscoveryEventCard
            {...props}
            event={event}
            matchingPeople={
              favoriteLineup?.kind === "available"
                ? favoriteLineup.items.find((item) => item.eventId === event.id)
                    ?.performers
                : undefined
            }
          />
        </div>
      ))}
    </CardRail>
  );
}
function LiveEventCards(props: EventCardsProps) {
  const { snapshot, retry } = useFavoriteLineup({
    eventIds: props.events.map((event) => event.id),
    favoriteProfileIds: props.preferences.favoriteProfileIds,
  });
  return (
    <>
      <EventCards {...props} favoriteLineup={snapshot} />
      {snapshot.kind === "error" && (
        <button
          className={styles.lineup}
          type="button"
          onClick={retry}
          aria-label="Retry favorite lineup"
        >
          Retry
        </button>
      )}
    </>
  );
}
function AvailableDiscovery({
  snapshot,
  liveFavoriteLineup,
  onFocusedClubChange,
  onFocusedEventChange,
  ...props
}: HomeDiscoveryViewProps & { snapshot: Available }) {
  const [focused, setFocused] = useState<FocusedCard | null>(null);
  useEffect(
    () => () => {
      onFocusedClubChange?.(null);
      onFocusedEventChange?.(null);
    },
    [onFocusedClubChange, onFocusedEventChange],
  );
  const events = retainFocused(
    snapshot.events,
    focused?.kind === "event" ? focused : null,
    snapshot.eligibleEventIds,
  );
  const clubs = retainFocused(
    snapshot.clubs,
    focused?.kind === "club" ? focused : null,
    snapshot.eligibleClubIds,
  );
  const onBlur: FocusEventHandler<HTMLDivElement> = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setFocused(null);
      onFocusedEventChange?.(null);
      onFocusedClubChange?.(null);
    }
  };
  const noEvents =
    events.length === 0 &&
    snapshot.coverage.events.length > 0 &&
    snapshot.coverage.events.every((stream) => stream.complete);
  const noClubs =
    clubs.length === 0 &&
    snapshot.coverage.clubs.length > 0 &&
    snapshot.coverage.clubs.every((stream) => stream.complete);
  const emptyGroup =
    noEvents && clubs.length > 0
      ? "events"
      : noClubs && events.length > 0
        ? "clubs"
        : undefined;
  const Cards = liveFavoriteLineup ? LiveEventCards : EventCards;
  return (
    <div
      className={styles.groups}
      data-empty-group={emptyGroup}
      data-single-event-with-clubs={
        (events.length === 1 && clubs.length === 2 &&
          clubs.every((club) => club.profileType === "community")) || undefined
      }
    >
      <div role="group" aria-labelledby="discovery-events-heading">
        <Cards
          {...props}
          events={events}
          onFocus={(item, index) => {
            setFocused({ kind: "event", item, index });
            onFocusedEventChange?.(item.id);
            onFocusedClubChange?.(null);
          }}
          onBlur={onBlur}
        />
        {events.length === 0 &&
          (noEvents ? (
            <p className={styles.status}>No events</p>
          ) : (
            <Link className={styles.browse} href="/discovery">
              Browse <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ))}
      </div>
      <div role="group" aria-labelledby="discovery-clubs-heading">
        <CardRail title="Clubs" restoreRailPosition={props.restoreRailPosition}>
          {clubs.map((club, index) =>
            club.profileType === "community" ? (
              <div
                key={club.id}
                data-home-rail-item={club.id}
                onFocusCapture={() => {
                  setFocused({ kind: "club", item: club, index });
                  onFocusedEventChange?.(null);
                  onFocusedClubChange?.(club.id);
                }}
                onBlurCapture={onBlur}
              >
                <DiscoveryClubCard
                  club={club}
                  preferences={props.preferences}
                  onFavorite={props.onFavorite}
                />
              </div>
            ) : null,
          )}
        </CardRail>
        {clubs.length === 0 &&
          (noClubs ? (
            <p className={styles.status}>No clubs</p>
          ) : (
            <Link className={styles.browse} href="/discovery">
              Browse <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ))}
      </div>
    </div>
  );
}
function DiscoveryFrames() {
  return (
    <div className={styles.groups} aria-hidden="true">
      {(["Events", "Clubs"] as const).map((group, index) => (
        <div key={group}>
          <CardRail title={group} placeholder>
            {[0, 1].map((slot) => (
              <div
                key={slot}
                data-testid="discovery-placeholder"
                className={styles.card}
              >
                <div className={`${index === 0 ? styles.artwork : styles.clubArtwork} ${styles.skeleton}`} />
                <div
                  className={
                    index === 0 ? styles.eventMetadata : styles.clubMetadata
                  }
                >
                  <span className={styles.skeletonLine} />
                  <span className={styles.skeletonLine} />
                </div>
              </div>
            ))}
          </CardRail>
        </div>
      ))}
    </div>
  );
}

/** Static public view also used by Storybook, without storage or live queries. */
export function HomeDiscoveryView(props: HomeDiscoveryViewProps) {
  const { snapshot, sectionRef, retry } = props;
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (snapshot.kind !== "loading") return;
    const timer = setTimeout(() => setShowLoading(true), 150);
    return () => {
      clearTimeout(timer);
      setShowLoading(false);
    };
  }, [snapshot.kind]);
  return (
    <section
      ref={sectionRef}
      className={styles.discovery}
      aria-labelledby="discover-heading"
      aria-busy={snapshot.kind === "loading"}
    >
      <header className={styles.heading}>
        <h2 id="discover-heading" tabIndex={-1}>
          Discover
        </h2>
        {snapshot.kind === "loading" && showLoading && (
          <span className={styles.loading} role="status">
            <LoaderCircle size={16} aria-hidden="true" />
            Loading
          </span>
        )}
        {snapshot.kind === "error" && (
          <div className={styles.failure} role="status">
            Unavailable{" "}
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        )}
        {snapshot.kind === "available" &&
          snapshot.events.length > 1 &&
          snapshot.clubs.some((club) => club.profileType === "community") && (
            <a href="#discovery-clubs-heading" className={styles.clubsShortcut}>
              Clubs <ArrowDown size={14} aria-hidden="true" />
            </a>
          )}
        <Link href="/discovery" className={styles.browse}>
          Browse <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </header>
      {snapshot.kind === "available" ? (
        <AvailableDiscovery {...props} snapshot={snapshot} />
      ) : (
        <DiscoveryFrames />
      )}
    </section>
  );
}

export function HomeDiscovery() {
  const discovery = useHomeDiscovery();
  const browse = useHomeBrowse();
  const preference = useTimelinePreferences();
  return (
    <HomeDiscoveryView
      snapshot={browse.kind === "ready" ? discovery : { kind: "loading" }}
      sectionRef={discovery.sectionRef}
      retry={discovery.retry}
      liveFavoriteLineup
      restoreRailPosition
      onFocusedEventChange={discovery.setFocusedEvent}
      onFocusedClubChange={discovery.setFocusedClub}
      timeZone={browse.timeZone ?? "UTC"}
      hour12={browse.hour12 ?? false}
      preferences={preference.preferences}
      onSelect={browse.selectEvent}
      onSave={(reference) => {
        const action = togglePlanAction(preference.preferences.plan, reference);
        if (action) browse.onPreferenceAction(action);
      }}
      onFavorite={(profileId) =>
        browse.onPreferenceAction({
          type: preference.preferences.favoriteProfileIds.includes(profileId)
            ? "remove-favorite"
            : "add-favorite",
          profileId,
        })
      }
    />
  );
}
