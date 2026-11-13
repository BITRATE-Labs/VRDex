import { z } from "zod";
import { PublicContextSchema, SourceDescriptorSchema } from "../contracts";
import { WorkerBindingSchema } from "../worker/deployment";

export const NATIVE_TRIAL_SEGMENT_GRACE_MS = 30000;

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const time = z.number().int().nonnegative();
const origin = z.string().refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && url.origin === value; } catch { return false; }
});
const bounded = (max: number) => z.number().int().positive().max(max);

/** A separately reviewed finite integration trial, never full hosted-release evidence. */
export const NativeTrialConfigSchema = z.strictObject({
  version: z.literal(1), trialId: id, operatorUserId: id,
  source: SourceDescriptorSchema, context: PublicContextSchema, origin,
  origins: z.array(origin).min(1).max(3),
  startsAt: time, expiresAt: time,
  limits: z.strictObject({ upstreamBytes: bounded(1024 ** 3), payloadBytes: bounded(512 * 1024 ** 2),
    requests: bounded(10000), retainedBytes: bounded(128 * 1024 ** 2) }),
  worker: WorkerBindingSchema,
}).refine(value => value.expiresAt > value.startsAt && value.expiresAt - value.startsAt <= 900000,
  "Trial lifetime exceeds fifteen minutes")
  .refine(value => value.worker.maxSources === 1 && !value.worker.draining &&
    value.worker.allocation.cpuUnits === 1024 && value.worker.allocation.memoryMiB === 2048,
  "Trial requires one fixed source slot on the selected allocation");
export type NativeTrialConfig = z.infer<typeof NativeTrialConfigSchema>;

export function readNativeTrialConfig(raw: string | undefined, now: number): NativeTrialConfig | null {
  try {
    const value = NativeTrialConfigSchema.parse(JSON.parse(raw ?? "null"));
    return Number.isFinite(now) && now >= value.startsAt && now < value.expiresAt ? value : null;
  } catch { return null; }
}

export function matchesTrialContext(trial: NativeTrialConfig, context: unknown, streamId: string): boolean {
  const parsed = PublicContextSchema.safeParse(context);
  if (!parsed.success || streamId !== trial.source.streamId) return false;
  const actual = parsed.data, expected = trial.context;
  return actual.kind === "profile" && expected.kind === "profile"
    ? actual.profileId === expected.profileId && actual.linkId === expected.linkId
    : actual.kind === "event" && expected.kind === "event" &&
      actual.eventId === expected.eventId && actual.selectedSourceId === expected.selectedSourceId;
}

export const NativeTrialEvidenceSchema = z.strictObject({
  target: z.literal("finite-native-trial"), trialId: id, evidenceId: id, measuredAt: time,
  sourceCap: z.literal(1), maximumGrants: z.literal(2),
  memoryPeakBytes: bounded(Math.floor(2048 * 1024 ** 2 * 0.7)),
  retainedPeakBytes: bounded(128 * 1024 ** 2),
  scratchLimitBytes: z.literal(512 * 1024 ** 2), scratchHardBoundVerified: z.literal(true),
  budgetEnforcementPassed: z.literal(true), nativeContractPassed: z.literal(true),
  cleanupPassed: z.literal(true), timestampWarnings: z.literal(0),
});
