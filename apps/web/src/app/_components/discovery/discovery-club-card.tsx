"use client";

import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";

import { FavoriteButton } from "@/components/ui/favorite-button";
import { publicSearchGenreLabel } from "@/lib/public-search-genres";
import { EntityImage } from "@/components/ui/entity-image";
import type { DiscoverySnapshot } from "@/lib/discovery/controller";
import type { TimelinePreferences } from "@/lib/timeline/preferences";
import type { TimelineActions } from "../timeline/timeline-event-bar";
import styles from "./discovery.module.css";

const clubImageSizes =
  "(max-width: 420px) 100vw, (max-width: 760px) 78vw, (max-width: 880px) 256px, 23vw";

type Available = Extract<DiscoverySnapshot, { kind: "available" }>;
export type DiscoveryClubCardProps = {
  club: Extract<Available["clubs"][number], { profileType: "community" }>;
  preferences: TimelinePreferences;
  onFavorite: TimelineActions["onFavorite"];
};

export function DiscoveryClubCard({
  club,
  preferences,
  onFavorite,
}: DiscoveryClubCardProps) {
  const favorite = preferences.favoriteProfileIds.includes(club.id);
  return (
    <article className={`${styles.card} ${styles.clubCard}`} data-testid="discovery-club-card">
      <span className={styles.clubArtwork}>
        {club.bannerImageUrl && (
          <EntityImage
            label={club.displayName}
            alt=""
            src={club.bannerImageUrl}
            className={styles.clubBackdrop}
            fallback={<></>}
            sizes={clubImageSizes}
          />
        )}
        <EntityImage
          label={club.displayName}
          alt=""
          src={club.logoImageUrl ?? club.imageUrl}
          className={styles.clubLogo}
          fallback={<span className={styles.clubArtworkFallback} />}
          imageClassName={styles.contained}
          sizes={clubImageSizes}
        />
      </span>
      <div className={styles.clubMetadata}>
        <div className={styles.clubName}>
          <h4
            className={styles.name}
            style={{
              "--club-artwork-name-size": `clamp(1rem, ${Math.min(12, 64 / Math.sqrt(club.displayName.length))}cqi, 2.7rem)`,
            } as CSSProperties}
          >
            <a href={`/${club.slug}`} className={styles.clubLink}>
              <span>{club.displayName}</span>
              <ArrowRight className={styles.clubProfileCue} size={18} aria-hidden="true" />
            </a>
          </h4>
          <FavoriteButton
            label={club.displayName}
            pressed={favorite}
            onToggle={() => onFavorite(club.id)}
            className={styles.favorite}
            visibleLabelClassName={styles.preferenceLabel}
          />
        </div>
        <div className={styles.clubFooter}>
          {club.genres.length > 0 && (
            <ul
              className={styles.genres}
              aria-label={`${club.displayName} genres`}
            >
              {club.genres.slice(0, 3).map((genre) => (
                <li key={genre.slug}>{publicSearchGenreLabel(genre)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
