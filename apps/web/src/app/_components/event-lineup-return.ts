"use client";

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { eventEditorHistoryPosition } from "@/lib/event-editor-history";

const historyKey = "vrdexEventLineupReturn";
const inputEvents = ["keydown", "wheel", "pointerdown", "touchstart"] as const;
const scrollKeys = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);

type LineupReturn = {
  href: string;
  rowKey: string;
  top: number;
  posterHeight: number;
  posterUrl?: string;
  keyboard: boolean;
  viewportWidth: number;
  timeOrigin: number;
};

type PerformerVisit = {
  position: number;
  destination: string;
  entry: LineupReturn;
};

const performerVisits = new Map<number, PerformerVisit>();
let awaitingReturn: PerformerVisit | undefined;
let pendingReturn: { visit: PerformerVisit; input: AbortController } | undefined;
let restoreMountedLineup: (() => void) | undefined;

function capturePerformerReturn(event: PopStateEvent) {
  pendingReturn?.input.abort();
  pendingReturn = undefined;
  const previousVisit = awaitingReturn;
  awaitingReturn = undefined;
  const position = eventEditorHistoryPosition(event.state);
  if (position === undefined) return;

  // Forward to the exact performer makes a subsequent Back a return to its lineup row.
  const forwardVisit = performerVisits.get(position - 1);
  if (forwardVisit?.destination === location.href) awaitingReturn = forwardVisit;

  if (!previousVisit || performerVisits.get(position) !== previousVisit || previousVisit.entry.href !== location.href) return;
  const input = new AbortController();
  const cancelOnInput = (interaction: Event) => {
    if (!interaction.isTrusted) return;
    performerVisits.delete(position);
    input.abort();
  };
  for (const type of inputEvents) {
    window.addEventListener(type, cancelOnInput, { capture: true, passive: true, signal: input.signal });
  }
  pendingReturn = { visit: previousVisit, input };
  // A cached route can mount before its later popstate listeners run.
  restoreMountedLineup?.();
}

function isPlainClick(event: MouseEvent | ReactMouseEvent<HTMLAnchorElement>) {
  return event.isTrusted && !event.defaultPrevented && event.button === 0
    && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

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
    let stopListening: (() => void) | undefined;

    const restoreAfterPoster = (fromCache = false) => {
      stopListening?.();
      const fromLineup = location.hash === "#event-lineup";
      const captured = pendingReturn?.visit.entry.href === location.href
        && pendingReturn.visit.position === eventEditorHistoryPosition(history.state) ? pendingReturn : undefined;
      const entry = captured?.visit.entry ?? history.state?.[historyKey] as LineupReturn | undefined;
      if (!entry || entry.href !== location.href || entry.posterUrl !== posterUrl
        || (fromLineup && !captured && !fromCache)) return;

      // A full reload should not reuse an old click, but a subsequent client Back
      // in that same document still uses the new click's history entry.
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (navigation?.type === "reload" && entry.timeOrigin !== performance.timeOrigin) {
        updateLineupReturn();
        return;
      }

      const row = lineupRow(listRef.current, entry.rowKey);
      if (!row || (!poster && !fromLineup)) return;

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
        if (captured && pendingReturn === captured) {
          pendingReturn = undefined;
          captured.input.abort();
        }
        if (location.href === entry.href) updateLineupReturn();
      };
      const cancelOnInput = (interaction: Event) => {
        if (!interaction.isTrusted) return;
        if (captured) performerVisits.delete(captured.visit.position);
        finish();
      };
      // A new visit or gesture should use the browser's normal scroll position.
      for (const type of inputEvents) window.addEventListener(type, cancelOnInput, { signal, passive: true });
      if (captured?.input.signal.aborted) {
        finish();
        return;
      }

      const initialHeight = poster?.getBoundingClientRect().height ?? 0;
      const settle = () => {
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            const canRestore = !captured || (pendingReturn === captured && !captured.input.signal.aborted
              && captured.visit.position === eventEditorHistoryPosition(history.state));
            finish();
            if (!canRestore || !row.isConnected || (poster && !poster.isConnected) || location.href !== entry.href
              || innerWidth !== entry.viewportWidth || (!fromLineup && poster?.naturalWidth === 0)) return;

            const height = poster?.getBoundingClientRect().height ?? 0;
            const bounds = row.getBoundingClientRect();
            const viewportHeight = window.visualViewport?.height ?? innerHeight;
            if (entry.top >= viewportHeight || entry.top + bounds.height <= 0 || bounds.height > viewportHeight) return;
            const posterChanged = Math.abs(height - entry.posterHeight) >= 2 || Math.abs(height - initialHeight) >= 2;
            // The browser can clamp the scroll against the shorter profile or land on the heading.
            const shift = bounds.top - entry.top;
            if ((fromLineup || posterChanged) && Math.abs(shift) >= 2) {
              window.scrollBy({ top: shift, behavior: "instant" });
            }
            const focused = document.activeElement;
            if (fromLineup && entry.keyboard) {
              if (captured) captured.visit.entry = { ...entry, keyboard: false };
              if (focused === document.body || focused?.id === "event-lineup" || focused?.id === "main-content") {
                row.querySelector("a")?.focus({ preventScroll: true });
              }
            }
          });
        });
      };
      if (!poster || poster.complete) settle();
      else {
        poster.addEventListener("load", settle, { once: true, signal });
        poster.addEventListener("error", fromLineup ? settle : finish, { once: true, signal });
      }
    };

    const restore = () => restoreAfterPoster();
    restoreMountedLineup = restore;
    restore();
    const forgetReplacedEntry = (event: MouseEvent) => {
      if (!isPlainClick(event) || location.hash === "#event-lineup" || !(event.target instanceof Element)) return;
      const shortcut = event.target.closest('a[data-managed-fragment][href="#event-lineup"]');
      if (!shortcut || shortcut.closest("main") !== listRef.current?.closest("main")) return;
      const position = eventEditorHistoryPosition(history.state);
      if (position !== undefined) performerVisits.delete(position + 1);
    };
    const forgetAfterScroll = (event: Event) => {
      if (!event.isTrusted || (event instanceof KeyboardEvent && !scrollKeys.has(event.key))) return;
      const position = eventEditorHistoryPosition(history.state);
      if (position !== undefined && performerVisits.get(position)?.entry.href === location.href) {
        performerVisits.delete(position);
      }
    };
    // A browser BFCache return does not remount this React component.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restoreAfterPoster(true);
    };
    document.addEventListener("click", forgetReplacedEntry, true);
    window.addEventListener("pageshow", onPageShow);
    for (const type of ["wheel", "touchmove", "keydown"]) {
      window.addEventListener(type, forgetAfterScroll, { passive: true });
    }
    return () => {
      if (restoreMountedLineup === restore) restoreMountedLineup = undefined;
      stopListening?.();
      document.removeEventListener("click", forgetReplacedEntry, true);
      window.removeEventListener("pageshow", onPageShow);
      for (const type of ["wheel", "touchmove", "keydown"]) window.removeEventListener(type, forgetAfterScroll);
    };
  }, [eventSlug, posterUrl]);

  function rememberLineupRow(rowKey: string, event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!isPlainClick(event)) return;
    const row = lineupRow(listRef.current, rowKey);
    const poster = posterRef.current;
    if (!row || (!poster && location.hash !== "#event-lineup")) return;
    const entry: LineupReturn = {
      href: location.href,
      rowKey,
      top: row.getBoundingClientRect().top,
      posterHeight: poster?.getBoundingClientRect().height ?? 0,
      posterUrl,
      keyboard: event.detail === 0,
      viewportWidth: innerWidth,
      timeOrigin: performance.timeOrigin,
    };
    updateLineupReturn(entry);
    const position = eventEditorHistoryPosition(history.state);
    if (location.hash === "#event-lineup" && position !== undefined) {
      const visit = { position, destination: event.currentTarget.href, entry };
      performerVisits.set(position, visit);
      awaitingReturn = visit;
      window.addEventListener("popstate", capturePerformerReturn, true);
    }
  }

  return { listRef, posterRef, rememberLineupRow };
}
