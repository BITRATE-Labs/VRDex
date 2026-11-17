import { createVrcdnStreamLinks } from "./_vrcdnLinks";
export function vrcdnLiveStateFromStatus(status: number): "live" | "offline" | "unavailable" {
  return status === 200 ? "live" : status === 401 || status === 404 ? "offline" : "unavailable";
}
export type VrcdnLiveProbeResult = { observedAt: number; state: "live" | "offline" | "unavailable" } & {
  durationMs: number;
  status: number;
};

type ProbeVrcdnLiveStateOptions = {
  fetchImplementation?: typeof fetch;
  now?: () => number;
  signal: AbortSignal;
};

export async function probeVrcdnLiveState(
  streamId: string,
  options: ProbeVrcdnLiveStateOptions,
): Promise<VrcdnLiveProbeResult> {
  const stream = createVrcdnStreamLinks(streamId);

  if (stream === null) {
    throw new Error("Invalid VRCDN stream identifier.");
  }

  const fetchImplementation = options.fetchImplementation ?? fetch;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const response = await fetchImplementation(stream.questUrl, { signal: options.signal });
  await response.body?.cancel();

  return {
    durationMs: now() - startedAt,
    observedAt: now(),
    state: vrcdnLiveStateFromStatus(response.status),
    status: response.status,
  };
}
