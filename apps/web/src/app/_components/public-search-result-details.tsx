import { PublicProfileLinks } from "./public-profile-links";
import type { PublicSearchPerson } from "@/lib/public-search";
import { orderedPublicSearchGenres, publicSearchGenreLabel } from "@/lib/public-search-genres";

const disclosureClassName = "min-h-6 w-fit cursor-pointer rounded-control leading-6 font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

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
        <details className="min-w-0 open:basis-full">
          <summary aria-label={`${remainingGenres.length} more genres`} className={disclosureClassName}>
            +{remainingGenres.length}
          </summary>
          <p className="-ms-[3.25rem] mt-1 [overflow-wrap:anywhere] sm:ms-0">{remainingGenres.join(" · ")}</p>
        </details>
      ) : null}
      {person.outboundLinks.length > 0 ? (
        <details className="min-w-0 open:basis-full">
          <summary className={disclosureClassName}>Links</summary>
          <div className="-ms-[3.25rem] min-w-0 pt-2 sm:ms-0">
            <PublicProfileLinks links={person.outboundLinks} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
