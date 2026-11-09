import { createNativeLineupAdapter } from "./native-lineup-adapter";
import type { PlaybackMode } from "./playback-mode";
import {
  createRelayPlaybackAdapter,
  type RelayPlaybackClient,
} from "./relay-playback-adapter";
import { EventLineupSession } from "./event-lineup-runtime";
import type {
  AdapterNotify,
  PlaybackAdapter,
  PlaybackRequest,
} from "./event-playback-owner";
import { createTwitchAdapter } from "./twitch-player-adapter";
import {
  attachVrcdnTransport,
  releaseVrcdnTransport,
  type VrcdnTransport,
} from "./vrcdn-transport";

export function createEventPlaybackAdapter(request: PlaybackRequest, mount: HTMLElement, notify: AdapterNotify, loadMpegts = () => import("mpegts.js"), loadHls = () => import("hls.js")): PlaybackAdapter {
  if (request.kind === "twitch") return createTwitchAdapter(request, mount, notify);
  if (request.kind === "performer_sequence") {
    let previousEvent = JSON.stringify(request.event);
    const session = new EventLineupSession(request.event, mount, (lineup) =>
      notify({
        lineup,
        status: lineup.unavailable
          ? "unavailable"
          : lineup.paused
            ? "paused"
            : "playing",
      }),
    );
    return {
      async play() {
        await session.play();
        return !session.state.paused;
      },
      pause: () => session.pause(),
      setVolume(value) {
        session.setVolume(value);
      },
      setMuted(value) {
        session.setMuted(value);
      },
      update(value) {
        if (value.kind === "performer_sequence") {
          const next = JSON.stringify(value.event);
          if (next !== previousEvent) {
            previousEvent = next;
            session.update(value.event);
          }
        }
      },
      dispose: () => session.dispose(),
      manual: (key) => session.manual(key),
      live: () => session.live(),
      retryNextPlayback: () => session.retryNextPlayback(),
      setMode: mode => session.setMode(mode),
    };
  }
  const video = document.createElement("video");
  video.playsInline = true;
  video.className = "aspect-video w-full object-contain";
  video.title = request.title;
  mount.append(video);
  let player: VrcdnTransport | undefined,
    disposed = false,
    attempt = 0;
  let failed = false;
  let hls: { destroy(): void } | undefined;
  let guardVolume = false, audible = false, beforeUnmute: (() => boolean) | undefined;
  const volumeChange = () => {
    if (guardVolume || !beforeUnmute) return;
    const nextAudible = !video.muted && video.volume > 0;
    if (nextAudible === audible) return;
    audible = nextAudible;
    if (!nextAudible) return;
    guardVolume = true;
    video.muted = true;
    try { if (beforeUnmute()) video.muted = false; } finally { audible = !video.muted && video.volume > 0; guardVolume = false; }
  };
  video.addEventListener("volumechange", volumeChange);
  const connectionEnded = () => {
    if (disposed || failed) return;
    if ("profileId" in request) {
      failed = true;
      notify({ status: "unavailable", unavailableReason: "ended" });
    } else notify({ status: "paused" });
  };
  const listeners: Array<[string, () => void]> = [
    [
      "playing",
      () => {
        if (!disposed && !video.paused) {
          failed = false;
          notify({ status: "playing" });
        }
      },
    ],
    [
      "pause",
      () => {
        if (!disposed && !failed) notify({ status: "paused" });
      },
    ],
    ["ended", connectionEnded],
    [
      "error",
      () => {
        if (!disposed) {
          failed = true;
          notify({ status: "unavailable" });
        }
      },
    ],
  ];
  for (const [event, listener] of listeners) video.addEventListener(event, listener);
  const ready = request.transport === "video" ? Promise.resolve().then(() => { if (!disposed) video.src = request.src; }) : request.transport === "hls" ? Promise.resolve().then(async () => {
    if (disposed) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) { video.src = request.src; return; }
    const { default: Hls } = await loadHls();
    if (disposed) return;
    if (!Hls.isSupported()) throw new Error("Unsupported media transport");
    const instance = new Hls({ enableWorker: true, maxBufferLength: 15, maxMaxBufferLength: 30 });
    hls = instance;
    instance.on(Hls.Events.ERROR, (_event, data) => { if (!disposed && data.fatal) { failed = true; notify({ status: "unavailable" }); } });
    instance.loadSource(request.src); instance.attachMedia(video);
  }) : loadMpegts().then(({ default: mpegts }) => {
    if (disposed) return;
    if (!mpegts.isSupported()) throw new Error("Unsupported media transport");
    player = attachVrcdnTransport(mpegts, video, request.src, { ...("profileId" in request ? {onLoadingComplete:connectionEnded} : {}), onError: () => { if (!disposed) { failed = true; notify({ status: "unavailable" }); } } });
  });
  // The owner may close before Play awaits the transport import.
  void ready.catch(() => {});
  return {
    enableControls(callback) { beforeUnmute = callback; video.controls = true; },
    async play() { const current = ++attempt; await ready; if (disposed || current !== attempt) return false;
      try { await video.play(); return !disposed && current === attempt; } catch { return false; } },
    pause() { attempt++; video.pause(); }, setVolume(value) { if (value === 0) audible = false; video.volume = value; }, setMuted(value) { if (value) audible = false; video.muted = value; },
    update(value) { video.title = value.title; },
    dispose() { if (disposed) return; disposed = true; attempt++; for (const [event, listener] of listeners) video.removeEventListener(event, listener); video.pause(); video.removeEventListener("volumechange", volumeChange); hls?.destroy(); if (player) releaseVrcdnTransport(player); video.removeAttribute("src"); video.load(); video.remove(); },
  };
}

/** Rollout is explicit. Saved audio never silently loads a legacy video stream. */
export function createRetainedPlaybackAdapter(
  request: PlaybackRequest,
  mount: HTMLElement,
  notify: AdapterNotify,
  { mode, relay }: { mode: PlaybackMode; relay?: RelayPlaybackClient },
): PlaybackAdapter {
  if (request.kind === "performer_sequence" && request.localOnly) {
    const adapter = createEventPlaybackAdapter(request, mount, notify);
    void adapter.setMode?.(mode);
    return adapter;
  }
  if (relay && request.kind === "vrcdn" && request.transport !== "video")
    return createRelayPlaybackAdapter({
      request,
      mount,
      notify,
      mode,
      client: relay,
    });
  if (relay && request.kind === "performer_sequence") return createNativeLineupAdapter({ request, mount, notify, mode, client: relay });
  if (mode === "audio" && request.kind !== "twitch")
    return {
      async play() {
        return false;
      },
      pause() {},
      setVolume() {},
      setMuted() {},
      update() {},
      dispose() {},
    };
  return createEventPlaybackAdapter(request, mount, notify);
}
