"use client";
import { useConvex } from "convex/react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useSyncExternalStore,
} from "react";
import { api } from "@convex-generated-api";
import type {
  PlanReference,
  TimelineRange,
} from "../../../../../../convex/_eventTimelineTypes";
import {
  createTimelineController,
  timelineViewportKey,
} from "@/lib/timeline/window-cache";

export function useTimelineData({
  range,
  favoritesOnly,
  favoriteProfileIds,
  plan,
}: {
  range: TimelineRange;
  favoritesOnly: boolean;
  favoriteProfileIds: ReadonlyArray<string>;
  plan: ReadonlyArray<PlanReference>;
}) {
  const client = useConvex();
  const controller = useMemo(
    () =>
      createTimelineController({
        list: (args) =>
          client
            ? client.query(api.eventTimeline.listPublic, args)
            : Promise.reject(new Error("Backend unavailable")),
        roster: (args) =>
          client
            ? client.query(api.eventTimeline.listPublicRoster, args)
            : Promise.reject(new Error("Backend unavailable")),
        resolve: (args) =>
          client
            ? client.query(api.eventTimeline.resolveSaved, args)
            : Promise.reject(new Error("Backend unavailable")),
      }),
    [client],
  );
  const { viewportKey: snapshotKey, ...state } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  // Pixels within the same windows do not invalidate in-flight pagination.
  const viewportKey = timelineViewportKey(range, favoritesOnly, favoriteProfileIds);
  const updateViewport = useEffectEvent(() =>
    controller.setViewport(range, favoritesOnly, favoriteProfileIds),
  );
  useEffect(() => {
    void updateViewport();
  }, [controller, viewportKey, favoriteProfileIds]);
  useEffect(() => {
    void controller.setPlan(plan);
  }, [controller, plan]);
  useEffect(() => {
    const refresh = () => {
      void controller.refresh();
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
      controller.dispose();
    };
  }, [controller]);
  return {
    ...state,
    isCurrentViewport: snapshotKey === viewportKey,
    retry: controller.retry,
    loadMore: controller.loadMore,
    resolveRoster: controller.resolveRoster,
  };
}
