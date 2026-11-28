import type { MouseEvent } from "react";

type Rail = "events" | "clubs";
type RailScroll = {
  index: number;
  left: number;
  width: number;
  top?: number;
  viewportWidth?: number;
  viewportHeight?: number;
};

type HomeRailPosition = RailScroll & { rail: Rail; itemId: string };
type HomeClubPosition = RailScroll & { clubId: string };

export function readHomeRailPosition(): HomeRailPosition | undefined {
  const state = window.history.state;
  const saved = state?.vrdexHomeRailPosition;
  if (saved) return saved;
  // Back may return to an entry saved before Events shared this behavior.
  const legacy: HomeClubPosition | undefined = state?.vrdexHomeClubPosition;
  if (legacy) {
    const { clubId, ...scroll } = legacy;
    return { ...scroll, rail: "clubs", itemId: clubId };
  }
}

export function clearHomeRailPosition(rail: Rail) {
  if (readHomeRailPosition()?.rail !== rail) return;
  const state = { ...window.history.state };
  delete state.vrdexHomeRailPosition;
  delete state.vrdexHomeClubPosition;
  window.history.replaceState(state, "");
}

export function isHomeRailNavigation(event: MouseEvent<HTMLElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
    || event.shiftKey || event.altKey || window.location.pathname !== "/") return false;

  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  return link instanceof HTMLAnchorElement && link.origin === window.location.origin
    && link.pathname !== window.location.pathname && (!link.target || link.target === "_self")
    && !link.hasAttribute("download");
}

export function saveHomeRailPosition(origin: Element | null) {
  const card = origin?.closest<HTMLElement>("[data-home-rail-item]");
  const rail = card?.parentElement;
  const group = rail?.getAttribute("data-home-rail");
  const itemId = card?.dataset.homeRailItem;
  if (!card || !rail || !itemId || (group !== "events" && group !== "clubs")) return;

  const position: HomeRailPosition = {
    rail: group,
    itemId,
    index: Array.from(rail.children).indexOf(card),
    left: rail.scrollLeft,
    width: rail.clientWidth,
    top: window.scrollY,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
  window.history.replaceState({ ...window.history.state, vrdexHomeRailPosition: position }, "");
}
