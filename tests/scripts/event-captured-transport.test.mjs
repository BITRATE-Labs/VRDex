import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createServer, connect } from 'node:net';
import { createHash } from 'node:crypto';
import { spawn as spawnSocketPublisher } from 'node:child_process';
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
// This test endpoint forwards setup through a complete local FFmpeg
// Publish.Start response, then owns subsequent receiver controls. Publisher
// EOF may be withheld by backpressure, so it is not the phase boundary.
const PUBLISH_START_PREFIX=Buffer.from('0200086f6e5374617475730000000000000000000503','hex');
function isPublishStart(message){
 if(message?.type!==20||message.streamId<1||!message.payload.subarray(0,PUBLISH_START_PREFIX.length).equals(PUBLISH_START_PREFIX))return false;
 const fields=new Map(),raw=message.payload;let at=PUBLISH_START_PREFIX.length;
 while(at+3<=raw.length&&!raw.subarray(at,at+3).equals(Buffer.from([0,0,9]))){
  const keyBytes=raw.readUInt16BE(at);at+=2;assert(keyBytes>0&&at+keyBytes+3<=raw.length,'Malformed onStatus key');
  const key=raw.subarray(at,at+keyBytes).toString('utf8');at+=keyBytes;assert.equal(raw[at++],2,'Only the local FFmpeg string-valued onStatus object is supported');
  const valueBytes=raw.readUInt16BE(at);at+=2;assert(at+valueBytes<=raw.length&&!fields.has(key),'Malformed onStatus value');
  fields.set(key,raw.subarray(at,at+valueBytes).toString('utf8'));at+=valueBytes;
 }
 assert(at+3===raw.length&&raw.subarray(at).equals(Buffer.from([0,0,9])),'Malformed onStatus object end');
 return fields.get('level')==='status'&&fields.get('code')==='NetStream.Publish.Start';
}
const publishStartReply=()=>Buffer.concat([handshake(),message(20,Buffer.concat([PUBLISH_START_PREFIX,Buffer.from('00056c6576656c0200067374617475730004636f64650200174e657453747265616d2e5075626c6973682e5374617274000009','hex')]))]);
async function startFinitePublisherRelay(capturePort,durationSeconds,{holdPublisherReads=false}={}){
 let hold=holdPublisherReads;
 assert(Number.isInteger(durationSeconds)&&durationSeconds>=1&&durationSeconds<=CAPTURED_TRANSPORT_LIMITS.durationSeconds);
 const sockets=new Set(),joins=[],errors=[];
 const publisherHash=createHash('sha256'),reverseHash=createHash('sha256');
 let connections=0,publisherBytes=0,forwardedBytes=0,reverseBytes=0,consumedAfterEof=0,consumedAfterPublish=0;
 let setup=Buffer.alloc(0),setupScan=3073,published=false,setupBoundary,publisherSocket,pauseNotice,controlNotice;
 const paused=new Promise(resolve=>{pauseNotice=resolve;}),controlConsumed=new Promise(resolve=>{controlNotice=resolve;});
 let publisherEof=false,captureEof=false,publisherFinished=false,captureFinished=false,closedSockets=0;
 let timer;
 const listener=createServer({allowHalfOpen:true},publisher=>{
  if(++connections!==1){publisher.destroy();fail('relay_connection_population');return;}
  listener.close();publisherSocket=publisher;
  const capture=connect({host:'127.0.0.1',port:capturePort,allowHalfOpen:true});
  for(const [name,socket]of [['publisher',publisher],['capture',capture]]){
   sockets.add(socket);
   joins.push(new Promise(resolve=>socket.once('close',hadError=>{sockets.delete(socket);closedSockets++;if(hadError)fail(name+'_close_error');resolve();})));
   socket.on('error',error=>fail(name+'_'+error.code));
  }
  publisher.on('data',bytes=>{
   publisherBytes+=bytes.length;
   if(publisherBytes>CAPTURED_TRANSPORT_LIMITS.clientBytes){fail('relay_publisher_bound');return;}
   publisherHash.update(bytes);
   if(!capture.write(bytes,error=>{if(error)fail('relay_forward_'+error.code);else forwardedBytes+=bytes.length;})){publisher.pause();pauseNotice();}
  });
  capture.on('drain',()=>{if(!hold)publisher.resume();});
  capture.on('data',bytes=>{
   reverseBytes+=bytes.length;
   if(reverseBytes>CAPTURED_TRANSPORT_LIMITS.serverBytes){fail('relay_reverse_bound');return;}
   reverseHash.update(bytes);
   function consume(bytes){if(!bytes)return;consumedAfterPublish+=bytes;if(publisherEof)consumedAfterEof+=bytes;controlNotice({bytes,publisherPaused:publisher.isPaused(),publisherEof,published});}
   if(published){consume(bytes.length);return;}
   const before=setup.length;
   if(before+bytes.length>16384){fail('relay_setup_bound');return;}
   setup=Buffer.concat([setup,bytes]);
   for(;setupScan<=setup.length;setupScan++){
    let messages;
    try{messages=parseCapturedRtmp(setup.subarray(0,setupScan));}
    catch(error){if(/^captured_transport_(?:chunk_truncated|message_incomplete)$/.test(error.message))continue;fail('relay_setup_parse_'+error.message);return;}
    try{if(isPublishStart(messages.at(-1))){published=true;setupBoundary=setupScan;break;}}
    catch(error){fail('relay_setup_status_'+error.message);return;}
   }
   const forward=published?bytes.subarray(0,setupBoundary-before):bytes;
   if(forward.length&&!publisher.write(forward,error=>{if(error)fail('relay_reverse_'+error.code);}))capture.pause();
   if(published){consume(bytes.length-forward.length);setup=Buffer.alloc(0);}
  });
  publisher.on('drain',()=>capture.resume());
  publisher.once('end',()=>{
   publisherEof=true;if(!published){fail('relay_setup_incomplete');return;}
   // end() flushes all queued publisher bytes before sending capture-side FIN.
   capture.end();publisher.end();capture.resume();
  });
  capture.once('end',()=>{captureEof=true;if(!publisherEof)fail('relay_premature_capture_eof');});
  publisher.once('finish',()=>{publisherFinished=true;});
  capture.once('finish',()=>{captureFinished=true;});
  if(hold){publisher.pause();pauseNotice();}
 });
 const listenerClosed=new Promise(resolve=>listener.once('close',resolve));
 function fail(reason){errors.push(reason);for(const socket of sockets)socket.destroy();if(listener.listening)listener.close();}
 listener.on('error',error=>fail('relay_listener_'+error.code));
 await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
 timer=setTimeout(()=>fail('relay_deadline'),durationSeconds*1000+15000);
 const receipt=()=>({connections,publisherBytes,forwardedBytes,reverseBytes,consumedAfterEof,consumedAfterPublish,published,setupBoundary,publisherEof,captureEof,publisherFinished,captureFinished,closedSockets,errors:[...errors]});
 async function close(){
  clearTimeout(timer);
  if(listener.listening)listener.close();
  for(const socket of sockets)socket.destroy();
  await Promise.all(joins);await listenerClosed;
 }
 return {
  proxyUrl:`rtmp://127.0.0.1:${listener.address().port}/live`,
  paused,controlConsumed,publisherPaused:()=>publisherSocket?.isPaused()??false,
  releasePublisherReads(){hold=false;publisherSocket?.resume();},
  async finish(){
   try{
    await Promise.all(joins);await listenerClosed;
    assert.deepEqual(errors,[]);assert.equal(connections,1);assert.equal(closedSockets,2);
    assert(published&&publisherEof&&captureEof&&publisherFinished&&captureFinished,'Relay requires Publish.Start, both EOFs and completed writable halves');
    assert(publisherBytes>3073&&reverseBytes>=3073);assert.equal(forwardedBytes,publisherBytes);
    return {...receipt(),publisherSha256:publisherHash.digest('hex'),reverseSha256:reverseHash.digest('hex')};
   }finally{clearTimeout(timer);}
  },close,
 };
}

test('finite test relay preserves bytes through setup and consumes post-publish replies',{timeout:5000},async()=>{
 // Actual local FFmpeg onStatus shape from the retained cf085 native capture.
 const nativeStatus=Buffer.from('0200086f6e537461747573000000000000000000050300056c6576656c0200067374617475730004636f64650200174e657453747265616d2e5075626c6973682e5374617274000b6465736372697074696f6e020019746573742d6b6579206973206e6f77207075626c6973686564000764657461696c73020008746573742d6b6579000009','hex');
 assert.equal(isPublishStart({type:20,streamId:1,payload:nativeStatus}),true);assert.throws(()=>isPublishStart({type:20,streamId:1,payload:nativeStatus.subarray(0,-1)}),/Malformed/);
 const received=[],publisherReceived=[],receiverErrors=[],publisherErrors=[],receiverSockets=new Set();
 const initialReply=publishStartReply(),lateReply=Buffer.from('receiver controls after publisher EOF');
 let lateTimer,relay,publisher;
 const receiver=createServer({allowHalfOpen:true},socket=>{
  receiverSockets.add(socket);receiver.close();
  socket.on('error',error=>receiverErrors.push(error.code));socket.once('close',()=>receiverSockets.delete(socket));
  socket.write(initialReply);socket.pause();setTimeout(()=>socket.resume(),50);
  socket.on('data',bytes=>received.push(Buffer.from(bytes)));
  socket.once('end',()=>{lateTimer=setTimeout(()=>socket.end(lateReply),20);});
 });
 const receiverClosed=new Promise(resolve=>receiver.once('close',resolve));
 await new Promise((resolve,reject)=>{receiver.once('error',reject);receiver.listen(0,'127.0.0.1',resolve);});
 try{
  relay=await startFinitePublisherRelay(receiver.address().port,1);
  publisher=connect({host:'127.0.0.1',port:Number(new URL(relay.proxyUrl).port),allowHalfOpen:true});
  publisher.on('error',error=>publisherErrors.push(error.code));
  const publisherClosed=new Promise(resolve=>publisher.once('close',resolve));
  await new Promise((resolve,reject)=>{publisher.on('data',bytes=>{publisherReceived.push(Buffer.from(bytes));if(Buffer.concat(publisherReceived).length>=initialReply.length)resolve();});publisher.once('error',reject);});
  const bytes=Buffer.alloc(4*1024*1024,73);publisher.end(bytes);
  const receipt=await relay.finish();await publisherClosed;await receiverClosed;
  assert.deepEqual(Buffer.concat(received),bytes);assert.deepEqual(Buffer.concat(publisherReceived),initialReply);
  assert.equal(receipt.publisherSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(receipt.reverseSha256,createHash('sha256').update(initialReply).update(lateReply).digest('hex'));
  assert.equal(receipt.publisherBytes,bytes.length);assert.equal(receipt.forwardedBytes,bytes.length);assert.equal(receipt.reverseBytes,initialReply.length+lateReply.length);
  assert.equal(receipt.consumedAfterEof,lateReply.length);assert.deepEqual(receiverErrors,[]);assert.deepEqual(publisherErrors,[]);
 }finally{clearTimeout(lateTimer);publisher?.destroy();await relay?.close();for(const socket of receiverSockets)socket.destroy();if(receiver.listening)receiver.close();await receiverClosed;}
});

for(const closeMode of ['exit','destroy'])test('post-publish controls are consumed while a full-closed publisher EOF is paused: '+closeMode,{timeout:7000},async t=>{
 const initialReply=publishStartReply(),control=Buffer.from('control during paused publisher EOF'),bytes=Buffer.alloc(16*1024,73),received=[],errors=[];
 let target,relay,child,childClosed,phase='setup';const phases=[];
 const receiver=createServer({allowHalfOpen:true},socket=>{
  target=socket;receiver.close();socket.on('error',error=>errors.push(error.code));socket.pause();socket.write(initialReply);
  socket.on('data',bytes=>received.push(Buffer.from(bytes)));socket.once('end',()=>socket.end());
 });
 const receiverClosed=new Promise(resolve=>receiver.once('close',resolve));
 await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve));
 let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Socket regression deadline while awaiting '+phase)),5000);});
 async function guard(promise,name){phase=name;phases.push({phase:name,state:'waiting'});const value=await Promise.race([promise,deadline]);phases.push({phase:name,state:'completed'});return value;}
 try{
  relay=await guard(startFinitePublisherRelay(receiver.address().port,1,{holdPublisherReads:true}),'relay setup');
  const code="const net=require('node:net');let n=0,started=false;const s=net.connect({host:'127.0.0.1',port:Number(process.argv[1]),allowHalfOpen:true});s.on('error',()=>process.exit(2));s.on('data',b=>{n+=b.length;if(!started&&n>=Number(process.argv[2])){started=true;s.end(Buffer.alloc(Number(process.argv[4]),73),()=>{if(process.argv[3]==='exit')process.exit(0);else s.destroySoon();});}});s.on('close',()=>process.exit(0));";
  child=spawnSocketPublisher(process.execPath,['-e',code,String(new URL(relay.proxyUrl).port),String(initialReply.length),closeMode,String(bytes.length)],{stdio:['ignore','ignore','ignore']});
  childClosed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  await guard(relay.paused,'explicit publisher pause barrier');const exit=await guard(childClosed,'publisher native close');assert.deepEqual(exit,{code:0,signal:null});assert.equal(relay.publisherPaused(),true,'The full-close regression must hold EOF behind an explicit read barrier');
  target.write(control);const consumed=await guard(relay.controlConsumed,'positive post-publish control consumption');assert.deepEqual(consumed,{bytes:control.length,publisherPaused:true,publisherEof:false,published:true});assert.equal(relay.publisherPaused(),true);relay.releasePublisherReads();target.resume();
  const receipt=await guard(relay.finish(),'full byte/hash and EOF join');assert.equal(receipt.published,true);assert.equal(receipt.setupBoundary,initialReply.length);assert.equal(receipt.consumedAfterPublish,control.length);assert.equal(receipt.publisherBytes,bytes.length);assert.equal(receipt.forwardedBytes,bytes.length);assert.equal(receipt.publisherSha256,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(Buffer.concat(received),bytes);assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({closeMode,phases,publisherExit:exit,consumed,receipt}));
 }catch(error){t.diagnostic(JSON.stringify({closeMode,phases,awaiting:phase,error:error.message}));throw error;}finally{clearTimeout(timer);if(child?.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await childClosed;await relay?.close();target?.destroy();if(receiver.listening)receiver.close();await receiverClosed;}
});

for(const mode of ['malformed','bound'])test('relay rejects invalid setup without reaching published phase: '+mode,{timeout:5000},async()=>{
 const invalid=mode==='malformed'?publishStartReply():Buffer.concat([handshake(),message(1,Buffer.from([0,0,128,0])),message(20,Buffer.alloc(32768))]).subarray(0,16385);
 if(mode==='malformed')invalid[invalid.length-1]=8;
 let target,relay,publisher;const socketErrors=[];
 const receiver=createServer({allowHalfOpen:true},socket=>{target=socket;receiver.close();socket.on('error',error=>socketErrors.push(error.code));socket.end(invalid);});
 const receiverClosed=new Promise(resolve=>receiver.once('close',resolve));await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve));
 try{
  relay=await startFinitePublisherRelay(receiver.address().port,1);publisher=connect(new URL(relay.proxyUrl).port,'127.0.0.1');publisher.resume();publisher.on('error',error=>socketErrors.push(error.code));
  await new Promise(resolve=>publisher.once('close',resolve));await assert.rejects(relay.finish(),mode==='malformed'?/relay_setup_status_/:/relay_setup_bound/);assert(socketErrors.every(code=>['ECONNRESET','EPIPE'].includes(code)),'Unexpected negative-setup cleanup error');
 }finally{publisher?.destroy();await relay?.close();target?.destroy();if(receiver.listening)receiver.close();await receiverClosed;}
});

// Positive provenance uses finite native source/publisher EOF, never an arbitrary
// canonical stop cut. The canonical publisher codec/mux recipe stays unchanged.
async function startOwnedFixture(directory,{quiet=false,durationSeconds=6}={}){
 const {createProcessOwner}=await import(runtimeModule('scripts/event-proof-processes.mjs'));
 const {outputArguments}=await import(runtimeModule('workers/restream/output-arguments.mjs'));
 const owner=createProcessOwner(),diagnostics={source:[],publisher:[]},stderrBytes={source:0,publisher:0},stderrEof={source:false,publisher:false},errors=[];
 let producer,relay,source,publisher,timer;
 const close=async()=>{clearTimeout(timer);if(source?.exitCode===null)source.kill('SIGKILL');if(publisher?.exitCode===null)publisher.kill('SIGKILL');try{await relay?.close();await producer?.close();}finally{const cleanup=await owner.close();await writeFile(join(directory,'fixture-cleanup.json'),JSON.stringify(cleanup,null,2)+'\n');}};
 function diagnostic(name,child){child.stderr.on('data',bytes=>{stderrBytes[name]+=bytes.length;if(stderrBytes[name]>65536){errors.push(name+'_stderr_bound');child.kill('SIGKILL');}else diagnostics[name].push(Buffer.from(bytes));});child.stderr.once('end',()=>{stderrEof[name]=true;});child.once('error',error=>errors.push(name+'_'+error.code));}
 async function saveDiagnostics(){await writeFile(join(directory,'fixture-source.stderr'),Buffer.concat(diagnostics.source));await writeFile(join(directory,'fixture-sender.stderr'),Buffer.concat(diagnostics.publisher));}
 try{
  producer=await startCapturedRtmpReceiver({directory,receiverPort:19743,settings:{videoPreset:'720p30',audioBitrateKbps:320},durationSeconds});
  relay=await startFinitePublisherRelay(producer.proxyPort,durationSeconds);
  const sourceArgs=['-hide_banner','-v','error','-re','-f','lavfi','-i',quiet?'color=c=gray:s=1280x720:r=30':'testsrc2=s=1280x720:r=30','-f','lavfi','-i',quiet?'anullsrc=r=48000:cl=stereo':'sine=frequency=440:sample_rate=48000','-t',String(durationSeconds),'-c:v','libx264','-threads','2','-preset','ultrafast','-bf','0','-g','30','-c:a','aac','-ac','2','-b:a','320k','-f','mpegts','pipe:1'];
  const publisherArgs=outputArguments('twitch',{url:relay.proxyUrl,key:'test-key'},resolveDestinationProfile({settings:{videoPreset:'720p30',audioBitrateKbps:320},destination:'twitch'}));
  publisher=owner.start('ffmpeg',publisherArgs,{stdio:['pipe','ignore','pipe','pipe']});diagnostic('publisher',publisher);
  source=owner.start('ffmpeg',sourceArgs,{stdio:['ignore','pipe','pipe']});diagnostic('source',source);
  let sourceEof=false,sourceBytes=0,progressBytes=0;
  source.stdout.once('end',()=>{sourceEof=true;});
  source.stdout.on('data',bytes=>{sourceBytes+=bytes.length;if(sourceBytes>CAPTURED_TRANSPORT_LIMITS.recordingBytes){errors.push('source_byte_bound');source.kill('SIGKILL');publisher.kill('SIGKILL');}});
  publisher.stdin.on('error',error=>{errors.push('publisher_stdin_'+error.code);source.kill('SIGKILL');publisher.kill('SIGKILL');});
  publisher.stdio[3].on('data',bytes=>{progressBytes+=bytes.length;if(progressBytes>65536){errors.push('publisher_progress_bound');publisher.kill('SIGKILL');}});
  source.stdout.pipe(publisher.stdin);
  timer=setTimeout(()=>{errors.push('fixture_deadline');source.kill('SIGKILL');publisher.kill('SIGKILL');},durationSeconds*1000+15000);
  const [sourceExit,publisherExit]=await Promise.all([source.closed,publisher.closed]);
  assert.equal(sourceExit,0);assert.equal(publisherExit,0);assert.equal(sourceEof,true);assert.equal(publisher.stdin.writableFinished,true);assert.deepEqual(stderrEof,{source:true,publisher:true});assert.deepEqual(errors,[]);
  const relayReceipt=await relay.finish();
  // Keep the strict factory drain and subsequent full native population join.
  await producer.drain();
  const evidence=producer.evidence();
  assert.equal(evidence.bindings.client.bytes,relayReceipt.publisherBytes);assert.equal(evidence.bindings.client.sha256,relayReceipt.publisherSha256);
  assert.equal(evidence.bindings.server.bytes,relayReceipt.reverseBytes);assert.equal(evidence.bindings.server.sha256,relayReceipt.reverseSha256);
  await saveDiagnostics();await writeFile(join(directory,'fixture-finite.json'),JSON.stringify({sourceArgs,publisherArgs,sourceExit,publisherExit,sourceEof,sourceBytes,stderrEof,progressBytes,relay:relayReceipt},null,2)+'\n');
  clearTimeout(timer);return {producer,close};
 }catch(error){let cleanupError;try{await close();}catch(failure){cleanupError=failure.message;}await saveDiagnostics();await writeFile(join(directory,'fixture-failure.json'),JSON.stringify({error:error.message,cleanupError,errors,stderrEof},null,2)+'\n');if(cleanupError)throw new AggregateError([error,Error(cleanupError)],'Fixture and cleanup failed');throw error;}
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

test('format-3 AAC header with zero of eight inherited payload bytes rejects',()=>{const prefix=Buffer.concat([handshake(),message(8,Buffer.from('af012110045608c1','hex'),21)]);assert.equal(parseCapturedRtmp(prefix)[0].payload.length,8);assert.throws(()=>parseCapturedRtmp(Buffer.concat([prefix,Buffer.from([195])])),/captured_transport_chunk_truncated/);});

async function negativeOwnedCapture(mode){
 const base=process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT,directory=base?join(base,'negative-'+mode):await mkdtemp(join(tmpdir(),'captured-negative-'));
 if(base)await mkdir(directory);
 let producer,fixture;
 try{
  fixture=await startOwnedFixture(directory,{durationSeconds:3});producer=fixture.producer;
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
  fixture=await startOwnedFixture(directory,{quiet:true,durationSeconds:8});producer=fixture.producer;
  const decoded=await decodeCapturedTransportMarkerRecord(owner,producer.filenames.recording,{transportCapture:producer,width:1280,height:720,maxSeconds:10});
  assert.equal(decoded.recordingSha256,producer.evidence().bindings.recording.sha256);assert.equal(decoded.episodes.length,0);assert.equal(decoded.visuals.length,0);assert(decoded.audioMetadataRows>200&&decoded.videoFrames>170);
  const wire=decoded.transportClock;assert(wire,'captured semantic wire must survive common core');transportProjectionFromWire(wire,decoded);
  await writeFile(join(directory,'common-core-summary.json'),JSON.stringify({recordingSha256:decoded.recordingSha256,audioRows:decoded.audioMetadataRows,videoFrames:decoded.videoFrames,transportClock:wire},null,2)+'\n');
 }finally{await fixture?.close();await owner.close();if(!base)await rm(directory,{recursive:true,force:true});}
});
const {createOutputSender}=await import(runtimeModule('workers/restream/output-sender.mjs'));
test('canonical sender stopNow SIGKILL is a lifecycle fence, not capture provenance',{skip:process.env.CAPTURED_TRANSPORT_NATIVE!=='1',timeout:40000},async()=>{
 const base=process.env.CAPTURED_TRANSPORT_NATIVE_OUTPUT,directory=base?join(base,'production-stop'):await mkdtemp(join(tmpdir(),'captured-stop-'));if(base)await mkdir(directory);
 const {createProcessOwner}=await import(runtimeModule('scripts/event-proof-processes.mjs'));const owner=createProcessOwner();let capture,sender,source,senderProcess,senderClosed;const signals=[],health=[],spawns=[];let sourceEnded=false,unsubscribed=false;
 try{
  capture=await startCapturedRtmpReceiver({directory,receiverPort:19743,settings:{videoPreset:'720p30',audioBitrateKbps:320},durationSeconds:12});
  source=owner.start('ffmpeg',['-hide_banner','-v','error','-re','-f','lavfi','-i','color=c=gray:s=1280x720:r=30','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-c:v','libx264','-threads','2','-preset','ultrafast','-bf','0','-g','30','-c:a','aac','-ac','2','-b:a','320k','-f','mpegts','pipe:1'],{stdio:['ignore','pipe','pipe']});source.stderr.resume();source.stdout.once('end',()=>{sourceEnded=true;});
  sender=createOutputSender({destination:'twitch',profile:resolveDestinationProfile({settings:{videoPreset:'720p30',audioBitrateKbps:320},destination:'twitch'}),credentialRef:'synthetic',resolveCredential:()=>JSON.stringify({rtmpUrl:'rtmp://live.twitch.tv/app',streamKey:'test-key'}),program:{subscribe(fn){source.stdout.on('data',fn);return()=>{unsubscribed=true;source.stdout.off('data',fn);};}},onHealth:state=>health.push({...state}),spawnProcess:(command,args,options)=>{const local=[...args];local[local.length-1]=capture.proxyUrl+'/test-key';spawns.push({command,args:[...local]});const child=owner.start(command,local,options);senderProcess=child;const kill=child.kill.bind(child);child.kill=signal=>{signals.push(signal);return kill(signal);};senderClosed=new Promise(yes=>child.once('close',(code,signal)=>yes({code,signal})));return child;}});
  await sender.start();const deadline=Date.now()+15000;
  while(!(sender.getState().publishing&&sender.getState().outputMs>=5000)){assert(Date.now()<deadline,'Canonical sender did not publish within bound');assert.equal(sender.getState().restarts,0);await sleep(20);}
  const publishing=sender.getState();assert.equal(spawns.length,1);assert.equal(sourceEnded,false,'Stop must occur with ongoing upstream input, not finite EOF');sender.stopNow();assert.equal(sender.getState().status,'stopped');assert.equal(sender.getState().publishing,false);assert.equal(unsubscribed,true);sender.enqueue(Buffer.alloc(188));
  const exit=await senderClosed;assert.equal(exit.signal,'SIGKILL');assert(signals.includes('SIGKILL'));source.kill('SIGKILL');await source.closed;
  await capture.close();assert.throws(()=>capture.evidence(),/not_drained/);
  const fencedBytes=(await readFile(capture.filenames.client)).length;sender.enqueue(Buffer.alloc(188));await sleep(50);assert.equal((await readFile(capture.filenames.client)).length,fencedBytes);assert.equal(sender.getState().restarts,0);assert.equal(spawns.length,1);assert.equal(sender.getState().status,'stopped');assert.equal(unsubscribed,true);
  await writeFile(join(directory,'production-stop-summary.json'),JSON.stringify({passed:true,scope:'Lifecycle fence only: canonical SIGKILL/unsubscribe and stable bytes after owned child/socket close; no capture or clock provenance',publishing,afterStop:sender.getState(),senderExit:exit,signals,spawnCount:spawns.length,spawns,unsubscribed,fencedBytes},null,2)+'\n');
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
