import {loadEventsWithFixtureCapacity} from "./_eventCapacityFixture";
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schemaModule from '../../convex/schema';
import { api } from '../../convex/_generated/api';
import { newClerkUserId } from './_clerkTestIdentity';
import { normalizeConnection, managedSecretRefAllowed } from '../../convex/_eventBroadcastConnections';
const schema = (schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule;
const modules = { '../../convex/_generated/server.ts': () => import('../../convex/_generated/server'), '../../convex/events.ts': loadEventsWithFixtureCapacity, '../../convex/eventBroadcastConnections.ts': () => import('../../convex/eventBroadcastConnections') };
const ref = (name: string) => makeFunctionReference<'mutation'>(`eventBroadcastConnections:${name}`);
const prefix = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:';
process.env.VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX = prefix;
process.env.VRDEX_EVENT_OUTPUT_BROKER_TOKEN = 'test-broker-token-only-1234567890123456789';
async function fixture() {
  const t = convexTest({ schema, modules }); const subject = newClerkUserId();
  await t.run(async ({ db }) => { const now = Date.now(); const userId = await db.insert('users', { clerkUserId: subject, name: 'Owner', email: 'owner@example.test', emailVerificationTime: now }); const profileId = await db.insert('profiles', { slug: 'club', displayName: 'Club', sortName: 'club', aliases: [], tags: [], claimState: 'claimed_verified', publicationState: 'published', publicSurfacingState: 'public', creationSource: 'self', updatedAt: now, profileType: 'community', community: { categoryTags: [] } }); await db.insert('profileOwners', { profileId, userId, roleKey: 'owner', state: 'active', grantedAt: now, updatedAt: now }); });
  const owner = t.withIdentity({ subject, emailVerified: true, issuer: 'test', tokenIdentifier: `test|${subject}` });
  const event = await owner.mutation(api.events.createCommunityEvent, { title: 'Connection event', communitySlug: 'club', startAt: Date.now() + 600000, timezone: 'UTC' });
  const input = { permissionsAccepted: true, currentSlug: event.slug, provider: 'vrcdn', serverUrl: 'rtmp://ingest.vrcdn.live/live', playbackUrl: 'https://stream.vrcdn.live/live/example.live.ts', expectedRevision: 0, requestId: '12345678-1234-1234-1234-123456789012', replaceKey: true, credentialDigest: 'a'.repeat(64) };
  return { t, owner, event, input };
}
it('validates preset servers with friendly errors and exact namespace binding', () => {
  assert.match(normalizeConnection({provider:'vrcdn',serverUrl:'rtmp://ingest.vrcdn.live/live',playbackUrl:'rtspt://stream.vrcdn.live/live/example'}).playbackUrl,/^https:.*\.live\.ts$/);
  assert.throws(() => normalizeConnection({ provider: 'vrcdn', serverUrl: 'bad', playbackUrl: 'https://example.test' }), /Enter a valid stream server URL/);
  assert.equal(managedSecretRefAllowed(prefix + 'vrdex/broadcast/abc/def/12345678-1234-1234-1234-123456789012-AbCd12', 'abc', 'def', '12345678-1234-1234-1234-123456789012'), true);
  assert.equal(managedSecretRefAllowed(prefix + 'vrdex/broadcast/other/def/12345678-1234-1234-1234-123456789012-AbCd12', 'abc', 'def', '12345678-1234-1234-1234-123456789012'), false);
});
it('rejects unauthorized setup, missing key and untrusted commit', async () => {
  const f = await fixture(); await assert.rejects(f.t.mutation(ref('prepareConnection'), f.input), /signed-in/);
  await assert.rejects(f.owner.mutation(ref('prepareConnection'), { ...f.input, replaceKey: false, credentialDigest: '' }), /Enter a stream key/);
  const grant = await f.owner.mutation(ref('prepareConnection'), f.input);
  await assert.rejects(f.owner.mutation(ref('commitConnection'), { grantId: grant.grantId, credentialRef: prefix + grant.secretName + '-AbCd12', brokerToken: 'bad' }), /unavailable/);
});
it('commits CAS metadata, retains a blank key and rejects changed server or stale revision', async () => {
  const f = await fixture(); const grant = await f.owner.mutation(ref('prepareConnection'), f.input);
  const args = { grantId: grant.grantId, credentialRef: prefix + grant.secretName + '-AbCd12', brokerToken: process.env.VRDEX_EVENT_OUTPUT_BROKER_TOKEN };
  const saved = await f.owner.mutation(ref('commitConnection'), args); assert.equal(saved.connection.revision, 1); assert.equal(saved.connection.testState, 'not_tested'); assert.equal(JSON.stringify(saved).includes('credentialRef'), false);
  assert.deepEqual(saved.connection.playbackLinks.map((link:any)=>link.platform),['browser','pc','standalone']);
  assert.deepEqual(await f.owner.mutation(ref('commitConnection'), args), saved);
  await assert.rejects(f.owner.mutation(ref('prepareConnection'), { ...f.input, requestId: '22345678-1234-1234-1234-123456789012' }), /Connection changed/);
  const edit = { ...f.input, requestId: '32345678-1234-1234-1234-123456789012', expectedRevision: 1, replaceKey: false, credentialDigest: '' };
  const next = await f.owner.mutation(ref('prepareConnection'), edit); assert.equal(next.credentialRef, args.credentialRef);
  await assert.rejects(f.owner.mutation(ref('prepareConnection'), { ...edit, requestId: '42345678-1234-1234-1234-123456789012', provider: 'twitch', serverUrl: 'rtmps://live.twitch.tv/app' }), /Enter a stream key/);
  const updated = await f.owner.mutation(ref('commitConnection'), { ...args, grantId: next.grantId }); assert.equal(updated.connection.revision, 2);
});
it('abandonment fences a late commit before deleting any staged secret', async () => {
  const f = await fixture(); const grant = await f.owner.mutation(ref('prepareConnection'), f.input);
  const brokerToken = process.env.VRDEX_EVENT_OUTPUT_BROKER_TOKEN;
  assert.deepEqual(await f.owner.mutation(ref('abandonConnection'), { grantId: grant.grantId, brokerToken }), { canDelete: true });
  await assert.rejects(f.owner.mutation(ref('commitConnection'), { grantId: grant.grantId, brokerToken, credentialRef: prefix + grant.secretName + '-AbCd12' }), /expired/);
});

for(const provider of ['vrcdn','twitch','custom'] as const)it(`managed ${provider} schedules with exact profile and blocks edits until real cleanup`,async()=>{
 const f=await fixture();const input={...f.input,provider,serverUrl:provider==='vrcdn'?f.input.serverUrl:provider==='twitch'?'rtmps://live.twitch.tv/app':'rtmps://stream.example.test/live'};
 const grant=await f.owner.mutation(ref('prepareConnection'),input);
 const saved=await f.owner.mutation(ref('commitConnection'),{grantId:grant.grantId,credentialRef:prefix+grant.secretName+'-AbCd12',brokerToken:process.env.VRDEX_EVENT_OUTPUT_BROKER_TOKEN});
 const scheduled=await f.owner.mutation(api.events.scheduleEventMediaWorker,{currentSlug:f.event.slug,startImmediately:true});
 const session=await f.t.run(({db})=>db.get(scheduled.sessionId));
 assert.equal(session?.destinationProfiles?.[0].destination,provider);assert.equal(session?.destinationProfiles?.[0].outputId,saved.connection.outputId);
 await assert.rejects(f.owner.mutation(ref('prepareConnection'),{...input,expectedRevision:1,requestId:'52345678-1234-1234-1234-123456789012'}),/already active/);
});
it('provisioning limits new grants per community while exact retries are free',async()=>{
 const f=await fixture();const requests=[];
 for(let i=1;i<=10;i++){
  const input={...f.input,requestId:`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`};
  requests.push({input,grant:await f.owner.mutation(ref('prepareConnection'),input)});
 }
 assert.deepEqual(await f.owner.mutation(ref('prepareConnection'),requests[0].input),requests[0].grant);
 await assert.rejects(f.owner.mutation(ref('prepareConnection'),{...f.input,requestId:'00000000-0000-0000-0000-000000000011'}),/Too many connection requests/);
 const second=await f.owner.mutation(api.events.createCommunityEvent,{title:'Second event',communitySlug:'club',startAt:Date.now()+600000,timezone:'UTC'});
 await assert.rejects(f.owner.mutation(ref('prepareConnection'),{...f.input,currentSlug:second.slug,requestId:'00000000-0000-0000-0000-000000000012'}),/Too many connection requests/);
 const count=await f.t.run(({db})=>db.query('eventBroadcastConnectionGrants').collect());assert.equal(count.length,10);
 await f.t.run(({db})=>db.patch(requests[0].grant.grantId,{createdAt:Date.now()-600001}));
 await f.owner.mutation(ref('prepareConnection'),{...f.input,requestId:'00000000-0000-0000-0000-000000000013'});
});
