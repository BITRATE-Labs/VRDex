import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
const runtimeModule=path=>process.env.CAPTURED_TRANSPORT_RUNTIME_ROOT?pathToFileURL(join(process.env.CAPTURED_TRANSPORT_RUNTIME_ROOT,path)).href:new URL('../../'+path,import.meta.url).href;
const { parseCapturedRtmp, parseCapturedAacConfig, inspectCapturedTransportClock, startCapturedTransportDecode, isCapturedTransportClock, capturedTransportProjection } = await import(runtimeModule('scripts/event-captured-transport.mjs'));
const handshake=()=>{const b=Buffer.alloc(3073);b[0]=3;return b;};
function message(type,payload,timestamp=0){const b=Buffer.alloc(12);b[0]=3;b.writeUIntBE(timestamp,1,3);b.writeUIntBE(payload.length,4,3);b[7]=type;b.writeUInt32LE(1,8);return Buffer.concat([b,payload]);}
test('parses complete bounded RTMP message preserving payload and stamp',()=>{const raw=Buffer.concat([handshake(),message(8,Buffer.from([175,0,17,144]),42)]);const rows=parseCapturedRtmp(raw);assert.equal(rows.length,1);assert.equal(rows[0].timestamp,42);assert.deepEqual(rows[0].payload,Buffer.from([175,0,17,144]));});
test('truncated message and continuation without predecessor reject',()=>{const raw=Buffer.concat([handshake(),message(8,Buffer.from([175,0,17,144]))]);assert.throws(()=>parseCapturedRtmp(raw.subarray(0,-1)),/transport/);assert.throws(()=>parseCapturedRtmp(Buffer.concat([handshake(),Buffer.from([195])])),/transport/);});
test('AAC config accepts only AAC-LC 48000 stereo 1024',()=>{assert.deepEqual(parseCapturedAacConfig(Buffer.from([17,144])),{objectType:2,sampleRate:48000,channels:2,samplesPerUnit:1024});for(const b of [[17,148],[17,136],[18,16],[41,144],[17,144,0]])assert.throws(()=>parseCapturedAacConfig(Buffer.from(b)),/transport/);});
test('128-byte capture and fabricated producer never issue membership',async()=>{const fake=Object.freeze({proxyUrl:'rtmp://127.0.0.1:1/live',capture:Buffer.alloc(128)});assert.equal(isCapturedTransportClock(fake),false);await assert.rejects(inspectCapturedTransportClock(fake,{}),/transport/);assert.throws(()=>startCapturedTransportDecode(fake,{file:'/tmp/x',original:[],stdio:[]}),/transport/);assert.throws(()=>capturedTransportProjection(fake),/transport/);});
test('AAC-LC sync extension explicitly disables SBR in actual FFmpeg capture',()=>{assert.equal(parseCapturedAacConfig(Buffer.from('119056e500','hex')).samplesPerUnit,1024);assert.throws(()=>parseCapturedAacConfig(Buffer.from('119056e580','hex')),/transport/);});
const { inspectCapturedTransportBytes, parseCapturedTs, CAPTURED_TRANSPORT_LIMITS } = await import(runtimeModule('scripts/event-captured-transport.mjs'));
function crc(b){let v=0xffffffff;for(const x of b){v^=x<<24;for(let i=0;i<8;i++)v=v&0x80000000?(v<<1)^0x04c11db7:v<<1;}return v>>>0;}
function table(hex){const b=Buffer.from(hex,'hex'),tail=Buffer.alloc(4);tail.writeUInt32BE(crc(b));return Buffer.concat([b,tail]);}
function packet(pid,payload,cc=0,psi=false){const p=Buffer.alloc(188,255);p[0]=71;p[1]=64+(pid>>8);p[2]=pid&255;if(psi){p[3]=16+cc;p[4]=0;payload.copy(p,5);}else{p[3]=48+cc;p[4]=183-payload.length;if(p[4])p[5]=0;payload.copy(p,5+p[4]);}return p;}
function pts(n){const v=BigInt(n);return Buffer.from([0x21+Number((v>>29n)&14n),Number(v>>22n&255n),Number(v>>14n&254n)+1,Number(v>>7n&255n),Number(v<<1n&254n)+1]);}
function pes(pid,stream,stamp,payload,cc=0){const b=Buffer.alloc(9);b[2]=1;b[3]=stream;b.writeUInt16BE(payload.length+8,4);b[6]=128;b[7]=128;b[8]=5;return packet(pid,Buffer.concat([b,pts(stamp),payload]),cc);}
const avcc=Buffer.from('0164001fffe100226764001facb402802dd080000003008000001e70300036ee8001b777351003c60ca801000468ef3cb0fdf8f800','hex');
function fixture({audioTimes=[0,21,42,64],videoTimes=[54,87,121],change=()=>{}}={}){
 const sps=avcc.subarray(8,42),pps=avcc.subarray(45,49),nal=Buffer.from([101,136,132]),n=Buffer.alloc(4);n.writeUInt32BE(nal.length);
 const messages=[message(8,Buffer.from([175,0,17,144])),message(9,Buffer.concat([Buffer.from([23,0,0,0,0]),avcc]))];
 const frames=audioTimes.map((t,i)=>{const payload=Buffer.from([1,2,3,i]);messages.push(message(8,Buffer.concat([Buffer.from([175,1]),payload]),t));const adts=Buffer.from([255,241,76,128,1,127,252]);adts[3]|=(payload.length+7)>>11;adts[4]=(payload.length+7)>>3;adts[5]=((payload.length+7)&7)*32+31;return Buffer.concat([adts,payload]);});
 const packets=[packet(0,table('00b00d0001c100000001f000'),0,true),packet(4096,table('02b0170001c10000e100f0001be100f0000fe101f000'),0,true),pes(257,192,126000,Buffer.concat(frames))];
 videoTimes.forEach((t,i)=>{messages.push(message(9,Buffer.concat([Buffer.from([23,1,0,0,0]),n,nal]),t));packets.push(pes(256,224,126000+t*90,Buffer.concat([Buffer.from([0,0,0,1]),sps,Buffer.from([0,0,0,1]),pps,Buffer.from([0,0,1]),nal]),i));});
 const parts={client:Buffer.concat([handshake(),...messages]),server:handshake(),recording:Buffer.concat(packets)};change(parts);return parts;
}
const inspect=f=>inspectCapturedTransportBytes(f.client,f.server,f.recording,{fps:30});
test('complete observed audio and video population joins without minting a clock',()=>{const r=inspect(fixture());assert.equal(r.audioUnits,4);assert.equal(r.frames,3);assert.equal(r.muxOffset,126000);assert.equal(isCapturedTransportClock(r),false);assert.throws(()=>capturedTransportProjection(r),/unproven/);});
test('TS transport packet truncation, continuity and parameter-set mutations reject',()=>{const f=fixture();assert.throws(()=>parseCapturedTs(f.recording.subarray(0,-1)),/ts_bound/);const repeated=Buffer.concat([f.recording.subarray(0,188),f.recording]);assert.throws(()=>parseCapturedTs(repeated),/ts_continuity/);const changed=fixture();changed.recording[changed.recording.length-5]^=1;assert.throws(()=>inspect(changed),/video/);});
test('one-tick unexplained video timestamp change rejects',()=>{const f=fixture();const p=188*3;const payload=p+5+f.recording[p+4];f.recording[payload+13]^=2;assert.throws(()=>inspect(f),/video_timestamp/);});
test('missing final complete media unit fails complete population join',()=>{const f=fixture();f.recording=f.recording.subarray(0,-188);assert.throws(()=>inspect(f),/population/);});
test('duplicated audio tag and same-payload wrong stamp reject',()=>{assert.throws(()=>inspect(fixture({audioTimes:[0,21,21,64]})),/tag_order/);assert.throws(()=>inspect(fixture({audioTimes:[0,21,43,100]})),/origin_domain/);});
test('config replacement, AAC payload mutation and video CTS reject',()=>{for(const kind of ['config','aac','cts']){const f=fixture();const rows=parseCapturedRtmp(f.client);if(kind==='config')rows[0].payload[3]^=8;if(kind==='aac')rows.find(x=>x.type===8&&x.payload[1]===1).payload[2]^=1;if(kind==='cts')rows.find(x=>x.type===9&&x.payload[1]===1).payload[4]=1;f.client=Buffer.concat([handshake(),...rows.map(x=>message(x.type,x.payload,x.timestamp))]);assert.throws(()=>inspect(f),/config|payload|cts/);}});
test('RTMP changed chunk sizes and matching extended timestamp continuations are checked',()=>{const size=message(1,Buffer.from([0,0,0,2]));const h=Buffer.alloc(16);h[0]=3;h.fill(255,1,4);h.writeUIntBE(4,4,3);h[7]=8;h.writeUInt32LE(1,8);h.writeUInt32BE(0x1000000,12);const ext=Buffer.alloc(4);ext.writeUInt32BE(0x1000000);const raw=Buffer.concat([handshake(),size,h,Buffer.from([1,2,195]),ext,Buffer.from([3,4])]);assert.equal(parseCapturedRtmp(raw)[1].timestamp,0x1000000);raw[raw.length-3]^=1;assert.throws(()=>parseCapturedRtmp(raw),/extended_stamp/);});
test('unsupported ADC CRC or multiblock and malformed TS table CRC reject',()=>{for(const where of ['crc','adts']){const f=fixture();if(where==='crc')f.recording[10]^=1;else{const p=188*2,at=p+5+f.recording[p+4]+14;f.recording[at+6]|=1;}assert.throws(()=>inspect(f),/psi_crc|adts_config/);}});
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { startCapturedRtmpReceiver, assertCapturedAudioClock, assertCapturedVideoClock } = await import(runtimeModule('scripts/event-captured-transport.mjs'));
const { programDecodeArguments } = await import(runtimeModule('scripts/event-marker-program-guards.mjs'));
const { parseMarkerMetadata } = await import(runtimeModule('scripts/event-marker-metadata.mjs'));
const { resolveDestinationProfile } = await import(runtimeModule('workers/restream/broadcast-profiles.mjs'));
// Positive provenance cases need a physically complete RTMP session before any
// mutation is tested. Finite FFmpeg EOF can race the receiver's final deleteStream
// reply, so use the actual production sender stop fence with ongoing media.
async function startOwnedFixture(directory,{quiet=false,minimumOutputMs=5000,durationSeconds=6}={}){
 const {createProcessOwner}=await import(runtimeModule('scripts/event-proof-processes.mjs'));const owner=createProcessOwner();
 let producer,source,sender,senderClosed,sourceEnded=false,unsubscribed=false;const signals=[],sourceDiagnostics=[],senderDiagnostics=[],spawns=[];let sourceDiagnosticBytes=0,senderDiagnosticBytes=0;
 const close=async()=>{sender?.stopNow();if(source?.exitCode===null)source.kill('SIGKILL');try{await producer?.close();}finally{const cleanup=await owner.close();await writeFile(join(directory,'fixture-cleanup.json'),JSON.stringify(cleanup,null,2)+'\n');}};
 try{
  producer=await startCapturedRtmpReceiver({directory,receiverPort:19743,settings:{videoPreset:'720p30',audioBitrateKbps:320},durationSeconds});
  const sourceArgs=['-hide_banner','-v','error','-re','-f','lavfi','-i',quiet?'color=c=gray:s=1280x720:r=30':'testsrc2=s=1280x720:r=30','-f','lavfi','-i',quiet?'anullsrc=r=48000:cl=stereo':'sine=frequency=440:sample_rate=48000','-c:v','libx264','-threads','2','-preset','ultrafast','-bf','0','-g','30','-c:a','aac','-ac','2','-b:a','320k','-f','mpegts','pipe:1'];
  source=owner.start('ffmpeg',sourceArgs,{stdio:['ignore','pipe','pipe']});source.stdout.once('end',()=>{sourceEnded=true;});source.stderr.on('data',b=>{sourceDiagnosticBytes+=b.length;if(sourceDiagnosticBytes>65536)source.kill('SIGKILL');else sourceDiagnostics.push(Buffer.from(b));});
  const {createOutputSender}=await import(runtimeModule('workers/restream/output-sender.mjs'));
  sender=createOutputSender({destination:'twitch',profile:resolveDestinationProfile({settings:{videoPreset:'720p30',audioBitrateKbps:320},destination:'twitch'}),credentialRef:'synthetic',resolveCredential:()=>JSON.stringify({rtmpUrl:'rtmp://live.twitch.tv/app',streamKey:'test-key'}),program:{subscribe(fn){source.stdout.on('data',fn);return()=>{unsubscribed=true;source.stdout.off('data',fn);};}},spawnProcess:(command,args,options)=>{const local=[...args];local[local.length-1]=producer.proxyUrl+'/test-key';spawns.push({command,canonicalArgs:args,localArgs:local});const child=owner.start(command,local,options),kill=child.kill.bind(child);child.kill=signal=>{signals.push(signal);return kill(signal);};senderClosed=new Promise(yes=>child.once('close',(code,signal)=>yes({code,signal})));child.stderr.on('data',b=>{senderDiagnosticBytes+=b.length;if(senderDiagnosticBytes>65536)sender.stopNow();else senderDiagnostics.push(Buffer.from(b));});return child;}});
  await sender.start();const deadline=Date.now()+15000;
  while(!(sender.getState().publishing&&sender.getState().outputMs>=minimumOutputMs)){assert(Date.now()<deadline,'Fixture sender did not publish within bound');assert.equal(sender.getState().restarts,0);assert(sourceDiagnosticBytes<=65536&&senderDiagnosticBytes<=65536);await sleep(20);}
  assert.equal(sourceEnded,false,'Fixture Stop must precede upstream EOF');const publishing=sender.getState();sender.stopNow();assert.equal(unsubscribed,true);assert.equal(sender.getState().status,'stopped');assert.equal(sender.getState().publishing,false);sender.enqueue(Buffer.alloc(188));const exit=await senderClosed;assert.equal(exit.signal,'SIGKILL');assert.deepEqual(signals,['SIGKILL']);source.kill('SIGKILL');await source.closed;
  await producer.drain();const bytes=(await readFile(producer.filenames.client)).length;sender.enqueue(Buffer.alloc(188));await sleep(25);assert.equal((await readFile(producer.filenames.client)).length,bytes);
  await writeFile(join(directory,'fixture-source.stderr'),Buffer.concat(sourceDiagnostics));await writeFile(join(directory,'fixture-sender.stderr'),Buffer.concat(senderDiagnostics));await writeFile(join(directory,'fixture-stop.json'),JSON.stringify({sourceArgs,spawns,publishing,sourceEndedAtStop:false,unsubscribed,exit,signals},null,2)+'\n');
  return {producer,close};
 }catch(error){let cleanupError;try{await close();}catch(failure){cleanupError=failure.message;}await writeFile(join(directory,'fixture-source.stderr'),Buffer.concat(sourceDiagnostics));await writeFile(join(directory,'fixture-sender.stderr'),Buffer.concat(senderDiagnostics));await writeFile(join(directory,'fixture-failure.json'),JSON.stringify({error:error.message,cleanupError,signals,sourceEnded,spawns},null,2)+'\n');if(cleanupError)throw new AggregateError([error,Error(cleanupError)],'Fixture and cleanup failed');throw error;}
}

test('real owned capture/decode binds native bytes and rejects every cross-binding mutation',{skip:process.env.CAPTURED_TRANSPORT_NATIVE!=='1',timeout:60000},async()=>{
 const directory=process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT?join(process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT,'owned-capture'):await mkdtemp(join(tmpdir(),'captured-transport-'));
 if(process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT)await mkdir(directory);
 let producer,fixture;
 try{
  fixture=await startOwnedFixture(directory);producer=fixture.producer;
  const file=producer.filenames.recording,original=programDecodeArguments(file,{width:1280,height:720}),stdio=['ignore','ignore','pipe','pipe','pipe','pipe','pipe'];
  assert.throws(()=>startCapturedTransportDecode({...producer},{file,original,stdio}),/unproven/);
  assert.throws(()=>startCapturedTransportDecode(producer,{file,original:[...original,'-shortest'],stdio}),/recipe/);
  const decoder=startCapturedTransportDecode(producer,{file,original,stdio}),parts={};for(const fd of [3,4,5,6]){parts[fd]=[];decoder.child.stdio[fd].on('data',b=>parts[fd].push(b));}
  const nativeCapture=await decoder.finish(),audioRows=parseMarkerMetadata(Buffer.concat(parts[6]).toString(),'audio'),videoRows=parseMarkerMetadata(Buffer.concat(parts[5]).toString(),'video'),rgb=Buffer.concat(parts[3]),audioChunks=parts[4],capture={nativeCapture,audioRows,videoRows,rgb,audioChunks};
  const clock=await inspectCapturedTransportClock(producer,capture);const {assertProgramClock}=await import(runtimeModule('scripts/event-marker-clock.mjs'));assert.throws(()=>assertProgramClock(clock),/marker_clock_unproven/);assert.equal(isCapturedTransportClock(clock),true);assert.equal(isCapturedTransportClock({...clock}),false);
  const projection=capturedTransportProjection(clock);assert.equal(projection.samples,audioRows.length*1024);assert.equal(projection.frames,videoRows.length);assert(projection.evidence.sha256&&projection.decoderEvidence.sha256);
  assertCapturedAudioClock(clock,audioChunks,audioRows);assertCapturedVideoClock(clock,rgb,videoRows);
  const badRgb=Buffer.from(rgb);badRgb[0]^=1;assert.throws(()=>assertCapturedVideoClock(clock,badRgb,videoRows),/binding/);
  const badAudio=[Buffer.concat(audioChunks)];badAudio[0][0]^=1;assert.throws(()=>assertCapturedAudioClock(clock,badAudio,audioRows),/binding/);
  const badRows=structuredClone(audioRows);badRows[1].pts++;assert.throws(()=>assertCapturedAudioClock(clock,audioChunks,badRows),/binding/);await assert.rejects(inspectCapturedTransportClock(producer,capture),/clock_consumed/);
  await assert.rejects(inspectCapturedTransportClock(producer,{...capture,nativeCapture:{...nativeCapture}}),/clock_consumed/);
  const recorded=await readFile(file);try{await writeFile(file,Buffer.alloc(188));await assert.rejects(inspectCapturedTransportClock(producer,capture),/clock_consumed/);}finally{await writeFile(file,recorded);}
 }finally{await fixture?.close();if(!process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT)await rm(directory,{recursive:true,force:true});}
});

test('format-3 new message after format-0 inherits the header timestamp delta',()=>{const raw=Buffer.concat([handshake(),message(8,Buffer.from([1]),42),Buffer.from([195,2])]);assert.deepEqual(parseCapturedRtmp(raw).map(x=>x.timestamp),[42,84]);});

async function negativeOwnedCapture(mode){
 const base=process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT,directory=base?join(base,'negative-'+mode):await mkdtemp(join(tmpdir(),'captured-negative-'));
 if(base)await mkdir(directory);
 let producer,fixture;
 try{
  fixture=await startOwnedFixture(directory,{minimumOutputMs:2500});producer=fixture.producer;
  const file=producer.filenames.recording,decoder=startCapturedTransportDecode(producer,{file,original:programDecodeArguments(file,{width:1280,height:720}),stdio:['ignore','ignore','pipe','pipe','pipe','pipe','pipe']}),parts={};for(const fd of [3,4,5,6]){parts[fd]=[];decoder.child.stdio[fd].on('data',b=>parts[fd].push(b));}
  const nativeCapture=await decoder.finish(),capture={nativeCapture,audioChunks:parts[4],rgb:Buffer.concat(parts[3]),audioRows:parseMarkerMetadata(Buffer.concat(parts[6]).toString(),'audio'),videoRows:parseMarkerMetadata(Buffer.concat(parts[5]).toString(),'video')};
  assert(Object.isFrozen(nativeCapture)&&Object.isFrozen(nativeCapture.channels[4]));
  let expected,restore;
  if(mode==='native'){capture.nativeCapture={...nativeCapture};expected=/native_binding/;}
  if(mode==='rows'){capture.audioRows[0].pts++;expected=/row_binding/;}
  if(mode==='file'){const original=await readFile(file);await writeFile(file,Buffer.alloc(188));restore=()=>writeFile(file,original);expected=/capture_mutation/;}
  try{await assert.rejects(inspectCapturedTransportClock(producer,capture),expected);}finally{await restore?.();}
  await assert.rejects(inspectCapturedTransportClock(producer,capture),/clock_consumed/);
 }finally{await fixture?.close();if(!base)await rm(directory,{recursive:true,force:true});}
}
for(const mode of ['native','rows','file'])test('owned factory rejects '+mode+' forgery before issuance and never reopens',{skip:process.env.CAPTURED_TRANSPORT_NATIVE!=='1',timeout:30000},()=>negativeOwnedCapture(mode));

const { decodeCapturedTransportMarkerRecord } = await import(runtimeModule('scripts/event-captured-capacity-media.mjs'));
const { transportProjectionFromWire } = await import(runtimeModule('scripts/event-marker-transport-wire.mjs'));
test('common captured marker decoder closes a real quiet segment',{skip:process.env.CAPTURED_TRANSPORT_NATIVE!=='1',timeout:40000},async()=>{
 const base=process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT,directory=base?join(base,'common-core'):await mkdtemp(join(tmpdir(),'captured-core-'));if(base)await mkdir(directory);let producer,fixture;
 const {createProcessOwner}=await import(runtimeModule('scripts/event-proof-processes.mjs'));const owner=createProcessOwner();
 try{
  fixture=await startOwnedFixture(directory,{quiet:true,minimumOutputMs:7500});producer=fixture.producer;
  const decoded=await decodeCapturedTransportMarkerRecord(owner,producer.filenames.recording,{transportCapture:producer,width:1280,height:720,maxSeconds:10});
  assert.equal(decoded.recordingSha256,producer.evidence().bindings.recording.sha256);assert.equal(decoded.episodes.length,0);assert.equal(decoded.visuals.length,0);assert(decoded.audioMetadataRows>200&&decoded.videoFrames>170);
  const wire=decoded.transportClock;assert(wire,'captured semantic wire must survive common core');transportProjectionFromWire(wire,decoded);
  await writeFile(join(directory,'common-core-summary.json'),JSON.stringify({recordingSha256:decoded.recordingSha256,audioRows:decoded.audioMetadataRows,videoFrames:decoded.videoFrames,transportClock:wire},null,2)+'\n');
 }finally{await fixture?.close();await owner.close();if(!base)await rm(directory,{recursive:true,force:true});}
});
const {createOutputSender}=await import(runtimeModule('workers/restream/output-sender.mjs'));
test('canonical sender stopNow SIGKILL fence permits complete owned capture drain',{skip:process.env.CAPTURED_TRANSPORT_NATIVE!=='1',timeout:40000},async()=>{
 const base=process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT,directory=base?join(base,'production-stop'):await mkdtemp(join(tmpdir(),'captured-stop-'));if(base)await mkdir(directory);
 const {createProcessOwner}=await import(runtimeModule('scripts/event-proof-processes.mjs'));const owner=createProcessOwner();let capture,sender,source,senderProcess,senderClosed;const signals=[],health=[];let sourceEnded=false,unsubscribed=false;
 try{
  capture=await startCapturedRtmpReceiver({directory,receiverPort:19743,settings:{videoPreset:'720p30',audioBitrateKbps:320},durationSeconds:12});
  source=owner.start('ffmpeg',['-hide_banner','-v','error','-re','-f','lavfi','-i','color=c=gray:s=1280x720:r=30','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-c:v','libx264','-threads','2','-preset','ultrafast','-bf','0','-g','30','-c:a','aac','-ac','2','-b:a','320k','-f','mpegts','pipe:1'],{stdio:['ignore','pipe','pipe']});source.stderr.resume();source.stdout.once('end',()=>{sourceEnded=true;});
  sender=createOutputSender({destination:'twitch',profile:resolveDestinationProfile({settings:{videoPreset:'720p30',audioBitrateKbps:320},destination:'twitch'}),credentialRef:'synthetic',resolveCredential:()=>JSON.stringify({rtmpUrl:'rtmp://live.twitch.tv/app',streamKey:'test-key'}),program:{subscribe(fn){source.stdout.on('data',fn);return()=>{unsubscribed=true;source.stdout.off('data',fn);};}},onHealth:state=>health.push({...state}),spawnProcess:(command,args,options)=>{const local=[...args];local[local.length-1]=capture.proxyUrl+'/test-key';const child=owner.start(command,local,options);senderProcess=child;const kill=child.kill.bind(child);child.kill=signal=>{signals.push(signal);return kill(signal);};senderClosed=new Promise(yes=>child.once('close',(code,signal)=>yes({code,signal})));return child;}});
  await sender.start();const deadline=Date.now()+15000;
  while(!(sender.getState().publishing&&sender.getState().outputMs>=5000)){assert(Date.now()<deadline,'Canonical sender did not publish within bound');assert.equal(sender.getState().restarts,0);await sleep(20);}
  const publishing=sender.getState();assert.equal(sourceEnded,false,'Stop must occur with ongoing upstream input, not finite EOF');sender.stopNow();assert.equal(sender.getState().status,'stopped');assert.equal(sender.getState().publishing,false);assert.equal(unsubscribed,true);sender.enqueue(Buffer.alloc(188));
  const exit=await senderClosed;assert.equal(exit.signal,'SIGKILL');assert(signals.includes('SIGKILL'));source.kill('SIGKILL');await source.closed;
  await capture.drain();const fencedBytes=(await readFile(capture.filenames.client)).length;sender.enqueue(Buffer.alloc(188));await sleep(50);assert.equal((await readFile(capture.filenames.client)).length,fencedBytes);
  const decoded=await decodeCapturedTransportMarkerRecord(owner,capture.filenames.recording,{transportCapture:capture,width:1280,height:720,maxSeconds:20});assert(decoded.videoFrames>60&&decoded.audioMetadataRows>90);transportProjectionFromWire(decoded.transportClock,decoded);
  await writeFile(join(directory,'production-stop-summary.json'),JSON.stringify({passed:true,scope:'Actual canonical sender stopNow with ongoing input; complete observed segment only',publishing,afterStop:sender.getState(),senderExit:exit,signals,unsubscribed,recordingSha256:decoded.recordingSha256,videoFrames:decoded.videoFrames,audioRows:decoded.audioMetadataRows,transportClock:decoded.transportClock},null,2)+'\n');
 }catch(error){await writeFile(join(directory,'production-stop-failure.json'),JSON.stringify({passed:false,error:String(error.message),signals,health:health.slice(-8),sourceEnded},null,2)+'\n');throw error;}
 finally{sender?.stopNow();if(source?.exitCode===null)source.kill('SIGKILL');await capture?.close();const cleanup=await owner.close();if(base)await writeFile(join(directory,'cleanup.json'),JSON.stringify({captureCloseCompleted:true,owner:cleanup},null,2)+'\n');if(!base)await rm(directory,{recursive:true,force:true});}
});
test('incomplete RTMP handshake reset cannot establish capture closure',{skip:process.env.CAPTURED_TRANSPORT_NATIVE!=='1',timeout:15000},async()=>{
 const {connect}=await import('node:net');const {processTable}=await import(runtimeModule('scripts/event-proof-processes.mjs'));
 const base=process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT,directory=base?join(base,'incomplete-close'):await mkdtemp(join(tmpdir(),'captured-incomplete-'));if(base)await mkdir(directory);
 const original=new Set((await processTable()).map(row=>row.pid));let producer,socket;
 try{
  producer=await startCapturedRtmpReceiver({directory,receiverPort:19743,settings:{videoPreset:'720p30',audioBitrateKbps:320},durationSeconds:1});
  socket=connect(producer.proxyPort,'127.0.0.1');socket.on('error',()=>{});await new Promise((yes,no)=>{socket.once('connect',yes);socket.once('error',no);});const closed=new Promise(yes=>socket.once('close',yes));const partial=Buffer.alloc(128);partial[0]=3;await new Promise((yes,no)=>socket.write(partial,error=>error?no(error):yes()));socket.resetAndDestroy();await closed;
  await assert.rejects(producer.drain(),/captured_transport_(?:(?:client|server)_socket_(?:error|incomplete)|receiver_exit|capture_closure)/);assert.throws(()=>producer.evidence(),/not_drained/);
 }finally{socket?.destroy();await producer?.close();const live=(await processTable()).filter(row=>row.live&&row.parent===process.pid&&!original.has(row.pid));assert.deepEqual(live,[]);if(base)await writeFile(join(directory,'cleanup.json'),JSON.stringify({closed:true,liveNewChildren:live},null,2)+'\n');else await rm(directory,{recursive:true,force:true});}
});
