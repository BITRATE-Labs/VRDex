import {createHash} from 'node:crypto';
const check=(ok)=>{if(!ok)throw Error('marker_transport_wire');};
const sha=x=>createHash('sha256').update(x).digest('hex');
const hash=x=>/^[a-f0-9]{64}$/.test(x??'');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const binding=x=>sha(JSON.stringify(stable(x)));
const integer=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1e12;
function reference(value,name){check(value&&Object.keys(value).sort().join(',')==='bytes,file,sha256'&&typeof value.file==='string'&&value.file===name&&hash(value.sha256)&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=1048576);return {...value};}
function packReference(value,name){check(value&&typeof value.file==='string');return reference({...value,file:value.file.split(/[\\/]/).at(-1)},name);}
/** Compact semantic description only. This cannot mint a capture certificate;
 * the referenced original artifacts still require independent physical joins. */
export function transportWireFromProjection(p) {
 check([30,60].includes(p?.fps)&&Array.isArray(p.audioRows)&&p.audioRows.length>0&&p.audioRows.length<=50000&&Array.isArray(p.videoRows)&&p.videoRows.length>=3&&p.videoRows.length<=40000);
 check(p.audioRows.every((r,i)=>r.index===i&&integer(r.pts)&&r.samples===1024)&&p.videoRows.every((r,i)=>r.index===i&&integer(r.pts)));
 const audioPtsRuns=p.audioRows.flatMap((r,i)=>!i||r.pts!==p.audioRows[i-1].pts+1024?[[i,r.pts]]:[]);
 check(audioPtsRuns.length<=1024);
 const videoPattern=p.videoRows.slice(0,3).map(r=>r.pts),period=3*90000/p.fps;
 check(p.videoRows.every((r,i)=>r.pts===videoPattern[i%3]+Math.floor(i/3)*period));
 check(sha(JSON.stringify(p.audioRows))===p.audioRowsSha256&&sha(JSON.stringify(p.videoRows))===p.videoRowsSha256);
 const wire={schema:'captured-transport-clock-v1',fps:p.fps,domain:structuredClone(p.domain),audioRowCount:p.audioRows.length,audioPtsRuns,frames:p.videoRows.length,videoPattern,
  recordingSha256:p.recordingSha256,audioSha256:p.audioSha256,videoSha256:p.videoSha256,audioRowsSha256:p.audioRowsSha256,videoRowsSha256:p.videoRowsSha256,
  evidence:packReference(p.evidence,'captured-transport-proof.json'),decoderEvidence:packReference(p.decoderEvidence,'captured-decode-proof.json')};
 wire.bindingSha256=binding(wire);transportProjectionFromWire(wire,{recordingSha256:p.recordingSha256});return wire;
}
export function transportProjectionFromWire(wire,record) {
 check(wire&&wire.schema==='captured-transport-clock-v1'&&[30,60].includes(wire.fps)&&Number.isSafeInteger(wire.audioRowCount)&&wire.audioRowCount>0&&wire.audioRowCount<=50000&&Number.isSafeInteger(wire.frames)&&wire.frames>=3&&wire.frames<=40000);
 const keys=['schema','fps','domain','audioRowCount','audioPtsRuns','frames','videoPattern','recordingSha256','audioSha256','videoSha256','audioRowsSha256','videoRowsSha256','evidence','decoderEvidence','bindingSha256'];check(Object.keys(wire).length===keys.length&&keys.every(k=>Object.hasOwn(wire,k)));
 check(Array.isArray(wire.audioPtsRuns)&&wire.audioPtsRuns.length>0&&wire.audioPtsRuns.length<=1024&&Array.isArray(wire.videoPattern)&&wire.videoPattern.length===3&&wire.videoPattern.every(integer));
 check(wire.domain&&Object.keys(wire.domain).sort().join(',')==='audio,video');
 for(const range of [wire.domain.audio,wire.domain.video])check(Array.isArray(range)&&range.length===2&&range.every(integer)&&range[0]<=range[1]&&range[1]-range[0]<=720);
 for(const key of ['recordingSha256','audioSha256','videoSha256','audioRowsSha256','videoRowsSha256','bindingSha256'])check(hash(wire[key]));
 check(wire.recordingSha256===record.recordingSha256);
 reference(wire.evidence,'captured-transport-proof.json');reference(wire.decoderEvidence,'captured-decode-proof.json');
 wire.audioPtsRuns.forEach((r,i)=>check(Array.isArray(r)&&r.length===2&&Number.isSafeInteger(r[0])&&r[0]>=0&&r[0]<wire.audioRowCount&&integer(r[1])&&(i?r[0]>wire.audioPtsRuns[i-1][0]:r[0]===0)));
 check(Buffer.byteLength(JSON.stringify(wire))<=65536);
 const {bindingSha256,...body}=wire;check(binding(body)===bindingSha256);
 let run=0;const audioRows=Array.from({length:wire.audioRowCount},(_,index)=>{while(run+1<wire.audioPtsRuns.length&&wire.audioPtsRuns[run+1][0]<=index)run++;const [start,pts]=wire.audioPtsRuns[run];return {index,pts:pts+(index-start)*1024,samples:1024};});
 const period=3*90000/wire.fps,videoRows=Array.from({length:wire.frames},(_,index)=>({index,pts:wire.videoPattern[index%3]+Math.floor(index/3)*period}));
 check(audioRows.every(r=>integer(r.pts))&&videoRows.every((r,i)=>integer(r.pts)&&(!i||r.pts>videoRows[i-1].pts)));
 check(sha(JSON.stringify(audioRows))===wire.audioRowsSha256&&sha(JSON.stringify(videoRows))===wire.videoRowsSha256);
 return {fps:wire.fps,domain:structuredClone(wire.domain),audioRows,videoRows,evidence:wire.evidence,decoderEvidence:wire.decoderEvidence,recordingSha256:wire.recordingSha256};
}
