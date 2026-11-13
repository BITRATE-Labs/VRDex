import assert from "node:assert/strict";
import { test } from "node:test";
import { createNativeTrialGateway } from "../src/trial/gateway";
import { NativeTrialConfigSchema } from "../src/trial/policy";
import { snapshotObjectKey } from "../src/contracts";

function fixture() {
  let now = 10000, revoked = false, calls = 0, exhausted = 0;
  const config = NativeTrialConfigSchema.parse({ version: 1, trialId: "trial", operatorUserId: "operator",
    source: { streamKey: "vrcdn/Alpha/1", streamId: "Alpha", inputFormat: "vrcdn_fmp4", packagingVersion: 1 },
    context: { kind: "profile", profileId: "profile", linkId: "Alpha" }, origin: "https://trial.invalid", origins: ["https://app.invalid"],
    startsAt: 1000, expiresAt: 901000, limits: { upstreamBytes: 1024, payloadBytes: 2048, requests: 1000, retainedBytes: 1024 },
    worker: { workerId: "worker", workerEpoch: 1, allocation: { cpuUnits: 1024, memoryMiB: 2048, evidenceId: "test-proof" }, maxSources: 1, draining: false } });
  const grant = { id: "grant", streamKey: config.source.streamKey, context: config.context, contextRevision: 1, issuedAt: 1000, expiresAt: config.expiresAt, renditions: ["video", "audio"] };
  const snapshots = Object.fromEntries((["video", "audio"] as const).map(rendition => [rendition,
    { streamKey: config.source.streamKey, epoch: 1, rendition, targetDurationSeconds: 2, sequence: 0, discontinuitySequence: 0, generatedAt: now,
      segments: [0,1,2].map(sequence => ({ sequence, objectKey: `vrcdn/Alpha/1/epochs/1/attempt-1-fixture/${rendition}-${sequence}.ts`, durationSeconds: 2, programDateTime: now + sequence * 2000, discontinuity: false })) }]));
  const handler = createNativeTrialGateway({ config, clock: () => now,
    authorize: async ({ rendition }) => { calls++; return revoked ? { kind: "denied" } :
      { kind: "active", grant, state: "ready", epoch: 1, leaseExpiresAt: 40000, snapshot: snapshots[rendition] }; },
    readSnapshot: key => Object.values(snapshots).find(value => snapshotObjectKey(value) === key),
    readSegment: () => Buffer.alloc(100), recordDemand: async () => {}, onExhausted: () => exhausted++,
  });
  return { config, handler, revoke: () => { revoked = true; }, expire: () => { now = config.expiresAt; }, calls: () => calls, exhausted: () => exhausted };
}

test("copied native segment URLs share the finite response allowance and recheck real grant authority", async () => {
  const h = fixture();
  const manifest = await h.handler(new Request("https://trial.invalid/p/grant/audio/index.m3u8"));
  assert.equal(manifest.status, 200); const text = await manifest.text();
  const url = text.split(/\r?\n/).find(line => line.startsWith("https://")); assert(url);
  let delivered = Buffer.byteLength(text), successes = 0;
  for (let index = 0; index < 30; index++) {
    const response = await h.handler(new Request(url));
    if (response.status === 429) break;
    assert.equal(response.status, 200); successes++; delivered += (await response.arrayBuffer()).byteLength;
  }
  assert(successes > 1); assert(delivered <= h.config.limits.payloadBytes); assert.equal(h.exhausted(), 1);
});

test("revoked, expired and cross-source requests fail before media reads; unknown origins are denied", async () => {
  const h = fixture();
  assert.equal((await h.handler(new Request("https://trial.invalid/p/grant/audio/index.m3u8", { headers: { origin: "https://evil.invalid" } }))).status, 403);
  const object = encodeURIComponent("vrcdn/Beta/1/epochs/1/attempt-1-fixture/audio-0.ts");
  assert.equal((await h.handler(new Request(`https://trial.invalid/p/grant/objects/${object}`))).status, 403);
  h.revoke(); assert.equal((await h.handler(new Request("https://trial.invalid/p/grant/audio/index.m3u8"))).status, 403);
  const calls = h.calls(); h.expire();
  assert.equal((await h.handler(new Request("https://trial.invalid/p/grant/audio/index.m3u8"))).status, 410);
  assert.equal(h.calls(), calls);
});
