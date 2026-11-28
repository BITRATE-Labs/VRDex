"use client";

import { useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";

const disclosureKey = "vrdexSearchDisclosures";
const focusKey = "vrdexSearchResultFocus";
const resultSelector = "a[data-search-result]";

function updateHistoryEntry(state: Record<string, unknown>) {
  try {
    history.replaceState(state, "");
  } catch {
    // Native disclosures and navigation still work if history storage is unavailable.
  }
}

function readOpenDisclosures(): string[] {
  const value: unknown = history.state?.[disclosureKey];
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

      const href: unknown = history.state?.[focusKey];
      if (typeof href !== "string") return;
      const state = { ...history.state };
      delete state[focusKey];
      updateHistoryEntry(state);

      if (document.activeElement !== document.body) return;
      const link = Array.from(results.querySelectorAll<HTMLAnchorElement>(resultSelector))
        .find(candidate => candidate.href === href);
      link?.focus({ preventScroll: true });
    };

    const save = (href?: string | null) => {
      if (currentSearch() !== mountedSearch) return;
      const previous = readOpenDisclosures();
      const open = disclosures()
        .filter(detail => detail.open)
        .map(detail => detail.dataset.searchDisclosure!);
      const changesFocus = href !== undefined && (href ?? undefined) !== history.state?.[focusKey];
      if (!changesFocus && open.length === previous.length && open.every(key => previous.includes(key))) return;

      // Preserve Next's router state and any other UI state on this entry.
      const nextState = { ...history.state };
      if (open.length) nextState[disclosureKey] = open;
      else delete nextState[disclosureKey];
      if (href === null) delete nextState[focusKey];
      else if (href !== undefined) nextState[focusKey] = href;
      updateHistoryEntry(nextState);
    };

    const saveDisclosures = () => save();
    const handleLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.origin !== location.origin || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      // A link can leave before a pending native toggle event is delivered.
      const keyboardResult = event.isTrusted && event.detail === 0 && link.matches(resultSelector);
      save(keyboardResult ? link.href : null);
    };

    const restoreCachedPage = (event: PageTransitionEvent) => {
      if (event.persisted) restore();
    };

    // An exact re-search can refresh the results without adding a history entry.
    if (previousSearch.current === mountedSearch) save();
    else restore();
    previousSearch.current = mountedSearch;
    results.addEventListener("toggle", saveDisclosures, true);
    results.addEventListener("click", handleLink, true);
    window.addEventListener("popstate", restore);
    window.addEventListener("pageshow", restoreCachedPage);
    return () => {
      results.removeEventListener("toggle", saveDisclosures, true);
      results.removeEventListener("click", handleLink, true);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("pageshow", restoreCachedPage);
    };
  }, [children, searchParams]);

  return <section aria-describedby="search-results-query" aria-label="Search results" className="space-y-3 sm:space-y-5" ref={resultsRef}>{children}</section>;
}
