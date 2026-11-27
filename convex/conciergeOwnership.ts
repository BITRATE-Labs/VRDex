import { ConvexError, v } from "convex/values";

import { getAccountFeatureAccess } from "./_accountFeatures";
import { requireVerifiedActiveBrowserSession } from "./_claimSession";
import type { DatabaseReader } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { getActiveProfileOwner, grantProfileOwner } from "./_profileOwnership";
import { canReadProfile } from "./_profilePermissions";
import { getProfileBySlug } from "./_profileSlugs";
import { createProfileSearchDocument, upsertSearchDocument } from "./_searchDocuments";

function assignmentError(message: string) {
  return new ConvexError({ code: "CONCIERGE_ASSIGNMENT", message });
}

async function requireAssignmentAuthority(ctx: Parameters<typeof requireVerifiedActiveBrowserSession>[0]) {
  const session = await requireVerifiedActiveBrowserSession(ctx);
  if (!(await getAccountFeatureAccess(ctx.db, session.user._id)).superAdmin) {
    throw assignmentError("Super admin access required.");
  }
  return session;
}

async function resolveAssignment(db: DatabaseReader, slug: string, email: string) {
  const profile = slug.trim().length <= 80 ? await getProfileBySlug(db, slug.trim()) : null;
  if (!profile || !canReadProfile("public", profile)) {
    throw assignmentError("Published profile required.");
  }
  if (profile.claimState !== "unclaimed" || await getActiveProfileOwner(db, profile._id)) {
    throw assignmentError("Profile already claimed.");
  }

  const exactEmail = email.trim();
  const users = exactEmail && exactEmail.length <= 320
    ? await db.query("users").withIndex("email", q => q.eq("email", exactEmail)).take(2)
    : [];
  const recipient = users[0];
  if (users.length !== 1 || !recipient?.clerkUserId || !recipient.emailVerificationTime) {
    throw assignmentError("No unique verified account for that email.");
  }
  return { profile, recipient, exactEmail };
}

const assignmentLookup = { slug: v.string(), email: v.string() };

export const previewAssignment = query({
  args: assignmentLookup,
  handler: async (ctx, args) => {
    await requireAssignmentAuthority(ctx);
    const { profile, recipient, exactEmail } = await resolveAssignment(ctx.db, args.slug, args.email);
    return {
      profileId: profile._id,
      profileName: profile.displayName,
      slug: profile.slug,
      userId: recipient._id,
      recipientName: recipient.name ?? null,
      email: exactEmail,
    };
  },
});

export const prepareAssignment = query({
  args: assignmentLookup,
  handler: async (ctx, args) => {
    const { userId, subject } = await requireAssignmentAuthority(ctx);
    const { profile, recipient, exactEmail } = await resolveAssignment(ctx.db, args.slug, args.email);
    return {
      operatorId: userId, actor: subject, profileId: profile._id,
      recipientId: recipient._id, recipientClerkId: recipient.clerkUserId, email: exactEmail,
    };
  },
});

export const assignProfile = internalMutation({
  args: {
    ...assignmentLookup,
    expectedProfileId: v.id("profiles"),
    expectedUserId: v.id("users"),
    verifiedClerkId: v.string(),
    operatorId: v.id("users"),
    actor: v.object({
      issuer: v.string(), subject: v.string(), tokenIdentifier: v.string(), displayName: v.optional(v.string()),
    }),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    if (operator?.clerkUserId !== args.actor.subject ||
        !(await getAccountFeatureAccess(ctx.db, args.operatorId)).superAdmin) {
      throw assignmentError("Super admin access required.");
    }
    const reason = args.reason.trim();
    if (reason.length < 10 || reason.length > 500) {
      throw assignmentError("Enter a reason between 10 and 500 characters.");
    }
    const { profile, recipient } = await resolveAssignment(ctx.db, args.slug, args.email);
    if (profile._id !== args.expectedProfileId || recipient._id !== args.expectedUserId || recipient.clerkUserId !== args.verifiedClerkId) {
      throw assignmentError("Profile or account changed. Review the assignment again.");
    }

    const now = Date.now();
    await grantProfileOwner(ctx.db, { profileId: profile._id, userId: recipient._id, now });
    await ctx.db.patch(profile._id, { claimState: "claimed_unverified", claimedAt: now, updatedAt: now });
    await upsertSearchDocument(ctx.db, createProfileSearchDocument({
      ...profile, claimState: "claimed_unverified", claimedAt: now, updatedAt: now,
    }));
    await ctx.db.insert("profileAuditEvents", {
      profileId: profile._id,
      actor: args.actor,
      targetUserId: recipient._id,
      action: "profile_owner_assigned_by_super_admin",
      sourceType: "moderator",
      note: reason,
      createdAt: now,
    });
    return { slug: profile.slug };
  },
});
