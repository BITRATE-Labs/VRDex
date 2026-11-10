/** A physically closed local transport observation. Never ProgramClock authority. */
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { PassThrough } from 'node:stream';
import { openSync, writeSync, closeSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { programDecodeArguments } from './event-marker-program-guards.mjs';
import { parseMarkerMetadata } from './event-marker-metadata.mjs';
import { parseMediaSettings, VIDEO_PROFILES } from '../workers/restream/broadcast-profiles.mjs';
const producers=new WeakMap(),decodes=new WeakMap(),certificates=new WeakMap();
const MB=1048576;
import {CAPTURED_TRANSPORT_LIMITS,CAPTURED_TRANSPORT_ARTIFACTS,CAPTURED_TRANSPORT_ARTIFACT_LIMITS} from './event-captured-transport-artifacts.mjs';
export {CAPTURED_TRANSPORT_LIMITS,CAPTURED_TRANSPORT_ARTIFACTS,CAPTURED_TRANSPORT_ARTIFACT_LIMITS};
const fail=reason=>{throw Error('captured_transport_'+reason);};
const check=(condition,reason)=>{if(!condition)fail(reason);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const freeze=x=>{if(x&&typeof x==='object'){for(const y of Object.values(x))freeze(y);Object.freeze(x);}return x;};
const integer=x=>{check(Number.isSafeInteger(x),'integer');return x;};
const rounded=(n,d)=>{n=BigInt(n);d=BigInt(d);return integer(Number(n<0n?-((-2n*n+d)/(2n*d)):(2n*n+d)/(2n*d)));};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function producerData(handle){const data=producers.get(handle);check(data,'unproven');return data;}
function boundedFile(file,cap){const fd=openSync(file,'wx',0o600);let bytes=0,closed=false;const digest=createHash('sha256');return {write(chunk){check(!closed&&bytes+chunk.length<=cap,'capture_bound');let at=0;while(at<chunk.length){const written=writeSync(fd,chunk,at,chunk.length-at);check(written>0,'capture_write');at+=written;}bytes+=chunk.length;digest.update(chunk);},close(){if(!closed){closed=true;closeSync(fd);}return {file,bytes};},get bytes(){return bytes;}};}
/** Pure parsing provides no private capture authority. */
export function parseCapturedRtmp(raw){
 check(Buffer.isBuffer(raw)&&raw.length>=3073&&raw.length<=CAPTURED_TRANSPORT_LIMITS.clientBytes&&raw[0]===3,'handshake');
 let at=3073,chunkSize=128;const states=new Map(),messages=[];
 const need=n=>check(Number.isSafeInteger(n)&&n>=0&&at+n<=raw.length,'chunk_truncated');
 while(at<raw.length){
  need(1);const first=raw[at++],fmt=first>>6;let id=first&63;
  if(id===0){need(1);id=64+raw[at++];}else if(id===1){need(2);id=64+raw[at++]+256*raw[at++];}
  const previous=states.get(id);check(fmt===0||previous,'chunk_predecessor');let s=previous,stamp;
  if(fmt<3){check(!s?.pending,'chunk_overlap');need([11,7,3][fmt]);stamp=raw.readUIntBE(at,3);at+=3;s={...s};
   if(fmt<2){s.length=raw.readUIntBE(at,3);at+=3;s.type=raw[at++];}if(fmt===0){s.streamId=raw.readUInt32LE(at);at+=4;}
   s.extended=stamp===0xffffff;if(s.extended){need(4);stamp=raw.readUInt32BE(at);at+=4;}s.extendedValue=stamp;
   s.delta=stamp;s.timestamp=integer(fmt===0?stamp:s.timestamp+stamp);s.pending=[];s.received=0;states.set(id,s);
  }else{if(s.extended){need(4);check(raw.readUInt32BE(at)===s.extendedValue,'extended_stamp');at+=4;}if(!s.pending){s.timestamp=integer(s.timestamp+s.delta);s.pending=[];s.received=0;}}
  check(s.length>=0&&s.length<=4*MB&&messages.length<100000&&states.size<=64,'message_bound');
  const bytes=Math.min(chunkSize,s.length-s.received);need(bytes);s.pending.push(raw.subarray(at,at+bytes));at+=bytes;s.received+=bytes;
  if(s.received===s.length){const payload=Buffer.concat(s.pending);s.pending=null;messages.push({type:s.type,timestamp:s.timestamp,streamId:s.streamId,payload});
   if(s.type===1){check(payload.length===4&&!(payload[0]&128),'chunk_size');chunkSize=payload.readUInt32BE();check(chunkSize>0&&chunkSize<=MB,'chunk_size');}
   // Abort changes message populations. This narrow chain never emits it.
   check(s.type!==2,'message_abort');
  }
 }
 for(const s of states.values())check(!s.pending,'message_incomplete');return messages;
}
export function parseCapturedAacConfig(raw){check(Buffer.isBuffer(raw)&&(raw.length===2||raw.equals(Buffer.from('119056e500','hex')))&&raw[0]===0x11&&raw[1]===0x90,'aac_config');return {objectType:2,sampleRate:48000,channels:2,samplesPerUnit:1024};}
function avccConfig(raw){
 check(raw.length>=7&&raw[0]===1&&(raw[4]&3)===3,'avcc_config');let at=6;const sets=[];
 const read=count=>{check(count>0&&count<=8,'avcc_sets');for(let i=0;i<count;i++){check(at+2<=raw.length,'avcc_truncated');const n=raw.readUInt16BE(at);at+=2;check(n>0&&at+n<=raw.length,'avcc_truncated');sets.push(Buffer.from(raw.subarray(at,at+n)));at+=n;}};
 read(raw[5]&31);check(at<raw.length,'avcc_truncated');read(raw[at++]);
 // High-profile AVCDecoderConfigurationRecord may append fixed chroma/depth fields.
 if(at<raw.length){check([100,110,122,144].includes(raw[1])&&at+4===raw.length&&raw[at+3]===0,'avcc_extension');at+=4;}
 check(at===raw.length&&sets.some(x=>(x[0]&31)===7)&&sets.some(x=>(x[0]&31)===8),'avcc_config');return sets;
}
function avccNals(raw){let at=0;const nals=[];while(at<raw.length){check(at+4<=raw.length,'avcc_truncated');const size=raw.readUInt32BE(at);at+=4;check(size>0&&at+size<=raw.length,'avcc_truncated');nals.push(raw.subarray(at,at+size));at+=size;}check(nals.length>0&&nals.length<=64,'avcc_population');return nals;}
function annexNals(raw){const starts=[...raw.toString('latin1').matchAll(/\x00\x00\x00?\x01/g)];check(starts.length&&starts[0].index===0,'annex_header');return starts.map((m,i)=>{let end=i+1<starts.length?starts[i+1].index:raw.length;while(end>m.index+m[0].length&&raw[end-1]===0)end--;const x=raw.subarray(m.index+m[0].length,end);check(x.length,'annex_nal');return x;});}
function transportTags(messages){
 let aacConfig,videoConfig,audioStream,videoStream,endVideo=false;const audio=[],video=[];
 for(const m of messages){
  if(m.type===8){check(!endVideo,'media_after_eof');check(m.payload.length>2&&m.payload[0]===0xaf&&m.streamId>0,'aac_tag');audioStream??=m.streamId;check(m.streamId===audioStream,'stream_change');
   if(m.payload[1]===0){check(!aacConfig&&!audio.length,'aac_config_change');aacConfig=Buffer.from(m.payload.subarray(2));parseCapturedAacConfig(aacConfig);}
   else{check(m.payload[1]===1&&aacConfig,'aac_sequence');audio.push({timestamp:m.timestamp,payload:m.payload.subarray(2)});}
  }else if(m.type===9){check(m.payload.length>=5&&(m.payload[0]&15)===7&&m.streamId>0,'avc_tag');videoStream??=m.streamId;check(m.streamId===videoStream,'stream_change');const kind=m.payload[1],cts=m.payload.readIntBE(2,3);check(cts===0,'video_cts');
   if(kind===0){check(!videoConfig&&!video.length,'video_config_change');videoConfig=avccConfig(m.payload.subarray(5));}
   else if(kind===1){check(videoConfig&&!endVideo,'video_sequence');const nals=avccNals(m.payload.subarray(5));check(nals.filter(n=>[1,5].includes(n[0]&31)).length>0,'video_picture');video.push({timestamp:m.timestamp,nals});}
   else{check(kind===2&&!endVideo&&m.payload.length===5,'video_eof');endVideo=true;}
  }else check([1,3,4,5,6,18,20].includes(m.type),'message_type');
 }
 check(audio.length>0&&video.length>0&&audioStream===videoStream&&aacConfig&&videoConfig,'media_population');
 for(const rows of [audio,video])for(let i=1;i<rows.length;i++)check(rows[i].timestamp>rows[i-1].timestamp,'tag_order');
 return {audio,video,videoConfig,aacConfig};
}
function ptsBytes(b){check(b.length===5&&[0,2,4].every(i=>b[i]&1),'pes_pts');return (b[0]>>1&7)*2**30+b[1]*2**22+(b[2]>>1)*2**15+b[3]*128+(b[4]>>1);}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b<<24;for(let i=0;i<8;i++)crc=(crc&0x80000000)?(crc<<1)^0x04c11db7:crc<<1;}return crc>>>0;}
export function parseCapturedTs(raw){
 check(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=CAPTURED_TRANSPORT_LIMITS.recordingBytes&&raw.length%188===0,'ts_bound');
 let pmtPid,audioPid,videoPid;const continuity=new Map(),pending=new Map(),pes=[];let patIdentity,pmtIdentity;
 const flush=pid=>{const x=pending.get(pid);if(x){pes.push({pid,...x,data:Buffer.concat(x.parts)});pending.delete(pid);}};
 for(let offset=0;offset<raw.length;offset+=188){const p=raw.subarray(offset,offset+188);check(p[0]===0x47&&!(p[1]&0x80)&&!(p[3]&0xc0),'ts_header');const pid=(p[1]&31)*256+p[2],pusi=!!(p[1]&64),afc=p[3]>>4&3;check(afc!==0,'ts_header');let at=4;
  if(afc&2){check(at+1+p[4]<=188,'ts_adaptation');if(p[4])check(!(p[5]&0x80),'ts_discontinuity');at+=1+p[4];}
  if(!(afc&1)||at>=188||pid===8191)continue;
  const cc=p[3]&15;if(continuity.has(pid))check(cc===(continuity.get(pid)+1)%16,'ts_continuity');continuity.set(pid,cc);const b=p.subarray(at);
  if(pid===0||pid===pmtPid){check(pusi&&b[0]===0,'psi_split');const section=b.subarray(1),length=((section[1]&15)<<8)|section[2];check(length>=9&&length+3<=section.length,'psi_length');const table=section.subarray(0,length+3);check(crc32(table)===0&&table[5]&1,'psi_crc');
   if(pid===0){check(table[0]===0&&table.length===16&&table.readUInt16BE(8)!==0,'pat');pmtPid=(table[10]&31)*256+table[11];const identity=hash(table);patIdentity??=identity;check(patIdentity===identity,'pat_change');}
   else{check(table[0]===2,'pmt');const identity=hash(table);pmtIdentity??=identity;check(pmtIdentity===identity,'pmt_change');let index=12+((table[10]&15)*256+table[11]);const streams=[];
    while(index<table.length-4){check(index+5<=table.length-4,'pmt_length');const type=table[index],streamPid=(table[index+1]&31)*256+table[index+2],descriptors=(table[index+3]&15)*256+table[index+4];streams.push({type,pid:streamPid});index+=5+descriptors;}
    check(index===table.length-4&&streams.length===2&&streams.filter(s=>s.type===15).length===1&&streams.filter(s=>s.type===27).length===1,'pmt_streams');audioPid=streams.find(s=>s.type===15).pid;videoPid=streams.find(s=>s.type===27).pid;
   }continue;
  }
  if(pid!==audioPid&&pid!==videoPid){check(pid===17,'ts_unknown_pid');continue;}
  if(pusi){flush(pid);check(b.length>=9&&b[0]===0&&b[1]===0&&b[2]===1,'pes_start');pending.set(pid,{offset,parts:[b]});}
  else{check(pending.has(pid),'pes_predecessor');pending.get(pid).parts.push(b);}
 }
 for(const pid of pending.keys())flush(pid);check(patIdentity&&pmtIdentity,'ts_tables');const audio=[],video=[],boundaries=[];
 for(const row of pes){let b=row.data;const length=b.readUInt16BE(4);if(length){check(b.length===length+6,'pes_length');}else check(row.pid===videoPid,'pes_unbounded_audio');check(b.length>=14&&(b[6]&0xc0)===0x80&&(b[7]&0xc0)===0x80&&b[8]===5,'pes_header');const pts=ptsBytes(b.subarray(9,14)),payload=b.subarray(14);
  if(row.pid===audioPid){check(b[3]===192,'pes_stream');let at=0,count=0;
   while(at<payload.length){const x=payload.subarray(at);check(x.length>=7&&x[0]===255&&x[1]===0xf1&&(x[2]>>6)===1&&(x[2]>>2&15)===3&&((x[2]&1)*4+(x[3]>>6))===2&&(x[6]&3)===0,'adts_config');const size=(x[3]&3)*2048+x[4]*8+(x[5]>>5);check(size>7&&at+size<=payload.length,'adts_truncated');audio.push({pts:pts+count*1920,payload:payload.subarray(at+7,at+size)});at+=size;count++;}
   check(count>0,'aac_empty');boundaries.push({first:audio.length-count,count,pts,offset:row.offset});
  }else{check(b[3]===224,'pes_stream');video.push({pts,nals:annexNals(payload)});}
 }
 check(audio.length&&video.length,'ts_population');return {audio,video,boundaries};
}
function originCell(timestamps,step){let lo=-Infinity,hi=Infinity;for(let i=0;i<timestamps.length;i++){const center=integer(timestamps[i]*720-i*step);lo=Math.max(lo,center-360);hi=Math.min(hi,center+360);}check(lo<=hi,'origin_domain');return [integer(lo),integer(hi)];}
function replayAudio(timestamps){let last,previous;return timestamps.map(t=>{integer(t);const center=t*48,a=center-24,b=center+24;const u=last===undefined||last<2*a-b||last>2*b-a?center:Math.max(a,Math.min(b,last));last=u+1024;previous=t;return u;});}
/** Complete pure lineage facts, still without capture membership. */
export function inspectCapturedTransportBytes(client,server,recording,{fps}){
 check(Buffer.isBuffer(server)&&server.length>=3073&&server.length<=CAPTURED_TRANSPORT_LIMITS.serverBytes&&server[0]===3,'server_handshake');parseCapturedRtmp(Buffer.concat([Buffer.from(client.subarray(0,3073)),server.subarray(3073)]));
 check([30,60].includes(fps),'fps');const tags=transportTags(parseCapturedRtmp(client)),ts=parseCapturedTs(recording);check(tags.audio.length===ts.audio.length&&tags.video.length===ts.video.length,'population');
 const replayed=replayAudio(tags.audio.map(x=>x.timestamp));
 const muxOffset=ts.audio[0].pts-rounded(BigInt(replayed[0])*15n,8n);check(Number.isSafeInteger(muxOffset),'mux_offset');
 for(const b of ts.boundaries)check(b.pts===rounded(BigInt(replayed[b.first])*15n,8n)+muxOffset,'pes_timestamp');
 tags.audio.forEach((tag,i)=>check(tag.payload.equals(ts.audio[i].payload),'aac_payload'));
 tags.video.forEach((tag,i)=>{const unit=ts.video[i];check(unit.pts===tag.timestamp*90+muxOffset,'video_timestamp');const strip=nals=>nals.filter(n=>{const type=n[0]&31;if(type===9)return false;if(type===7||type===8){check(tags.videoConfig.some(s=>s.equals(n)),'video_config_change');return false;}return true;});check(equal(strip(tag.nals).map(hash),strip(unit.nals).map(hash)),'video_payload');});
 const shift=muxOffset*8;const domain={audio:originCell(tags.audio.map(x=>x.timestamp),15360).map(x=>integer(x+shift)),video:originCell(tags.video.map(x=>x.timestamp),720000/fps).map(x=>integer(x+shift))};
 return {domain,fps,audioPts:ts.audio.map(x=>rounded(BigInt(x.pts)*8n,15n)),videoPts:ts.video.map(x=>x.pts),samples:ts.audio.length*1024,frames:ts.video.length,audioUnits:ts.audio.length,muxOffset,clientSha256:hash(client),serverSha256:hash(server),recordingSha256:hash(recording)};
}
function ownedChild(args,stdio){
 const child=spawn('ffmpeg',args,{stdio,windowsHide:true});let error,signal;
 const row={child,args,stdio,result:null};
 const closed=new Promise(resolve=>{child.once('error',e=>{error=String(e.message);});child.once('close',(code,s)=>{signal=s;row.result={exitCode:code,signal,error:error??null};resolve(row.result);});});child.closed=closed.then(x=>x.exitCode);return {...row,closed,get result(){return row.result;}};
}
async function fileBinding(file,maximum){const meta=await stat(file);check(meta.isFile()&&meta.size>0&&meta.size<=maximum,'file_bound');const bytes=await readFile(file);check(bytes.length===meta.size,'file_mutation');return {bytes,sha256:hash(bytes)};}
function stopData(data,reason){data.failure??=reason;for(const socket of data.sockets)socket.destroy();data.server?.close();if(data.receiver?.child.exitCode===null)data.receiver.child.kill('SIGKILL');}
/** Owns the listener, byte forwarding, disk writers and actual receiver child. */
export async function startCapturedRtmpReceiver({directory,receiverPort,settings,durationSeconds}){
 const parsed=parseMediaSettings(settings),profile=VIDEO_PROFILES[parsed.videoPreset];
 check(parsed.videoPreset==='720p30'&&parsed.audioBitrateKbps===320,'profile');
 check(Number.isInteger(durationSeconds)&&durationSeconds>=1&&durationSeconds<=CAPTURED_TRANSPORT_LIMITS.durationSeconds,'duration');
 check(Number.isInteger(receiverPort)&&receiverPort>=1024&&receiverPort<=65535,'port');check(typeof directory==='string'&&resolve(directory)===directory,'directory');
 const paths={client:join(directory,'captured-client.rtmp'),server:join(directory,'captured-server.rtmp'),recording:join(directory,'twitch.ts'),receiverStderr:join(directory,'captured-receiver.stderr'),proof:join(directory,'captured-transport-proof.json')};
 const data={paths,settings:parsed,profile,durationSeconds,sockets:new Set(),connections:0,ended:new Set(),closed:false,drained:false,failure:null,decode:null};
 data.writers=[];let clientWriter,serverWriter,errWriter;
 try{for(const [key,cap]of [['client',CAPTURED_TRANSPORT_LIMITS.clientBytes],['server',CAPTURED_TRANSPORT_LIMITS.serverBytes],['receiverStderr',CAPTURED_TRANSPORT_LIMITS.stderrBytes]])data.writers.push(boundedFile(paths[key],cap));[clientWriter,serverWriter,errWriter]=data.writers;}catch(error){for(const w of data.writers)w.close();throw error;}
 const receiverArgs=['-hide_banner','-loglevel','error','-listen','1','-i',`rtmp://127.0.0.1:${receiverPort}/live/test-key`,'-c','copy','-f','mpegts','-y',paths.recording];
 data.receiver=ownedChild(receiverArgs,['ignore','ignore','pipe']);
 data.receiver.child.stderr.on('data',b=>{try{errWriter.write(b);}catch{stopData(data,'receiver_stderr_bound');}});
 data.receiverStderrEof=false;data.receiver.child.stderr.once('end',()=>{data.receiverStderrEof=true;});
 data.server=createServer({allowHalfOpen:true},client=>{
  if(++data.connections!==1){client.destroy();stopData(data,'connection_population');return;}
  const upstream=connect({host:'127.0.0.1',port:receiverPort,allowHalfOpen:true});
  for(const [socket,other,writer,name] of [[client,upstream,clientWriter,'client'],[upstream,client,serverWriter,'server']]){
   data.sockets.add(socket);socket.on('data',b=>{try{writer.write(b);}catch{stopData(data,name+'_capture_bound');}});
   socket.once('end',()=>{data.ended.add(name);other.end();});
   socket.once('error',()=>stopData(data,name+'_socket_error'));
   socket.once('close',hadError=>{data.sockets.delete(socket);if(hadError||!data.ended.has(name))stopData(data,name+'_socket_incomplete');});
   socket.pipe(other,{end:false});
  }
 });
 data.server.on('error',()=>stopData(data,'listener_error'));
 let timeout,watch;
 try{
  await new Promise((yes,no)=>{data.server.once('error',no);data.server.listen(0,'127.0.0.1',yes);});
  timeout=setTimeout(()=>stopData(data,'capture_deadline'),(durationSeconds+120)*1000);
  watch=setInterval(async()=>{try{const s=await stat(paths.recording);if(s.size>CAPTURED_TRANSPORT_LIMITS.recordingBytes)stopData(data,'recording_bound');}catch{}},250);
  await sleep(300);check(data.receiver.result===null,'receiver_start');
 }catch(error){stopData(data,'start_failed');clearTimeout(timeout);clearInterval(watch);await data.receiver.closed;for(const w of data.writers)w.close();throw error;}
 const complete=async()=>{
  if(data.drained)return data.evidence;
  const limit=Date.now()+CAPTURED_TRANSPORT_LIMITS.drainMs;
  try{
   while((data.sockets.size||data.receiver.result===null)&&Date.now()<limit){if(data.failure)fail(data.failure);await sleep(25);}
   check(!data.sockets.size&&data.receiver.result!==null,'drain_deadline');
   const native=await data.receiver.closed;check(native.exitCode===0&&!native.signal&&!native.error&&data.receiverStderrEof,'receiver_exit');
   check(!data.failure&&data.connections===1&&data.ended.has('client')&&data.ended.has('server'),'capture_closure');
   await new Promise(yes=>data.server.close(yes));data.closed=true;
   for(const w of data.writers)w.close();
   const bindings={};for(const [key,cap] of [['client',CAPTURED_TRANSPORT_LIMITS.clientBytes],['server',CAPTURED_TRANSPORT_LIMITS.serverBytes],['recording',CAPTURED_TRANSPORT_LIMITS.recordingBytes]]){const b=await fileBinding(paths[key],cap);bindings[key]={file:paths[key],bytes:b.bytes.length,sha256:b.sha256};}
   const receiverStderr=await readFile(paths.receiverStderr);bindings.receiverStderr={file:paths.receiverStderr,bytes:receiverStderr.length,sha256:hash(receiverStderr)};
   data.evidence={kind:'physically-closed-transport',scope:'Complete observed local RTMP segment only; no encoder-input, priming/fill, native-program or provider assurance',settings:parsed,limits:CAPTURED_TRANSPORT_LIMITS,receiverArgs,receiverNative:native,receiverStderrEof:data.receiverStderrEof,connections:data.connections,clientEof:true,serverEof:true,bindings};data.drained=true;
   await writeFile(paths.proof,JSON.stringify(data.evidence,null,2)+'\n',{flag:'wx',mode:0o600});return freeze(data.evidence);
  }catch(error){stopData(data,'drain_failed');await data.receiver.closed;for(const w of data.writers)w.close();throw error;}
  finally{clearTimeout(timeout);clearInterval(watch);}
 };
 let draining;
 const handle=Object.freeze({proxyPort:data.server.address().port,proxyUrl:`rtmp://127.0.0.1:${data.server.address().port}/live`,filenames:freeze({...paths}),drain(){return draining??=complete();},async close(){if(data.decode){if(!data.decode.result)data.decode.capture.stop('producer_close');await data.decode.capture.finish();}if(data.closed)return;stopData(data,'closed');clearTimeout(timeout);clearInterval(watch);await data.receiver.closed;for(const w of data.writers)w.close();data.closed=true;},evidence(){check(data.drained,'not_drained');return data.evidence;}});
 producers.set(handle,data);return handle;
}
/** This entry point never accepts a caller-supplied subprocess or capture handle. */
export function startCapturedTransportDecode(handle,{file,original,stdio}){
 const data=producerData(handle);check(data.drained&&!data.failure&&!data.decode,'decode_state');check(resolve(file)===data.paths.recording,'recording_binding');
 const expected=programDecodeArguments(file,{width:data.profile.width,height:data.profile.height});check(equal(original,expected)&&equal(stdio,['ignore','ignore','pipe','pipe','pipe','pipe','pipe']),'decode_recipe');
 const recipe=Object.freeze([...original]),writers=new Map(),eof=new Set(),hashes=new Map(),publicPipes=Array.from({length:7},(_,fd)=>fd>=2?new PassThrough():null);let stopped=null;
 const caps={2:CAPTURED_TRANSPORT_LIMITS.stderrBytes,3:CAPTURED_TRANSPORT_LIMITS.rgbBytes,4:CAPTURED_TRANSPORT_LIMITS.pcmBytes,5:CAPTURED_TRANSPORT_LIMITS.metadataBytes,6:CAPTURED_TRANSPORT_LIMITS.metadataBytes};
 try{for(const fd of [2,3,4,5,6]){const path=join(resolve(data.paths.recording,'..'),fd===2?'captured-decode.stderr':`captured-decode-${fd}.bin`);writers.set(fd,boundedFile(path,caps[fd]));hashes.set(fd,createHash('sha256'));}}catch(error){for(const w of writers.values())w.close();throw error;}
 let native;try{native=ownedChild([...recipe],[...stdio]);}catch(error){for(const w of writers.values())w.close();throw error;}
 for(const fd of [2,3,4,5,6]){const writer=writers.get(fd);native.child.stdio[fd].on('data',b=>{try{writer.write(b);hashes.get(fd).update(b);publicPipes[fd].write(Buffer.from(b));}catch{stopped='decode_bound';native.child.kill('SIGKILL');}});native.child.stdio[fd].once('end',()=>{eof.add(fd);publicPipes[fd].end();});}
 // stderr is retained privately even if the consumer does not subscribe.
 publicPipes[2].resume();
 const timer=setTimeout(()=>{stopped='decode_deadline';native.child.kill('SIGKILL');},CAPTURED_TRANSPORT_LIMITS.decodeMs);
 const finished=native.closed.then(async result=>{clearTimeout(timer);const channels={};for(const [fd,w]of writers){const info=w.close();channels[fd]={...info,sha256:hashes.get(fd).digest('hex'),eof:eof.has(fd)};}
  const outcome=freeze({native:{...result,stopReason:stopped},argv:[...recipe],channels});data.decode.result=outcome;await writeFile(join(resolve(data.paths.recording,'..'),'captured-decode-proof.json'),JSON.stringify(outcome,null,2)+'\n',{flag:'wx',mode:0o600});return outcome;
 });
 const stop=reason=>{stopped=String(reason).slice(0,80);native.child.kill('SIGKILL');};
 // Consumer streams are copies. No caller receives the physical pipe emitters,
 // so prependListener/emit/removeAllListeners cannot forge private originals.
 const child=Object.freeze({stdio:Object.freeze(publicPipes),stderr:publicPipes[2],closed:native.child.closed,nativeClosed:native.closed,kill(){stop('consumer_kill');}});
 const capture=Object.freeze({child,stop,finish(){return finished;}});data.decode={capture,result:null};decodes.set(capture,data);return capture;
}
function audioBinding(chunks,rows){const digest=createHash('sha256');let bytes=0;check(Array.isArray(chunks)&&Array.isArray(rows),'audio_binding');for(const b of chunks){check(b instanceof Uint8Array,'audio_binding');bytes+=b.length;digest.update(b);}return {bytes,sha256:digest.digest('hex'),rowsSha256:hash(JSON.stringify(rows))};}
function videoBinding(rgb,rows){check(rgb instanceof Uint8Array&&Array.isArray(rows),'video_binding');return {bytes:rgb.length,sha256:hash(rgb),rowsSha256:hash(JSON.stringify(rows))};}
export async function inspectCapturedTransportClock(handle,capture){
 const data=producerData(handle);check(!data.clockConsumed,'clock_consumed');data.clockConsumed=true;
 const native=data.decode?.result;check(data.drained&&!data.failure&&native&&capture.nativeCapture===native,'native_binding');
 check(native.native.exitCode===0&&native.native.signal===null&&native.native.error===null&&native.native.stopReason===null&&Object.values(native.channels).every(x=>x.eof),'decode_closure');
 const files={};for(const [key,cap]of [['client',CAPTURED_TRANSPORT_LIMITS.clientBytes],['server',CAPTURED_TRANSPORT_LIMITS.serverBytes],['recording',CAPTURED_TRANSPORT_LIMITS.recordingBytes]]){files[key]=await fileBinding(data.paths[key],cap);check(files[key].sha256===data.evidence.bindings[key].sha256,'capture_mutation');}
 const facts=inspectCapturedTransportBytes(files.client.bytes,files.server.bytes,files.recording.bytes,{fps:data.profile.frameRate});
 const audio=audioBinding(capture.audioChunks,capture.audioRows),video=videoBinding(capture.rgb,capture.videoRows);
 check(audio.sha256===native.channels[4].sha256&&audio.bytes===native.channels[4].bytes&&video.sha256===native.channels[3].sha256&&video.bytes===native.channels[3].bytes,'decoded_binding');
 for(const [fd,rows,kind]of [[5,capture.videoRows,'video'],[6,capture.audioRows,'audio']]){const b=await fileBinding(native.channels[fd].file,CAPTURED_TRANSPORT_LIMITS.metadataBytes);check(b.sha256===native.channels[fd].sha256,'row_mutation');const parsed=parseMarkerMetadata(b.bytes.toString(),kind);check(equal(parsed,rows),'row_binding');}
 check(capture.audioRows.length===facts.audioUnits&&capture.videoRows.length===facts.frames&&audio.bytes===facts.samples*2&&video.bytes===facts.frames*6,'decode_population');
 capture.audioRows.forEach((r,i)=>check(r.index===i&&r.pts===facts.audioPts[i]&&r.samples===1024,'audio_replay'));
 capture.videoRows.forEach((r,i)=>check(r.index===i&&r.pts===facts.videoPts[i],'video_replay'));
 const audioRuns=capture.audioRows.flatMap((r,i)=>!i||r.pts!==capture.audioRows[i-1].pts+1024?[[i,r.pts]]:[]);
 const proof=await fileBinding(data.paths.proof,MB),decoderFile=join(resolve(data.paths.recording,'..'),'captured-decode-proof.json'),decoder=await fileBinding(decoderFile,MB);
 check(equal(JSON.parse(proof.bytes.toString()),data.evidence),'capture_proof_mutation');
 check(equal(JSON.parse(decoder.bytes.toString()),native),'decode_proof_mutation');
 const projection=freeze({kind:'CapturedTransportClock',scope:'physically-closed-transport',fps:facts.fps,samples:facts.samples,frames:facts.frames,domain:facts.domain,audioRows:structuredClone(capture.audioRows),videoRows:structuredClone(capture.videoRows),audioPtsRuns:audioRuns,audioRowCount:capture.audioRows.length,recordingSha256:facts.recordingSha256,audioSha256:audio.sha256,videoSha256:video.sha256,audioRowsSha256:audio.rowsSha256,videoRowsSha256:video.rowsSha256,evidence:{file:data.paths.proof,sha256:proof.sha256,bytes:proof.bytes.length},decoderEvidence:{file:decoderFile,sha256:decoder.sha256,bytes:decoder.bytes.length}});
 const clock=Object.freeze({kind:'CapturedTransportClock'});certificates.set(clock,{projection,audio,video});return clock;
}
export function isCapturedTransportClock(clock){return certificates.has(clock);}
export function capturedTransportProjection(clock){const data=certificates.get(clock);check(data,'unproven');return data.projection;}
export function assertCapturedAudioClock(clock,chunks,rows){const data=certificates.get(clock);check(data&&equal(data.audio,audioBinding(chunks,rows)),'audio_binding');return clock;}
export function assertCapturedVideoClock(clock,rgb,rows){const data=certificates.get(clock);check(data&&equal(data.video,videoBinding(rgb,rows)),'video_binding');return clock;}
