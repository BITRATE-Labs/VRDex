import { ChevronDown } from "lucide-react";

import { PublicProfileLinks } from "./public-profile-links";
import styles from "./public-search-result-details.module.css";
import { cn } from "@/lib/cn";
import type { PublicSearchPerson } from "@/lib/public-search";
import { orderedPublicSearchGenres, publicSearchGenreLabel } from "@/lib/public-search-genres";

const summaryClassName = "min-h-6 min-w-6 w-fit cursor-pointer list-none rounded-control leading-6 font-medium text-accent-strong underline decoration-accent/55 underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [&::-webkit-details-marker]:hidden";
const disclosureClassName = cn("min-w-0 open:basis-full", styles.disclosure);
const detailPanelClassName = "order-last min-w-0 flex-[1_0_100%] -ms-[3.25rem] border-s border-border py-1 ps-2 sm:ms-0";

export function PublicSearchResultDetails({ person }: { person: PublicSearchPerson }) {
  const genres = orderedPublicSearchGenres(person.genres);
  const visibleGenres = genres.slice(0, 3).map(publicSearchGenreLabel);
  const remainingGenres = genres.slice(3).map(publicSearchGenreLabel);

  if (genres.length === 0 && person.outboundLinks.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 ps-16 pe-3 pb-2.5 text-xs leading-5 text-muted sm:ps-[5.25rem] sm:pe-4 sm:pb-3 sm:text-sm">
      {visibleGenres.length > 0 ? (
        <span className="min-w-0 [overflow-wrap:anywhere]">{visibleGenres.join(" · ")}</span>
      ) : null}
      {remainingGenres.length > 0 ? (
        <details className={disclosureClassName}>
          <summary aria-label={`${remainingGenres.length} more genres`} className={cn(summaryClassName, "text-center")}>
            +{remainingGenres.length}
          </summary>
          <p className={cn(detailPanelClassName, "[overflow-wrap:anywhere]")}>{remainingGenres.join(" · ")}</p>
        </details>
      ) : null}
      {person.outboundLinks.length > 0 ? (
        <details className={cn(disclosureClassName, "group/links")}>
          <summary className={cn(summaryClassName, "flex items-center gap-1")}>
            <ChevronDown aria-hidden="true" className="size-3 shrink-0 group-open/links:rotate-180" />
            Links
          </summary>
          <div className={detailPanelClassName}>
            <PublicProfileLinks links={person.outboundLinks} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
