"use client";

import { useEffect, useRef } from "react";

type ReturnFocus = { link: HTMLAnchorElement; scrollY: number };
type FragmentEntry = { href: string; key?: string; returnFocus?: ReturnFocus };

function currentEntry(): FragmentEntry {
  const browser = window as Window & { navigation?: { currentEntry?: { key: string } | null } };
  return { href: location.href, key: browser.navigation?.currentEntry?.key };
}

function sameEntry(saved: FragmentEntry | undefined, current: FragmentEntry) {
  return saved?.href === current.href && saved.key === current.key;
}

export function useFragmentBackFocus<T extends HTMLElement>({ focusAfterNativeHash = false }: {
  focusAfterNativeHash?: boolean;
} = {}) {
  const scope = useRef<T>(null);

  useEffect(() => {
    const container = scope.current;
    if (!container) return;

    let entries = [currentEntry()];
    let index = 0;
    let historyLength = window.history.length;
    let pending: { href: string; managed: boolean; returnFocus?: ReturnFocus } | undefined;
    let frame = 0;
    let landingFrame = 0;

    const recordJump = (entry: FragmentEntry) => {
      entries = [...entries.slice(0, index + 1), { ...entry, returnFocus: pending?.returnFocus }];
      index += 1;
      pending = undefined;
    };

    const onClick = (event: MouseEvent, managed: boolean) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (Boolean(link?.hasAttribute("data-managed-fragment")) !== managed) return;
      if (pending?.managed && pending.href === location.href) recordJump(currentEntry());
      pending = undefined;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!link?.hash || link.hash === location.hash || link.origin !== location.origin
        || link.pathname !== location.pathname || link.search !== location.search
        || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;

      const entry = currentEntry();
      if (!sameEntry(entries[index], entry)) {
        entries = [entry];
        index = 0;
      }

      const jump = {
        href: link.href,
        managed,
        returnFocus: event.isTrusted && event.detail === 0 && container.contains(link)
          ? { link, scrollY: window.scrollY }
          : undefined,
      };
      pending = jump;

      if (focusAfterNativeHash && managed && event.isTrusted && location.hash
        && history.state === null && container.contains(link)) {
        // A native hash (such as Skip to content) doesn't update the router's canonical URL.
        // Returning to its last known hash can push the URL without scrolling or focusing.
        const deadline = performance.now() + 750;
        const land = () => {
          if (pending !== jump || !link.isConnected) return;
          if (location.href === jump.href) {
            const target = document.getElementById(link.hash.slice(1));
            target?.scrollIntoView();
            target?.focus({ preventScroll: true });
            if (pending === jump) {
              historyLength = window.history.length;
              recordJump(currentEntry());
            }
          } else if (sameEntry(entry, currentEntry()) && performance.now() < deadline) {
            landingFrame = requestAnimationFrame(land);
          }
        };
        cancelAnimationFrame(landingFrame);
        landingFrame = requestAnimationFrame(land);
      }
    };

    const onManagedClick = (event: MouseEvent) => onClick(event, true);
    const onNativeClick = (event: MouseEvent) => onClick(event, false);
    const onFocusIn = (event: FocusEvent) => {
      // Next's hash-only Link pushes state and focuses the heading without popstate.
      if (!pending?.managed || pending.href !== location.href || !(event.target instanceof Element)
        || event.target.id !== location.hash.slice(1)) return;
      historyLength = window.history.length;
      recordJump(currentEntry());
    };

    function onPopState() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(landingFrame);
      const entry = currentEntry();
      const newEntry = window.history.length > historyLength;
      historyLength = window.history.length;

      if (pending?.href === entry.href) {
        recordJump(entry);
        return;
      }
      pending = undefined;

      const back = sameEntry(entries[index - 1], entry);
      const forward = sameEntry(entries[index + 1], entry);
      // Without browser entry keys, an identical URL on either side is ambiguous.
      if (newEntry || back === forward) {
        entries = [entry];
        index = 0;
        return;
      }

      const opener = back ? entries[index]?.returnFocus : undefined;
      index += back ? -1 : 1;
      if (!opener) return;

      frame = requestAnimationFrame(() => {
        if (!sameEntry(entry, currentEntry()) || !opener.link.getClientRects().length) return;
        const bounds = opener.link.getBoundingClientRect();
        const header = document.querySelector('[aria-label="Primary navigation"]')?.closest("header");
        const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
        // Some native fragment returns leave the restored control behind the header or out of view.
        if (bounds.top < Math.max(0, headerBottom) || bounds.bottom > innerHeight) {
          window.scrollTo({ top: opener.scrollY, behavior: "instant" });
        }
        opener.link.focus({ preventScroll: true });
      });
    }

    document.addEventListener("click", onManagedClick, true);
    document.addEventListener("click", onNativeClick);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("popstate", onPopState);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(landingFrame);
      document.removeEventListener("click", onManagedClick, true);
      document.removeEventListener("click", onNativeClick);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("popstate", onPopState);
    };
  }, [focusAfterNativeHash]);

  return scope;
}
