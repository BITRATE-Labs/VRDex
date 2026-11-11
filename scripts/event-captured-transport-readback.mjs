/** Complete offline artifact joins return facts, never private clock membership. */
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {CAPTURED_TRANSPORT_ARTIFACTS,CAPTURED_TRANSPORT_ARTIFACT_LIMITS,CAPTURED_TRANSPORT_LIMITS,inspectCapturedTransportBytes} from './event-captured-transport.mjs';
import {transportProjectionFromWire} from './event-marker-transport-wire.mjs';
import {parseMarkerMetadata} from './event-marker-metadata.mjs';
import {programDecodeArguments} from './event-marker-program-guards.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const check=(condition,reason)=>{if(!condition)throw Error('captured_transport_readback_'+reason);};
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const filename=p=>typeof p==='string'?p.split(/[\\/]/).at(-1):undefined;
function originalDirectory(file){check(typeof file==='string'&&file.length<4096&&(/^(?:\/|[A-Za-z]:[\\/])/.test(file))&&!file.split(/[\\/]/).some(x=>x==='.'||x==='..')&&filename(file)==='twitch.ts','original_path');return file.slice(0,-'twitch.ts'.length);}
async function boundedRead(directory,name,maximum){
 check(basename(name)===name,'name');const file=join(directory,name),before=await lstat(file);check(before.isFile()&&!before.isSymbolicLink()&&before.size<=maximum,'file_bound');
 const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const first=await handle.stat();check(first.isFile()&&first.ino===before.ino&&first.dev===before.dev&&first.size===before.size,'file_race');let bytes=0;const chunks=[];
  for(;;){const b=Buffer.alloc(Math.min(65536,maximum+1-bytes));check(b.length>0,'file_bound');const r=await handle.read(b,0,b.length,null);if(!r.bytesRead)break;bytes+=r.bytesRead;check(bytes<=maximum,'file_bound');chunks.push(b.subarray(0,r.bytesRead));}
  const after=await handle.stat();check(after.size===before.size&&after.mtimeMs===before.mtimeMs&&bytes===before.size,'file_mutation');return Buffer.concat(chunks);
 }finally{await handle.close();}
}
/** Supply the original final receipt artifact table to bind final acceptance.
 * Omitting it is diagnostic-only and explicitly reported in returned facts. */
export async function verifyCapturedTransportArtifacts({directory,wire,artifacts}){
 check(typeof directory==='string'&&directory.length>0,'directory');directory=resolve(directory);
 const names=[...CAPTURED_TRANSPORT_ARTIFACTS,'twitch.ts'],buffers={},actual={};
 const projected=transportProjectionFromWire(wire,{recordingSha256:wire?.recordingSha256});
 let manifest;
 if(artifacts!==undefined){check(Array.isArray(artifacts)&&artifacts.length<=128,'manifest');manifest=new Map();for(const row of artifacts){check(row&&typeof row.name==='string'&&!manifest.has(row.name),'manifest_duplicate');manifest.set(row.name,row);}}
 for(const name of names){const cap=name==='twitch.ts'?CAPTURED_TRANSPORT_LIMITS.recordingBytes:CAPTURED_TRANSPORT_ARTIFACT_LIMITS[name];const b=await boundedRead(directory,name,cap);check(b.length>0||name.endsWith('.stderr'),'empty');buffers[name]=b;actual[name]={file:name,bytes:b.length,sha256:sha(b)};
  if(manifest){const row=manifest.get(name);check(row?.complete===true&&row.bytes===b.length&&row.sha256===actual[name].sha256,'manifest_binding');}
 }
 const proof=JSON.parse(buffers['captured-transport-proof.json'].toString()),decoder=JSON.parse(buffers['captured-decode-proof.json'].toString());
 for(const [ref,name]of [[wire.evidence,'captured-transport-proof.json'],[wire.decoderEvidence,'captured-decode-proof.json']])check(equal(ref,actual[name]),'reference_binding');
 check(proof.kind==='physically-closed-transport'&&equal(proof.settings,{videoPreset:'720p30',audioBitrateKbps:320})&&equal(proof.limits,CAPTURED_TRANSPORT_LIMITS),'profile');
 check(proof.receiverNative?.exitCode===0&&proof.receiverNative.signal===null&&proof.receiverNative.error===null&&proof.receiverStderrEof===true&&proof.connections===1&&proof.clientEof===true&&proof.serverEof===true,'receiver_closure');
 check(proof.bindings&&Object.keys(proof.bindings).sort().join(',')==='client,receiverStderr,recording,server','capture_bindings');
 const originalFile=proof.bindings.recording.file,originalDir=originalDirectory(originalFile);
 for(const [key,name]of [['client','captured-client.rtmp'],['server','captured-server.rtmp'],['recording','twitch.ts'],['receiverStderr','captured-receiver.stderr']]){const ref=proof.bindings[key];check(ref.file===originalDir+name&&ref.bytes===actual[name].bytes&&ref.sha256===actual[name].sha256,'capture_binding');}
 check(Array.isArray(proof.receiverArgs)&&/^rtmp:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/live\/test-key$/.test(proof.receiverArgs[6]??''),'receiver_recipe');
 const port=Number(proof.receiverArgs[6].split(':')[2].split('/')[0]);check(port>=1024&&port<=65535,'receiver_recipe');
 const receiverArgs=['-hide_banner','-loglevel','error','-listen','1','-i',`rtmp://127.0.0.1:${port}/live/test-key`,'-c','copy','-f','mpegts','-y',originalFile];check(equal(proof.receiverArgs,receiverArgs),'receiver_recipe');
 check(equal(decoder.argv,programDecodeArguments(originalFile,{width:1280,height:720})),'decoder_recipe');
 check(decoder.native?.exitCode===0&&decoder.native.signal===null&&decoder.native.error===null&&decoder.native.stopReason===null,'decoder_closure');
 check(decoder.channels&&Object.keys(decoder.channels).sort().join(',')==='2,3,4,5,6','decoder_channels');
 for(const fd of [2,3,4,5,6]){const name=fd===2?'captured-decode.stderr':`captured-decode-${fd}.bin`,channel=decoder.channels[fd];check(channel.file===originalDir+name&&channel.bytes===actual[name].bytes&&channel.sha256===actual[name].sha256&&channel.eof===true,'decoder_channel_binding');}
 const facts=inspectCapturedTransportBytes(buffers['captured-client.rtmp'],buffers['captured-server.rtmp'],buffers['twitch.ts'],{fps:wire.fps});
 check(equal(facts.domain,projected.domain),'domain');
 check(facts.fps===30&&facts.recordingSha256===wire.recordingSha256&&wire.audioSha256===actual['captured-decode-4.bin'].sha256&&wire.videoSha256===actual['captured-decode-3.bin'].sha256,'wire_binding');
 const audioRows=parseMarkerMetadata(buffers['captured-decode-6.bin'].toString(),'audio'),videoRows=parseMarkerMetadata(buffers['captured-decode-5.bin'].toString(),'video');
 check(equal(audioRows,projected.audioRows)&&equal(videoRows,projected.videoRows)&&sha(JSON.stringify(audioRows))===wire.audioRowsSha256&&sha(JSON.stringify(videoRows))===wire.videoRowsSha256,'row_mapping');
 check(audioRows.length===facts.audioUnits&&videoRows.length===facts.frames&&buffers['captured-decode-4.bin'].length===facts.samples*2&&buffers['captured-decode-3.bin'].length===facts.frames*6,'population');
 check(audioRows.every((row,i)=>row.index===i&&row.samples===1024&&row.pts===facts.audioPts[i])&&videoRows.every((row,i)=>row.index===i&&row.pts===facts.videoPts[i]),'decoded_timestamp_replay');
 return {verified:true,manifestBound:manifest!==undefined,scope:'offline-transport-artifact-join',assurance:'No private capture membership, native ProgramClock, image identity, capacity or provider acceptance is issued',domain:facts.domain,fps:facts.fps,samples:facts.samples,frames:facts.frames,audioRows:audioRows.length,recordingSha256:facts.recordingSha256,evidence:actual['captured-transport-proof.json'],decoderEvidence:actual['captured-decode-proof.json'],artifacts:Object.values(actual)};
}
