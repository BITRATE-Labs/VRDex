"use client";

import { useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";

const historyKey = "vrdexSearchDisclosures";

function readOpenDisclosures(): string[] {
  const value: unknown = history.state?.[historyKey];
  return Array.isArray(value) ? value : [];
}

export function SearchResultsHistory({ children }: { children: ReactNode }) {
  const resultsRef = useRef<HTMLElement>(null);
  const searchParams = useSearchParams();
  const previousSearch = useRef<string | null>(null);

  useLayoutEffect(() => {
    const results = resultsRef.current;
    if (!results) return;
    const currentSearch = () => location.pathname + location.search;
    const mountedSearch = currentSearch();
    const disclosures = () => Array.from(results.querySelectorAll<HTMLDetailsElement>("details[data-search-disclosure]"));

    const restore = () => {
      if (currentSearch() !== mountedSearch) return;
      const open = new Set(readOpenDisclosures());
      for (const detail of disclosures()) {
        detail.open = open.has(detail.dataset.searchDisclosure!);
      }
    };

    const save = () => {
      if (currentSearch() !== mountedSearch) return;
      const previous = readOpenDisclosures();
      const open = disclosures()
        .filter(detail => detail.open)
        .map(detail => detail.dataset.searchDisclosure!);
      if (open.length === previous.length && open.every(key => previous.includes(key))) return;

      // Preserve Next's router state and any other UI state on this entry.
      const nextState = { ...history.state };
      if (open.length) nextState[historyKey] = open;
      else delete nextState[historyKey];
      try {
        history.replaceState(nextState, "");
      } catch {
        // Native disclosures and navigation still work if history storage is unavailable.
      }
    };

    const handleLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.origin !== location.origin || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      // A link can leave before a pending native toggle event is delivered.
      save();
    };

    // An exact re-search can refresh the results without adding a history entry.
    if (previousSearch.current === mountedSearch) save();
    else restore();
    previousSearch.current = mountedSearch;
    results.addEventListener("toggle", save, true);
    results.addEventListener("click", handleLink, true);
    window.addEventListener("popstate", restore);
    return () => {
      results.removeEventListener("toggle", save, true);
      results.removeEventListener("click", handleLink, true);
      window.removeEventListener("popstate", restore);
    };
  }, [children, searchParams]);

  return <section aria-describedby="search-results-query" aria-label="Search results" className="space-y-3 sm:space-y-5" ref={resultsRef}>{children}</section>;
}
