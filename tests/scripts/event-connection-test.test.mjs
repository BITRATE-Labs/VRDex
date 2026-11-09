import assert from 'node:assert/strict';
import { it } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { markerBits, matchingMarker, decodeMarkerFrame, decodeConnectionTest, connectionTestEncoderArguments } from '../../workers/restream/connection-test.mjs';
const marker='0123456789abcdef0123456789abcdef';
const pixels=id=>Buffer.from(markerBits(id).flatMap(bit=>[bit?240:16,bit?240:16,bit?240:16]));
it('decoded pixels must match the exact random test identity, including after lossy intensity change',()=>{assert.equal(matchingMarker(pixels(marker),marker),true);assert.equal(matchingMarker(pixels(marker),'11111111111111111111111111111111'),false);assert.equal(matchingMarker(Buffer.from('socket connected'),marker),false);assert.equal(matchingMarker(Buffer.alloc(192,128),marker),false);});
it('readback does not pass on a response, partial frame, wrong identity or decoder failure',async()=>{
 const launch=(frame,code=0)=>(()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.kill=()=>child.emit('exit',1);queueMicrotask(()=>{child.stdout.end(frame);child.emit('exit',code);});return child;});
 for(const [frame,code,expected] of [[pixels(marker),0,true],[pixels(marker).subarray(0,191),0,false],[pixels(marker),1,false],[pixels('11111111111111111111111111111111'),0,false]])assert.equal(await decodeMarkerFrame({input:'synthetic-only',marker,launch:launch(frame,code)}),expected);
});
it('deadline kills a stalled decoder and leaves no timer alive',async()=>{let killed=false;const launch=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.kill=()=>{killed=true;child.emit('exit',1);};return child;};assert.equal(await decodeMarkerFrame({input:'synthetic-only',marker,timeoutMs:5,launch}),false);assert.equal(killed,true);});
it('test encoder is bounded and embeds the marker into encoded video',()=>{const args=connectionTestEncoderArguments({marker,mediaSettings:{videoPreset:'720p30',audioBitrateKbps:160}});assert.equal(args[args.indexOf('-t')+1],'60');assert.match(args[args.indexOf('-vf')+1],/drawbox/);assert.equal(args.at(-1),'pipe:1');});
it('production readback rejects local or credential-bearing endpoints before launching',async()=>{for(const url of ['http://127.0.0.1/a','https://user:password@example.com/a','https://10.0.0.1/a'])await assert.rejects(decodeConnectionTest({url,marker}),/Invalid test playback URL/);});
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
it('real FFmpeg encodes a synthetic test screen then decodes the matching visual identity',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vrdex-connection-test-'));
 try {
  const path=join(directory,'test.ts');const args=connectionTestEncoderArguments({marker,mediaSettings:{videoPreset:'480p30',audioBitrateKbps:160}}).filter(arg=>arg!=='-re');
  args[args.indexOf('-t')+1]='1';args[args.indexOf('-progress')+1]='pipe:2';args[args.length-1]=path;
  const encoded=spawnSync('ffmpeg',args,{timeout:15000,encoding:'utf8'});assert.equal(encoded.status,0,encoded.stderr);
  assert.equal(await decodeMarkerFrame({input:path,marker}),true);
  assert.equal(await decodeMarkerFrame({input:path,marker:'11111111111111111111111111111111'}),false);
  const resized=join(directory,'resized.ts');const scaled=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',path,'-vf','scale=640:360','-c:v','libx264','-an',resized],{timeout:15000,encoding:'utf8'});assert.equal(scaled.status,0,scaled.stderr);
  assert.equal(await decodeMarkerFrame({input:resized,marker,encodedSize:{width:854,height:480}}),true);
 }finally{await rm(directory,{recursive:true,force:true});}
});
import { createEventWorker } from '../../workers/restream/event-worker.mjs';
it('ordinary leased worker routes test publication through outputs and reports only matching decoded proof',async()=>{
 const now=Date.now(),calls=[];let fenced=false,renderOptions;
 const config={connectionTest:{jobId:'job',revision:1,marker,deadlineAt:now+60000},outputId:'output',outputs:[{id:'output',playbackLinks:[{platform:'browser',url:'https://stream.vrcdn.live/live/fixture.live.ts'}]}],mediaSettings:{videoPreset:'480p30',audioBitrateKbps:160},sessionDeadline:now+60000,policy:{},slots:[],sources:[],scenes:[]};
 const renderer={subscribe:()=>()=>{},start:async()=>{},stop:async()=>{},getState:()=>({running:true,outputMs:1000})};
 const worker=createEventWorker({identity:{eventId:'event',sessionId:'session',workerId:'worker',epoch:0},clock:()=>0,checkEnabled:async()=>true,inputs:{stop:async()=>{}},createRenderer:options=>{renderOptions=options;return renderer;},createOutputs:async()=>({start:async()=>{},enqueue:()=>{},stopNow:()=>{fenced=true;},stop:async()=>{},getState:()=>({publishing:true,destinations:[{outputId:'output',status:'publishing'}]})}),readConnectionTest:async request=>{assert.equal(request.marker,marker);return true;},control:async(name,args)=>{calls.push({name,args});if(name==='acquireSession')return {granted:true,epoch:1,serverNow:now,expiresAt:now+10000,renewAfterMs:5000,configuration:config};if(name==='refreshConfiguration')return {granted:true,serverNow:now,configuration:config};return {accepted:true};}});
 await worker.start();assert.equal(renderOptions.connectionTest.marker,marker);await worker.tick();await new Promise(resolve=>setImmediate(resolve));assert.equal(fenced,true);assert.equal(worker.getState().stopped,true);assert.equal(calls.find(call=>call.name==='recordConnectionTestProof')?.args.jobId,'job');assert.equal(calls.some(call=>call.name==='claimCommands'),false);await worker.stop();
});
it('canonical Twitch channel readback uses existing bounded acquisition and disposes after decoded proof',async()=>{
 let acquired,disposed=0,decoderArgs;
 const launch=(_command,args)=>{decoderArgs=args;const child=new EventEmitter();child.stdout=new PassThrough();child.kill=()=>child.emit('exit',1);queueMicrotask(()=>{child.stdout.end(pixels(marker));child.emit('exit',0);});return child;};
 const before=Date.now();const passed=await decodeConnectionTest({url:'https://www.twitch.tv/Fixture_DJ/',marker,mediaSettings:{videoPreset:'720p30',audioBitrateKbps:320},timeoutMs:1000,launch,acquireTwitch:options=>{acquired=options;return {transportReady:Promise.resolve({url:'http://127.0.0.1:1234/opaque'}),dispose:async()=>{disposed++;}};},createRelay:()=>{throw Error('Direct relay must not acquire Twitch');}});
 assert.equal(passed,true);assert.deepEqual(acquired.source,{kind:'twitch',channel:'fixture_dj'});assert.equal(acquired.settings.audioBitrateKbps,320);assert.ok(acquired.preparationExpiresAt<=before+1000);assert.equal(acquired.sessionExpiresAt,acquired.preparationExpiresAt);assert.ok(acquired.signal instanceof AbortSignal);assert.equal(disposed,1);assert.equal(decoderArgs[decoderArgs.indexOf('-f')+1],'mpegts');assert.equal(decoderArgs[decoderArgs.indexOf('-protocol_whitelist')+1],'http,tcp,crypto');
});
it('failed Twitch preparation awaits disposal and never falls back to a direct URL',async()=>{
 let disposed=false,launched=false;
 await assert.rejects(decodeConnectionTest({url:'https://twitch.tv/fixture_dj',marker,timeoutMs:500,launch:()=>{launched=true;},acquireTwitch:()=>({transportReady:Promise.reject(Error('provider unavailable')),dispose:async()=>{await new Promise(resolve=>setImmediate(resolve));disposed=true;}}),createRelay:()=>{throw Error('Unexpected fallback');}}),/provider unavailable/);
 assert.equal(disposed,true);assert.equal(launched,false);
});
it('reserved Twitch pages, video paths and query strings never acquire a channel',async()=>{
 for(const path of ['directory','fixture_dj/videos','fixture_dj?filter=clips'])await assert.rejects(decodeConnectionTest({url:`https://twitch.tv/${path}`,marker,acquireTwitch:()=>{throw Error('Acquisition should not run');}}),/Invalid Twitch channel/);
});
