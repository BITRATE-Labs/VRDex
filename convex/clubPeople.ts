import { v, type Infer } from "convex/values";
import { mutation, query, internalMutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { peopleSource, personIdentity, PEOPLE_DAY_MS, PEOPLE_VIEW_MS, validPersonName, type PeopleSource, type PeopleReferenceSource } from "./_clubPeople";
import { normalizeRecipients } from "./_clubInvitations";
import { normalizeVrchatTargetId } from "./_vrchatIdentity";
import { readManagedIntegration, readCollectionSubject } from "./_groupObservationPolicy";
import { resolveClubActor, resolveClubSubject, requireClubPermission, canReadCategory, readClubVisibility, type ClubActor } from "./_clubAccess";
import { enabledClubFeatures, currentClubAuthority } from "./_clubConnection";
import { readRequirement } from "./_clubProviderReads";
import { clubOperationRequirement } from "./_clubOperationPolicy";
import { policyOperation } from "./_clubOperations";
import { membershipActivityIdentities } from "./_membershipActivityIdentity";

type Ctx = QueryCtx | MutationCtx;
type Integration = Doc<"communityVrchatIntegrations">;
type Subject = NonNullable<ClubActor["subject"]>;
type Target = { userId: string; source: PeopleReferenceSource; expiresAt: number; canLookup: boolean; displayName?: string; observedAt?: number };
const epoch = (integration: Integration) => integration.telemetryEpochStartedAt ?? integration.createdAt;
const pendingOperation = (operation: Doc<"clubOperations">) => ["pending", "claimed", "submitted"].includes(operation.state);

async function scope(ctx: Ctx, communityProfileId: Id<"profiles">, integrationId?: Id<"communityVrchatIntegrations">, epochStartedAt?: number) {
  const integration = await readManagedIntegration(ctx.db, communityProfileId);
  if (!integration || !["active", "degraded"].includes(integration.state) || integration.killSwitchEnabled ||
      (integrationId !== undefined && integration._id !== integrationId) ||
      (epochStartedAt !== undefined && epoch(integration) !== epochStartedAt) || !integration.assignedCollectorAccountId)
    throw new Error("People view unavailable.");
  return integration;
}
async function historyAccess(ctx: Ctx, actor: ClubActor, integration: Integration) {
  if (actor.kind === "none" || !canReadCategory(actor, await readClubVisibility(ctx.db, integration.communityProfileId!), "individual_membership_history") ||
      !enabledClubFeatures(integration).includes("analytics") || integration.namedMembershipCollectionEnabled === false)
    throw new Error("History unavailable.");
}
function requireFeature(integration: Integration, feature: "instances" | "membership_management" | "analytics" | "posts" | "calendar") {
  if (!enabledClubFeatures(integration).includes(feature)) throw new Error("Feature unavailable.");
}
async function reviewAccess(ctx: Ctx, actor: ClubActor, integration: Integration, source: Extract<PeopleSource, { kind: "invitation_review" }>) {
  requireClubPermission(actor, source.destination.kind === "group" ? "invite_group_members" : "manage_instances");
  requireFeature(integration, source.destination.kind === "group" ? "membership_management" : "instances");
  if (source.destination.kind === "instance") {
    const { worldId, instanceId } = source.destination;
    const groups = [...instanceId.matchAll(/~group\(([^)]+)\)/g)];
    if (!/^wrld_[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(worldId) ||
        instanceId.length > 1000 || /[\s:/?#\\%]/u.test(instanceId) || groups.length !== 1 || groups[0][1] !== integration.vrchatGroupId)
      throw new Error("Invitation destination unavailable.");
  } else if (source.destination.kind === "scheduled_instance") {
    const operation = await ctx.db.get(source.destination.creationOperationId);
    if (!operation || operation.integrationId !== integration._id || operation.epochStartedAt !== epoch(integration) ||
        operation.communityProfileId !== integration.communityProfileId || operation.payload.kind !== "create_instance" ||
        operation.revision !== source.destination.creationRevision || !["pending", "claimed", "submitted", "succeeded"].includes(operation.state))
      throw new Error("Invitation destination unavailable.");
  }
}
function targets(ids: { id?: string; name?: string }[], source: PeopleReferenceSource, expiresAt: number, canLookup = true, observedAt?: number): Target[] {
  return ids.flatMap(({ id, name }) => {
    const userId = id && normalizeVrchatTargetId(id, "vrchat_user");
    return userId ? [{ userId, source, expiresAt, canLookup, ...(validPersonName(name) ? { displayName: name } : {}), ...(observedAt !== undefined ? { observedAt } : {}) }] : [];
  });
}
async function sourceTargets(ctx: Ctx, integration: Integration, actor: ClubActor | null, source: PeopleReferenceSource, now: number): Promise<Target[]> {
  switch (source.kind) {
    case "audit": {
      if (actor) await historyAccess(ctx, actor, integration);
      requireFeature(integration, "analytics");
      if (integration.namedMembershipCollectionEnabled === false) throw new Error("History unavailable.");
      const event = await ctx.db.get(source.eventId);
      if (!event?.verified || event.integrationId !== integration._id || event.epochStartedAt !== epoch(integration)) throw new Error("Event unavailable.");
      const supplemental = await ctx.db.query("communityMembershipEvidence").withIndex("by_audit", q => q.eq("integrationId", integration._id).eq("epochStartedAt", epoch(integration)).eq("auditId", event.auditId)).unique();
      return targets([{ id: event.targetUserId, name: event.targetDisplayName }, { id: event.actorUserId ?? supplemental?.actorUserId, name: event.actorDisplayName ?? supplemental?.actorDisplayName }], source, Number.MAX_SAFE_INTEGER, true, event.occurredAt);
    }
    case "review": {
      const view = await ctx.db.get(source.viewId);
      if (!actor || !view || view.expiresAt <= now || view.integrationId !== integration._id || view.epochStartedAt !== epoch(integration) ||
          view.subject.tokenIdentifier !== actor.subject?.tokenIdentifier || view.source.kind !== "invitation_review") throw new Error("Review expired.");
      await reviewAccess(ctx, actor, integration, view.source);
      return targets(view.source.targetUserIds.map(id => ({ id })), source, view.expiresAt);
    }
    case "operation": {
      const operation = await ctx.db.get(source.operationId);
      if (!actor || !operation || operation.communityProfileId !== integration.communityProfileId || operation.integrationId !== integration._id || operation.epochStartedAt !== epoch(integration)) throw new Error("Operation unavailable.");
      const requirement = clubOperationRequirement(policyOperation(operation.payload, "unknown"));
      requireClubPermission(actor, requirement.permission);
      requireFeature(integration, requirement.feature);
      const expiresAt = pendingOperation(operation) ? Number.MAX_SAFE_INTEGER : (operation.completedAt ?? operation.updatedAt) + 30 * PEOPLE_DAY_MS;
      if (expiresAt <= now) throw new Error("Operation reference expired.");
      if (source.batchId) {
        const batch = await ctx.db.get(source.batchId);
        const index = batch?.operationIds.indexOf(operation._id) ?? -1;
        if (!batch || batch.communityProfileId !== integration.communityProfileId || index < 0 || batch.recipients[index] !== source.reviewedUserId) throw new Error("Batch unavailable.");
      } else if (source.reviewedUserId !== undefined) throw new Error("Invalid reviewed recipient.");
      return targets([{ id: "targetUserId" in operation.payload ? operation.payload.targetUserId : undefined }, { id: source.reviewedUserId }], source, expiresAt, operation.state !== "cancelled");
    }
    case "read": {
      const read = await ctx.db.get(source.requestId);
      if (!actor || !read || read.communityProfileId !== integration.communityProfileId || read.subject.tokenIdentifier !== actor.subject?.tokenIdentifier ||
          read.integrationId !== integration._id || read.epochStartedAt !== epoch(integration) || read.expiresAt <= now || read.state !== "succeeded" || !read.result ||
          !["members", "search", "member", "requests", "invites", "bans"].includes(read.params.kind) || read.result.items.length > 100 || read.result.observedAt > now)
        throw new Error("Member read unavailable.");
      const requirement = readRequirement(read.params.kind);
      requireClubPermission(actor, requirement.permission);
      requireFeature(integration, requirement.feature);
      const account = await ctx.db.get(integration.assignedCollectorAccountId!);
      if (!account || account._id !== read.collectorAccountId || account.credentialGeneration !== read.credentialGeneration) throw new Error("Member read expired.");
      return targets(read.result.items.map(item => ({ id: item.userId ?? item.id, name: item.displayName })), source, Math.min(read.expiresAt, read.result.observedAt + PEOPLE_DAY_MS), true, read.result.observedAt);
    }
  }
}
async function viewTargets(ctx: Ctx, integration: Integration, actor: ClubActor, source: PeopleSource, viewId?: Id<"clubPeopleViews">): Promise<Target[]> {
  const now = Date.now();
  const refs: PeopleReferenceSource[] = [];
  switch (source.kind) {
    case "activity":
      if (!source.auditIds.length || source.auditIds.length > 25 || source.auditIds.some(id => !id || id.length > 200)) throw new Error("Invalid activity page.");
      for (const auditId of new Set(source.auditIds)) {
        const event = await ctx.db.query("communityMembershipEvents").withIndex("by_audit", q => q.eq("integrationId", integration._id).eq("epochStartedAt", epoch(integration)).eq("auditId", auditId)).unique();
        if (!event) throw new Error("Event unavailable.");
        refs.push({ kind: "audit", eventId: event._id });
      }
      break;
    case "invitation_review":
      await reviewAccess(ctx, actor, integration, source);
      normalizeRecipients(source.targetUserIds);
      if (!viewId) return [];
      refs.push({ kind: "review", viewId });
      break;
    case "invitation_batch": {
      const batch = await ctx.db.get(source.batchId);
      if (!batch || batch.communityProfileId !== integration.communityProfileId || batch.operationIds.length > 100 || batch.operationIds.length !== batch.recipients.length) throw new Error("Batch unavailable.");
      for (let i = 0; i < batch.operationIds.length; i++) refs.push({ kind: "operation", operationId: batch.operationIds[i], batchId: batch._id, reviewedUserId: batch.recipients[i] });
      break;
    }
    case "scheduled_operations":
      if (!source.operationIds.length || source.operationIds.length > 25) throw new Error("Invalid operation page.");
      refs.push(...source.operationIds.map(operationId => ({ kind: "operation" as const, operationId })));
      break;
    case "provider_read": refs.push({ kind: "read", requestId: source.requestId }); break;
  }
  return (await Promise.all(refs.map(ref => sourceTargets(ctx, integration, actor, ref, now)))).flat();
}
async function admit(ctx: MutationCtx, integration: Integration, target: Target, subject?: Subject) {
  const now = Date.now();
  const publicCache = await ctx.db.query("profileLinkDestinations").withIndex("by_key", q => q.eq("key", `vrchat_user:${target.userId}`)).unique();
  const publicFreshUntil = publicCache?.status === "resolved" && publicCache.entityId?.toLowerCase() === target.userId && validPersonName(publicCache.name) &&
    publicCache.observedAt !== undefined && publicCache.observedAt <= now ? publicCache.observedAt + PEOPLE_DAY_MS : 0;
  let person = await ctx.db.query("clubPeople").withIndex("by_scope_user", q => q.eq("integrationId", integration._id).eq("epochStartedAt", epoch(integration)).eq("userId", target.userId)).unique();
  if (!person) {
    const id = await ctx.db.insert("clubPeople", {
      integrationId: integration._id, epochStartedAt: epoch(integration), userId: target.userId,
      collectorAccountId: integration.assignedCollectorAccountId!, status: publicFreshUntil > now ? "resolved" : "pending", retryAt: publicFreshUntil, failures: 0,
      priority: subject ? 0 : 1, interestUntil: subject ? now + PEOPLE_VIEW_MS : 0,
      ...(target.canLookup && publicFreshUntil <= now ? { dueAt: now } : {}), checkAt: now + 60 * 60_000,
    });
    person = (await ctx.db.get(id))!;
  } else if (person.collectorAccountId !== integration.assignedCollectorAccountId) {
    await ctx.db.patch(person._id, { collectorAccountId: integration.assignedCollectorAccountId!, lease: undefined, dueAt: target.canLookup && publicFreshUntil <= now ? Math.max(now, person.retryAt) : undefined });
  } else if (publicFreshUntil > now && !person.lease) {
    await ctx.db.patch(person._id, { dueAt: undefined, retryAt: Math.max(person.retryAt, publicFreshUntil) });
  } else if (target.canLookup && !person.lease && person.retryAt <= now && person.dueAt === undefined) {
    await ctx.db.patch(person._id, { dueAt: now, collectorAccountId: integration.assignedCollectorAccountId! });
  }
  if (subject) await ctx.db.patch(person._id, { priority: 0, interestUntil: now + PEOPLE_VIEW_MS });
  const sourceKey = JSON.stringify([target.source, subject?.tokenIdentifier ?? null]);
  const prior = await ctx.db.query("clubPeopleReferences").withIndex("by_person_key", q => q.eq("personId", person._id).eq("sourceKey", sourceKey)).unique();
  const data = { expiresAt: target.expiresAt, checkAt: Math.min(target.expiresAt, now + 60 * 60_000) };
  if (prior) await ctx.db.patch(prior._id, data);
  else await ctx.db.insert("clubPeopleReferences", { ...data, personId: person._id, integrationId: integration._id, source: target.source, sourceKey, ...(subject ? { subject } : {}) });
  if (target.canLookup && publicFreshUntil <= now && person.retryAt <= now && process.env.VRDEX_PEOPLE_RESOLUTION_ENABLED === "true" &&
      (!integration.providerAuthority || integration.providerAuthority.authority.observedAt < now - 60_000)) {
    await ctx.db.patch(integration._id, { nextPollAt: Math.min(integration.nextPollAt ?? now, now) });
  }
}

export async function admitVerifiedAudit(ctx: MutationCtx, integration: Integration, eventId: Id<"communityMembershipEvents">) {
  if (!integration.assignedCollectorAccountId || readCollectionSubject(integration).kind !== "managed") return;
  for (const target of await sourceTargets(ctx, integration, null, { kind: "audit", eventId }, Date.now())) await admit(ctx, integration, target);
}

export const requestView = mutation({
  args: { communityProfileId: v.id("profiles"), source: peopleSource },
  returns: v.object({ viewId: v.id("clubPeopleViews"), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const actor = await resolveClubActor(ctx, args.communityProfileId);
    if (!actor.subject || actor.kind === "none") throw new Error("Sign in required.");
    const integration = await scope(ctx, args.communityProfileId);
    const source: PeopleSource = args.source.kind === "invitation_review" ? { ...args.source, targetUserIds: normalizeRecipients(args.source.targetUserIds) } : args.source;
    await viewTargets(ctx, integration, actor, source);
    const sourceKey = source.kind === "invitation_review" ? "invitation_review" : JSON.stringify(source);
    const prior = await ctx.db.query("clubPeopleViews").withIndex("by_actor_scope_key", q => q.eq("subject.tokenIdentifier", actor.subject!.tokenIdentifier).eq("integrationId", integration._id).eq("sourceKey", sourceKey)).unique();
    if (prior && prior.expiresAt > Date.now() && prior.epochStartedAt === epoch(integration) && JSON.stringify(prior.source) === JSON.stringify(source)) {
      for (const target of await viewTargets(ctx, integration, actor, source, prior._id)) await admit(ctx, integration, target, actor.subject);
      return { viewId: prior._id, expiresAt: prior.expiresAt };
    }
    if (prior) await ctx.db.delete(prior._id);
    const expiresAt = Date.now() + PEOPLE_VIEW_MS;
    const viewId = await ctx.db.insert("clubPeopleViews", { communityProfileId: args.communityProfileId, integrationId: integration._id, epochStartedAt: epoch(integration), subject: actor.subject, source, sourceKey, expiresAt });
    for (const target of await viewTargets(ctx, integration, actor, source, viewId)) await admit(ctx, integration, target, actor.subject);
    return { viewId, expiresAt };
  },
});

export const readView = query({
  args: { viewId: v.id("clubPeopleViews") },
  returns: v.object({ people: v.array(personIdentity), pendingCount: v.number(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const view = await ctx.db.get(args.viewId);
    if (!view || view.expiresAt <= Date.now()) throw new Error("People view expired.");
    const actor = await resolveClubActor(ctx, view.communityProfileId);
    if (actor.kind === "none" || actor.subject?.tokenIdentifier !== view.subject.tokenIdentifier) throw new Error("People view unavailable.");
    const integration = await scope(ctx, view.communityProfileId, view.integrationId, view.epochStartedAt);
    const entries = await viewTargets(ctx, integration, actor, view.source, view._id);
    const unique = new Map<string, Target>();
    for (const target of entries) {
      const previous = unique.get(target.userId);
      const named = target.displayName && (!previous?.displayName || (target.observedAt ?? 0) > (previous.observedAt ?? 0)) ? target : previous ?? target;
      unique.set(target.userId, { ...named, canLookup: target.canLookup || !!previous?.canLookup });
    }
    const publicIdentities = await membershipActivityIdentities(ctx, [...unique.keys()]);
    const people: Infer<typeof personIdentity>[] = [];
    const account = await ctx.db.get(integration.assignedCollectorAccountId!);
    const fleet = await ctx.db.query("collectorFleetSettings").withIndex("by_key", q => q.eq("key", "global")).unique();
    for (const [userId, target] of unique) {
      const identity = publicIdentities.get(userId)!;
      const cached = await ctx.db.query("clubPeople").withIndex("by_scope_user", q => q.eq("integrationId", integration._id).eq("epochStartedAt", epoch(integration)).eq("userId", userId)).unique();
      const { profileDisplayName, ...publicIdentity } = identity;
      const person: Infer<typeof personIdentity> = { userId, ...publicIdentity, status: cached?.status ?? "unavailable", ...(identity.displayName ? { source: "vrchat_public_cache" } : {}) };
      if (cached?.displayName && cached.observedAt !== undefined && cached.observedAt <= Date.now() && (person.observedAt === undefined || cached.observedAt > person.observedAt)) {
        person.displayName = cached.displayName; person.observedAt = cached.observedAt; person.source = "vrchat_private";
      }
      if (!person.displayName && target.displayName) { person.displayName = target.displayName; person.observedAt = target.observedAt; person.source = "recorded"; }
      if (!person.displayName && profileDisplayName) { person.displayName = profileDisplayName; person.source = "vrdex_profile"; }
      const runnable = process.env.VRDEX_PEOPLE_RESOLUTION_ENABLED === "true" && target.canLookup &&
        account?.state === "ready" && !account.killSwitchEnabled && !fleet?.killSwitchEnabled && (account.cooldownUntil ?? 0) <= Date.now() &&
        (integration.backoffUntil ?? 0) <= Date.now() && cached?.dueAt !== undefined;
      if (runnable) person.status = cached.retryAt <= Date.now() ? "pending" : "retry";
      else person.status = person.displayName ? "resolved" : "unavailable";
      people.push(person);
    }
    return { people, pendingCount: people.filter(person => person.status === "pending").length, expiresAt: view.expiresAt };
  },
});

async function providerSourceAccess(ctx: Ctx, source: PeopleReferenceSource, permissions: readonly string[]) {
  if (permissions.includes("*")) return true;
  if (source.kind === "audit") return permissions.includes("group-audit-view");
  if (source.kind === "read") {
    const read = await ctx.db.get(source.requestId);
    return !!read && readRequirement(read.params.kind).grants.every(grant => permissions.includes(grant));
  }
  if (source.kind === "operation") {
    const operation = await ctx.db.get(source.operationId);
    return !!operation && clubOperationRequirement(policyOperation(operation.payload, "unknown")).providerPermissions.every(grant => permissions.includes(grant));
  }
  const view = await ctx.db.get(source.viewId);
  return view?.source.kind === "invitation_review" && (view.source.destination.kind !== "group" || permissions.includes("group-invites-manage"));
}

async function validReferences(ctx: Ctx, person: Doc<"clubPeople">, forWork: boolean, providerPermissions?: readonly string[]): Promise<boolean | null> {
  const integration = await ctx.db.get(person.integrationId);
  if (!integration?.communityProfileId) return false;
  try { await scope(ctx, integration.communityProfileId, integration._id, person.epochStartedAt); } catch { return false; }
  // A truncated scan proves neither authority nor absence; the sweeper prunes references independently.
  const refs = await ctx.db.query("clubPeopleReferences").withIndex("by_person_key", q => q.eq("personId", person._id)).take(101);
  for (const ref of refs.slice(0, 100)) {
    if (ref.expiresAt <= Date.now()) continue;
    try {
      const actor = ref.subject ? await resolveClubSubject(ctx.db, integration.communityProfileId, ref.subject) : null;
      const entries = await sourceTargets(ctx, integration, actor, ref.source, Date.now());
      if (entries.some(target => target.userId === person.userId && (!forWork || target.canLookup)) &&
          (providerPermissions === undefined || await providerSourceAccess(ctx, ref.source, providerPermissions))) return true;
    } catch { /* Removed sources and revoked permissions cannot authorize work. */ }
  }
  return refs.length > 100 ? null : false;
}

const worker = { collectorAccountId: v.id("collectorAccounts"), workerId: v.string(), workerKeyHash: v.string() };
type Worker = { collectorAccountId: Id<"collectorAccounts">; workerId: string; workerKeyHash: string };
async function workerAccount(ctx: Ctx, args: Worker) {
  const account = await ctx.db.get(args.collectorAccountId);
  const fleet = await ctx.db.query("collectorFleetSettings").withIndex("by_key", q => q.eq("key", "global")).unique();
  // Cooldown blocks new work, but authenticated in-flight results can extend it.
  if (!account || account.workerKeyHash !== args.workerKeyHash || account.state !== "ready" || account.killSwitchEnabled || fleet?.killSwitchEnabled) return null;
  return { account, fleet };
}
async function workerScope(ctx: Ctx, person: Doc<"clubPeople">, account: Doc<"collectorAccounts">) {
  const integration = await ctx.db.get(person.integrationId);
  if (!integration || integration.assignedCollectorAccountId !== account._id || person.collectorAccountId !== account._id || person.epochStartedAt !== epoch(integration) || (integration.backoffUntil ?? 0) > Date.now()) return false;
  const authority = currentClubAuthority(integration, account, Date.now());
  return authority?.membershipStatus === "member" && await validReferences(ctx, person, true, authority.permissions) === true;
}
export const claim = internalMutation({
  args: { ...worker, limit: v.optional(v.number()) },
  returns: v.object({ jobs: v.array(v.object({ personId: v.id("clubPeople"), userId: v.string(), leaseToken: v.string() })) }),
  handler: async (ctx, args) => {
    if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 10)) throw new Error("Invalid people claim limit.");
    // Live provider acceptance is a release gate, independent of queue admission.
    if (process.env.VRDEX_PEOPLE_RESOLUTION_ENABLED !== "true") return { jobs: [] };
    const authorized = await workerAccount(ctx, args);
    if (!authorized || (authorized.account.cooldownUntil ?? 0) > Date.now()) return { jobs: [] };
    const now = Date.now();
    // A due operational or collection assignment on any group has priority.
    for (const state of ["active", "degraded", "connecting", "disconnecting"] as const) {
      const due = await ctx.db.query("communityVrchatIntegrations").withIndex("by_account_state_nextPollAt", q =>
        q.eq("assignedCollectorAccountId", args.collectorAccountId).eq("state", state).gt("nextPollAt", 0).lte("nextPollAt", now)).take(101);
      if (due.length > 100 || due.some(integration => !integration.killSwitchEnabled && (integration.backoffUntil ?? 0) <= now)) return { jobs: [] };
    }
    const candidates = (await Promise.all([0, 1].map(priority => ctx.db.query("clubPeople").withIndex("by_account_priority_due", q =>
      q.eq("collectorAccountId", args.collectorAccountId).eq("priority", priority).gt("dueAt", 0).lte("dueAt", now)).take(10)))).flat();
    for (const person of candidates) {
      if (person.priority === 0 && person.interestUntil <= now) { await ctx.db.patch(person._id, { priority: 1 }); continue; }
      if (person.lease && person.lease.expiresAt > now) continue;
      const referenceAuthority = await validReferences(ctx, person, true);
      if (referenceAuthority === null) continue;
      if (!referenceAuthority) { await ctx.db.patch(person._id, { dueAt: undefined, lease: undefined }); continue; }
      if (!await workerScope(ctx, person, authorized.account)) {
        const integration = await ctx.db.get(person.integrationId);
        if (integration && integration.assignedCollectorAccountId === authorized.account._id && epoch(integration) === person.epochStartedAt) {
          await ctx.db.patch(integration._id, { nextPollAt: Math.min(integration.nextPollAt ?? now, now) });
          await ctx.db.patch(person._id, { dueAt: now + 60_000, lease: undefined });
        } else await ctx.db.patch(person._id, { dueAt: undefined, lease: undefined });
        continue;
      }
      const [operation, read, lease] = await Promise.all([
        ctx.db.query("clubOperations").withIndex("by_integration_state_readyAt", q => q.eq("integrationId", person.integrationId).eq("state", "pending").lte("readyAt", now)).first(),
        ctx.db.query("clubProviderReadRequests").withIndex("by_integration_state_createdAt", q => q.eq("integrationId", person.integrationId).eq("state", "pending")).first(),
        ctx.db.query("collectorAccountLeases").withIndex("by_integrationId_state", q => q.eq("integrationId", person.integrationId).eq("state", "active")).first(),
      ]);
      if (operation || read || (lease && lease.expiresAt > now)) continue;
      const windowStartedAt = Math.floor(now / 60_000) * 60_000;
      const budgets = [{ scopeKey: "global", limit: authorized.fleet?.globalRequestsPerMinute ?? 30 }, { scopeKey: `account:${args.collectorAccountId}`, limit: authorized.account.requestsPerMinute }, { scopeKey: `people:account:${args.collectorAccountId}`, limit: 2 }];
      const counters = await Promise.all(budgets.map(async budget => ({ ...budget, row: await ctx.db.query("collectorRequestBudgetCounters").withIndex("by_scopeKey", q => q.eq("scopeKey", budget.scopeKey)).unique() })));
      if (counters.some(({ row, limit }) => (row?.windowStartedAt === windowStartedAt ? row.requestCount : 0) >= limit)) return { jobs: [] };
      for (const { scopeKey, row } of counters) {
        const data = { windowStartedAt, requestCount: (row?.windowStartedAt === windowStartedAt ? row.requestCount : 0) + 1, updatedAt: now };
        if (row) await ctx.db.patch(row._id, data); else await ctx.db.insert("collectorRequestBudgetCounters", { scopeKey, ...data });
      }
      const leaseToken = crypto.randomUUID();
      const integration = (await ctx.db.get(person.integrationId))!;
      await ctx.db.patch(person._id, { dueAt: now + 60_000, lease: { token: leaseToken, workerId: args.workerId, workerKeyHash: args.workerKeyHash, credentialGeneration: authorized.account.credentialGeneration, integrationGeneration: integration.leaseGeneration, expiresAt: now + 60_000 } });
      return { jobs: [{ personId: person._id, userId: person.userId, leaseToken }] };
    }
    return { jobs: [] };
  },
});
const leased = { ...worker, personId: v.id("clubPeople"), leaseToken: v.string() };
async function leasedPerson(ctx: Ctx, args: Worker & { personId: Id<"clubPeople">; leaseToken: string }, requireSource = true) {
  const authorized = await workerAccount(ctx, args);
  const person = await ctx.db.get(args.personId);
  if (!authorized || !person?.lease || person.collectorAccountId !== args.collectorAccountId || person.lease.token !== args.leaseToken || person.lease.workerId !== args.workerId || person.lease.workerKeyHash !== args.workerKeyHash || person.lease.credentialGeneration !== authorized.account.credentialGeneration || person.lease.expiresAt <= Date.now() || (requireSource && !await workerScope(ctx, person, authorized.account))) return null;
  if (requireSource && (await ctx.db.get(person.integrationId))?.leaseGeneration !== person.lease.integrationGeneration) return null;
  return person;
}
export const recordResult = internalMutation({
  args: { ...leased, result: v.union(v.object({ status: v.literal("resolved"), userId: v.string(), displayName: v.string() }), v.object({ status: v.literal("unavailable") }), v.object({ status: v.literal("transient"), retryAfterMs: v.optional(v.number()), rateLimited: v.optional(v.boolean()) })) },
  returns: v.object({ accepted: v.boolean(), cooldownRecorded: v.optional(v.boolean()) }),
  handler: async (ctx, args) => {
    const person = await leasedPerson(ctx, args);
    const now = Date.now();
    let cooldownRecorded: boolean | undefined;
    if (args.result.status === "transient" && args.result.rateLimited) {
      const retryAfterMs = args.result.retryAfterMs ?? 60_000;
      if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0 || !Number.isSafeInteger(Math.ceil(now + retryAfterMs))) throw new Error("Invalid retry interval.");
      // An attempted request still throttles its account if its source was revoked in flight.
      const leased = await leasedPerson(ctx, args, false);
      const account = leased && await ctx.db.get(args.collectorAccountId);
      cooldownRecorded = !!account;
      if (account) await ctx.db.patch(account._id, { cooldownUntil: Math.max(account.cooldownUntil ?? 0, now + Math.max(retryAfterMs, 1000)), updatedAt: now });
    }
    if (!person) return { accepted: false, ...(cooldownRecorded !== undefined ? { cooldownRecorded } : {}) };
    if (args.result.status === "resolved") {
      if (normalizeVrchatTargetId(args.result.userId, "vrchat_user") !== person.userId || !validPersonName(args.result.displayName)) return { accepted: false };
      await ctx.db.patch(person._id, { status: "resolved", displayName: args.result.displayName.trim(), observedAt: now, retryAt: now + PEOPLE_DAY_MS, dueAt: undefined, lease: undefined, failures: 0 });
    } else {
      const transient = args.result.status === "transient";
      const retryAfterMs = args.result.status === "transient" ? args.result.retryAfterMs ?? 0 : 0;
      if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) throw new Error("Invalid retry interval.");
      const retryAt = now + (transient ? Math.max(Math.min(60_000 * 2 ** Math.min(person.failures, 10), PEOPLE_DAY_MS), retryAfterMs) : PEOPLE_DAY_MS);
      await ctx.db.patch(person._id, { status: transient ? "retry" : "unavailable", retryAt, dueAt: transient ? retryAt : undefined, lease: undefined, failures: person.failures + 1 });
    }
    return { accepted: true, ...(cooldownRecorded !== undefined ? { cooldownRecorded } : {}) };
  },
});
export const release = internalMutation({
  args: leased,
  returns: v.object({ released: v.boolean() }),
  handler: async (ctx, args) => {
    const person = await leasedPerson(ctx, args);
    if (person) await ctx.db.patch(person._id, { lease: undefined, dueAt: Math.max(Date.now(), person.retryAt) });
    return { released: !!person };
  },
});

export const sweep = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const views = await ctx.db.query("clubPeopleViews").withIndex("by_expiresAt", q => q.lte("expiresAt", now)).take(100);
    for (const view of views) await ctx.db.delete(view._id);
    const refs = await ctx.db.query("clubPeopleReferences").withIndex("by_checkAt", q => q.lte("checkAt", now)).take(50);
    for (const ref of refs) {
      const person = await ctx.db.get(ref.personId);
      const integration = person && await ctx.db.get(person.integrationId);
      let valid = false;
      if (ref.expiresAt > now && integration?.communityProfileId && person) {
        try {
          await scope(ctx, integration.communityProfileId, integration._id, person.epochStartedAt);
          const actor = ref.subject ? await resolveClubSubject(ctx.db, integration.communityProfileId, ref.subject) : null;
          valid = (await sourceTargets(ctx, integration, actor, ref.source, now)).some(target => target.userId === person.userId);
        } catch { /* Expired source or authority. */ }
      }
      if (!valid) await ctx.db.delete(ref._id);
      else await ctx.db.patch(ref._id, { checkAt: Math.min(ref.expiresAt, now + 60 * 60_000) });
    }
    const people = await ctx.db.query("clubPeople").withIndex("by_checkAt", q => q.lte("checkAt", now)).take(10);
    for (const person of people) {
      if (await validReferences(ctx, person, false) === false) await ctx.db.delete(person._id);
      else await ctx.db.patch(person._id, { checkAt: now + 60 * 60_000 });
    }
    if (views.length === 100 || refs.length === 50 || people.length === 10) await ctx.scheduler.runAfter(0, internal.clubPeople.sweep, {});
    return null;
  },
});
