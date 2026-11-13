import type { OwnershipLease } from "../contracts";
import { createDemand } from "../gateway/demand";
import { createControlRpc, createConvexControl, gatewayAuthorization } from "../providers/convex-control";
import { startRelayWorker } from "../worker/main";
import { createPackager } from "../worker/packager";
import { createNativeTrialGateway } from "./gateway";
import { readNativeTrialConfig } from "./policy";
import { verifyNativeTrialScratch } from "./scratch";
import { createNativeTrialSource } from "./source";
import { createNativeTrialStorage } from "./storage";

/** Never acknowledge terminal ownership until physical packager cleanup has succeeded. */
export async function completeNativeTrialStop({ stopWorker, attempts, acknowledge, close }: {
  stopWorker: () => Promise<void>; attempts: Iterable<Promise<{ stop(): Promise<void> }>>;
  acknowledge: () => Promise<void>; close: () => void;
}) {
  try {
    await stopWorker();
    await Promise.all([...attempts].map(async attempt => {
      // The original packager rejects before acquisition; setup failures after acquisition return a stop handle.
      let handle: { stop(): Promise<void> };
      try { handle = await attempt; } catch { return; }
      await handle.stop();
    }));
    await acknowledge();
  } finally { close(); }
}
/** Existing control/registry/packager contract, on one physically finite trial host. */
export async function startNativeTrial(env: NodeJS.ProcessEnv = process.env) {
  const config = readNativeTrialConfig(env.MEDIA_RELAY_TRIAL_CONFIG, Date.now());
  if (!config || process.getuid?.() === undefined || process.getuid() === 0) throw Error("Inactive trial or privileged runtime");
  const scratch = await verifyNativeTrialScratch(env.MEDIA_RELAY_TRIAL_SCRATCH ?? "");
  const url = env.MEDIA_RELAY_CONTROL_URL ?? "", workerToken = env.MEDIA_RELAY_WORKER_TOKEN ?? "", gatewayToken = env.MEDIA_RELAY_GATEWAY_TOKEN ?? "";
  if (!workerToken || !gatewayToken || workerToken === gatewayToken) throw Error("Distinct scoped relay credentials required");
  const storage = createNativeTrialStorage({ streamKey: config.source.streamKey, maxBytes: config.limits.retainedBytes });
  let lastDemand: number | null = null;
  const demand = createDemand({ clock: Date.now, maxEntries: 1, store: {
    async checkHealth() {},
    async updateMax({ streamKey, at }) { if (streamKey !== config.source.streamKey) throw Error("Wrong trial demand"); lastDemand = Math.max(lastDemand ?? 0, at); },
    async read(streamKey) { if (streamKey !== config.source.streamKey) throw Error("Wrong trial demand"); return lastDemand; },
  } });
  const rpc = createControlRpc({ url, credential: workerToken });
  const control = createConvexControl(rpc, config.worker);
  let claimed: OwnershipLease | undefined;
  const claim = control.claim;
  control.claim = async (descriptor, signal) => claimed = await claim(descriptor, signal);
  const attempts = new Set<Promise<{ stop(): Promise<void> }>>();
  let stopping: Promise<void> | undefined;
  let worker: ReturnType<typeof startRelayWorker> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const stop = () => stopping ??= (async () => {
    if (deadline) clearTimeout(deadline);
    await completeNativeTrialStop({ stopWorker: async () => { await worker?.stop(); }, attempts,
      acknowledge: async () => {
        if (claimed) await rpc("mutation", "observeSource", { workerId: config.worker.workerId, workerEpoch: config.worker.workerEpoch,
          streamKey: claimed.streamKey, epoch: claimed.epoch, state: "stopped", progressAt: 0, trialId: config.trialId }, AbortSignal.timeout(2000));
      }, close: storage.close,
    });
  })();
  const source = createNativeTrialSource({ source: config.source, maxBytes: config.limits.upstreamBytes, onLimit: () => { void stop(); } });
  const packager = createPackager({ createRelay: source.create });
  worker = startRelayWorker({ binding: config.worker, directory: scratch.directory, storage, demand,
    control, limits: { maxAttempts: 1 }, packager: options => {
      const attempt = packager(options); attempts.add(attempt); return attempt;
    },
    metrics: ({ kind }) => process.stdout.write(JSON.stringify({ kind }) + "\n"),
  });
  deadline = setTimeout(() => { void stop(); }, config.expiresAt - Date.now());
  const gateway = createNativeTrialGateway({ config, clock: Date.now,
    authorize: gatewayAuthorization(createControlRpc({ url, credential: gatewayToken })),
    readSnapshot: storage.readSnapshot, readSegment: storage.readSegment,
    recordDemand: demand.recordDemand, onExhausted: () => { void stop(); },
  });
  return { gateway, stop, upstreamBytes: source.upstreamBytes, retainedBytes: storage.bytes, acquisitions: source.acquisitions };
}
