import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {transportWireFromProjection,transportProjectionFromWire} from '../../scripts/event-marker-transport-wire.mjs';
import {isCapturedTransportClock} from '../../scripts/event-captured-transport.mjs';
import {decodeSourceAudio} from '../../scripts/event-source-markers.mjs';
import {buildMarkerContexts} from '../../scripts/event-marker-contexts.mjs';
import {createTransportComparison} from '../../scripts/event-marker-transport-domain.mjs';
import {packMarkerRecord,validateMarkerRecord} from '../../scripts/event-marker-evidence.mjs';
import {packAudioEpisode,unpackAudioEpisode} from '../../scripts/event-marker-wire.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function projection(){const audioRows=Array.from({length:32},(_,index)=>({index,pts:67200+index*1024-(index>=17?8:0),samples:1024})),videoRows=Array.from({length:20},(_,index)=>({index,pts:[127890,130860,133920][index%3]+Math.floor(index/3)*9000}));return {fps:30,domain:{audio:[1007800,1008040],video:[1023000,1023240]},audioRows,videoRows,recordingSha256:'a'.repeat(64),audioSha256:'b'.repeat(64),videoSha256:'c'.repeat(64),audioRowsSha256:hash(JSON.stringify(audioRows)),videoRowsSha256:hash(JSON.stringify(videoRows)),evidence:{file:'/tmp/run/captured-transport-proof.json',sha256:'d'.repeat(64),bytes:500},decoderEvidence:{file:'/tmp/run/captured-decode-proof.json',sha256:'e'.repeat(64),bytes:600}};}
test('compact mapping preserves raw overlap and frame witnesses without granting capture authority',()=>{
 const p=projection(),wire=transportWireFromProjection(p),actual=transportProjectionFromWire(wire,{recordingSha256:p.recordingSha256});assert.deepEqual(actual.audioRows,p.audioRows);assert.deepEqual(actual.videoRows,p.videoRows);assert.deepEqual(actual.domain,p.domain);assert.equal(wire.audioPtsRuns.length,2);assert.equal(isCapturedTransportClock(actual),false);
});
test('domain, row, frame, evidence and recording mutations fail semantic binding',()=>{
 const p=projection(),wire=transportWireFromProjection(p);
 for(const change of [w=>w.domain.audio[0]++,w=>w.audioPtsRuns[1][1]++,w=>w.videoPattern[1]++,w=>w.frames++,w=>w.evidence.sha256='f'.repeat(64),w=>w.decoderEvidence.file='../captured-decode-proof.json',w=>w.recordingSha256='f'.repeat(64)]){const w=structuredClone(wire);change(w);assert.throws(()=>transportProjectionFromWire(w,{recordingSha256:p.recordingSha256}));}
 assert.throws(()=>transportProjectionFromWire(wire,{recordingSha256:'f'.repeat(64)}));
});
test('wire bounds are enforced before expanding mappings or trusting arbitrary row shapes',()=>{
 const p=projection();p.audioRows[20].samples=960;assert.throws(()=>transportWireFromProjection(p));
 const q=projection();q.videoRows[5].pts++;assert.throws(()=>transportWireFromProjection(q));
 const wire=transportWireFromProjection(projection());wire.audioRowCount=Number.MAX_SAFE_INTEGER;assert.throws(()=>transportProjectionFromWire(wire,{recordingSha256:wire.recordingSha256}));
});
function semanticRecord(){
 const audioRows=Array.from({length:512},(_,index)=>({index,pts:index*1024,samples:1024})),pcm=Buffer.alloc(512*1024*2);
 for(let pulse=0;pulse<8;pulse++)for(let n=0;n<4800;n++){const at=62400+pulse*48000+n;pcm.writeInt16LE(Math.round(.65*32767*Math.sin(2*Math.PI*700*at/48000)),at*2);}
 const decoded=decodeSourceAudio([pcm],audioRows);audioRows.forEach((r,i)=>{if(i>=17)r.pts-=8;});
 decoded.episodes.forEach((e,id)=>{e.id=id;for(const point of [e.firstLoudLeft,e.lastLoudRight,e.closureRight])point.raw=audioRows[point.row].pts+point.inRow;e.onset=e.firstLoudLeft.raw;e.end=e.closureRight.raw;});
 const videoRows=Array.from({length:301},(_,index)=>({index,pts:index*3000})),p={fps:30,domain:{audio:[-240,0],video:[0,0]},audioRows,videoRows,recordingSha256:'a'.repeat(64),audioSha256:hash(pcm),videoSha256:'c'.repeat(64),audioRowsSha256:hash(JSON.stringify(audioRows)),videoRowsSha256:hash(JSON.stringify(videoRows)),evidence:{file:'captured-transport-proof.json',sha256:'d'.repeat(64),bytes:500},decoderEvidence:{file:'captured-decode-proof.json',sha256:'e'.repeat(64),bytes:600}};
 const raw={...decoded,recordingSha256:p.recordingSha256,audioStreamIndex:1,videoStreamIndex:0,audioRange:[0,512*1024-8],videoFrames:301,videoRange:[0,900000],identityEpochs:[[0,4],[90000,1]],visuals:Array.from({length:8},(_,id)=>({id,start:117000+id*90000,end:126000+id*90000,startFrame:39+id*30,endFrame:42+id*30,identity:'a',watermark:-1})),watermarks:[]};
 const s={identity:'a',revision:1,tick:30,fps:30,sourcePts:0,endTick:150,lastSourcePts:357000,carryIn:false,pulses:Array.from({length:4},(_,i)=>({tick:39+i*30,sourcePts:27000+i*90000})),sourcePulses:[27000,117000,207000,297000]};
 raw.contexts=buildMarkerContexts(raw,{selections:[s],windows:[{identity:'a',start:2,end:8}]},createTransportComparison(raw,p)).contexts;
 const packed=structuredClone(packMarkerRecord(raw));packed.transportClock=transportWireFromProjection(p);return packed;
}
test('tagged semantic record recomputes context identities with exact raw noncontiguous endpoint mapping',()=>{
 // This is a pure semantic fixture. Its description is not a private physical
 // clock and cannot authorize a decoder to bypass ordinary continuity.
 const wire=semanticRecord();assert.equal(isCapturedTransportClock(wire.transportClock),false);
 const proof=validateMarkerRecord(wire);assert.equal(proof.valid,true);assert.deepEqual(proof.contexts[0].pairs.map(p=>p.episodeId),[0,1,2,3]);
 const legacy=structuredClone(wire);delete legacy.transportClock;assert.throws(()=>validateMarkerRecord(legacy),/marker_audio_range/);
 for(const mutate of [e=>e.closureRight.raw++,e=>e.closureRight.row++,e=>e.firstLoudLeft.side='right']){
  const bad=structuredClone(wire),episode=unpackAudioEpisode(bad.episodes[0]);mutate(episode);assert.throws(()=>{bad.episodes[0]=packAudioEpisode(episode);validateMarkerRecord(bad);},/marker_/);
 }
 const bad=structuredClone(wire);bad.visuals[0][1]++;assert.throws(()=>validateMarkerRecord(bad),/marker_transport_frame/);
});
