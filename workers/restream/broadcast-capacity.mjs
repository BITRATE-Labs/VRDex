// Server/bridge only. Deliberately excluded from the worker/proof image.
import { VIDEO_PROFILES } from "./broadcast-profiles.mjs";
import { parseAllocation } from "./worker-allocation.mjs";
/** @typedef {{videoPreset: import("./broadcast-profiles.mjs").VideoPreset, audioBitrateKbps: 160|320, simulcastEnabled: boolean}} CapacityInput */
/** @typedef {(input: CapacityInput) => import("./worker-allocation.mjs").WorkerAllocation} CapacityResolver */
/** Passing candidate receipts populate this map after actual-image measurement. */
const MEASURED_ALLOCATIONS = Object.freeze({
  // Synthetic capacity only; live input and provider acceptance remain separate.
  "720p30:320:false": Object.freeze({
    cpuUnits: 8192,
    memoryMiB: 16384,
    evidenceId: "task6-br447-primary-20261110g",
  }),
  "720p30:320:true": Object.freeze({
    cpuUnits: 8192,
    memoryMiB: 16384,
    evidenceId: "task6-br447-twitch-20261110h",
  }),
});
/** Pure fixture seam for unit tests. No environment or client resource authority.
 * @param {Readonly<Record<string, import("./worker-allocation.mjs").WorkerAllocation>>} entries
 * @returns {CapacityResolver}
 */
export function createCapacityResolver(entries) {
  /** @param {CapacityInput} input */
  return function resolve(input) {
    if (
      !input ||
      Object.keys(input).sort().join(",") !== "audioBitrateKbps,simulcastEnabled,videoPreset" ||
      !Object.hasOwn(VIDEO_PROFILES, input.videoPreset) ||
      ![160, 320].includes(input.audioBitrateKbps) ||
      typeof input.simulcastEnabled !== "boolean"
    )
      throw Error("Invalid capacity profile");
    const entry = entries[`${input.videoPreset}:${input.audioBitrateKbps}:${input.simulcastEnabled}`];
    if (!entry) throw Error("Unproved broadcast configuration");
    return Object.freeze(parseAllocation(entry));
  };
}
/** @type {CapacityResolver} */
export const resolveWorkerAllocation =
  createCapacityResolver(MEASURED_ALLOCATIONS);
/** @param {CapacityResolver} [resolve] */
export function validateMeasuredSnapshot(
  snapshot,
  resolve = resolveWorkerAllocation,
) {
  const expected = resolve({
    videoPreset: snapshot.mediaSettings.videoPreset,
    audioBitrateKbps: snapshot.mediaSettings.audioBitrateKbps,
    simulcastEnabled: snapshot.destinationProfiles.some(
      (d) => d.destination === "twitch",
    ),
  });
  if (
    Object.entries(expected).some(
      ([key, val]) => snapshot.allocation[key] !== val,
    )
  )
    throw Error("Unproved allocation snapshot");
  return expected;
}
