"use client";

import { useLayoutEffect } from "react";
import { eventEditorHistoryPosition } from "@/lib/event-editor-history";

const historyKey = "vrdexDiscoveryResultFocus";
const scrollKey = "vrdexDiscoveryResultScroll";
const resultSelector = "a[data-discovery-result]";
const categorySelector = "a[data-discovery-category]";
const categoryPositions = new Map<number, { href: string; scroll: number }>();

type CategoryReturn = {
  href: string;
  position: number;
  scroll: number;
  result: unknown;
  input: AbortController;
};

let pendingCategoryReturn: CategoryReturn | undefined;
let restoreMountedCategory: (() => void) | undefined;

function captureCategoryReturn(event: PopStateEvent) {
  pendingCategoryReturn?.input.abort();
  pendingCategoryReturn = undefined;
  const position = eventEditorHistoryPosition(event.state);
  if (position === undefined) return;
  const saved = categoryPositions.get(position);
  const href = location.href;
  const scroll: unknown = event.state?.[scrollKey] ?? (saved?.href === href ? saved.scroll : undefined);
  if (typeof scroll !== "number") return;

  const input = new AbortController();
  const cancelOnInput = (interaction: Event) => {
    if (interaction.isTrusted) input.abort();
  };
  for (const type of ["pointerdown", "wheel", "keydown"]) {
    window.addEventListener(type, cancelOnInput, { capture: true, passive: true, signal: input.signal });
  }
  pendingCategoryReturn = { href, position, scroll, result: event.state?.[historyKey], input };
  // A cached return can mount Discovery before this listener receives popstate.
  restoreMountedCategory?.();
}

function updateHistoryEntry(state: Record<string, unknown>) {
  try {
    history.replaceState(state, "");
  } catch {
    // Focus restoration is optional if the browser rejects the history update.
  }
}

export function DiscoveryResultFocus() {
  useLayoutEffect(() => {
    const container = document.querySelector<HTMLElement>("[data-discovery-results]");
    if (!container) return;

    const save = (event: MouseEvent) => {
      if (!event.isTrusted || event.button !== 0 || event.defaultPrevented
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>(`${resultSelector}, ${categorySelector}`)
        : null;
      if (!link || !container.contains(link) || link.origin !== location.origin
        || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;

      const position = eventEditorHistoryPosition(history.state);
      if (link.matches(categorySelector)) {
        // A new fragment push may reuse the next history position after Back.
        if (link.hash !== location.hash) categoryPositions.delete((position ?? 0) + 1);
        return;
      }

      const keyboard = event.detail === 0;
      const heading = document.getElementById(location.hash.slice(1));
      const fromCategory = heading?.matches("h2") && container.contains(heading);
      if (!keyboard && !fromCategory) return;

      // Keep the category position on this entry so repeat Back/Forward visits can restore it.
      const state = { ...history.state };
      if (keyboard) state[historyKey] = link.dataset.discoveryResult;
      else delete state[historyKey];
      if (fromCategory) {
        const scroll = window.scrollY;
        state[scrollKey] = scroll;
        // A router refresh can replace custom state even after Discovery has remounted.
        if (position !== undefined) categoryPositions.set(position, { href: location.href, scroll });
        window.addEventListener("popstate", captureCategoryReturn, true);
      }
      updateHistoryEntry(state);
    };

    let scrollFrame = 0;
    const restore = () => {
      const state = { ...history.state };
      const captured = pendingCategoryReturn?.href === location.href
        && pendingCategoryReturn.position === eventEditorHistoryPosition(state) ? pendingCategoryReturn : undefined;
      const scroll: unknown = captured?.scroll ?? state[scrollKey];
      const key: unknown = captured?.result ?? state[historyKey];
      const recoverScroll = typeof scroll === "number" && scroll !== state[scrollKey];
      if (recoverScroll) state[scrollKey] = scroll;
      if (typeof key === "string") delete state[historyKey];
      if (recoverScroll || typeof key === "string") updateHistoryEntry(state);
      if (captured) {
        cancelAnimationFrame(scrollFrame);
        // The browser can snap back to the fragment just after this route mounts.
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = requestAnimationFrame(() => {
            if (pendingCategoryReturn !== captured) return;
            pendingCategoryReturn = undefined;
            if (!captured.input.signal.aborted && captured.href === location.href
              && captured.position === eventEditorHistoryPosition(history.state)) {
              window.scrollTo({ top: captured.scroll, behavior: "instant" });
            }
            captured.input.abort();
          });
        });
      } else if (typeof scroll === "number") window.scrollTo({ top: scroll, behavior: "instant" });

      if (typeof key !== "string" || captured?.input.signal.aborted) return;

      if (document.activeElement !== document.body) return;
      const link = Array.from(container.querySelectorAll<HTMLAnchorElement>(resultSelector))
        .find((candidate) => candidate.dataset.discoveryResult === key);
      link?.focus({ preventScroll: true });
    };

    restoreMountedCategory = restore;
    restore();
    container.addEventListener("click", save, true);
    window.addEventListener("pageshow", restore);
    return () => {
      if (restoreMountedCategory === restore) restoreMountedCategory = undefined;
      cancelAnimationFrame(scrollFrame);
      container.removeEventListener("click", save, true);
      window.removeEventListener("pageshow", restore);
    };
  }, []);

  return null;
}
