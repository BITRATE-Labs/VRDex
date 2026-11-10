import { createTwitchInput } from "./twitch-input.mjs";
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { parseMediaSettings, VIDEO_PROFILES } from './broadcast-profiles.mjs';
/** A random per-job visual identity survives the provider's video transcode. */
export function markerBits(marker) {
 if(typeof marker!=='string'||!/^[a-f0-9]{32}$/.test(marker))throw Error('Invalid test identity');
 return [...createHash('sha256').update(marker).digest().subarray(0,8)].flatMap(byte=>Array.from({length:8},(_,bit)=>(byte>>(7-bit))&1));
}
export function matchingMarker(frame,marker){
 if(frame.length!==8*8*3)return false;
 return markerBits(marker).every((bit,i)=>{const rgb=[...frame.subarray(i*3,i*3+3)];return bit?rgb.every(c=>c>190):rgb.every(c=>c<65);});
}
export function connectionTestEncoderArguments({marker,mediaSettings}) {
 const settings=parseMediaSettings(mediaSettings),profile=VIDEO_PROFILES[settings.videoPreset];
 const boxes=markerBits(marker).map((bit,i)=>`drawbox=x=${i%8*32}:y=${Math.floor(i/8)*32}:w=32:h=32:color=${bit?'white':'black'}:t=fill`).join(',');
 return ['-hide_banner','-loglevel','error','-nostdin','-progress','pipe:3','-re','-f','lavfi','-i',`color=c=0x202838:s=${profile.width}x${profile.height}:r=${profile.frameRate}`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-vf',boxes,'-t','60','-c:v','libx264','-threads','2','-preset','veryfast','-tune','zerolatency','-pix_fmt','yuv420p','-g',String(profile.frameRate),'-b:v',`${profile.videoBitrateKbps}k`,'-c:a','aac','-b:a',`${settings.audioBitrateKbps}k`,'-f','mpegts','pipe:1'];
}
export function createConnectionTestRenderer({connectionTest,mediaSettings,onError=()=>{},launch=spawn}) {
 let child,stopped=false,bytes=0,outputMs=0;const listeners=new Set();
 return {subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},getState:()=>({outputMs,running:!!child&&!stopped&&child.exitCode===null,publishing:bytes>0}),async start(){if(stopped)throw Error('Test stopped');child=launch('ffmpeg',connectionTestEncoderArguments({marker:connectionTest.marker,mediaSettings}),{stdio:['ignore','pipe','ignore','pipe']});createInterface({input:child.stdio[3]}).on('line',line=>{if(line.startsWith('out_time_us='))outputMs=Number(line.slice(12))/1000;});child.stdout.on('data',chunk=>{bytes+=chunk.length;for(const listener of listeners)listener(chunk);});child.on('error',onError);child.on('exit',()=>{if(!stopped)onError();});},async stop(){stopped=true;if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGKILL');});}};
}
/** Readback decodes pixels, never treats a response, timer, socket or byte count as success. */
export async function decodeConnectionTest({url,marker,mediaSettings,timeoutMs=10000,launch=spawn,acquireTwitch=createTwitchInput,createRelay}){
 markerBits(marker);
 const startedAt=Date.now(),profile=VIDEO_PROFILES[parseMediaSettings(mediaSettings).videoPreset];
 const endpoint=new URL(url);
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.port||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(endpoint.hostname))throw Error('Invalid test playback URL');
 const deadlineAt=startedAt+timeoutMs,signal=AbortSignal.timeout(timeoutMs);
 const twitchHost=endpoint.hostname.replace(/^www\./,'')==='twitch.tv';
 const channelParts=endpoint.pathname.split('/').filter(Boolean);
 const channel=channelParts[0]?.toLowerCase();
 const reserved=new Set(['directory','downloads','jobs','p','settings','subscriptions','turbo','videos']);
 if(twitchHost&&(endpoint.search||endpoint.hash||channelParts.length!==1||!channel||!/^[a-z0-9_]{3,25}$/.test(channel)||reserved.has(channel)))throw Error('Invalid Twitch channel');
 let handle,relay;
 try {
  if(twitchHost){
   handle=acquireTwitch({source:{kind:'twitch',channel},settings:parseMediaSettings(mediaSettings),signal,preparationExpiresAt:deadlineAt,sessionExpiresAt:deadlineAt});
  }else{
   const factory=createRelay??(await import('./direct-media-input.mjs')).createDirectMediaRelay;
   relay=await factory({limits:{lifetimeMs:timeoutMs,requestMs:timeoutMs,sessionBytes:32*1024*1024,responseBytes:16*1024*1024}});
   handle=relay.createInput({source:{input:{kind:'direct_media',url:endpoint.href}},signal});
  }
  const descriptor=await handle.transportReady;
  if(Date.now()>=deadlineAt||signal.aborted)return false;
  return await decodeMarkerFrame({input:descriptor.url,demuxer:twitchHost?'mpegts':descriptor.demuxer,marker,encodedSize:profile,timeoutMs:Math.max(1,deadlineAt-Date.now()),launch});
 } finally {await handle?.dispose();relay?.stop();}
}
export async function decodeMarkerFrame({input,demuxer,marker,encodedSize,timeoutMs=10000,launch=spawn}) {
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid readback bound');
 return new Promise((resolve,reject)=>{
  const child=launch('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-rw_timeout',String(Math.ceil(timeoutMs*1000)),...(demuxer?['-protocol_whitelist','http,tcp,crypto','-format_whitelist','mpegts,hls,mov,matroska,webm,aac','-f',demuxer]:[]),'-i',input,'-an','-vf',`${encodedSize?`crop=iw*256/${encodedSize.width}:ih*256/${encodedSize.height}:0:0`:'crop=256:256:0:0'},scale=8:8:flags=area`,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{stdio:['ignore','pipe','ignore']});
  let buffer=Buffer.alloc(0),expired=false;const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},timeoutMs);
  child.stdout.on('data',data=>{if(buffer.length+data.length>192){child.kill('SIGKILL');return;}buffer=Buffer.concat([buffer,data]);});
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);resolve(!expired&&code===0&&matchingMarker(buffer,marker));});
 });
}
