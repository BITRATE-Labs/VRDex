import assert from "node:assert/strict";
import { test } from "node:test";
import { NativeTrialConfigSchema, readNativeTrialConfig } from "../src/trial/policy";

export const trialConfig = {
  version: 1, trialId: "native-trial-fixture", operatorUserId: "operator",
  source: { streamKey: "vrcdn/Alpha/1", streamId: "Alpha", inputFormat: "vrcdn_fmp4", packagingVersion: 1 },
  context: { kind: "profile", profileId: "profile", linkId: "Alpha" },
  origin: "https://trial.invalid", origins: ["https://app.invalid"], startsAt: 1000, expiresAt: 901000,
  limits: { upstreamBytes: 1024 ** 3, payloadBytes: 256 * 1024 ** 2, requests: 3000, retainedBytes: 128 * 1024 ** 2 },
  worker: { workerId: "native-trial-worker", workerEpoch: 1, allocation: { cpuUnits: 1024, memoryMiB: 2048, evidenceId: "trial-fixture-proof" }, maxSources: 1, draining: false },
};

test("native trial is one source, two grants, finite time and immutable bounded resources", () => {
  assert.equal(NativeTrialConfigSchema.parse(trialConfig).expiresAt, 901000);
  for (const bad of [
    { ...trialConfig, expiresAt: 901001 },
    { ...trialConfig, source: { ...trialConfig.source, streamId: "Other" } },
    { ...trialConfig, origin: "http://trial.invalid" },
    { ...trialConfig, worker: { ...trialConfig.worker, maxSources: 2 } },
    { ...trialConfig, limits: { ...trialConfig.limits, upstreamBytes: 2 * 1024 ** 3 } },
  ]) assert.equal(NativeTrialConfigSchema.safeParse(bad).success, false);
});

test("missing, malformed, premature, expired and reversed-clock trial configurations stay off", () => {
  const raw = JSON.stringify(trialConfig);
  assert.equal(readNativeTrialConfig(undefined, 1000), null);
  assert.equal(readNativeTrialConfig("broken", 1000), null);
  assert.equal(readNativeTrialConfig(raw, 999), null);
  assert.equal(readNativeTrialConfig(raw, 901000), null);
  assert.equal(readNativeTrialConfig(raw, Number.NaN), null);
  assert.equal(readNativeTrialConfig(raw, 1000)?.trialId, "native-trial-fixture");
});
