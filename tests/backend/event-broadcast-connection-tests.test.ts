import { fixtureCapacityResolver } from "../scripts/_event-allocation-fixture.mjs";
import { loadEventsWithFixtureCapacity } from "./_eventCapacityFixture";
import { bindVrcdnTestAccount } from "./_eventOutputAccountFixture";
import assert from "node:assert/strict";
import { it, mock } from "node:test";
mock.timers.enable({apis:["setTimeout"]});
import { convexTest } from "convex-test";
import { makeFunctionReference, getFunctionName } from "convex/server";
import { api, internal } from "../../convex/_generated/api";
import schemaModule from "../../convex/schema";
import { newClerkUserId } from "./_clerkTestIdentity";
const schema = (schemaModule as unknown as {
    default?: typeof schemaModule;
}).default ?? schemaModule;
const worker = (name: string) => makeFunctionReference<"mutation">(`eventMediaWorker:${name}`);
const modules = {
    "../../convex/_generated/api.ts": () => import("../../convex/_generated/api"),
    "../../convex/events.ts": loadEventsWithFixtureCapacity,
    "../../convex/eventMediaWorker.ts": () => import("../../convex/eventMediaWorker"),
    "../../convex/eventBroadcastConnectionTests.ts": async()=>{const module=await import("../../convex/eventBroadcastConnectionTests");return {...module,startConnectionTest:module.createStartConnectionTest(fixtureCapacityResolver)};},
};
const bridgeToken = "worker-test-only-credential";
process.env.VRDEX_EVENT_MEDIA_BRIDGE_TOKEN = bridgeToken;
const secretPrefix='arn:aws:secretsmanager:us-east-1:123456789012:secret:';
process.env.VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX=secretPrefix;
async function fixture() {
    const t = convexTest({ schema, modules });
    const subject = newClerkUserId();
    await t.run(async ({ db }) => {
        const now = Date.now();
        const userId = await db.insert("users", { clerkUserId: subject, name: "Owner", email: "owner@example.test", emailVerificationTime: now });
        const profileId = await db.insert("profiles", { slug: "club", displayName: "Club", sortName: "club", aliases: [], tags: [], claimState: "claimed_verified", publicationState: "published", publicSurfacingState: "public", creationSource: "self", updatedAt: now, profileType: "community", community: { categoryTags: [] } });
    bindVrcdnTestAccount(profileId, "event-media/vrcdn/main");
        await db.insert("profileOwners", { profileId, userId, roleKey: "owner", state: "active", grantedAt: now, updatedAt: now });
    });
    const owner = t.withIdentity({ subject, emailVerified: true, issuer: "test", tokenIdentifier: `test|${subject}` });
    const event = await owner.mutation(api.events.createCommunityEvent, { title: "Worker event", communitySlug: "club", startAt: Date.now() + 600000, timezone: "UTC" });
    const output = await owner.mutation(api.events.configureVrcdnOutput, { currentSlug: event.slug, key: "primary", label: "Main", credentialRef: "event-media/vrcdn/main", sourceConsentAccepted: true, destinationAuthorityAccepted: true, providerRulesAccepted: true, rightsClearedMediaAccepted: true, playbackLinks: [{ platform: "browser", url: "https://example.test/watch" }] });
    await t.run(async({db})=>{const stored=(await db.get(output.outputId))!;const eventDoc=(await db.get(event.eventId))!;const requestId='12345678-1234-1234-1234-123456789012';await db.patch(output.outputId,{credential:{...stored.credential!,secretRef:`${secretPrefix}vrdex/broadcast/${eventDoc.communityProfileId}/${event.eventId}/${requestId}-AbCd12`},managedConnection:{communityProfileId:eventDoc.communityProfileId!,provider:"vrcdn",serverUrl:"rtmp://ingest.vrcdn.live/live",revision:1,requestId,testState:"not_tested"}});});
    const startArgs={currentSlug:event.slug,expectedRevision:1,idempotencyKey:"test-request"};
    const started=await owner.mutation(api.eventBroadcastConnectionTests.startConnectionTest,startArgs);
    const job=await t.run(({db})=>db.get(started.jobId));
    const args={protocolVersion:2,bridgeToken,eventId:event.eventId,sessionId:job!.sessionId,workerId:"test-worker",epoch:0};
    return {t,owner,event,output,job:job!,started,startArgs,args};
}
it('test start is idempotent, immutable, and uses normal allocated session dispatch',async()=>{
 const {t,owner,started,startArgs,job,args}=await fixture();
 assert.deepEqual(await owner.mutation(api.eventBroadcastConnectionTests.startConnectionTest,startArgs),started);
 await assert.rejects(owner.mutation(api.eventBroadcastConnectionTests.startConnectionTest,{...startArgs,expectedRevision:2}),/different connection/);
 const session=await t.run(({db})=>db.get(job.sessionId));assert.ok(session?.allocation);assert.equal(session?.runtimeDeadlineAt,job.deadlineAt);assert.ok(job.deadlineAt-job.createdAt<=120000);
 const admitted=await t.mutation(worker('admitDispatch'),{bridgeToken,eventId:args.eventId,sessionId:args.sessionId,dispatchId:'test-dispatch',launchProtocol:'fenced-v1'});assert.equal(admitted.granted,true);
 await assert.rejects(owner.mutation(api.eventBroadcastConnectionTests.startConnectionTest,{...startArgs,idempotencyKey:'second-test'}),/already active/);
});
it('late, wrong-marker and cancelled proof cannot pass, and cancellation retains reservation',async()=>{
 const {t,owner,job,args,event,startArgs}=await fixture();const lease=await t.mutation(worker('acquireSession'),args);const proof={...args,epoch:lease.epoch,jobId:job._id,marker:job.marker,decodedAt:Date.now()};
 assert.equal((await t.mutation(worker('recordConnectionTestProof'),{...proof,marker:'11111111111111111111111111111111'})).accepted,false);
 await owner.mutation(api.eventBroadcastConnectionTests.cancelConnectionTest,{currentSlug:event.slug,jobId:job._id});
 assert.equal((await t.mutation(worker('recordConnectionTestProof'),proof)).accepted,false);
 assert.equal((await owner.query(api.eventBroadcastConnectionTests.getConnectionTest,{currentSlug:event.slug,jobId:job._id}))?.state,'stopping');
 await assert.rejects(owner.mutation(api.eventBroadcastConnectionTests.startConnectionTest,{...startArgs,idempotencyKey:'second'}),/already active/);
});
it('matching decoded proof only completes after actual process and definition cleanup',async()=>{
 const {t,owner,job,args,event,output}=await fixture();const lease=await t.mutation(worker('acquireSession'),args);
 await t.run(({db})=>db.patch(job.sessionId,{dispatchId:'test-dispatch',workerTaskId:'test-task',workerTaskStatus:'running'}));
 assert.equal((await t.mutation(worker('recordConnectionTestProof'),{...args,epoch:lease.epoch,jobId:job._id,marker:job.marker,decodedAt:Date.now()})).accepted,true);
 const status=()=>owner.query(api.eventBroadcastConnectionTests.getConnectionTest,{currentSlug:event.slug,jobId:job._id});assert.equal((await status())?.state,'stopping');
 await t.mutation(worker('recordProcessStatus'),{bridgeToken,sessionId:job.sessionId,taskArn:'test-task',stopped:true});assert.equal((await status())?.state,'stopping');
 assert.equal((await t.run(({db})=>db.get(output.outputId)))?.managedConnection?.testState,'not_tested');
 await t.mutation(worker('completeTaskCleanup'),{bridgeToken,sessionId:job.sessionId,taskArn:'test-task'});assert.equal((await status())?.state,'passed');assert.equal((await t.run(({db})=>db.get(output.outputId)))?.managedConnection?.testState,'passed');
});
it('a stale revision cannot submit success and foreign users cannot inspect a test',async()=>{
 const {t,owner,job,args,event,output}=await fixture();const lease=await t.mutation(worker('acquireSession'),args);
 await t.run(async({db})=>{const stored=await db.get(output.outputId);await db.patch(output.outputId,{managedConnection:{...stored!.managedConnection!,revision:2}});});
 assert.equal((await t.mutation(worker('recordConnectionTestProof'),{...args,epoch:lease.epoch,jobId:job._id,marker:job.marker,decodedAt:Date.now()})).accepted,false);
 await assert.rejects(t.query(api.eventBroadcastConnectionTests.getConnectionTest,{currentSlug:event.slug,jobId:job._id}),/signed-in/);
});
it('late decoded proof cannot revive a failed cleaned session with an unexpired lease',async()=>{
 const {t,owner,job,args,event}=await fixture();const lease=await t.mutation(worker('acquireSession'),args);
 await t.run(async({db})=>{
  const session=(await db.get(job.sessionId))!;
  await db.patch(session._id,{status:'error',dispatchId:'test-dispatch',workerTaskId:'test-task',dispatchStopConfirmedAt:Date.now(),workerTaskCleanupPending:false});
  await db.patch(session.programId,{activeSessionId:undefined});
  await db.patch(job._id,{state:'failed'});
 });
 assert.equal((await t.mutation(worker('recordConnectionTestProof'),{...args,epoch:lease.epoch,jobId:job._id,marker:job.marker,decodedAt:Date.now()})).accepted,false);
 assert.equal((await owner.query(api.eventBroadcastConnectionTests.getConnectionTest,{currentSlug:event.slug,jobId:job._id}))?.state,'failed');
 assert.equal((await t.run(({db})=>db.get(job.sessionId)))?.status,'error');
});
it('cancelling before admission atomically proves no launch and releases the queued test',async()=>{
 const {t,owner,job,event,args}=await fixture();
 await owner.mutation(api.eventBroadcastConnectionTests.cancelConnectionTest,{currentSlug:event.slug,jobId:job._id});
 assert.equal((await owner.query(api.eventBroadcastConnectionTests.getConnectionTest,{currentSlug:event.slug,jobId:job._id}))?.state,'cancelled');
 assert.equal((await t.mutation(worker('admitDispatch'),{bridgeToken,eventId:event.eventId,sessionId:args.sessionId,dispatchId:'late-admit'})).granted,false);
});
it('first lease freezes max60s runtime and expired queued jobs cannot dispatch',async()=>{
 const active=await fixture();const lease=await active.t.mutation(worker('acquireSession'),active.args);assert.ok(lease.configuration.sessionDeadline-lease.serverNow<=60000);
 const expired=await fixture();await expired.t.run(({db})=>db.patch(expired.job._id,{deadlineAt:Date.now()-1}));
 await expired.t.mutation(internal.eventBroadcastConnectionTests.expireConnectionTest,{jobId:expired.job._id});
 assert.equal((await expired.owner.query(api.eventBroadcastConnectionTests.getConnectionTest,{currentSlug:expired.event.slug,jobId:expired.job._id}))?.state,'failed');
 assert.equal((await expired.t.mutation(worker('admitDispatch'),{bridgeToken,eventId:expired.event.eventId,sessionId:expired.args.sessionId,dispatchId:'late'})).granted,false);
});
