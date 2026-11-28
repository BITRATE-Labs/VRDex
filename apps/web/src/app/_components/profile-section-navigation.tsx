"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ReturnFocus = { link: HTMLAnchorElement; scrollY: number };
type FragmentEntry = { href: string; key?: string; returnFocus?: ReturnFocus };

function currentEntry(): FragmentEntry {
  const browser = window as Window & { navigation?: { currentEntry?: { key: string } | null } };
  return { href: location.href, key: browser.navigation?.currentEntry?.key };
}

function sameEntry(saved: FragmentEntry | undefined, current: FragmentEntry) {
  return saved?.href === current.href && saved.key === current.key;
}

export function ProfileSectionNavigation({ className, children }: { className: string; children: ReactNode }) {
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = nav.current;
    if (!container) return;

    let entries = [currentEntry()];
    let index = 0;
    let historyLength = window.history.length;
    let pending: { href: string; returnFocus?: ReturnFocus } | undefined;
    let frame = 0;

    const onClick = (event: MouseEvent) => {
      pending = undefined;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link?.hash || link.hash === location.hash || link.origin !== location.origin
        || link.pathname !== location.pathname || link.search !== location.search
        || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;

      const entry = currentEntry();
      if (!sameEntry(entries[index], entry)) {
        entries = [entry];
        index = 0;
      }

      pending = {
        href: link.href,
        returnFocus: event.isTrusted && event.detail === 0 && container.contains(link)
          ? { link, scrollY: window.scrollY }
          : undefined,
      };
    };

    function onPopState() {
      cancelAnimationFrame(frame);
      const entry = currentEntry();
      const jump = pending;
      pending = undefined;

      const newEntry = window.history.length > historyLength;
      historyLength = window.history.length;

      if (jump?.href === entry.href) {
        entries = [...entries.slice(0, index + 1), { ...entry, returnFocus: jump.returnFocus }];
        index += 1;
        return;
      }

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
        if (!sameEntry(entry, currentEntry()) || !opener.link.isConnected) return;
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

    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return <nav aria-label="Profile sections" className={className} ref={nav}>{children}</nav>;
}
