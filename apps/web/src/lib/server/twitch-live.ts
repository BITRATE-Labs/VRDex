import "server-only";

import { unstable_cache } from "next/cache";

import { type LiveClaimLink } from "@/lib/live-claim-sources";
import { twitchLoginForLiveClaim } from "@/lib/twitch-url";
import { requestTwitchToken, requestTwitchStreams } from "../../../../../convex/_twitchLiveProbe";

export type TwitchLiveState =
  | {
      status: "live";
      gameName?: string;
      startedAt: string;
      title: string;
      viewerCount: number;
    }
  | { status: "offline" }
  | { status: "unavailable" };

export type TwitchLiveObservation = { state: TwitchLiveState; observedAt: number };
type PublicLink = LiveClaimLink;

const staleStateMaxAgeMs = 60_000;
const staleStates = new Map<string, { fetchedAt: number; state: TwitchLiveState }>();

function getFreshStaleState(login: string): TwitchLiveState | undefined {
  const entry = staleStates.get(login);

  if (!entry) {
    return undefined;
  }

  if (Date.now() - entry.fetchedAt <= staleStateMaxAgeMs) {
    return entry.state;
  }

  staleStates.delete(login);
  return undefined;
}

const getTwitchAppToken = unstable_cache(
  async () => {
    const clientId = process.env.TWITCH_CLIENT_ID?.trim();
    const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();

    if (!clientId || !clientSecret) {
      return null;
    }

    const token = await requestTwitchToken(clientId, clientSecret);
    return token?.accessToken ?? null;
  },
  ["twitch-app-token"],
  { revalidate: 3000 },
);

const getCachedTwitchLiveState = unstable_cache(
  async (login: string): Promise<TwitchLiveObservation> => {
    const observe = (state: TwitchLiveState): TwitchLiveObservation => ({ state, observedAt: Date.now() });
    const clientId = process.env.TWITCH_CLIENT_ID?.trim();
    const token = await getTwitchAppToken();

    if (!clientId || !token) {
      return observe({ status: "unavailable" });
    }

    const response = await requestTwitchStreams([login], clientId, token);
    if (response.unavailable) throw new Error("Twitch stream request rate limited.");
    const stream = response.streams.find(stream => stream.user_login === login);
    if (!stream) {
      return observe({ status: "offline" });
    }

    return observe({
      status: "live",
      title: stream.title?.trim() || "Live on Twitch",
      viewerCount: stream.viewer_count ?? 0,
      startedAt: stream.started_at ?? new Date().toISOString(),
      ...(stream.game_name?.trim() ? { gameName: stream.game_name.trim() } : {}),
    });
  },
  ["twitch-live-state-observation"],
  { revalidate: 30 },
);

export async function getTwitchLiveObservation(links: readonly PublicLink[]): Promise<TwitchLiveObservation | undefined> {
  const login = twitchLoginForLiveClaim(links);

  if (!login) {
    return undefined;
  }

  try {
    const observation = await getCachedTwitchLiveState(login);
    const { state } = observation;

    if (state.status !== "unavailable") {
      staleStates.set(login, { fetchedAt: observation.observedAt, state });
    }

    const previous = staleStates.get(login);
    return state.status === "unavailable" && previous && getFreshStaleState(login)
      ? { state: previous.state, observedAt: previous.fetchedAt } : observation;
  } catch (error) {
    console.error(`Twitch live-state lookup failed for ${login}:`, error);
    const entry = staleStates.get(login);
    return entry && getFreshStaleState(login) ? {state:entry.state, observedAt:entry.fetchedAt} : {state:{status:"unavailable"},observedAt:Date.now()};
  }
}

export async function getTwitchLiveState(links: readonly PublicLink[]): Promise<TwitchLiveState | undefined> {
 return (await getTwitchLiveObservation(links))?.state;
}
