"use client";

import { useSyncExternalStore } from "react";
import { createPreferenceStore } from "../../../lib/timeline/preference-storage";

// Providers run when the first subscriber commits. Rendering never touches storage.
const store = createPreferenceStore({
  storage: () => typeof window === "undefined" ? null : window.localStorage,
  eventTarget: () => typeof window === "undefined" ? null : window,
});
export function useTimelinePreferences() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...snapshot, dispatch: store.dispatch };
}
