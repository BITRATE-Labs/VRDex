"use client";

import { useEffect, type RefObject } from "react";
import { eventEditorHistoryPosition } from "@/lib/event-editor-history";

const worldsHash = "#profile-worlds";
const worldSelector = "a[data-profile-world]";
const cancelEvents = ["pointerdown", "touchstart", "keydown", "wheel"] as const;
const scrollEvents = ["wheel", "touchmove", "keydown"] as const;
const scrollKeys = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);

type WorldVisit = {
  profile: string;
  world: string;
  top: number;
  width: number;
  keyboard: boolean;
};

const visits = new Map<number, WorldVisit>();
let leavingForWorld: WorldVisit | undefined;
let pending: { visit: WorldVisit; position: number; input: AbortController } | undefined;
let applyOnProfile: (() => void) | undefined;

function onTraversal(event: PopStateEvent) {
  pending?.input.abort();
  pending = undefined;
  const departed = leavingForWorld;
  leavingForWorld = undefined;
  const position = eventEditorHistoryPosition(event.state);
  if (position === undefined) return;

  // An actual Forward to the World can be followed by another Back to the same card.
  const forward = visits.get(position - 1);
  if (forward?.world === location.href) leavingForWorld = forward;
  if (!departed || visits.get(position) !== departed || departed.profile !== location.href) return;

  const input = new AbortController();
  const cancel = (interaction: Event) => {
    if (!interaction.isTrusted) return;
    visits.delete(position);
    input.abort();
  };
  for (const type of cancelEvents) {
    window.addEventListener(type, cancel, { capture: true, passive: true, signal: input.signal });
  }
  pending = { visit: departed, position, input };
  // On a cached return the profile can commit before this popstate listener runs.
  applyOnProfile?.();
}

export function useProfileWorldReturn(nav: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const main = nav.current?.closest("main");
    if (!main) return;
    let frame = 0;

    const remember = (event: MouseEvent) => {
      if (!event.isTrusted || event.defaultPrevented || event.button !== 0
        || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || !main.contains(link) || link.origin !== location.origin
        || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const position = eventEditorHistoryPosition(history.state);
      if (nav.current?.contains(link) && link.hash === worldsHash && location.hash !== worldsHash) {
        visits.delete((position ?? 0) + 1);
      }
      if (position === undefined || location.hash !== worldsHash || !link.matches(worldSelector)) return;

      const visit = {
        profile: location.href,
        world: link.href,
        top: link.getBoundingClientRect().top,
        width: innerWidth,
        keyboard: event.detail === 0,
      };
      visits.set(position, visit);
      leavingForWorld = visit;
      window.addEventListener("popstate", onTraversal, true);
    };

    const restore = () => {
      const returned = pending;
      if (!returned || returned.visit.profile !== location.href) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (pending !== returned) return;
          pending = undefined;
          const canceled = returned.input.signal.aborted;
          returned.input.abort();
          const { visit, position } = returned;
          if (canceled || !main.isConnected || visit.profile !== location.href
            || position !== eventEditorHistoryPosition(history.state) || visit.width !== innerWidth) return;

          const link = Array.from(main.querySelectorAll<HTMLAnchorElement>(worldSelector))
            .find((candidate) => candidate.href === visit.world);
          if (!link) return;
          const shift = link.getBoundingClientRect().top - visit.top;
          if (Math.abs(shift) >= 2) window.scrollBy({ top: shift, behavior: "instant" });

          const focused = document.activeElement;
          if (visit.keyboard && (focused === document.body || focused?.id === "main-content" || focused?.id === "profile-worlds")) {
            link.focus({ preventScroll: true });
          }
          visit.keyboard = false;
        });
      });
    };

    const forgetAfterScroll = (event: Event) => {
      if (!event.isTrusted || (event instanceof KeyboardEvent && !scrollKeys.has(event.key))) return;
      const position = eventEditorHistoryPosition(history.state);
      if (position !== undefined && visits.get(position)?.profile === location.href) visits.delete(position);
    };

    applyOnProfile = restore;
    restore();
    document.addEventListener("click", remember, true);
    for (const type of scrollEvents) window.addEventListener(type, forgetAfterScroll, { passive: true });
    return () => {
      if (applyOnProfile === restore) applyOnProfile = undefined;
      cancelAnimationFrame(frame);
      document.removeEventListener("click", remember, true);
      for (const type of scrollEvents) window.removeEventListener(type, forgetAfterScroll);
    };
  }, [nav]);
}
