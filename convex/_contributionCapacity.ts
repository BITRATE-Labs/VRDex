import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseWriter, DatabaseReader } from "./_generated/server";
import { getAccountFeatureAccess } from "./_accountFeatures";
import { resolveContributionPolicy } from "./_contributionPolicy";
import { validMediaCleanupUrl } from "./_mediaCleanupUrl";
import {
  PROFILE_ASSET_UPLOAD_MAX_BYTES,
  validateProfileAssetByteSize,
} from "./_profileAssets";

// Accounting validation defaults. Admission uses the current role policy.
export const CONTRIBUTION_CAPACITY = {
  actorProcessing: 3,
  targetProcessing: 2,
  actorBytes: resolveContributionPolicy({}).ordinary.actorBytes,
  targetBytes: resolveContributionPolicy({}).ordinary.targetBytes,
} as const;
export function reservationBytes(sourceBytes: number) {
  return (
    2 * validateProfileAssetByteSize(sourceBytes) +
    2 * PROFILE_ASSET_UPLOAD_MAX_BYTES
  );
}
export function localUploadModes(env: Record<string, string | undefined> = process.env) {
  const ready = env.VRDEX_CONTRIBUTION_UPLOADS_ENABLED === "true" &&
    env.VRDEX_MEDIA_UPLOAD_CLEANUP_READY === "true" &&
    !!validMediaCleanupUrl(env.VRDEX_MEDIA_CLEANUP_URL) && !!env.VRDEX_MEDIA_CLEANUP_TOKEN;
  return {
    owner: ready && env.VRDEX_PROFILE_MEDIA_KIT_ENABLED === "true",
    contributor: ready && env.VRDEX_PROFILE_MEDIA_SUBMISSIONS_ENABLED === "true",
  };
}
// Includes archived and legacy envelopes. A bounded read also handles rows created
// before envelope admission existed, without an unbounded migration transaction.
export async function retainedBatchUsage(db: DatabaseReader, actor: Id<"users">, limit: number, maximumBytesRead = 8 * 1024 * 1024) {
  const usage = await db.query("contributionManifestUsage").withIndex("by_actor", q => q.eq("actorUserId", actor)).unique();
  if (usage?.retainedBatches !== undefined) return { count: usage.retainedBatches, isLowerBound: false };
  const page = await db.query("contributionBatches")
    .withIndex("by_actor_key", q => q.eq("actorUserId", actor)).paginate({
      cursor: null, numItems: limit + 1, maximumRowsRead: limit + 1,
      maximumBytesRead,
    });
  return { count: page.page.length, isLowerBound: !page.isDone || page.pageStatus === "SplitRequired" };
}
export async function effectiveContributionPolicy(
  db: DatabaseReader,
  actor: Id<"users">,
) {
  const policy = resolveContributionPolicy();
  const grants = await getAccountFeatureAccess(db, actor);
  const tier = grants.superAdmin ? "superadmin" :
    grants.canContributeBulk || grants.canReviewMedia || grants.canPublishMedia ? "trusted" : "ordinary";
  return { ...policy, tier, limits: policy[tier] };
}
export function effectiveCapacityLimit(policyLimit: number | null, storedLimit?: number) {
  return policyLimit === null ? storedLimit ?? null : Math.min(policyLimit, storedLimit ?? policyLimit);
}
export async function contributionChargeRefusal(
  db: DatabaseReader,
  reservation: Pick<
    Doc<"contributionUploadReservations">,
    "actorUserId" | "profileId"
  >,
  bytes: number,
  processing: number,
) {
  const policy = await effectiveContributionPolicy(db, reservation.actorUserId);
  if (policy.paused) return "CONTRIBUTION_INTAKE_PAUSED";
  for (const [scope, maxBytes, maxProcessing, category] of [
    [
      `actor:${reservation.actorUserId}`,
      policy.limits.actorBytes,
      policy.limits.actorProcessing,
      "ACTOR",
    ],
    [
      `target:${reservation.profileId}`,
      policy.limits.targetBytes,
      policy.limits.targetProcessing,
      "TARGET",
    ],
    [
      "deployment",
      policy.deploymentBytes,
      policy.deploymentProcessing,
      "DEPLOYMENT",
    ],
  ] as const) {
    const row = await db
      .query("contributionCapacity")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .unique();
    const published =
      scope === "deployment"
        ? await db
            .query("contributionCapacity")
            .withIndex("by_scope", (q) => q.eq("scope", "published"))
            .unique()
        : null;
    const byteLimit = effectiveCapacityLimit(maxBytes, row?.byteLimit);
    const processingLimit = effectiveCapacityLimit(maxProcessing, row?.processingLimit);
    if (
      byteLimit !== null && (row?.bytes ?? 0) + (published?.bytes ?? 0) + bytes > byteLimit
    )
      return `CONTRIBUTION_${category}_BYTES`;
    if (
      processingLimit !== null && (row?.processing ?? 0) + processing > processingLimit
    )
      return `CONTRIBUTION_${category}_CONCURRENCY`;
  }
  return null;
}
export async function assertCapacityNotRevoked(
  db: DatabaseReader,
  actor: Id<"users">,
  admittedAt: number,
) {
  const access = await getAccountFeatureAccess(db, actor);
  if (access.superAdmin || access.canContributeBulk || access.canReviewMedia || access.canPublishMedia) return;
  const groups = await Promise.all((["trusted_contributor", "media_reviewer", "trusted_publisher", "super_admin"] as const).map(feature =>
    db.query("accountFeatureGrants").withIndex("by_userId_feature_state", q =>
      q.eq("userId", actor).eq("feature", feature).eq("state", "revoked")).order("desc").first()));
  if (groups.some(grant => grant?.revokedAt !== undefined && grant.revokedAt >= admittedAt))
    throw new ConvexError({ code: "CONTRIBUTION_CAPACITY_REVOKED" });
}
export async function changeContributionCharge(
  db: DatabaseWriter,
  reservation: Pick<
    Doc<"contributionUploadReservations">,
    "actorUserId" | "profileId"
  > & { ledgerVersion?: number },
  bytes: number,
  processing: number,
  admit = false,
) {
  if (
    admit &&
    (await contributionChargeRefusal(db, reservation, bytes, processing))
  )
    throw new ConvexError({ code: "UPLOAD_CAPACITY_EXCEEDED" });
  for (const [scope, maxBytes, maxProcessing] of [
    [
      `actor:${reservation.actorUserId}`,
      CONTRIBUTION_CAPACITY.actorBytes,
      CONTRIBUTION_CAPACITY.actorProcessing,
    ],
    [
      `target:${reservation.profileId}`,
      CONTRIBUTION_CAPACITY.targetBytes,
      CONTRIBUTION_CAPACITY.targetProcessing,
    ],
    ["deployment", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ] as const) {
    if (scope === "deployment" && !admit && reservation.ledgerVersion !== 1)
      continue;
    const row = await db
      .query("contributionCapacity")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .unique();
    const next = {
      bytes: (row?.bytes ?? 0) + bytes,
      processing: (row?.processing ?? 0) + processing,
    };
    if (
      next.bytes < 0 ||
      next.processing < 0 ||
      !Number.isSafeInteger(next.bytes)
    )
      throw new ConvexError({ code: "UPLOAD_ACCOUNTING_INVALID" });
    const byteLimit = Math.min(row?.byteLimit ?? maxBytes, maxBytes);
    const processingLimit = Math.min(
      row?.processingLimit ?? maxProcessing,
      maxProcessing,
    );
    if (
      ![byteLimit, processingLimit].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    )
      throw new ConvexError({ code: "UPLOAD_ACCOUNTING_INVALID" });
    if (row) await db.patch(row._id, next);
    else await db.insert("contributionCapacity", { scope, ...next });
  }
}

export async function registerLegacyContribution(
  db: DatabaseWriter,
  intentId: Id<"profileAssetUploadIntents">,
  actorUserId: Id<"users">,
  profileId: Id<"profiles">,
  bytes = PROFILE_ASSET_UPLOAD_MAX_BYTES,
) {
  const intent = (await db.get(intentId))!;
  const charge = reservationBytes(bytes);
  await changeContributionCharge(
    db,
    { actorUserId, profileId, ledgerVersion: 1 },
    charge,
    1,
    true,
  );
  await db.insert("contributionUploadReservations", {
    intentId,
    actorUserId,
    profileId,
    ledgerVersion: 1,
    oauthClientId: intent.mcpOauthClientId ?? "browser",
    idempotencyKey: intent.mcpIdempotencyKeyHash ?? String(intentId),
    fingerprint: intent.mcpRequestFingerprint ?? String(intentId),
    mode: "contributor",
    expectedUpdatedAt: (await db.get(profileId))!.updatedAt,
    declaredBytes: bytes,
    declaredType: intent.mimeType ?? "image/unknown",
    sha256: "legacy",
    chargedBytes: charge,
    quarantineBytes: 0,
    processing: true,
    state: "pending",
    expiresAt: intent.expiresAt,
    cleanupAfter: intent.expiresAt + 86400000,
    createdAt: Date.now(),
  });
}
export async function settleLegacyContribution(
  db: DatabaseWriter,
  intent: Doc<"profileAssetUploadIntents">,
  sizes: {
    byteSize: number;
    sourceByteSize?: number;
    downloadByteSize?: number;
  },
) {
  if (intent.issuer === "mcp_local") return;
  const row = await db
    .query("contributionUploadReservations")
    .withIndex("by_intentId", (q) => q.eq("intentId", intent._id))
    .unique();
  if (!row || row.receipt) return;
  const bytes =
    sizes.byteSize +
    (sizes.sourceByteSize ?? 0) +
    (sizes.downloadByteSize ?? 0);
  if (bytes > row.chargedBytes) throw new ConvexError({ code: "UPLOAD_RESERVATION_EXCEEDED" });
  await changeContributionCharge(db, row, bytes - row.chargedBytes, -1);
  await db.patch(row._id, {
    chargedBytes: bytes,
    processing: false,
    state: "committed",
    receipt: {
      operationId: String(intent._id),
      operationState: "committed",
      resourceId: String(intent.targetSubmissionId),
    },
  });
}
export async function transferPublishedCharge(
  db: DatabaseWriter,
  submission: Doc<"profileMediaSubmissions">,
) {
  if (!submission.uploadIntentId) return;
  const row = await db
    .query("contributionUploadReservations")
    .withIndex("by_intentId", (q) =>
      q.eq("intentId", submission.uploadIntentId!),
    )
    .unique();
  if (!row || row.publishedBytes !== undefined) return;
  const bytes = row.chargedBytes - row.quarantineBytes;
  await changeContributionCharge(db, row, -bytes, 0);
  const scope = "published",
    old = await db
      .query("contributionCapacity")
      .withIndex("by_scope", (q) => q.eq("scope", scope))
      .unique();
  if (old) await db.patch(old._id, { bytes: old.bytes + bytes });
  else await db.insert("contributionCapacity", { scope, bytes, processing: 0 });
  await db.patch(row._id, {
    chargedBytes: row.quarantineBytes,
    publishedBytes: bytes,
  });
}

// Compact rolling admission history shares the existing actor/target ledgers.
export async function submissionAdmissionTimes(db: DatabaseReader, scope: "actor" | "target", id: Id<"users"> | Id<"profiles">, now: number) {
  const row = await db.query("contributionCapacity").withIndex("by_scope", q => q.eq("scope", `${scope}:${id}`)).unique();
  if (row?.submissionTimes !== undefined) return row.submissionTimes.filter(time => time > now - 86400000);
  const legacy = scope === "actor"
    ? await db.query("profileMediaSubmissions").withIndex("by_submitterUserId_createdAt", q => q.eq("submitterUserId", id as Id<"users">).gt("createdAt", now - 86400000)).order("desc").take(1000)
    : await db.query("profileMediaSubmissions").withIndex("by_profileId_createdAt", q => q.eq("profileId", id as Id<"profiles">).gt("createdAt", now - 86400000)).order("desc").take(100);
  return legacy.map(row => row.createdAt);
}
export async function insertMediaSubmission(db: DatabaseWriter, submission: Omit<Doc<"profileMediaSubmissions">, "_id" | "_creationTime">) {
  for (const [scope, id, limit] of [["actor", submission.submitterUserId, 1000], ["target", submission.profileId, 100]] as const) {
    const row = await db.query("contributionCapacity").withIndex("by_scope", q => q.eq("scope", `${scope}:${id}`)).unique();
    const times = await submissionAdmissionTimes(db, scope, id, submission.createdAt);
    const submissionTimes = [submission.createdAt, ...times].sort((a, b) => b - a).slice(0, limit);
    if (row) await db.patch(row._id, { submissionTimes });
    else await db.insert("contributionCapacity", { scope: `${scope}:${id}`, bytes: 0, processing: 0, submissionTimes });
  }
  return db.insert("profileMediaSubmissions", submission);
}
