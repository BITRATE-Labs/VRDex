import type { ReactNode } from "react";

import { SEARCH_VIEWS, type SearchViewKey } from "./search-view-state";
import { PageContainer, PageShell } from "@/components/ui/page-shell";

export function SearchViewShell({
  activeView,
  children,
  className,
  hasQuery = false,
  searchControl,
  searchNavigation,
}: {
  activeView: SearchViewKey;
  children: ReactNode;
  className?: string;
  hasQuery?: boolean;
  searchControl: ReactNode;
  searchNavigation?: ReactNode;
}) {
  const standardHeading = hasQuery ? "Search results" : "Search";

  return (
    <PageShell className={className}>
      <PageContainer className="gap-5" max={activeView === "standard" ? "3xl" : "7xl"}>
        <header className="grid gap-4 pt-2">
          <h1 className="text-3xl leading-none font-semibold tracking-[-0.045em] sm:text-5xl">
            {activeView === "standard" ? standardHeading : SEARCH_VIEWS.dj.label}
          </h1>
          {searchNavigation}
          {searchControl}
        </header>

        {children}
      </PageContainer>
    </PageShell>
  );
}
