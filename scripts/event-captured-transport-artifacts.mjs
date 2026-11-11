// Fixed bounded ordinary-capture artifact policy. No clock or capture authority.
const MB=1048576;
export const CAPTURED_TRANSPORT_LIMITS=Object.freeze({durationSeconds:600,clientBytes:256*MB,serverBytes:4*MB,recordingBytes:256*MB,pcmBytes:64*MB,rgbBytes:256*1024,metadataBytes:24*MB,stderrBytes:MB,drainMs:10000,decodeMs:120000});
export const CAPTURED_TRANSPORT_ARTIFACTS=Object.freeze(['captured-client.rtmp','captured-server.rtmp','captured-receiver.stderr','captured-transport-proof.json','captured-decode-3.bin','captured-decode-4.bin','captured-decode-5.bin','captured-decode-6.bin','captured-decode.stderr','captured-decode-proof.json']);
export const CAPTURED_TRANSPORT_ARTIFACT_LIMITS=Object.freeze(Object.fromEntries(CAPTURED_TRANSPORT_ARTIFACTS.map(name=>[name,name==='captured-client.rtmp'?256*MB:name==='captured-server.rtmp'?4*MB:name==='captured-decode-3.bin'?256*1024:name==='captured-decode-4.bin'?64*MB:['captured-decode-5.bin','captured-decode-6.bin'].includes(name)?24*MB:MB])));
export function isCapturedTransportArtifact(name){return CAPTURED_TRANSPORT_ARTIFACTS.includes(name);}
/** Narrow capture model only. Other valid benchmarks retain their original
 * strict receiver and timestamp verification path. This grants no admission. */
export function isCapturedTransportApplicable(request){return request?.settings?.videoPreset==='720p30'&&request.settings.audioBitrateKbps===320&&Number.isInteger(request.durationSeconds)&&request.durationSeconds>=1&&request.durationSeconds<=CAPTURED_TRANSPORT_LIMITS.durationSeconds;}
