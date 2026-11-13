import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesNativeTrial, NativeTrialRoutingSchema } from "../../apps/web/src/lib/native-trial-routing";
const request = { kind: "vrcdn", profileId: "profile", profileSlug: "dj", sourceId: "Alpha", src: "vrcdn:Alpha", transport: "mpegts", href: "/dj", title: "DJ" } as const;
const trial = NativeTrialRoutingSchema.parse({ trialId: "trial", context: { kind: "profile", profileId: "profile", linkId: "Alpha" }, streamId: "Alpha", expiresAt: 200, href: "/dj" });
test("local native trial opt-in matches only the pinned live source/context before expiry", () => {
  assert.equal(matchesNativeTrial(trial,request,100),true);
  assert.equal(matchesNativeTrial(trial,request,200),false);
  assert.equal(matchesNativeTrial(trial,request,NaN),false);
  assert.equal(matchesNativeTrial(trial,{...request,profileId:"other"},100),false);
  assert.equal(matchesNativeTrial(trial,{...request,sourceId:"Beta"},100),false);
  assert.equal(matchesNativeTrial(trial,{...request,transport:"video"},100),false);
  assert.equal(matchesNativeTrial(null,request,100),false);
});

import { createNativeTrialOptIn } from "../../apps/web/src/lib/native-trial-routing";
import { profilePlaybackRequest } from "../../apps/web/src/lib/event-playback-request";
test("canonical public provider MP4 profile requests remain eligible for the pinned native trial", () => {
  const projected = profilePlaybackRequest({ id: "profile", slug: "dj", displayName: "DJ", outboundLinks: [{ type: "vrcdn", url: "https://stream.vrcdn.live/live/Alpha.live.mp4" }] }, "Alpha");
  assert(projected); assert.equal(matchesNativeTrial(trial,projected,100),true);
  assert.equal(matchesNativeTrial(trial,{...request,transport:"video",src:"https://stream.vrcdn.live/recordings/Alpha.mp4"},100),false);
});
test("explicit trial admission waits for one eligibility read retained across navigation", async () => {
  let resolve!: (value: unknown) => void, loads = 0, completed = false;
  const future = { ...trial, expiresAt: Date.now() + 10000 };
  const optIn = createNativeTrialOptIn("trial","/dj",() => { loads++; return new Promise(done => {resolve=done;}); });
  const first = optIn.read().then(value => {completed=true; return value;});
  const second = optIn.read();
  await Promise.resolve(); assert.equal(completed,false); assert.equal(loads,1); assert.equal(optIn.current(),null);
  resolve(future); assert.deepEqual(await first, future); assert.deepEqual(await second,future);
  assert.equal(matchesNativeTrial(optIn.current(),request),true);
  assert.equal(matchesNativeTrial(optIn.current(),{...request,profileId:"other",href:"/other"}),false);
  assert.deepEqual(await optIn.read(),future); assert.equal(loads,1);
});

import { createDeferredTrialAdapter } from "../../apps/web/src/lib/native-trial-routing";
for (const choice of ["matching","other","unavailable"] as const) test(`deferred routing preserves ${choice} playback after eligibility resolves`,async()=>{
  let resolve!: (value: typeof trial|null)=>void, created = "", plays = 0;
  const pending = new Promise<typeof trial|null>(done=>{resolve=done;});
  const chosen = choice === "other" ? {...request,sourceId:"Beta"} : request;
  const adapter = createDeferredTrialAdapter({load:()=>pending,mode:"video",create:config=>{
    created = matchesNativeTrial(config,chosen,100) ? "native" : "ordinary";
    return {play:async()=>{plays++;return true;},pause(){},setVolume(){},setMuted(){},update(){},dispose(){}};
  }});
  const playing = adapter.play(); await Promise.resolve(); assert.equal(created,"");
  resolve(choice === "unavailable" ? null : trial);
  assert.equal(await playing,true); assert.equal(created,choice === "matching" ? "native":"ordinary");assert.equal(plays,1);adapter.dispose();
});
for(const action of ["pause","dispose"] as const) test(`${action} before eligibility cannot create or play a stale transport`,async()=>{
  let resolve!: (value:typeof trial)=>void,created=0;
  const pending=new Promise<typeof trial>(done=>{resolve=done;});
  const adapter=createDeferredTrialAdapter({load:()=>pending,mode:"video",create:()=>{created++;throw Error("Stale transport constructed");}});
  const playing=adapter.play();adapter[action]();resolve(trial);
  assert.equal(await playing,false);assert.equal(created,0);
});

test("deferred adapter preserves real admission errors for the owner recovery UI",async()=>{
  const adapter=createDeferredTrialAdapter({load:async()=>trial,mode:"video",create:()=>({play:async()=>{throw Error("admission failed");},pause(){},setVolume(){},setMuted(){},update(){},dispose(){}})});
  await assert.rejects(adapter.play(),/admission failed/);adapter.dispose();
});
