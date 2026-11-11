import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectMarkerDecodeObservations,decodeMediaMarkerRecord} from '../../scripts/event-capacity-media.mjs';
import {decodeCapturedTransportMarkerRecord} from '../../scripts/event-captured-capacity-media.mjs';
import {decodeSourceAudio,classifyObservedSourceAudio} from '../../scripts/event-source-markers.mjs';
import {assertProgramClock} from '../../scripts/event-marker-clock.mjs';
import {isCapturedTransportClock} from '../../scripts/event-captured-transport.mjs';
test('raw observation helper rejects invalid bounds before starting a process',async()=>{
 const owner={start(){assert.fail('Invalid bounds must not launch');}};
 for(const options of [{width:0,height:48,maxSeconds:12},{width:64,height:NaN,maxSeconds:12},{width:64,height:48,maxSeconds:NaN},{width:64,height:48,maxSeconds:0},{width:64,height:48,maxSeconds:2049}])await assert.rejects(collectMarkerDecodeObservations(owner,'/tmp/test.ts',options),/marker_decode_bounds/);
});
test('named captured decoder refuses forged/serialized handles and caller-provided probe or capture hooks',async()=>{
 const owner={start(){assert.fail('A supplied owner is not capture authority');},run(){assert.fail('Must not reach probe');}};
 const options={width:64,height:48,maxSeconds:12,transportCapture:{kind:'CapturedTransportClock'}};
 await assert.rejects(decodeCapturedTransportMarkerRecord(owner,'/tmp/test.ts',options),/captured_transport_unproven/);
 for(const key of ['startCapture','observeDecoded','finalProbe'])await assert.rejects(decodeCapturedTransportMarkerRecord(owner,'/tmp/test.ts',{...options,[key]:()=>{}}),/marker_captured_decoder_required/);
 await assert.rejects(decodeMediaMarkerRecord(owner,'/tmp/test.ts',{...options,observeDecoded:()=>{}}),/marker_qualified_decoder_required/);
});
test('plain observed classifier facts cannot grant a clock or bypass either strict decoder contract',()=>{
 const chunks=[Buffer.alloc(4096)],rows=[{index:0,pts:0,samples:1024},{index:1,pts:1016,samples:1024}];
 assert.throws(()=>decodeSourceAudio(chunks,rows),/marker_audio_continuity/);
 const facts=classifyObservedSourceAudio(chunks,rows);assert.equal(facts.episodes.length,0);assert.equal(isCapturedTransportClock(facts),false);assert.throws(()=>assertProgramClock(facts),/marker_clock_unproven/);
});
