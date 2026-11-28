"use client";

import { useLayoutEffect } from "react";

export function WorldEventsFocus() {
  useLayoutEffect(() => {
    if (window.location.hash === "#world-events" && document.activeElement === document.body) {
      document.getElementById("world-events")?.focus({ preventScroll: true });
    }
  }, []);

  return null;
}
