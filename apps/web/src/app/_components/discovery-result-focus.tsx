"use client";

import { useLayoutEffect } from "react";

const historyKey = "vrdexDiscoveryResultFocus";
const resultSelector = "a[data-discovery-result]";

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
      if (!event.isTrusted || event.detail !== 0 || event.button !== 0 || event.defaultPrevented
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(resultSelector) : null;
      if (!link || !container.contains(link) || link.origin !== location.origin
        || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;

      // Preserve Next's state on the Discovery entry that the link leaves.
      updateHistoryEntry({ ...history.state, [historyKey]: link.dataset.discoveryResult });
    };

    const restore = () => {
      const key: unknown = history.state?.[historyKey];
      if (typeof key !== "string") return;
      const state = { ...history.state };
      delete state[historyKey];
      updateHistoryEntry(state);

      if (document.activeElement !== document.body) return;
      const link = Array.from(container.querySelectorAll<HTMLAnchorElement>(resultSelector))
        .find((candidate) => candidate.dataset.discoveryResult === key);
      link?.focus({ preventScroll: true });
    };

    restore();
    container.addEventListener("click", save, true);
    window.addEventListener("pageshow", restore);
    return () => {
      container.removeEventListener("click", save, true);
      window.removeEventListener("pageshow", restore);
    };
  }, []);

  return null;
}
