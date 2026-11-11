import {clockMay,clockMust} from './event-marker-clock.mjs';
const integer=n=>{if(!Number.isSafeInteger(n))throw Error('marker_clock_coordinate');return n;};
const inverse={'<':'>=','<=':'>','>':'<=','>=':'<','==':'!='};
/** Pure comparison of predicates. This interface creates no clock authority.
 * Every unresolved boolean is quantified over the same joint origin domain. */
export function createTransportComparison(record,projection) {
 const domain=projection?.domain??{audio:[0,0],video:[0,0]};
 if(!clockMay(domain,[]))throw Error('marker_clock_domain');
 const fps=projection?.fps;
 if(projection&&(![30,60].includes(fps)||!Array.isArray(projection.audioRows)||!Array.isArray(projection.videoRows)||projection.audioRows.length>50000||projection.videoRows.length>40000))throw Error('marker_clock_mapping');
 const videoIndex=new Map(projection?.videoRows.map((r,i)=>[r.pts,i]));
 const samples=projection?.audioRows.reduce((n,r)=>integer(n+r.samples),0);
 const point=(a,b,c)=>[a,b,integer(c)];
 const literalPts=pts=>point(0,0,integer(pts)*8);
 const shiftClock=(p,units)=>point(p[0],p[1],p[2]+integer(units));
 const shift=(p,pts)=>shiftClock(p,integer(pts)*8);
 function audioOrdinal(ordinal) {integer(ordinal);if(ordinal<0||ordinal>samples)throw Error('marker_clock_endpoint');return point(1,0,ordinal*15);}
 function videoFrame(frame) {integer(frame);if(frame<0||frame>=projection.videoRows.length)throw Error('marker_clock_frame');return point(0,1,frame*720000/fps);}
 function epoch(pts) {if(!projection)return literalPts(pts);const frame=videoIndex.get(pts);if(frame===undefined)throw Error('marker_clock_epoch');return videoFrame(frame);}
 function atom(left,op,right) {
  if(!['<','<=','>','>=','=='].includes(op))throw Error('marker_clock_predicate');
  const predicate={value:left.map((n,i)=>integer(n-right[i])),op,bound:0};
  if(clockMust(domain,[predicate]))return true;
  if(!clockMay(domain,[predicate]))return false;
  return {kind:'atom',predicate};
 }
 function all(...parts) {if(parts.includes(false))return false;parts=parts.filter(x=>x!==true);return parts.length?parts.length===1?parts[0]:{kind:'all',parts}:true;}
 function any(...parts) {if(parts.includes(true))return true;parts=parts.filter(x=>x!==false);return parts.length?parts.length===1?parts[0]:{kind:'any',parts}:false;}
 function dnf(formula,negated=false) {
  if(typeof formula==='boolean')return formula!==negated?[[]]:[];
  if(formula.kind==='not')return dnf(formula.part,!negated);
  if(formula.kind==='atom') {
   const p=formula.predicate;
   if(negated&&p.op==='==')return [[{...p,op:'<'}],[{...p,op:'>'}]].filter(rows=>clockMay(domain,rows));
   const row=negated?{...p,op:inverse[p.op]}:p;
   return clockMay(domain,[row])?[[row]]:[];
  }
  const isAll=(formula.kind==='all')!==negated;
  let result=isAll?[[]]:[];
  for(const part of formula.parts) {
   const terms=dnf(part,negated);
   if(isAll) {const next=[];for(const a of result)for(const b of terms){const rows=[...a,...b];if(clockMay(domain,rows))next.push(rows);if(next.length>512)throw Error('marker_clock_complexity');}result=next;}
   else {result.push(...terms);if(result.length>512)throw Error('marker_clock_complexity');}
  }
  return result;
 }
 function test(formula) {
  if(typeof formula==='boolean')return formula;
  const yes=dnf(formula).length>0,no=dnf(formula,true).length>0;
  if(yes&&no)throw Error('marker_clock_ambiguous');
  return yes;
 }
 const api={atom,all,any,test,not:part=>typeof part==='boolean'?!part:{kind:'not',part},literalPts,shift,shiftClock,epoch,
  audio(e,edge) {return projection?audioOrdinal(edge==='start'?e.firstLoudLeft.ordinal:e.closureRight.ordinal):point(0,0,(edge==='start'?e.onset:e.end)*15);},
  video(v,edge) {return projection?videoFrame(edge==='start'?v.startFrame:v.endFrame):literalPts(edge==='start'?v.start:v.end);},
  audioRange(edge) {return projection?audioOrdinal(edge==='start'?0:samples):point(0,0,record.audioRange[edge==='start'?0:1]*15);},
  videoRange(edge) {return projection?videoFrame(edge==='start'?0:projection.videoRows.length-1):literalPts(record.videoRange[edge==='start'?0:1]);},
  context(context,key) {if(!projection)return literalPts(context[key]);if(key==='selection')return epoch(context.selection);return context.kind==='transition'?shift(epoch(context.selection),context[key]-context.selection):literalPts(context[key]);},
  within(left,right,units,strict=false) {return all(atom(left,strict?'<':'<=',shiftClock(right,units)),atom(left,strict?'>':'>=',shiftClock(right,-units)));},
  intersectsAudio(e,left,right) {return all(atom(api.audio(e,'start'),'<',right),atom(api.audio(e,'end'),'>',left));},
  intersectsVideo(v,left,right) {return all(atom(api.video(v,'start'),'<',right),atom(api.video(v,'end'),'>',left));},
 };
 return api;
}
export function markerComparison(record) {
 return createTransportComparison(record);
}
