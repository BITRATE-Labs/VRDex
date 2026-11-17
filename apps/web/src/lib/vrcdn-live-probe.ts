import {
  type VrcdnLiveState,
  type VrcdnLiveStates,
  vrcdnReportedState,
} from "./vrcdn-live";

export type VrcdnProbeFreshnessMode = "cached" | "fresh";

export { probeVrcdnLiveState, type VrcdnLiveProbeResult } from "../../../../convex/_vrcdnLiveProbe";
import type { VrcdnLiveProbeResult } from "../../../../convex/_vrcdnLiveProbe";

export function vrcdnProbeLog(input: {
  durationMs: number;
  freshnessMode: VrcdnProbeFreshnessMode;
  state: VrcdnLiveState;
  status: number;
}) {
  return {
    durationMs: input.durationMs,
    freshnessMode: input.freshnessMode,
    level: "info",
    message: "VRCDN live-state lookup completed",
    provider: "vrcdn",
    state: input.state,
    status: input.status,
  } as const;
}

export function vrcdnProbeFailureLog(input: {
  durationMs: number;
  error: unknown;
  freshnessMode: VrcdnProbeFreshnessMode;
}) {
  const errorKind = input.error instanceof Error && input.error.name === "AbortError"
    ? "abort"
    : input.error instanceof TypeError
      ? "network"
      : "unknown";

  return {
    durationMs: input.durationMs,
    errorKind,
    freshnessMode: input.freshnessMode,
    level: "error",
    message: "VRCDN live-state lookup failed",
    provider: "vrcdn",
  } as const;
}

export type VrcdnProbeLogEntry =
  | ReturnType<typeof vrcdnProbeFailureLog>
  | ReturnType<typeof vrcdnProbeLog>;

type CollectVrcdnLiveStatesOptions = {
  freshnessMode: VrcdnProbeFreshnessMode;
  log?: (entry: VrcdnProbeLogEntry) => void;
  now?: () => number;
  readCached: (streamId: string) => Promise<VrcdnLiveProbeResult>;
  readFresh: (streamId: string) => Promise<VrcdnLiveProbeResult>;
};

export async function collectVrcdnLiveStates(
  streamIds: readonly string[],
  options: CollectVrcdnLiveStatesOptions,
): Promise<VrcdnLiveStates> {
  const read = options.freshnessMode === "fresh" ? options.readFresh : options.readCached;
  const now = options.now ?? Date.now;
  const states = await Promise.all(
    streamIds.map(async (streamId): Promise<[string, VrcdnLiveState]> => {
      const startedAt = now();

      try {
        const result = await read(streamId);
        const state = vrcdnReportedState(result, now());
        options.log?.(vrcdnProbeLog({
          durationMs: result.durationMs,
          freshnessMode: options.freshnessMode,
          state,
          status: result.status,
        }));
        return [streamId, state];
      } catch (error) {
        options.log?.(vrcdnProbeFailureLog({
          durationMs: now() - startedAt,
          error,
          freshnessMode: options.freshnessMode,
        }));
        return [streamId, "unavailable"];
      }
    }),
  );

  return Object.fromEntries(states);
}
