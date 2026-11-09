import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createOutputTunnel } from '../../workers/restream/output-tunnel.mjs';
import { parseOutputCredential, outputArguments } from '../../workers/restream/output-sender.mjs';
import { resolveDestinationProfile } from '../../workers/restream/broadcast-profiles.mjs';
import { resolveOutputSecretArn } from '../../scripts/event-media-ecs-bridge.mjs';
it('custom RTMP rejects private, metadata, mixed and reserved DNS at the actual transport', async () => {
  for (const addresses of [['127.0.0.1'], ['169.254.169.254'], ['10.0.0.1'], ['192.0.2.1'], ['198.51.100.2'], ['1.1.1.1', '172.16.0.1']]) {
    await assert.rejects(createOutputTunnel({ url: 'rtmp://example.test/live', key: 'private' }, { lookupAddresses: async () => addresses.map(address => ({ address, family: 4 })), connectTcp: () => { throw Error('must not connect'); } }), /unavailable/);
  }
});
it('custom sender pins a public address and presents only a loopback URL to ffmpeg', async () => {
  const tunnel = await createOutputTunnel({ url: 'rtmps://custom.example.test/live', key: 'private' }, { lookupAddresses: async () => [{ address: '1.1.1.1', family: 4 }] });
  try { assert.match(tunnel.url, /^rtmp:\/\/127\.0\.0\.1:\d+\/live$/); assert.equal(tunnel.key, 'private'); const profile = resolveDestinationProfile({ destination: 'custom', settings: { videoPreset: '720p30', audioBitrateKbps: 320 } }); assert.equal(profile.audioBitrateKbps, 320); assert.equal(outputArguments('custom', tunnel, profile).includes('copy'), true); } finally { tunnel.close(); }
});
it('custom credential validation retains protocol, query, auth and key limits', () => {
  assert.equal(parseOutputCredential('custom', JSON.stringify({ rtmpUrl: 'rtmps://custom.example.test/live', streamKey: 'key' })).key, 'key');
  for (const rtmpUrl of ['https://custom.example.test/live', 'rtmp://user:password@custom.example.test/live', 'rtmp://custom.example.test/live?token=private']) assert.throws(() => parseOutputCredential('custom', JSON.stringify({ rtmpUrl, streamKey: 'key' })), /Invalid output credential/);
});
it('dispatcher retains exact static mappings and restricts managed references to configured account and namespace', () => {
  const prefix = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:'; const ref = prefix + 'vrdex/broadcast/community/event/12345678-1234-1234-1234-123456789012-AbCd12'; const config = { secretRefMap: { legacy: 'old-arn' }, managedOutputSecretArnPrefix: prefix };
  assert.equal(resolveOutputSecretArn('legacy', config), 'old-arn'); assert.equal(resolveOutputSecretArn(ref, config), ref);
  assert.throws(() => resolveOutputSecretArn(ref.replace('123456789012:secret:', '999999999999:secret:'), config), /authorized mapping/);
  assert.throws(() => resolveOutputSecretArn(prefix + 'unrelated-secret', config), /authorized mapping/);
});
