/** Ordinary owned transport observation only. This module is deliberately
 * outside the offline native ProgramClock implementation closure. */
import {collectMarkerDecodeObservations,summarizeDecodedMarkerFacts,observeMediaOutputFacts,markerMeasurementOptions} from './event-capacity-media.mjs';
import {startCapturedTransportDecode,inspectCapturedTransportClock,capturedTransportProjection,assertCapturedAudioClock,assertCapturedVideoClock} from './event-captured-transport.mjs';
import {classifyObservedSourceAudio} from './event-source-markers.mjs';
import {decodeMarkerVisuals} from './event-marker-record.mjs';
import {createTransportComparison} from './event-marker-transport-domain.mjs';
import {transportWireFromProjection} from './event-marker-transport-wire.mjs';
export async function decodeCapturedTransportMarkerRecord(owner,file,{transportCapture,...options}) {
 if(['startCapture','observeDecoded','finalProbe'].some(key=>Object.hasOwn(options,key)))throw Error('marker_captured_decoder_required');
 const capture=await collectMarkerDecodeObservations(owner,file,{...options,startCapture:request=>startCapturedTransportDecode(transportCapture,{file,...request})});
 const clock=await inspectCapturedTransportClock(transportCapture,capture),projection=capturedTransportProjection(clock);
 if(capture.recordingSha256!==projection.recordingSha256)throw Error('marker_clock_binding');
 assertCapturedAudioClock(clock,capture.audioChunks,capture.audioRows);assertCapturedVideoClock(clock,capture.rgb,capture.videoRows);
 const decoded={...classifyObservedSourceAudio(capture.audioChunks,capture.audioRows),...decodeMarkerVisuals(capture.rgb,capture.videoRows),watermarks:[],audioMetadataRows:capture.audioRows.length,
  recordingSha256:capture.recordingSha256,videoStreamIndex:capture.finalProbe.streams.find(s=>s.codec_type==='video')?.index,audioStreamIndex:capture.finalProbe.streams.find(s=>s.codec_type==='audio')?.index,
  clock,transportScope:'physically-closed-transport',transportClock:transportWireFromProjection(projection)};
 decoded.episodes.forEach((episode,id)=>{episode.id=id;});return decoded;
}
export async function measureCapturedMediaMarkers(owner,file,options) {
 const decoded=await decodeCapturedTransportMarkerRecord(owner,file,options);
 return summarizeDecodedMarkerFacts(decoded,options,createTransportComparison(decoded,capturedTransportProjection(decoded.clock)));
}
export async function verifyCapturedMedia(owner,file,request,destination,phases,references,internalDelayMs,selections,transportCapture) {
 if(destination!=='twitch')throw Error('marker_transport_destination');
 const {info,...facts}=await observeMediaOutputFacts(owner,file,request,destination,phases,references,internalDelayMs);
 const markers=await measureCapturedMediaMarkers(owner,file,{...markerMeasurementOptions(info,request,phases,selections,destination),transportCapture});
 return {...facts,...markers};
}
