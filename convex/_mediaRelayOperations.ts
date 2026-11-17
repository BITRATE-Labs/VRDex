import { readNativeTrialConfig } from "../packages/media-relay/src/trial/policy";
import type { DatabaseReader } from "./_generated/server";
export async function relayOperationState(db: DatabaseReader) {
  return db
    .query("mediaRelayOperations")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .unique();
}
export async function activeNativeTrial(db: DatabaseReader, now = Date.now()) {
  const trial = readNativeTrialConfig(process.env.MEDIA_RELAY_TRIAL_CONFIG, now);
  if (!trial) return null;
  const operation = await relayOperationState(db);
  return operation?.trialEnabled === true && operation.trialId === trial.trialId &&
    operation.trialEvidenceId === trial.worker.allocation.evidenceId &&
    operation.trialConfiguration === JSON.stringify(trial) ? trial : null;
}

export async function relayEnabled(db: DatabaseReader) {
  return (
    process.env.MEDIA_RELAY_ENABLED === "true" &&
    (await relayOperationState(db))?.enabled === true
  ) || (await activeNativeTrial(db)) !== null;
}
