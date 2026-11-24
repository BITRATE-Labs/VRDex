import assert from "node:assert/strict";
import { test } from "node:test";
import { EventPlaybackOwner, type PlaybackRequest } from "../../apps/web/src/lib/event-playback-owner";
import { createTwitchAdapter, type TwitchSDK } from "../../apps/web/src/lib/twitch-player-adapter";
import { foregroundPlayback } from "../../apps/web/src/lib/foreground-playback";
import { createEventPlaybackAdapter } from "../../apps/web/src/lib/event-playback-adapters";
const request: PlaybackRequest = { kind: "vrcdn", eventId: "a", eventSlug: "a", title: "A", href: "/a", sourceId: "a", src: "a", transport: "video", startAt: Date.now() - 1000 };
class Video extends EventTarget {
  bufferEnd = 0;
  get buffered() { return { length: this.bufferEnd > 0 ? 1 : 0, end: () => this.bufferEnd }; }
  style = {}; src = ""; paused = true; muted = false; volume = 1; removed = false; listeners = 0; currentTime = 0;
  async play() { this.paused = false; this.dispatchEvent(new Event("playing")); }
  pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
  removeAttribute() {} load() {} remove() { this.removed = true; }
  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>) { this.listeners++; super.addEventListener(...args); }
  override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>) { this.listeners--; super.removeEventListener(...args); }
}
function dom() {
  const before = { document: globalThis.document, window: globalThis.window }; const nodes: Video[] = [];
  const events = new EventTarget(); let listeners = 0;
  const document = { visibilityState: "visible", createElement() { const node = new Video(); nodes.push(node); return node; },
    addEventListener(...args: Parameters<EventTarget["addEventListener"]>) { listeners++; events.addEventListener(...args); },
    removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>) { listeners--; events.removeEventListener(...args); } };
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1200, location: { hostname: "localhost" } } });
  return { nodes, get documentListeners() { return listeners; }, visibility(value: string) { document.visibilityState = value; events.dispatchEvent(new Event("visibilitychange")); }, mount: { append() {} } as unknown as HTMLElement, restore() { Object.defineProperty(globalThis, "document", { configurable: true, value: before.document }); Object.defineProperty(globalThis, "window", { configurable: true, value: before.window }); } };
}
test("native browser pause, EOF, error and recovery update state; disposal removes listeners", async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const audioSession = { type: "auto" };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { audioSession } });
  const fixture = dom(); const owner = new EventPlaybackOwner((value, notify) => createEventPlaybackAdapter(value, fixture.mount, notify));
  try {
    await owner.play(request); assert.equal(audioSession.type, "playback"); assert.equal(owner.supportsAudioOnly, false); const video = fixture.nodes[0]; video.pause(); assert.equal(owner.getSnapshot().status, "paused"); assert.equal(audioSession.type, "auto");
    let stoppedOther = false; foregroundPlayback.acquire({}, () => { stoppedOther = true; });
    await video.play(); assert.equal(owner.getSnapshot().status, "playing"); assert.equal(stoppedOther, true);
    video.dispatchEvent(new Event("ended")); assert.equal(owner.getSnapshot().status, "paused");
    video.dispatchEvent(new Event("error")); assert.equal(owner.getSnapshot().status, "unavailable");
    owner.close(); assert.equal(video.listeners, 0); video.dispatchEvent(new Event("playing")); assert.equal(owner.getSnapshot().status, "idle");
  } finally { owner.close(); fixture.restore(); if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else Reflect.deleteProperty(globalThis, "navigator"); }
});
test("Twitch SDK failure retry creates a recoverable adapter and restores viewer output", async () => {
  const fixture = dom(); let attempts = 0;
  const outputs: unknown[] = [];
  class Player {
    static READY = "ready"; static PLAYING = "playing"; static PAUSE = "pause"; static OFFLINE = "offline"; static PLAYBACK_BLOCKED = "blocked";
    callbacks = new Map<string, () => void>();
    addEventListener(key: string, callback: () => void) { this.callbacks.set(key, callback); if (key === "ready") queueMicrotask(callback); }
    removeEventListener(key: string) { this.callbacks.delete(key); }
    play() { this.callbacks.get("playing")?.(); } pause() {} setVolume(value: number) { outputs.push(value); } setMuted(value: boolean) { outputs.push(value); }
  }
  const load = async () => { if (++attempts === 1) throw new Error("SDK failed"); return { Player } as TwitchSDK; };
  const twitch: PlaybackRequest = { ...request, kind: "twitch", channel: "fixture" };
  const owner = new EventPlaybackOwner((value, notify) => createTwitchAdapter(value as Extract<PlaybackRequest, {kind:"twitch"}>, fixture.mount, notify, load));
  try { owner.setVolume(0.25); owner.setMuted(true); await owner.play(twitch); assert.equal(owner.getSnapshot().status, "unavailable"); owner.pause(); await owner.play(twitch); assert.equal(attempts, 2); assert.equal(owner.getSnapshot().status, "playing"); assert.equal(fixture.nodes[0].removed, true); assert.deepEqual(outputs, [0.25, true]); }
  finally { owner.close(); fixture.restore(); }
});

test("fatal MPEG-TS retry disposes failed transport before reattach and reapplies viewer output", async () => {
  const fixture = dom();
  const players: Array<{ callbacks: Map<string, () => void>; disposed: boolean }> = [];
  const mpegts = { isSupported: () => true, Events: { ERROR: "error", LOADING_COMPLETE: "complete" }, createPlayer() {
    const record = { callbacks: new Map<string, () => void>(), disposed: false }; players.push(record);
    return { on(key: string, callback: () => void) { record.callbacks.set(key, callback); }, attachMediaElement() {}, load() {}, pause() {}, unload() {}, detachMediaElement() {}, destroy() { record.disposed = true; } };
  } };
  const load = async () => ({ default: mpegts }) as unknown as typeof import("mpegts.js");
  const owner = new EventPlaybackOwner((value, notify) => createEventPlaybackAdapter(value, fixture.mount, notify, load));
  try {
    owner.setMuted(true); owner.setVolume(0.25);
    const stream: PlaybackRequest = { ...request, transport: "mpegts" };
    await owner.play(stream); players[0].callbacks.get("error")!(); fixture.nodes[0].pause();
    assert.equal(owner.getSnapshot().status, "unavailable");
    await owner.play(stream); assert.equal(players.length, 2); assert.equal(players[0].disposed, true);
    assert.equal(fixture.nodes[0].listeners, 0); assert.equal(fixture.nodes[1].muted, true); assert.equal(fixture.nodes[1].volume, 0.25);
    players[0].callbacks.get("error")!(); assert.equal(owner.getSnapshot().status, "playing");
  } finally { owner.close(); fixture.restore(); }
});

test("blocked playback retries the existing usable adapter", async () => {
  const fixture = dom(); let created = 0;
  const owner = new EventPlaybackOwner((value, notify) => {
    created++; const adapter = createEventPlaybackAdapter(value, fixture.mount, notify);
    const video = fixture.nodes.at(-1)!; const play = video.play.bind(video); let first = true;
    video.play = async () => { if (first) { first = false; throw new Error("autoplay blocked"); } await play(); };
    return adapter;
  });
  try { await owner.play(request); assert.equal(owner.getSnapshot().status, "blocked"); await owner.play(request); assert.equal(created, 1); assert.equal(owner.getSnapshot().status, "playing"); }
  finally { owner.close(); fixture.restore(); }
});

test("Twitch provider Play can recover autoplay denial while explicit pause and disposal stay fenced", async () => {
  const fixture = dom(); let player!: Player;
  class Player {
    static READY = "ready"; static PLAYING = "playing"; static PAUSE = "pause"; static OFFLINE = "offline"; static PLAYBACK_BLOCKED = "blocked";
    callbacks = new Map<string, () => void>(); pauses = 0;
    constructor() { player = this; }
    addEventListener(key: string, callback: () => void) { this.callbacks.set(key, callback); if (key === "ready") queueMicrotask(callback); }
    removeEventListener(key: string) { this.callbacks.delete(key); }
    play() { this.callbacks.get("blocked")?.(); }
    pause() { this.pauses++; }
    setVolume() {} setMuted() {}
  }
  const twitch: PlaybackRequest = { ...request, kind: "twitch", channel: "fixture" };
  const owner = new EventPlaybackOwner((value, notify) => createTwitchAdapter(value as Extract<PlaybackRequest, { kind: "twitch" }>, fixture.mount, notify, async () => ({ Player }) as TwitchSDK));
  try {
    await owner.play(twitch);
    assert.equal(owner.getSnapshot().status, "blocked");
    player.callbacks.get("playing")!(); // Provider iframe UI gesture; no parent Play call.
    assert.equal(owner.getSnapshot().status, "playing");
    assert.equal(player.pauses, 0);
    owner.pause();
    player.callbacks.get("blocked")!();
    player.callbacks.get("playing")!();
    assert.notEqual(owner.getSnapshot().status, "playing");
    assert.equal(player.pauses, 2);
    const latePlaying = player.callbacks.get("playing")!;
    owner.close(); latePlaying();
    assert.equal(owner.getSnapshot().status, "idle");
    assert.equal(player.callbacks.size, 0);
  } finally { owner.close(); fixture.restore(); }
});
test('legacy rollback preserves audio preference without loading full video, and explicit Video permits playback',async()=>{
 const {createRetainedPlaybackAdapter}=await import('../../apps/web/src/lib/event-playback-adapters');const fixture=dom();
 try{const audio=createRetainedPlaybackAdapter(request,fixture.mount,()=>{},{mode:'audio'});assert.equal(await audio.play(),false);assert.equal(fixture.nodes.length,0);audio.dispose();
 const video=createRetainedPlaybackAdapter(request,fixture.mount,()=>{},{mode:'video'});assert.equal(await video.play(),true);assert.equal(fixture.nodes.length,1);video.dispose();}finally{fixture.restore();}
});

test("relay rollout preserves profile and event direct video while audio never loads video", async () => {
  const { createRetainedPlaybackAdapter } = await import('../../apps/web/src/lib/event-playback-adapters');
  const { profilePlaybackRequest, eventPlaybackRequest } = await import('../../apps/web/src/lib/event-playback-request');
  const fixture = dom(); let admissions = 0;
  const relay = { open: async () => { admissions++; return {kind:'unavailable',reason:'unavailable'}; } } as unknown as import('../../apps/web/src/lib/relay-playback-adapter').RelayPlaybackClient;
  try {
    for (const url of ['https://stream.vrcdn.live/live/basicbit.mp4', 'https://stream.vrcdn.live/live/basicbit.live.mp4', 'vrcdn:basicbit']) {
      const profile = profilePlaybackRequest({id:'profile',slug:'dj',displayName:'DJ',outboundLinks:[{type:'vrcdn',url}]}, 'basicbit');
      const event = eventPlaybackRequest({id:'event',slug:'show',title:'Show',watchSurfaceEnabled:true,startAt:1,mediaLinks:[{type:'watch',label:'Watch',url,presentation:'open'}],slots:[]} as never);
      for (const request of [profile,event]) {
        assert.ok(request);
        if (request.kind !== 'vrcdn') throw Error('expected vrcdn');
        const before = admissions, nodes = fixture.nodes.length;
        const audio = createRetainedPlaybackAdapter(request,fixture.mount,()=>{},{mode:'audio',relay});
        if (request.transport === 'video') {
          assert.equal(await audio.play(),false); assert.equal(fixture.nodes.length,nodes); audio.dispose();
          const video = createRetainedPlaybackAdapter(request,fixture.mount,()=>{},{mode:'video',relay});
          assert.equal(await video.play(),true); assert.equal(fixture.nodes.at(-1)?.src,url); video.dispose();
          assert.equal(admissions,before);
        } else { await audio.play(); assert.equal(admissions,before+1); audio.dispose(); }
      }
    }
  } finally { fixture.restore(); }
});

test("profile EOF requires explicit fresh playback while event EOF remains paused", async () => {
  const fixture = dom();
  const owner = new EventPlaybackOwner((value, notify) => createEventPlaybackAdapter(value, fixture.mount, notify));
  const profile: PlaybackRequest = {kind:"vrcdn",profileId:"profile",profileSlug:"dj",title:"DJ - VRDex",href:"/dj",sourceId:"Alpha",src:"/direct.mp4",transport:"video"};
  try {
    await owner.play(profile);
    const video = fixture.nodes[0];
    video.dispatchEvent(new Event("ended"));
    assert.equal(owner.getSnapshot().status,"unavailable");
    assert.equal(owner.getSnapshot().unavailableReason,"ended");
    await owner.play(profile);
    assert.equal(fixture.nodes.length,2);
    assert.equal(video.removed,true);
    assert.equal(owner.getSnapshot().status,"playing");
    assert.equal(owner.getSnapshot().unavailableReason,undefined);
  } finally {owner.close();fixture.restore();}
});


test("automatic community playback never opens a relay even when one is available", async () => {
  const { createRetainedPlaybackAdapter } = await import("../../apps/web/src/lib/event-playback-adapters");
  const previous = globalThis.document;
  Object.defineProperty(globalThis, "document", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  let calls = 0;
  const unexpected = async () => { calls++; throw Error("Unexpected relay request"); };
  const relay = { open: unexpected, get: unexpected, refresh: unexpected, restart: unexpected, release: unexpected };
  const local: PlaybackRequest = { kind: "performer_sequence", localOnly: true, eventId: "community", eventSlug: "community", title: "Community", href: "/community", event: { title: "Community", startAt: 0, slots: [] } };
  try {
    const adapter = createRetainedPlaybackAdapter(local, {} as HTMLElement, () => {}, { mode: "audio", relay });
    adapter.dispose();
    assert.equal(calls, 0);
  } finally { Object.defineProperty(globalThis, "document", { configurable: true, value: previous }); }
});


test("automatic saved audio creates neither a hidden-video session nor relay admission", async () => {
  const { createRetainedPlaybackAdapter } = await import("../../apps/web/src/lib/event-playback-adapters");
  const previous = globalThis.document;
  let subscriptions = 0, admissions = 0;
  Object.defineProperty(globalThis, "document", { configurable: true, value: { addEventListener() { subscriptions++; }, removeEventListener() {} } });
  const unexpected = async () => { admissions++; throw Error("Unexpected relay request"); };
  const relay = { open: unexpected, get: unexpected, refresh: unexpected, restart: unexpected, release: unexpected };
  const local: PlaybackRequest = { kind: "performer_sequence", localOnly: true, eventId: "community", eventSlug: "community", title: "Community", href: "/community", startAt: 0, event: { title: "Community", startAt: 0, slots: [] } };
  let adapter: ReturnType<typeof createRetainedPlaybackAdapter> | undefined;
  try {
    adapter = createRetainedPlaybackAdapter(local, {} as HTMLElement, () => {}, { mode: "audio", relay });
    assert.equal(subscriptions, 0, "unsupported saved audio must not initialize the legacy video session");
    assert.equal(await adapter.play(), false);
    assert.equal(admissions, 0);
  } finally { adapter?.dispose(); Object.defineProperty(globalThis, "document", { configurable: true, value: previous }); }
});

test("a direct startup/stall becomes retryable without discarding recovering media", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fixture = dom(); const owner = new EventPlaybackOwner((value, notify) => createEventPlaybackAdapter(value, fixture.mount, notify));
  try {
    await owner.play(request); const video = fixture.nodes[0];
    video.dispatchEvent(new Event("stalled"));
    t.mock.timers.tick(2000); video.currentTime = 2; video.dispatchEvent(new Event("timeupdate"));
    t.mock.timers.tick(20000); assert.equal(owner.getSnapshot().status, "playing", "buffered playback survives a network stall");
    video.dispatchEvent(new Event("waiting"));
    t.mock.timers.tick(14999); assert.equal(owner.getSnapshot().status, "playing");
    t.mock.timers.tick(1); assert.equal(owner.getSnapshot().status, "unavailable");
    assert.equal(video.removed, false);
    video.currentTime = 3; video.dispatchEvent(new Event("timeupdate")); assert.equal(owner.getSnapshot().status, "playing");
    assert.equal(fixture.nodes.length, 1, "decoded progress recovers the buffered connection without a retry");
    video.dispatchEvent(new Event("waiting")); t.mock.timers.tick(15000); video.pause();
    assert.equal(owner.getSnapshot().status, "paused", "native Pause remains available during a recoverable stall");
    await owner.play(request); assert.equal(fixture.nodes.length, 1);
    video.dispatchEvent(new Event("waiting")); owner.pause(); t.mock.timers.tick(20000);
    assert.equal(owner.getSnapshot().status, "paused");
    owner.close(); assert.equal(video.listeners, 0);
  } finally { owner.close(); fixture.restore(); }
});

test("a never-starting direct stream has a fifteen-second startup allowance", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fixture = dom();
  const pending = new Promise<void>(() => {});
  const owner = new EventPlaybackOwner((value, notify) => {
    const adapter = createEventPlaybackAdapter(value, fixture.mount, notify);
    fixture.nodes[0].play = () => pending;
    return adapter;
  });
  try {
    const start = owner.play(request);
    await Promise.resolve(); await Promise.resolve();
    t.mock.timers.tick(14999); assert.equal(owner.getSnapshot().status, "loading");
    t.mock.timers.tick(1); assert.equal(owner.getSnapshot().status, "unavailable");
    assert.equal(fixture.nodes[0].removed, false);
    void start;
  } finally { owner.close(); fixture.restore(); }
});

test("growing startup media extends the deadline, unchanged buffers do not", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fixture = dom();
  const owner = new EventPlaybackOwner((value, notify) => {
    const adapter = createEventPlaybackAdapter(value, fixture.mount, notify);
    fixture.nodes[0].play = () => new Promise<void>(() => {});
    return adapter;
  });
  try {
    void owner.play(request); await Promise.resolve(); await Promise.resolve();
    const video = fixture.nodes[0];
    t.mock.timers.tick(10000); video.bufferEnd = 1;
    t.mock.timers.tick(5000); assert.equal(owner.getSnapshot().status, "loading", "deadline samples growing MSE buffers without progress events");
    t.mock.timers.tick(5000);
    video.bufferEnd = 2; video.dispatchEvent(new Event("loadeddata"));
    t.mock.timers.tick(10000); video.dispatchEvent(new Event("progress"));
    t.mock.timers.tick(4999); assert.equal(owner.getSnapshot().status, "loading");
    t.mock.timers.tick(1); assert.equal(owner.getSnapshot().status, "unavailable");
    assert.equal(video.removed, false);
  } finally { owner.close(); fixture.restore(); }
});

test("recoverable buffering retains music ownership until another surface pauses it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator"), audioSession = { type: "auto" };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { audioSession } });
  const fixture = dom(), other = {};
  const owner = new EventPlaybackOwner((value, notify) => createEventPlaybackAdapter(value, fixture.mount, notify));
  try {
    await owner.play(request); const video = fixture.nodes[0];
    video.dispatchEvent(new Event("waiting")); t.mock.timers.tick(15000);
    assert.equal(owner.getSnapshot().status, "unavailable"); assert.equal(audioSession.type, "playback");
    foregroundPlayback.acquire(other, () => {});
    assert.equal(owner.getSnapshot().status, "paused"); assert.equal(video.paused, true);
    video.currentTime = 3; video.dispatchEvent(new Event("timeupdate"));
    assert.equal(owner.getSnapshot().status, "paused", "the old stalled stream cannot steal the new surface on progress");
  } finally { foregroundPlayback.release(other); owner.close(); fixture.restore(); if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); else Reflect.deleteProperty(globalThis, "navigator"); }
});

test("explicit retry rebuilds a starved unpaused direct stream immediately", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fixture = dom(); const owner = new EventPlaybackOwner((value, notify) => createEventPlaybackAdapter(value, fixture.mount, notify));
  try {
    await owner.play(request); const original = fixture.nodes[0];
    original.dispatchEvent(new Event("waiting")); t.mock.timers.tick(15000);
    original.play = async () => { original.paused = false; };
    await owner.play(request); assert.equal(fixture.nodes.length, 2); assert.equal(original.removed, true);
  } finally { owner.close(); fixture.restore(); }
});

test("hidden pages suppress direct stall deadlines and foreground gets a fresh full window", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fixture = dom(); const owner = new EventPlaybackOwner((value, notify) => createEventPlaybackAdapter(value, fixture.mount, notify));
  try {
    await owner.play(request); fixture.nodes[0].dispatchEvent(new Event("waiting"));
    t.mock.timers.tick(10000); fixture.visibility("hidden"); t.mock.timers.tick(20000);
    assert.equal(owner.getSnapshot().status, "playing");
    fixture.visibility("visible"); t.mock.timers.tick(14999); assert.equal(owner.getSnapshot().status, "playing");
    t.mock.timers.tick(1); assert.equal(owner.getSnapshot().status, "unavailable");
    owner.close(); assert.equal(fixture.documentListeners, 0);
  } finally { owner.close(); fixture.restore(); }
});

test("actual resumed profile playback clears an old ended reason", async () => {
  const fixture = dom();
  const profile: PlaybackRequest = { kind: "vrcdn", profileId: "p", profileSlug: "dj", title: "DJ", href: "/dj", sourceId: "AA", src: "url", transport: "video" };
  const owner = new EventPlaybackOwner((value, notify) => createEventPlaybackAdapter(value, fixture.mount, notify));
  try {
    await owner.play(profile); fixture.nodes[0].dispatchEvent(new Event("ended"));
    assert.equal(owner.getSnapshot().unavailableReason, "ended");
    await fixture.nodes[0].play();
    assert.equal(owner.getSnapshot().status, "playing"); assert.equal(owner.getSnapshot().unavailableReason, undefined);
  } finally { owner.close(); fixture.restore(); }
});
