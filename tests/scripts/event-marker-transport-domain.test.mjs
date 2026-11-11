import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTransportComparison} from '../../scripts/event-marker-transport-domain.mjs';
import {buildMarkerContexts} from '../../scripts/event-marker-contexts.mjs';
import {associateContext} from '../../scripts/event-marker-association.mjs';
const record={videoFrames:4,audioRange:[0,4096],videoRange:[0,9000]};
const projection={fps:30,domain:{audio:[0,480],video:[0,480]},audioRows:Array.from({length:4},(_,index)=>({index,pts:index*1024,samples:1024})),videoRows:Array.from({length:4},(_,index)=>({index,pts:index*3000}))};
test('audio/video endpoints use observed ordinal/frame identity without rewriting raw coordinates',()=>{
 const compare=createTransportComparison(record,projection);
 const e={onset:100,end:200,firstLoudLeft:{ordinal:25},closureRight:{ordinal:125}};
 assert.deepEqual(compare.audio(e,'start'),[1,0,375]);assert.deepEqual(compare.audio(e,'end'),[1,0,1875]);
 assert.deepEqual(compare.video({start:777,startFrame:2},'start'),[0,1,48000]);assert.equal(e.onset,100);
});
test('a decision at strict candidate or inclusive AV boundary rejects an ambiguous shared origin',()=>{
 const c=createTransportComparison(record,projection),a=[1,0,0],v=[0,1,0];
 for(const [op,bound] of [['<',360000],['<=',72000],['>=',-72000],['<',9000],['<',45000],['>',18000]])assert.throws(()=>c.test(c.atom(c.shiftClock(a,bound),op,c.shiftClock(v,bound))),/ambiguous/);
 assert.equal(c.test(c.atom(c.shiftClock(a,1000),'>',v)),true);
});
test('relevance uses a may union over the same joint origin, not independent favorable choices',()=>{
 const c=createTransportComparison(record,projection),a=[1,0,0],v=[0,1,0];
 // One branch alone is ambiguous; their union is true at every origin.
 assert.equal(c.test(c.any(c.atom(a,'<',v),c.atom(a,'>=',v))),true);
 // Each branch is possible independently, but they cannot both be true.
 assert.equal(c.test(c.all(c.atom(a,'<',v),c.atom(a,'>=',v))),false);
 assert.throws(()=>c.test(c.any(c.atom(a,'<',v),false)),/ambiguous/);
});
test('point identity and row bounds reject malformed endpoint/frame witnesses',()=>{
 const c=createTransportComparison(record,projection);
 assert.throws(()=>c.video({startFrame:4},'start'));
 assert.throws(()=>c.audio({firstLoudLeft:{ordinal:4097}},'start'));
 assert.throws(()=>c.epoch(123));
});
function contextFixture(){
 const record={schema:'source-tones-v1',videoFrames:301,videoRange:[0,900000],audioRange:[0,524288],identityEpochs:[[0,4],[90000,1]],
  visuals:Array.from({length:8},(_,i)=>({id:i,start:117000+i*90000,end:126000+i*90000,startFrame:39+i*30,endFrame:42+i*30,identity:'a',watermark:-1})),
  episodes:Array.from({length:8},(_,i)=>({id:i,onset:62400+i*48000,end:67680+i*48000,firstLoudLeft:{ordinal:62400+i*48000},closureRight:{ordinal:67680+i*48000},identity:'a'})),watermarks:[]};
 const p={fps:30,domain:{audio:[-240,240],video:[-240,240]},audioRows:Array.from({length:512},(_,index)=>({index,pts:index*1024,samples:1024})),videoRows:Array.from({length:301},(_,index)=>({index,pts:index*3000}))};
 const s={identity:'a',revision:1,tick:30,fps:30,sourcePts:0,endTick:150,lastSourcePts:357000,carryIn:false,pulses:Array.from({length:4},(_,i)=>({tick:39+i*30,sourcePts:27000+i*90000})),sourcePulses:[27000,117000,207000,297000]};
 return {record,p,s};
}
test('full context path retains identical pair/disposition identities over the shared joint domain',()=>{
 const {record,p,s}=contextFixture(),before=record.episodes.map(e=>[e.onset,e.end]);
 const result=buildMarkerContexts(record,{selections:[s],windows:[{identity:'a',start:2,end:8}]},createTransportComparison(record,p));
 assert.deepEqual(result.contexts[0].pairs.map(x=>x.episodeId),[0,1,2,3]);
 assert.deepEqual(result.contexts[1].pairs.map(x=>x.episodeId),[1,2,3,4,5,6]);
 assert.deepEqual(record.episodes.map(e=>[e.onset,e.end]),before);
});
test('epoch and steady full-visual boundary choices are quantified before association',()=>{
 const a=contextFixture();assert.throws(()=>buildMarkerContexts(a.record,{selections:[a.s],windows:[{identity:'a',start:1,end:7}]},createTransportComparison(a.record,a.p)),/ambiguous/);
 const b=contextFixture();b.record.visuals.forEach(v=>{v.start-=9000;v.end-=9000;v.startFrame-=3;v.endFrame-=3;});b.record.episodes.forEach(e=>{e.onset-=4800;e.end-=4800;e.firstLoudLeft.ordinal-=4800;e.closureRight.ordinal-=4800;});b.s.pulses.forEach(p=>p.tick-=3);
 assert.throws(()=>buildMarkerContexts(b.record,{selections:[b.s],windows:[{identity:'a',start:2,end:8}]},createTransportComparison(b.record,b.p)),/ambiguous/);
});
test('an AV-boundary candidate cannot pass by selecting a favorable audio/video origin',()=>{
 const {record,p,s}=contextFixture();record.episodes[0].onset+=4800;record.episodes[0].firstLoudLeft.ordinal+=4800;
 assert.throws(()=>buildMarkerContexts(record,{selections:[s]},createTransportComparison(record,p)),/ambiguous/);
});
test('unknown competitors remain rejected with a valid captured coordinate domain',()=>{
 const {record,p,s}=contextFixture();record.episodes.push({id:8,onset:50000,end:52000,firstLoudLeft:{ordinal:50000},closureRight:{ordinal:52000},identity:'unknown'});
 assert.throws(()=>buildMarkerContexts(record,{selections:[s]},createTransportComparison(record,p)),/unknown_competitor/);
});
function associationFixture(first=5.3){
 const visuals=Array.from({length:4},(_,id)=>({id,identity:'b',watermark:-1,start:Math.round((first+id)*90000),end:Math.round((first+id+.1)*90000),startFrame:Math.round((first+id)*30),endFrame:Math.round((first+id+.1)*30)}));
 const episode=(id,start,end,identity='b')=>({id,identity,onset:Math.round(start*48000),end:Math.round(end*48000),firstLoudLeft:{ordinal:Math.round(start*48000)},closureRight:{ordinal:Math.round(end*48000)}});
 const record={visuals,episodes:visuals.map((v,id)=>episode(id,v.start/90000,v.start/90000+.11)),watermarks:[],audioRange:[0,768000],videoRange:[0,1350000],identityEpochs:[[0,4],[90000,1],[450000,2]]};
 const p={fps:30,domain:{audio:[-240,240],video:[-240,240]},audioRows:Array.from({length:750},(_,index)=>({index,pts:index*1024,samples:1024})),videoRows:Array.from({length:451},(_,index)=>({index,pts:index*3000}))};
 const context={kind:'transition',identity:'b',start:450000,end:810000,selection:450000,fullVisualIds:[0,1,2,3]};return {record,p,context,episode};
}
test('reference-fence membership and strict half-period competitor are quantified as complete relevant sets',()=>{
 for(const [start,end] of [[4.7,4.8],[5.8,5.85]]){const {record,p,context,episode}=associationFixture();record.episodes.push(episode(4,start,end,'unknown'));assert.throws(()=>associateContext(record,context,createTransportComparison(record,p)),/ambiguous/);}
});
test('previous-epoch tail at the inclusive100ms fence cannot choose a favorable shared origin',()=>{
 const {record,p,context,episode}=associationFixture();record.episodes.push(episode(4,4.98,5.1,'a'));assert.throws(()=>associateContext(record,context,createTransportComparison(record,p)),/ambiguous/);
});
test('carry fragment at the100ms fragment reference edge rejects ambiguous ownership',()=>{
 const {record,p,context,episode}=associationFixture(5.9);record.visuals.push({id:4,start:450000,end:459000,startFrame:150,endFrame:153,identity:'b',watermark:0});
 record.watermarks.push({identity:'b',carryIn:true,selectionVideoPts:450000,selectionTick:1,firstPulseTick:1,selectionSourcePts:7500,firstPulseSourcePts:7500});record.episodes.push(episode(4,5.2,5.22));
 assert.throws(()=>associateContext(record,{...context,carryVisualId:4},createTransportComparison(record,p)),/ambiguous/);
});
