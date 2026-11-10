import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {sourceMarkerFixture} from '../fixtures/source-marker-literal.mjs';
import {transportWireFromProjection} from '../../scripts/event-marker-transport-wire.mjs';
import {CAPTURED_TRANSPORT_ARTIFACTS,isCapturedTransportApplicable} from '../../scripts/event-captured-transport-artifacts.mjs';
import {validateCapacityReceipt} from '../../scripts/event-capacity-contracts.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
// Pure semantic fixtures, never physical capture or measured allocation proof.
function receipt(){
 const marker=sourceMarkerFixture(),e=marker.markerEvidence,count=Math.ceil(e.metadataSamples/1024),audioRows=Array.from({length:count},(_,index)=>({index,pts:index*1024,samples:1024})),videoRows=Array.from({length:e.videoFrames},(_,index)=>({index,pts:index*3000}));
 e.metadataSamples=count*1024;e.decodedBytes=e.metadataSamples*2;e.audioRange[1]=e.metadataSamples;e.detectorBlockCount++;
 e.transportClock=transportWireFromProjection({fps:30,domain:{audio:[0,0],video:[0,0]},audioRows,videoRows,recordingSha256:e.recordingSha256,audioSha256:'b'.repeat(64),videoSha256:'c'.repeat(64),audioRowsSha256:hash(JSON.stringify(audioRows)),videoRowsSha256:hash(JSON.stringify(videoRows)),evidence:{file:'captured-transport-proof.json',sha256:'d'.repeat(64),bytes:500},decoderEvidence:{file:'captured-decode-proof.json',sha256:'e'.repeat(64),bytes:600}});
 const r={schemaVersion:1,terminal:true,request:{settings:{videoPreset:'720p30',audioBitrateKbps:320},cpuUnits:8192,memoryMiB:16384,durationSeconds:300,simulcastEnabled:true,outputDir:'/tmp/unit-proof'},cleanup:{closed:true,liveChildren:0,liveGroups:0},steady:{durationMs:300000,dualDecodeMs:300000,readinessLosses:0,samples:300,maxSampleGapMs:1100},resources:{cpuP95Percent:70,sampleCoverageMs:300000,memoryPeakBytes:1000000},maxCompressedBufferBytes:3000000,maxDecoders:2,maxAcquisitions:2,artifacts:[],outputs:[]};
 for(const destination of ['vrcdn','twitch']){const m=destination==='twitch'?marker:sourceMarkerFixture();r.outputs.push({destination,videoCodec:'h264',width:1280,height:720,fps:30,pixelFormat:'yuv420p',audioCodec:'aac',channels:2,sampleRate:48000,audioKbps:destination==='twitch'?160:320,maxGop:destination==='twitch'?2:1,maxGap:.03,monotonic:true,identities:['a','b','slate'],visualPsnrDb:35,...m,internalDelayMs:100});r.artifacts.push({name:destination+'.ts',bytes:1,sha256:e.recordingSha256,complete:true});}
 for(const name of CAPTURED_TRANSPORT_ARTIFACTS)r.artifacts.push({name,bytes:name.endsWith('.stderr')?0:1,sha256:name.endsWith('.stderr')?hash(''):'f'.repeat(64),complete:true});
 const item=name=>r.artifacts.find(a=>a.name===name);
 for(const ref of [e.transportClock.evidence,e.transportClock.decoderEvidence])Object.assign(item(ref.file),ref,{name:ref.file});
 item('captured-decode-4.bin').sha256=e.transportClock.audioSha256;item('captured-decode-3.bin').sha256=e.transportClock.videoSha256;
 r.capturedTransport={kind:'physically-closed-transport',bindings:Object.fromEntries([['client','captured-client.rtmp'],['server','captured-server.rtmp'],['recording','twitch.ts']].map(([key,name])=>[key,{file:'/tmp/unit/'+name,bytes:item(name).bytes,sha256:item(name).sha256}]))};return r;
}
test('transport receipt explicitly binds all raw originals and even empty stderr',()=>assert.equal(validateCapacityReceipt(receipt()).terminal,true));
test('missing, duplicate, crossed or mutated transport artifacts reject final receipt',()=>{
 for(const change of [r=>r.artifacts.splice(r.artifacts.findIndex(a=>a.name==='captured-client.rtmp'),1),r=>r.artifacts.push({...r.artifacts.find(a=>a.name==='captured-decode-4.bin')}),r=>r.artifacts.find(a=>a.name==='captured-decode-4.bin').sha256='f'.repeat(64),r=>r.artifacts.find(a=>a.name==='captured-decode-proof.json').bytes++,r=>r.capturedTransport.bindings.client.sha256='e'.repeat(64),r=>r.artifacts.find(a=>a.name==='captured-decode.stderr').sha256='f'.repeat(64)]){const r=receipt();change(r);assert.throws(()=>validateCapacityReceipt(r));}
});
test('transport evidence cannot exceed the unchanged total artifact budget',()=>{
 const r=receipt();r.artifacts.find(a=>a.name==='vrcdn.ts').bytes=300000000;r.artifacts.find(a=>a.name==='twitch.ts').bytes=300000000;r.artifacts.find(a=>a.name==='captured-client.rtmp').bytes=200000000;
 Object.assign(r.capturedTransport.bindings.recording,{bytes:300000000});Object.assign(r.capturedTransport.bindings.client,{bytes:200000000});
 assert.throws(()=>validateCapacityReceipt(r),/artifact/);
});
function legacyReceipt({videoPreset='720p30',audioBitrateKbps=320,durationSeconds=300}={}){
 const r=receipt();r.request.settings={videoPreset,audioBitrateKbps};r.request.durationSeconds=durationSeconds;r.steady.durationMs=r.steady.dualDecodeMs=r.resources.sampleCoverageMs=durationSeconds*1000;r.steady.samples=durationSeconds;
 delete r.outputs[1].markerEvidence.transportClock;delete r.capturedTransport;r.artifacts=r.artifacts.filter(a=>!CAPTURED_TRANSPORT_ARTIFACTS.includes(a.name));
 for(const o of r.outputs){if(videoPreset==='1080p30'){o.width=1920;o.height=1080;}if(o.destination==='vrcdn')o.audioKbps=audioBitrateKbps;}return r;
}
test('capture applicability is limited to its exact profile and bounded duration',()=>{
 for(const [options,expected] of [[{},true],[{durationSeconds:600},true],[{durationSeconds:601},false],[{durationSeconds:900},false],[{videoPreset:'1080p30'},false],[{audioBitrateKbps:160},false],[{durationSeconds:0},false],[{durationSeconds:NaN},false]])assert.equal(isCapturedTransportApplicable({settings:{videoPreset:'720p30',audioBitrateKbps:320,...Object.fromEntries(Object.entries(options).filter(([key])=>key!=='durationSeconds'))},durationSeconds:Object.hasOwn(options,'durationSeconds')?options.durationSeconds:300}),expected);
});
test('default captured lane requires captured evidence at300 and600seconds',()=>{
 for(const durationSeconds of [300,600])assert.throws(()=>validateCapacityReceipt(legacyReceipt({durationSeconds})),/marker_transport_required/);
});
test('other valid benchmark profiles and longer durations retain the original strict path',()=>{
 for(const options of [{videoPreset:'1080p30'},{audioBitrateKbps:160},{durationSeconds:900}])assert.equal(validateCapacityReceipt(legacyReceipt(options)).terminal,true);
});
