
import { NativeTrialRoutingSchema, type NativeTrialRouting } from "@vrdex/media-relay";
export { NativeTrialRoutingSchema, type NativeTrialRouting } from "@vrdex/media-relay";
import type { PlaybackRequest } from "./event-playback-owner";
import { relayContext } from "./relay-playback-adapter";

/** A local opt-in never changes routing for another source, context or expired trial. */
export function matchesNativeTrial(trial: NativeTrialRouting | null, request: PlaybackRequest, now = Date.now()) {
  if (!trial || !Number.isFinite(now) || now >= trial.expiresAt || request.kind !== "vrcdn" || request.sourceId !== trial.streamId) return false;
  if (request.transport === "video" && request.src !== `https://stream.vrcdn.live/live/${trial.streamId}.live.mp4`) return false;
  const actual = relayContext(request), expected = trial.context;
  return actual.kind === "profile" && expected.kind === "profile" ? actual.profileId === expected.profileId && actual.linkId === expected.linkId :
    actual.kind === "event" && expected.kind === "event" && actual.eventId === expected.eventId && actual.selectedSourceId === expected.selectedSourceId;
}


/** One eligibility read belongs to the retained root owner, including navigation. */
export function createNativeTrialOptIn(expected: string, href: string, load: () => Promise<unknown>) {
  let value: NativeTrialRouting | null = null, promise: Promise<NativeTrialRouting | null> | undefined;
  return { href, current: () => value,
    read: () => promise ??= load().then(input => {
      const parsed = NativeTrialRoutingSchema.safeParse(input);
      value = parsed.success && parsed.data.trialId === expected && parsed.data.expiresAt > Date.now() ? parsed.data : null;
      return value;
    }).catch(() => null),
  };
}
