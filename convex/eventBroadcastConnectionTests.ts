import { resolveWorkerAllocation } from "../workers/restream/broadcast-capacity.mjs";
import { v } from "convex/values";
import { mutation, query, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireActiveBrowserSessionSubject } from "./_browserSessionAuthority";
import { getMediaManageableEventBySlug, getLatestEventMediaProgram, requireStoppedOutputSessions, scheduleEventMediaWorkerInContext } from "./events";
import { requireEventMediaBridgeToken, workerSessionArgs, settleTerminalSessionCommands } from "./_eventBroadcastInputs";
import { controlFence } from "./_eventBroadcastControl";

const jobState = v.union(v.literal("queued"),v.literal("running"),v.literal("stopping"),v.literal("passed"),v.literal("failed"),v.literal("cancelled"));
export const projection = v.object({jobId:v.id("eventBroadcastConnectionTests"),revision:v.number(),state:jobState,failure:v.optional(v.string()),deadlineAt:v.number()});
function cleanupComplete(session:Doc<"eventMediaSessions">|null){
 return !!session && ((session.dispatchStopConfirmedAt!==undefined && session.workerTaskCleanupPending===false) || (!session.dispatchId && !session.workerTaskId && session.epoch===undefined && ["ended","error"].includes(session.status) && !session.workerTaskCleanupPending));
}
export async function connectionTestProjection(ctx: QueryCtx | MutationCtx, job: Doc<"eventBroadcastConnectionTests">) {
 const session=await ctx.db.get(job.sessionId);
 const cleaned=cleanupComplete(session);
 let state=job.state;
 if(cleaned) state=job.cancelRequestedAt!==undefined?"cancelled":job.decodedAt!==undefined?"passed":"failed";
 else if(job.cancelRequestedAt!==undefined || job.decodedAt!==undefined || Date.now()>=job.deadlineAt) state="stopping";
 else if(session?.epoch!==undefined) state="running";
 return {jobId:job._id,revision:job.revision,state,failure:state==="failed"?job.failure??"The stream test did not complete.":undefined,deadlineAt:job.deadlineAt};
}
async function authorize(ctx:MutationCtx|QueryCtx,currentSlug:string){const {subject}=await requireActiveBrowserSessionSubject(ctx);return getMediaManageableEventBySlug(ctx,currentSlug,subject);}
export function createStartConnectionTest(resolveAllocation:typeof resolveWorkerAllocation=resolveWorkerAllocation){ return mutation({
 args:{currentSlug:v.string(),expectedRevision:v.number(),idempotencyKey:v.string()},returns:v.object({jobId:v.id("eventBroadcastConnectionTests")}),
 handler:async(ctx,args)=>{
  const {event}=await authorize(ctx,args.currentSlug);
  if(!/^[a-zA-Z0-9:_-]{1,128}$/.test(args.idempotencyKey))throw Error("Invalid test request.");
  const previous=await ctx.db.query("eventBroadcastConnectionTests").withIndex("by_eventId_idempotencyKey",q=>q.eq("eventId",event._id).eq("idempotencyKey",args.idempotencyKey)).unique();
  if(previous){if(previous.revision!==args.expectedRevision)throw Error("This test request belongs to a different connection.");return {jobId:previous._id};}
  if(!event.communityProfileId)throw Error("This event cannot test a connection.");
  const recent=await ctx.db.query("eventBroadcastConnectionTests").withIndex("by_community_createdAt",q=>q.eq("communityProfileId",event.communityProfileId).gte("createdAt",Date.now()-600000)).take(10);
  if(recent.length>=10)throw Error("Too many connection tests. Try again later.");
  const program=await getLatestEventMediaProgram(ctx.db,event._id);if(!program)throw Error("Connect your stream first.");
  await requireStoppedOutputSessions(ctx.db,program._id);
  const selected=program.currentOutputId?await ctx.db.get(program.currentOutputId):null;
  const output=selected?.programId===program._id&&selected.eventId===event._id?selected:await ctx.db.query("eventMediaOutputs").withIndex("by_programId_key",q=>q.eq("programId",program._id).eq("key","primary")).unique();
  if(!output?.managedConnection || output.managedConnection.revision!==args.expectedRevision)throw Error("The connection changed. Save it before testing.");
  if(!output.playbackLinks.some(link=>["browser","pc"].includes(link.platform)))throw Error("Add a playback link before testing.");
  const scheduled=await scheduleEventMediaWorkerInContext(ctx,{currentSlug:args.currentSlug,startImmediately:true,outputKey:output.key},resolveAllocation,true);
  const now=Date.now(),deadlineAt=now+120000,marker=crypto.randomUUID().replaceAll("-","");
  const jobId=await ctx.db.insert("eventBroadcastConnectionTests",{communityProfileId:event.communityProfileId,eventId:event._id,outputId:output._id,sessionId:scheduled.sessionId,revision:args.expectedRevision,idempotencyKey:args.idempotencyKey,marker,state:"queued",deadlineAt,queueDeadlineAt:deadlineAt,createdAt:now,updatedAt:now});
  await ctx.db.patch(scheduled.sessionId,{connectionTest:{jobId,revision:args.expectedRevision,marker,deadlineAt},runtimeDeadlineAt:deadlineAt,readyDeadlineAt:deadlineAt});
  await ctx.scheduler.runAt(deadlineAt,internal.eventBroadcastConnectionTests.expireConnectionTest,{jobId});
  return {jobId};
 }
});
}
export const startConnectionTest=createStartConnectionTest();
export const pruneConnectionTests=internalMutation({args:{},returns:v.null(),handler:async ctx=>{
 for(const state of ["passed","failed","cancelled"] as const){
  const jobs=await ctx.db.query("eventBroadcastConnectionTests").withIndex("by_state_createdAt",q=>q.eq("state",state).lt("createdAt",Date.now()-30*86400000)).take(50);
  for(const job of jobs)if(cleanupComplete(await ctx.db.get(job.sessionId)))await ctx.db.delete(job._id);
 }
 return null;
}});
export const getConnectionTest=query({args:{currentSlug:v.string(),jobId:v.id("eventBroadcastConnectionTests")},returns:v.union(projection,v.null()),handler:async(ctx,args)=>{const {event}=await authorize(ctx,args.currentSlug);const job=await ctx.db.get(args.jobId);return job?.eventId===event._id?connectionTestProjection(ctx,job):null;}});
async function requestTestStop(ctx:MutationCtx,job:Doc<"eventBroadcastConnectionTests">,now:number){
 const session=await ctx.db.get(job.sessionId);if(!session)return;
 // Atomic no-launch proof: the normal dispatcher must reserve before attempting RunTask.
 const unlaunched=!session.dispatchId&&!session.workerTaskId&&session.epoch===undefined&&session.launchAttemptedAt===undefined&&!session.workerTaskDefinitionArn;
 await ctx.db.patch(session._id,{stopRequestedAt:now,status:unlaunched?"ended":"stopping",updatedAt:now});
 if(unlaunched){
  await settleTerminalSessionCommands(ctx.db,session._id,"ended",now);
  const program=await ctx.db.get(session.programId);if(program?.activeSessionId===session._id)await ctx.db.patch(program._id,{activeSessionId:undefined,state:"ready",updatedAt:now});
  await finishConnectionTest(ctx,session);
 }
}
export const cancelConnectionTest=mutation({args:{currentSlug:v.string(),jobId:v.id("eventBroadcastConnectionTests")},returns:v.null(),handler:async(ctx,args)=>{const {event}=await authorize(ctx,args.currentSlug);const job=await ctx.db.get(args.jobId);if(!job||job.eventId!==event._id)throw Error("Stream test not found.");const state=await connectionTestProjection(ctx,job);if(["passed","failed","cancelled"].includes(state.state))return null;const now=Date.now();await ctx.db.patch(job._id,{cancelRequestedAt:job.cancelRequestedAt??now,state:"stopping",updatedAt:now});await requestTestStop(ctx,(await ctx.db.get(job._id))!,now);return null;}});
export const expireConnectionTest=internalMutation({args:{jobId:v.id("eventBroadcastConnectionTests")},returns:v.null(),handler:async(ctx,args)=>{const job=await ctx.db.get(args.jobId);if(!job||Date.now()<job.deadlineAt)return null;const status=await connectionTestProjection(ctx,job);if(["passed","failed","cancelled"].includes(status.state))return null;const now=Date.now();await ctx.db.patch(job._id,{state:"stopping",failure:job.decodedAt?undefined:"The stream test timed out.",updatedAt:now});await requestTestStop(ctx,(await ctx.db.get(job._id))!,now);return null;}});
/** Only the currently leased worker can submit decoded identity proof for this exact saved revision. */
export const recordConnectionTestProof=mutation({args:{...workerSessionArgs,jobId:v.id("eventBroadcastConnectionTests"),marker:v.string(),decodedAt:v.number()},returns:v.object({accepted:v.boolean()}),handler:async(ctx,args)=>{
 requireEventMediaBridgeToken(args.bridgeToken);
 const authority=await controlFence(ctx.db,args);if("result" in authority)return {accepted:false};
 const now=Date.now(),job=await ctx.db.get(args.jobId),session=authority.session;
 if(!job||!session||job.sessionId!==session._id||job.eventId!==args.eventId||session.connectionTest?.jobId!==job._id||session.workerId!==args.workerId||session.epoch!==args.epoch||(session.leaseExpiresAt??0)<=now||job.cancelRequestedAt!==undefined||now>=job.deadlineAt||session.stopRequestedAt!==undefined||args.marker!==job.marker||!Number.isFinite(args.decodedAt)||args.decodedAt<job.createdAt||args.decodedAt>now||args.decodedAt>job.deadlineAt)return {accepted:false};
 const output=await ctx.db.get(job.outputId);if(output?.managedConnection?.revision!==job.revision)return {accepted:false};
 if(!job.decodedAt)await ctx.db.patch(job._id,{decodedAt:args.decodedAt,state:"stopping",updatedAt:now});
 await ctx.db.patch(session._id,{stopRequestedAt:now,status:"stopping",updatedAt:now});return {accepted:true};
}});
/** Called only after ECS process stop and task-definition cleanup acknowledgements. */
export async function finishConnectionTest(ctx:MutationCtx,session:Doc<"eventMediaSessions">){
 if(!session.connectionTest)return;const job=await ctx.db.get(session.connectionTest.jobId);if(!job||job.sessionId!==session._id)return;
 const now=Date.now(),state=job.cancelRequestedAt!==undefined?"cancelled":job.decodedAt!==undefined?"passed":"failed";
 await ctx.db.patch(job._id,{state,updatedAt:now});const output=await ctx.db.get(job.outputId);
 if(output?.managedConnection?.revision===job.revision)await ctx.db.patch(output._id,{managedConnection:{...output.managedConnection,testState:state==="passed"?"passed":state==="failed"?"failed":"not_tested"},updatedAt:now});
}
