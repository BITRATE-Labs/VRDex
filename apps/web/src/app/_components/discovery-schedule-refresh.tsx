"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const maxTimeoutMs = 2_147_483_647;

export function EventScheduleRefresh({ nextTransition, serverNow }: {
  nextTransition: number;
  serverNow: number;
}) {
  const router = useRouter();
  const attemptedBoundary = useRef<number>(null);
  useEffect(() => {
    const relativeDeadline = Date.now() + (nextTransition - serverNow);
    // Back can restore an aged snapshot. After one refresh, use server-relative
    // time for this boundary if the browser clock was ahead of the server.
    const deadline = attemptedBoundary.current === nextTransition
      ? relativeDeadline
      : Math.min(nextTransition, relativeDeadline);
    let timer: number | undefined;
    let refreshed = false;

    function refreshWhenDue() {
      if (refreshed) return;
      window.clearTimeout(timer);
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        timer = window.setTimeout(refreshWhenDue, Math.min(remaining, maxTimeoutMs));
        return;
      }
      refreshed = true;
      attemptedBoundary.current = nextTransition;
      router.refresh();
    }

    function refreshOnWake() {
      if (document.visibilityState === "visible") refreshWhenDue();
    }

    refreshWhenDue();
    document.addEventListener("visibilitychange", refreshOnWake);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshOnWake);
    };
  }, [nextTransition, router, serverNow]);

  return null;
}
