import type { EventPlaybackOwner, PlaybackSnapshot } from "./event-playback-owner";
import type { PlaybackMode } from "./playback-mode";
import { playbackArtwork } from "./playback-metadata";

type Identity = { displayName: string; artwork: string | undefined };
// Chrome supports this action ahead of our TypeScript DOM definitions.
const ENTER_PICTURE_IN_PICTURE = "enterpictureinpicture" as MediaSessionAction;
export function nowPlayingIdentity(state: PlaybackSnapshot): Identity | null {
  if (!state.request || !state.metadata) return null;
  return { displayName: state.metadata.displayName, artwork: playbackArtwork(state) };
}
function session() { return typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null; }
export function clearNowPlaying(): void {
  const current = session();
  if (!current) return;
  current.metadata = null;
  current.playbackState = "none";
  for (const action of ["play", "pause", "stop", ENTER_PICTURE_IN_PICTURE] satisfies MediaSessionAction[]) {
    try { current.setActionHandler(action, null); } catch { /* Older browsers omit individual actions. */ }
  }
}
export function applyNowPlaying({ identity, mode, actions }: { identity: Identity | null; mode: PlaybackMode; actions: { owner: EventPlaybackOwner; generation: number } }): void {
  const current = session();
  if (!current) return;
  if (!identity) { clearNowPlaying(); return; }
  current.metadata = new MediaMetadata({ title: `${identity.displayName} - VRDex`, ...(identity.artwork ? { artwork: [{ src: new URL(identity.artwork, location.origin).href, sizes: "512x512", type: "image/png" }] } : {}) });
  const { owner, generation } = actions;
  const valid = () => owner.generation === generation && Boolean(owner.getSnapshot().request);
  current.playbackState = owner.getSnapshot().status === "playing" ? "playing" : "paused";
  for (const [action, handler] of [
    ["play", () => { const request = owner.getSnapshot().request; if (valid() && request) void owner.play(request); }],
    ["pause", () => { if (valid()) owner.pause(); }],
    ["stop", () => { if (valid()) { owner.close(); clearNowPlaying(); } }],
  ] satisfies [MediaSessionAction, () => void][]) {
    try { current.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
  }
  try {
    // The browser invokes this when automatic PiP is permitted, without another tap.
    current.setActionHandler(ENTER_PICTURE_IN_PICTURE, mode === "video" ? () => {
      const state = owner.getSnapshot();
      const media = owner.media;
      if (!valid() || state.mode !== "video" || state.status !== "playing" ||
          typeof HTMLVideoElement === "undefined" || !(media instanceof HTMLVideoElement) ||
          !document.pictureInPictureEnabled || document.pictureInPictureElement || !media.requestPictureInPicture) return;
      void media.requestPictureInPicture().catch(() => {});
    } : null);
  } catch { /* Safari and older browsers may omit this action. */ }
}

/** The root provider retains this subscription alongside its existing playback owner. */
export function retainNowPlaying(owner: EventPlaybackOwner): () => void {
  let previous = "";
  const update = () => {
    const state = owner.getSnapshot();
    const identity = nowPlayingIdentity(state);
    const generation = owner.generation;
    const key = JSON.stringify([identity, state.mode, state.status, generation]);
    if (key === previous) return;
    previous = key;
    applyNowPlaying({ identity, mode: state.mode, actions: { owner, generation } });
  };
  const unsubscribe = owner.subscribe(update);
  update();
  return () => { unsubscribe(); clearNowPlaying(); };
}
