import { ChevronDown } from "lucide-react";

import { PublicProfileLinks } from "./public-profile-links";
import styles from "./public-search-result-details.module.css";
import { cn } from "@/lib/cn";
import type { PublicSearchPerson } from "@/lib/public-search";
import { orderedPublicSearchGenres, publicSearchGenreLabel } from "@/lib/public-search-genres";

const summaryClassName = "inline-flex min-h-11 min-w-11 w-fit cursor-pointer list-none items-center justify-center gap-1 rounded-control leading-6 font-medium text-accent-strong underline decoration-accent/55 underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring max-sm:border max-sm:border-border max-sm:px-2.5 max-sm:no-underline max-sm:hover:bg-surface-strong sm:min-h-6 sm:min-w-6 [&::-webkit-details-marker]:hidden";
const disclosureClassName = cn("min-w-0 open:basis-full", styles.disclosure);
const detailPanelClassName = "order-last min-w-0 flex-[1_0_100%]";

export function PublicSearchResultDetails({ person, slug }: { person: PublicSearchPerson; slug: string }) {
  const genres = orderedPublicSearchGenres(person.genres);
  const visibleGenres = genres.slice(0, 3).map(publicSearchGenreLabel);
  const remainingGenres = genres.slice(3).map(publicSearchGenreLabel);
  const remainingGenreCount = remainingGenres.length;
  const genreNoun = remainingGenreCount === 1 ? "genre" : "genres";

  if (genres.length === 0 && person.outboundLinks.length === 0) return null;

  return (
    <div className={cn(styles.resultDetails, "flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:items-baseline sm:gap-y-1 ps-16 pe-3 pb-2.5 text-xs leading-5 text-muted sm:ps-[5.25rem] sm:pe-4 sm:pb-3 sm:text-sm")}>
      {visibleGenres.length > 0 ? (
        <span className="min-w-0 [overflow-wrap:anywhere] max-sm:basis-full">{visibleGenres.join(" · ")}</span>
      ) : null}
      {remainingGenreCount > 0 ? (
        <details className={cn(disclosureClassName, "group/genres")} data-search-disclosure={`${slug}:genres`}>
          <summary aria-label={`${remainingGenreCount} more ${genreNoun}`} className={summaryClassName}>
            <span>+{remainingGenreCount} {genreNoun}</span>
            <ChevronDown aria-hidden="true" className="size-3 shrink-0 group-open/genres:rotate-180" />
          </summary>
          <p className={cn(detailPanelClassName, "[overflow-wrap:anywhere] sm:border-s sm:border-border sm:py-1 sm:ps-2")}>{remainingGenres.join(" · ")}</p>
        </details>
      ) : null}
      {person.outboundLinks.length > 0 ? (
        <details className={cn(disclosureClassName, "group/links")} data-search-disclosure={`${slug}:links`}>
          <summary className={summaryClassName}>
            <ChevronDown aria-hidden="true" className="size-3 shrink-0 group-open/links:rotate-180 sm:order-last" />
            Links
          </summary>
          <div className={cn(detailPanelClassName, "-ms-[3.25rem] border-s border-border py-1 ps-2 sm:ms-0", styles.linksPanel)}>
            <PublicProfileLinks links={person.outboundLinks} showDestinationLabels />
          </div>
        </details>
      ) : null}
    </div>
  );
}
