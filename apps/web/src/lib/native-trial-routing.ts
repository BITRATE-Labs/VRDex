
import { NativeTrialRoutingSchema, type NativeTrialRouting } from "@vrdex/media-relay";
export { NativeTrialRoutingSchema, type NativeTrialRouting } from "@vrdex/media-relay";
import type { PlaybackAdapter, PlaybackRequest } from "./event-playback-owner";
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
export function createNativeTrialOptIn(expected: string, load: () => Promise<unknown>) {
  let value: NativeTrialRouting | null = null, promise: Promise<NativeTrialRouting | null> | undefined;
  return { current: () => value,
    read: () => promise ??= load().then(input => {
      const parsed = NativeTrialRoutingSchema.safeParse(input);
      value = parsed.success && parsed.data.trialId === expected && parsed.data.expiresAt > Date.now() ? parsed.data : null;
      return value;
    }).catch(() => null),
  };
}

import type { PlaybackMode } from "./playback-mode";
/** Resolve eligibility before choosing native or ordinary playback, without changing the root owner. */
export function createDeferredTrialAdapter({ load, create, mode: initialMode }: {
  load: () => Promise<NativeTrialRouting | null>;
  create: (trial: NativeTrialRouting | null, mode: PlaybackMode) => PlaybackAdapter;
  mode: PlaybackMode;
}): PlaybackAdapter {
  let target: PlaybackAdapter | undefined, pending: Promise<PlaybackAdapter> | undefined;
  let disposed = false, intent = false, version = 0, mode = initialMode, volume = 1, muted = false;
  let updated: PlaybackRequest | undefined;
  const get = () => target ? Promise.resolve(target) : pending ??= load().then(trial => {
    if (disposed || !intent) throw Error("Playback intent ended");
    target = create(trial, mode); target.setVolume(volume); target.setMuted(muted);
    if (updated) target.update(updated);
    return target;
  }).catch(error => { pending = undefined; throw error; });
  const play = async (retry = false) => {
    intent = true; const token = ++version;
    try {
      const adapter = await get();
      if (disposed || !intent || token !== version) return false;
      return await (retry && adapter.retry ? adapter.retry() : adapter.play());
    } catch (error) { if (disposed || !intent || token !== version) return false; throw error; }
  };
  return {
    get supportsAudioOnly() { return target?.supportsAudioOnly === true; },
    get supportsPictureInPicture() { return target ? target.supportsPictureInPicture !== false : false; },
    get media() { return target?.media; },
    play: () => play(),
    get retry() { return target && !target.retry ? undefined : () => play(true); },
    pause() { intent = false; version++; target?.pause(); },
    setVolume(value) { volume = value; target?.setVolume(value); },
    setMuted(value) { muted = value; target?.setMuted(value); },
    get setMode() {
      if (!target?.setMode) return undefined;
      return async (value: PlaybackMode) => { mode = value; return target?.setMode ? target.setMode(value) : true; };
    },
    update(value) { updated = value; target?.update(value); },
    refresh: async () => { await target?.refresh?.(); },
    setMetadata(value) { target?.setMetadata?.(value); },
    dispose() { disposed = true; intent = false; version++; target?.dispose(); },
  };
}
