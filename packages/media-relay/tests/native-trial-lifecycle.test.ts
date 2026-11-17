import { request as requestHttp } from "node:http";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { test } from "node:test";
import { bootNativeTrial } from "../src/trial/entrypoint";

async function unusedPort() {
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const address = probe.address(); assert(address && typeof address !== "string");
  const port = address.port; await new Promise<void>(resolve => probe.close(() => resolve())); return port;
}
function fakeRuntime() {
  let stopped = 0;
  return { gateway: async () => new Response("ok"), stop: async () => { stopped++; },
    upstreamBytes: () => 0, retainedBytes: () => 0, acquisitions: () => 0, stopped: () => stopped };
}
test("absolute trial expiry stops the actual HTTP server and owned runtime once", async () => {
  const port = await unusedPort(), fake = fakeRuntime();
  const handle = await bootNativeTrial({ PORT: String(port), MEDIA_RELAY_TRIAL_CONFIG: JSON.stringify({ origin: `http://127.0.0.1:${port}`, expiresAt: Date.now() + 100 }) }, async () => fake);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), "ok");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(fake.stopped(), 1);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`));
  await handle.stop(); assert.equal(fake.stopped(), 1);
});
test("failed HTTP startup cleans the already started runtime", async () => {
  const occupied = createServer(); occupied.listen(0, "0.0.0.0"); await once(occupied, "listening");
  const address = occupied.address(); assert(address && typeof address !== "string");
  const fake = fakeRuntime();
  try {
    await assert.rejects(bootNativeTrial({ PORT: String(address.port), MEDIA_RELAY_TRIAL_CONFIG: JSON.stringify({ origin: "https://trial.invalid", expiresAt: Date.now() + 10000 }) }, async () => fake));
    assert.equal(fake.stopped(), 1);
  } finally { await new Promise<void>(resolve => occupied.close(() => resolve())); }
});


import { completeNativeTrialStop } from "../src/trial/runtime";
test("terminal acknowledgment waits for actual packager cleanup beyond registry stop", async () => {
  const order: string[] = []; let finish!: () => void;
  const physical = new Promise<void>(resolve => {finish=resolve;});
  const stopping = completeNativeTrialStop({ stopWorker: async () => {order.push("registry-stopped");},
    attempts: [Promise.resolve({stop:()=>physical})], acknowledge:async()=>{order.push("terminal-ack");},close:()=>{order.push("storage-closed");} });
  await new Promise(resolve=>setImmediate(resolve)); assert.deepEqual(order,["registry-stopped"]);
  finish(); await stopping; assert.deepEqual(order,["registry-stopped","terminal-ack","storage-closed"]);
});
test("failed physical cleanup cannot acknowledge terminal source ownership", async () => {
  let acknowledged = false;
  await assert.rejects(completeNativeTrialStop({stopWorker:async()=>{},attempts:[Promise.resolve({stop:async()=>{throw Error("cleanup failed");}})],acknowledge:async()=>{acknowledged=true;},close:()=>{}}));
  assert.equal(acknowledged,false);
});

test("failed setup has no acquired handle and still permits exact terminal acknowledgment",async()=>{
  const order:string[]=[];
  await completeNativeTrialStop({stopWorker:async()=>{},attempts:[Promise.reject(Error("setup rejected before acquisition"))],acknowledge:async()=>{order.push("ack");},close:()=>{order.push("close");}});
  assert.deepEqual(order,["ack","close"]);
});
test("failed terminal RPC still closes local storage and preserves the failure",async()=>{
  let closed=false;
  await assert.rejects(completeNativeTrialStop({stopWorker:async()=>{},attempts:[],acknowledge:async()=>{throw Error("control unavailable");},close:()=>{closed=true;}}),/control unavailable/);
  assert.equal(closed,true);
});

import { createNativeTrialGateway } from "../src/trial/gateway";
import { NativeTrialConfigSchema } from "../src/trial/policy";
test("malformed targets, unsupported methods and overlong URLs debit the real HTTP cap without crashing",async()=>{
  const port=await unusedPort(),now=Date.now();let authority=0,exhausted=0;
  const config=NativeTrialConfigSchema.parse({version:1,trialId:"trial",operatorUserId:"operator",source:{streamKey:"vrcdn/Alpha/1",streamId:"Alpha",inputFormat:"vrcdn_fmp4",packagingVersion:1},context:{kind:"profile",profileId:"profile",linkId:"Alpha"},origin:"https://trial.invalid",origins:["https://app.invalid"],startsAt:now-1,expiresAt:now+10000,limits:{upstreamBytes:1024,payloadBytes:1024,requests:3,retainedBytes:1024},worker:{workerId:"worker",workerEpoch:1,allocation:{cpuUnits:1024,memoryMiB:2048,evidenceId:"trial-proof"},maxSources:1,draining:false}});
  const gateway=createNativeTrialGateway({config,clock:Date.now,authorize:async()=>{authority++;return{kind:"denied"};},readSnapshot:()=>undefined,readSegment:()=>undefined,recordDemand:async()=>{},onExhausted:()=>{exhausted++;}});
  const fake=fakeRuntime();
  const handle=await bootNativeTrial({PORT:String(port),MEDIA_RELAY_TRIAL_CONFIG:JSON.stringify(config)},async()=>({...fake,gateway}));
  try{
    const malformed=await new Promise<number>((resolve,reject)=>{
      const request=requestHttp({hostname:"127.0.0.1",port,path:"*%",method:"GET"},response=>{response.resume();response.once("end",()=>resolve(response.statusCode??0));});
      request.once("error",reject);request.end();
    });
    assert.equal(malformed,400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/p/grant/audio/index.m3u8`,{method:"POST"})).status,400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/${"x".repeat(2049)}`)).status,400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/p/grant/audio/index.m3u8`)).status,429);
    assert.equal(authority,0);assert.equal(exhausted,1);
  }finally{await handle.stop();}
});
