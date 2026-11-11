const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const ordinary = {
  openActor: 3,
  openTarget: 2,
  dailyActor: 6,
  dailyTarget: 20,
  burst: 1,
  burstWindowMs: 30_000,
  actorProcessing: 3,
  targetProcessing: 2,
  actorBytes: 144 * MiB,
  targetBytes: 96 * MiB,
  activeRows: 1000,
  retainedBatches: 1000,
  retainedRevisions: 10000,
};
const trusted = {
  ...ordinary,
  openActor: 1000,
  openTarget: 20,
  dailyActor: 1000,
  dailyTarget: 100,
  burst: 12,
  burstWindowMs: 60_000,
  actorProcessing: 4,
  actorBytes: 20 * GiB,
  activeRows: 10000,
  retainedBatches: 10000,
  retainedRevisions: 100000,
};
const superadmin = {
  ...trusted,
  openActor: null,
  openTarget: null,
  dailyActor: null,
  dailyTarget: null,
  burst: null,
  actorProcessing: null,
  actorBytes: null,
};
export function resolveContributionPolicy(env: Record<string, string | undefined> = process.env) {
  function bound(name: string, fallback: number) {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER / 2)
      throw new Error("POLICY_BOUND_INVALID");
    return value;
  }
  return {
    version: "roles-v1",
    ordinary,
    trusted,
    superadmin,
    deploymentBytes: bound("VRDEX_CONTRIBUTION_DEPLOYMENT_BYTES", 100 * GiB),
    deploymentProcessing: bound("VRDEX_CONTRIBUTION_DEPLOYMENT_CONCURRENCY", 16),
    hostFetchesPerMinute: bound("VRDEX_CONTRIBUTION_HOST_FETCHES_PER_MINUTE", 30),
    paused: env.VRDEX_CONTRIBUTION_INTAKE_PAUSED === "true",
    bulkEnabled: env.VRDEX_CONTRIBUTION_BATCHES_ENABLED === "true",
  };
}
