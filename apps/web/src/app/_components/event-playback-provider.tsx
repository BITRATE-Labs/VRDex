"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex-generated-api";
import { EventPlaybackOwner } from "@/lib/event-playback-owner";
import { createRetainedPlaybackAdapter } from "@/lib/event-playback-adapters";
import {
  eventPlaybackRequest,
  profilePlaybackRequest,
} from "@/lib/event-playback-request";
import { retainPlaybackAuthorization } from "@/lib/event-playback-revalidation";
import {
  relayPlaybackEnabled,
  retainForegroundGrant,
} from "@/lib/relay-playback-adapter";
import { matchesNativeTrial, createNativeTrialOptIn, createDeferredTrialAdapter, type NativeTrialRouting } from "@/lib/native-trial-routing";
import { retainNowPlaying } from "@/lib/now-playing";
import { EventCompactPlayer } from "./event-compact-player";

const Context = createContext<EventPlaybackOwner | null>(null);
export function useEventPlayback() {
  return useContext(Context);
}
export function useEventPlaybackSnapshot(owner: EventPlaybackOwner) {
  return useSyncExternalStore(
    owner.subscribe,
    owner.getSnapshot,
    owner.getSnapshot,
  );
}

/** Root owner and mount survive route/auth changes. Presentation never reparents media. */
export function EventPlaybackProvider({ children }: { children: ReactNode }) {
  const mount = useRef<HTMLDivElement>(null);
  const trial = useRef<ReturnType<typeof createNativeTrialOptIn> | null>(null);
  useEffect(() => {
    const expected = new URLSearchParams(window.location.search).get("relayTrial");
    if (expected) {
      trial.current ??= createNativeTrialOptIn(expected, window.location.pathname, () =>
        fetch("/api/media-relay/trial", { cache: "no-store", signal: AbortSignal.timeout(5000) }).then(reply => reply.json()));
      void trial.current.read();
    }
  }, []);
  const [owner] = useState(
    () =>
      new EventPlaybackOwner((request, notify, mode) => {
        if (!mount.current) throw new Error("Playback mount unavailable");
        const optIn = trial.current;
        const create = (configuration: NativeTrialRouting | null, selectedMode: typeof mode) => {
          const selectedTrial = matchesNativeTrial(configuration, request);
          if (relayPlaybackEnabled() || selectedTrial) {
            const url = process.env.NEXT_PUBLIC_CONVEX_URL;
            if (!url) throw Error("Playback unavailable");
            const client = new ConvexHttpClient(url);
            return createRetainedPlaybackAdapter(request, mount.current!, notify, {
              mode: selectedMode,
              providerTrial: selectedTrial,
              relay: {
                open: async (context, streamId, preferredMode, continuationGrantId) => {
                  if (selectedTrial && configuration) {
                    const reply = await fetch("/api/media-relay/trial", { method: "POST", signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ trialId: configuration.trialId, context, streamId, preferredMode }) });
                    if (!reply.ok) throw Error("Playback unavailable");
                    return reply.json();
                  }
                  return client.mutation(api.mediaRelayPlayback.openPlayback, {
                    context, streamId, preferredMode, ...(continuationGrantId ? { continuationGrantId } : {}),
                  });
                },
                rebind: (grantId, selectedSourceId, expectedSelectedSourceId, expectedContextRevision) =>
                  client.mutation(api.mediaRelayPlayback.rebindPlayback, { grantId, selectedSourceId, expectedSelectedSourceId, expectedContextRevision }),
                get: (grantId) =>
                  client.query(api.mediaRelayPlayback.getPlayback, { grantId }),
                restart: (grantId) =>
                  client.mutation(api.mediaRelayPlayback.restartPlayback, {
                    grantId,
                  }),
                refresh: (grantId) =>
                  client.mutation(api.mediaRelayPlayback.refreshPlayback, {
                    grantId,
                  }),
                release: (grantId) =>
                  client.mutation(api.mediaRelayPlayback.releasePlayback, {
                    grantId,
                  }),
              },
            });
          }
          return createRetainedPlaybackAdapter(request, mount.current!, notify, { mode: selectedMode });
        };
        return optIn && request.kind === "vrcdn" ? createDeferredTrialAdapter({ load: optIn.read, create, mode }) : create(null, mode);
      }),
  );
  const state = useEventPlaybackSnapshot(owner);
  const generation = owner.generation;
  const active = Boolean(state.request);
  const relayActive = relayPlaybackEnabled() || Boolean(state.request && matchesNativeTrial(trial.current?.current() ?? null, state.request));
  useEffect(() => () => owner.close(), [owner]);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url || !state.request) return;
    const client = new ConvexHttpClient(url);
    const active = state.request;
    return retainPlaybackAuthorization(owner, async (slug) =>
      "profileId" in active && active.kind === "vrcdn"
        ? profilePlaybackRequest(
            await client.query(api.profiles.getPublicBySlug, { slug }),
            active.sourceId,
          )
        : eventPlaybackRequest(
            await client.query(api.events.getPublicBySlug, { slug }),
          ),
    );
    // Metadata refreshes must not restart the revalidation loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, generation]);
  useEffect(() => {
    if (!active || !relayActive) return;
    return retainForegroundGrant(
      owner,
      document,
      () => document.visibilityState === "visible",
    );
  }, [owner, generation, active, relayActive]);
  useEffect(() => retainNowPlaying(owner), [owner]);
  return (
    <Context.Provider value={owner}>
      {children}
      <EventCompactPlayer owner={owner} state={state} mount={mount} />
    </Context.Provider>
  );
}
