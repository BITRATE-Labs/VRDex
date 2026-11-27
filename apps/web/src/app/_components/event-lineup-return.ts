"use client";

import { useEffect, useRef } from "react";

const historyKey = "vrdexEventLineupReturn";
const inputEvents = ["keydown", "wheel", "pointerdown", "touchstart"] as const;

type LineupReturn = {
  href: string;
  rowKey: string;
  top: number;
  posterHeight: number;
  posterUrl: string;
  viewportWidth: number;
  timeOrigin: number;
};

function lineupRow(list: HTMLOListElement | null, key: string) {
  return list?.querySelector<HTMLLIElement>(`li[data-lineup-row="${CSS.escape(key)}"]`);
}

function updateLineupReturn(entry?: LineupReturn) {
  const nextState = { ...history.state };
  if (entry) nextState[historyKey] = entry;
  else delete nextState[historyKey];
  try {
    history.replaceState(nextState, "");
  } catch {
    // Navigation still works if the browser declines a history-state write.
  }
}

export function useEventLineupReturn(eventSlug: string, posterUrl: string | undefined) {
  const listRef = useRef<HTMLOListElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const poster = posterRef.current;
    if (!poster || !posterUrl) return;
    let stopListening: (() => void) | undefined;

    const restoreAfterPoster = () => {
      stopListening?.();
      const entry = history.state?.[historyKey] as LineupReturn | undefined;
      if (!entry || entry.href !== location.href || entry.posterUrl !== posterUrl) return;

      // A full reload should not reuse an old click, but a subsequent client Back
      // in that same document still uses the new click's history entry.
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (navigation?.type === "reload" && entry.timeOrigin !== performance.timeOrigin) {
        updateLineupReturn();
        return;
      }

      const row = lineupRow(listRef.current, entry.rowKey);
      if (!row) return;

      const removeListeners = new AbortController();
      const { signal } = removeListeners;
      let frame = 0;
      const stop = () => {
        cancelAnimationFrame(frame);
        removeListeners.abort();
      };
      stopListening = stop;

      const finish = () => {
        stop();
        if (location.href !== entry.href) return;
        updateLineupReturn();
      };
      // A new visit or gesture should use the browser's normal scroll position.
      for (const type of inputEvents) window.addEventListener(type, finish, { signal, passive: true });

      const initialHeight = poster.getBoundingClientRect().height;
      const settle = () => {
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            finish();
            if (!row.isConnected || !poster.isConnected || location.href !== entry.href
              || innerWidth !== entry.viewportWidth || poster.naturalWidth === 0) return;

            const height = poster.getBoundingClientRect().height;
            const bounds = row.getBoundingClientRect();
            const viewportHeight = window.visualViewport?.height ?? innerHeight;
            if ((Math.abs(height - entry.posterHeight) < 2 && Math.abs(height - initialHeight) < 2)
              || entry.top >= viewportHeight || entry.top + bounds.height <= 0 || bounds.height > viewportHeight) return;

            // Chromium can already keep the row in place. Only correct a visible jump.
            const shift = bounds.top - entry.top;
            if (Math.abs(shift) >= 2) window.scrollBy({ top: shift, behavior: "instant" });
          });
        });
      };
      if (poster.complete) settle();
      else {
        poster.addEventListener("load", settle, { once: true, signal });
        poster.addEventListener("error", finish, { once: true, signal });
      }
    };

    restoreAfterPoster();
    // A browser BFCache return does not remount this React component.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restoreAfterPoster();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stopListening?.();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [eventSlug, posterUrl]);

  function rememberLineupRow(rowKey: string) {
    const row = lineupRow(listRef.current, rowKey);
    const poster = posterRef.current;
    if (!row || !poster || !posterUrl) return;
    const entry: LineupReturn = {
      href: location.href,
      rowKey,
      top: row.getBoundingClientRect().top,
      posterHeight: poster.getBoundingClientRect().height,
      posterUrl,
      viewportWidth: innerWidth,
      timeOrigin: performance.timeOrigin,
    };
    updateLineupReturn(entry);
  }

  return { listRef, posterRef, rememberLineupRow };
}
