import assert from 'node:assert/strict';
import { it } from 'node:test';
import { provisionConnection } from '../../scripts/event-output-secret-broker.mjs';
const input = { permissionsAccepted: true, currentSlug: 'event', provider: 'vrcdn', serverUrl: 'rtmp://ingest.vrcdn.live/live', playbackUrl: 'https://example.test/watch', expectedRevision: 0, requestId: '12345678-1234-1234-1234-123456789012', streamKey: 'PRIVATE_KEY' };
const brokerToken = 'a'.repeat(32);
it('stream keys cross only the secret service boundary', async () => {
  let prepared, committed, secret;
  const result = await provisionConnection({ input, brokerToken, prepare: async args => (prepared = args, { grantId: 'grant', secretName: 'generated', credentialRef: null }), secrets: { send: async command => (secret = command.input, { ARN: 'authorized-arn' }) }, commit: async args => (committed = args, { connection: { revision: 1 } }) });
  assert.equal(JSON.stringify(prepared).includes(input.streamKey), false); assert.equal(JSON.stringify(committed).includes(input.streamKey), false); assert.equal(JSON.stringify(result).includes(input.streamKey), false); assert.equal(JSON.parse(secret.SecretString).streamKey, input.streamKey);
});
it('reconciles a lost commit response before considering orphan cleanup', async () => {
  let commits = 0, deletes = 0;
  const result = await provisionConnection({ input, brokerToken, prepare: async () => ({ grantId: 'grant', secretName: 'generated' }), secrets: { send: async () => { if (commits) deletes++; return { ARN: 'arn' }; } }, commit: async () => { if (++commits === 1) throw Error('lost'); return { connection: { revision: 1 } }; }, abandon: async () => ({ canDelete: true }) });
  assert.equal(result.connection.revision, 1); assert.equal(deletes, 0);
});
it('cleans a staged orphan only after the grant is irreversibly abandoned', async () => {
  const order = []; await assert.rejects(provisionConnection({ input, brokerToken, prepare: async () => ({ grantId: 'grant', secretName: 'generated' }), secrets: { send: async command => { order.push(command.constructor.name); return { ARN: 'arn' }; } }, commit: async () => { throw Error('failed'); }, abandon: async () => { order.push('abandoned'); return { canDelete: true }; } }), /Could not save/);
  assert.deepEqual(order, ['CreateSecretCommand', 'abandoned', 'DeleteSecretCommand']);
});
