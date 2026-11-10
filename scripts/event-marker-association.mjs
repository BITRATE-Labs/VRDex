import { markerOffset } from './event-source-markers.mjs';
import { precedingIdentityAt, IDENTITY_CODES } from './event-marker-record.mjs';
import { markerComparison } from './event-marker-transport-domain.mjs';
const integer=n=>{if(!Number.isSafeInteger(n))throw Error('marker_integer');return n;};
const classes=new Set(['a','b','unknown','mixed']);

/** Full global interval partition. Returns failures as facts, never a nearest pair. */
export function associateContext(record,context,comparison=markerComparison(record)) {
  const {visuals,episodes,watermarks,audioRange,videoRange}=record;
  if(!Array.isArray(visuals)||visuals.length>4096||!Array.isArray(episodes)||episodes.length>4096||!Array.isArray(watermarks)||watermarks.length>64)throw Error('marker_evidence_bound');
  const visualMap=new Map(),episodeMap=new Map();
  for(const v of visuals) {
    [v.id,v.start,v.end,v.watermark].forEach(integer);
    if(visualMap.has(v.id)||v.end<=v.start||!['a','b','slate'].includes(v.identity)||v.watermark< -1||v.watermark>=watermarks.length)throw Error('marker_visual_reference');
    visualMap.set(v.id,v);
  }
  for(const e of episodes) {
    [e.id,e.onset,e.end].forEach(integer);
    if(episodeMap.has(e.id)||e.end<=e.onset||!classes.has(e.identity))throw Error('marker_episode_reference');
    episodeMap.set(e.id,e);
  }
  const {kind,identity,start,end,selection}=context;
  const q=comparison,lo=q.context(context,'start'),hi=q.context(context,'end'),selected=q.context(context,'selection');
  const reference=(e,v)=>q.intersectsAudio(e,q.shift(q.video(v,'start'),-45000),q.shift(q.video(v,'start'),45000));
  const candidate=(e,v)=>q.within(q.audio(e,'start'),q.video(v,'start'),360000,true);
  const previousIdentity=precedingIdentityAt(record,selection);
  if(context.previousIdentity!==undefined&&context.previousIdentity!==previousIdentity)throw Error('marker_identity_predecessor');
  [start,end,selection,...audioRange,...videoRange].forEach(integer);
  if(!['transition','steady'].includes(kind)||!['a','b'].includes(identity)||end<=start)throw Error('marker_context');
  if(record.identityEpochs.findLast(row=>q.test(q.atom(q.epoch(row[0]),'<=',lo)))?.[1]!==IDENTITY_CODES[identity]||record.identityEpochs.some(row=>q.test(q.all(q.atom(q.epoch(row[0]),'>',lo),q.atom(q.epoch(row[0]),'<',hi)))&&row[1]!==IDENTITY_CODES[identity]))throw Error('marker_context_identity');
  const fullIds=context.fullVisualIds;
  if(!Array.isArray(fullIds)||fullIds.length>256||new Set(fullIds).size!==fullIds.length)throw Error('marker_visual_reference');
  const full=fullIds.map(id=>{const v=visualMap.get(id);if(!v||v.identity!==identity)throw Error('marker_visual_reference');return v;});
  if(context.carryVisualId!=null&&fullIds.includes(context.carryVisualId))throw Error('marker_full_fragment_overlap');
  const relevant=episodes.filter(e=>q.test(q.any(q.intersectsAudio(e,lo,hi),...full.map(v=>reference(e,v)))));
  if(relevant.length>8192)throw Error('marker_reference_bound');
  const failures=new Set(),used=new Map(),pairs=[],claimedFragments=new Map();
  const fail=reason=>failures.add(reason);
  if(!q.test(q.all(...[lo,...full.map(v=>q.shift(q.video(v,'start'),-45000))].map(p=>q.atom(q.audioRange('start'),'<=',p)),...[hi,...full.map(v=>q.shift(q.video(v,'start'),45000))].map(p=>q.atom(q.audioRange('end'),'>=',p)),q.atom(q.videoRange('start'),'<=',lo),q.atom(q.videoRange('end'),'>=',hi))))fail('incomplete_context_coverage');
  for(const v of full) {
    const references=relevant.filter(e=>q.test(reference(e,v)));
    if(references.length>16)throw Error('marker_candidate_bound');
    const candidates=references.filter(e=>e.identity===identity&&q.test(q.all(candidate(e,v),q.atom(q.audio(e,'start'),'>=',q.shiftClock(selected,-72000)))));
    if(candidates.length!==1) {fail(candidates.length?'duplicate_source_candidate':'missing_audio');continue;}
    const e=candidates[0];
    if(used.has(e.id)) {fail('duplicate_episode_use');continue;}
    const offset=markerOffset(e.onset,v.start);
    used.set(e.id,{episodeId:e.id,code:'paired_full',visualId:v.id});
    pairs.push({visualId:v.id,episodeId:e.id,videoPts:v.start,audioSample:e.onset,offsetNumerator:offset});
    if(!q.test(q.within(q.audio(e,'start'),q.video(v,'start'),72000)))fail('av_out_of_bounds');
  }
  const carry=context.carryVisualId==null?undefined:visualMap.get(context.carryVisualId);
  if(context.carryVisualId!=null) {
    const w=carry&&watermarks[carry.watermark];
    if(!carry||!w||carry.identity!==identity||w.identity!==identity||w.carryIn!==true||w.selectionVideoPts!==selection||w.firstPulseTick!==w.selectionTick||w.firstPulseSourcePts!==w.selectionSourcePts||!q.test(q.all(q.atom(q.video(carry,'start'),'<=',selected),q.atom(selected,'<',q.video(carry,'end')))))throw Error('marker_carry_reference');
  }
  const edges=kind==='steady'?visuals.filter(v=>v.identity===identity&&!fullIds.includes(v.id)&&q.test(q.all(q.not(q.all(q.atom(q.video(v,'start'),'>',q.shift(lo,18000)),q.atom(q.video(v,'start'),'<',q.shift(hi,-18000)))),q.intersectsVideo(v,lo,hi)))):[];
  const dispositions=[];
  for(const e of relevant) {
    if(used.has(e.id)) {dispositions.push(used.get(e.id));continue;}
    let code,visualId=-1;
    const inFull=q.test(q.any(...full.map(v=>candidate(e,v))));
    if(e.identity==='unknown'||e.identity==='mixed')fail(e.identity+'_competitor');
    else if(previousIdentity!=='slate'&&e.identity===previousIdentity&&q.test(q.all(q.atom(q.audio(e,'start'),'<',selected),q.atom(q.audio(e,'end'),'<=',q.shiftClock(selected,72000)))))code='previous_epoch_tail';
    else {
      const fragments=[...(carry?[carry]:[]),...edges.filter(v=>v.id!==carry?.id)].filter(v=>e.identity===identity&&!inFull&&q.test(q.intersectsAudio(e,q.shift(q.video(v,'start'),-9000),q.shift(q.video(v,'end'),9000))));
      if(fragments.length===1) {
        const v=fragments[0];visualId=v.id;
        if(claimedFragments.has(v.id))fail('fragment_multiple_episode');
        else {claimedFragments.set(v.id,e.id);code=v===carry?'existing_carry_in_fragment':'existing_steady_edge_fragment';}
      } else if(fragments.length>1)fail('fragment_multiple_visual');
      else if(q.test(q.all(q.atom(q.audio(e,'start'),'<',q.shiftClock(selected,-72000)),q.atom(q.audio(e,'end'),'<=',lo),q.not(q.any(...full.map(v=>reference(e,v)))))))code='recorded_pre_epoch_exclusion';
      else fail(e.identity===identity?'unaccounted_episode':'foreign_interval');
    }
    dispositions.push({episodeId:e.id,code:code??'failure',visualId});
  }
  if(dispositions.length!==relevant.length||new Set(dispositions.map(d=>d.episodeId)).size!==relevant.length)throw Error('marker_partition_conservation');
  return {kind,identity,start,end,selection,valid:failures.size===0,failures:[...failures],pairs,dispositions,carryIn:carry?{visualId:carry.id,episodeId:claimedFragments.get(carry.id)??null}:null,relevantEpisodeCount:relevant.length};
}
