import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./_identity";
import { ANALYTICS_POLICY_VERSION, analyticsChoice, analyticsPreference } from "./_analyticsPreference";

export const set = mutation({
  args: {
    choice: analyticsChoice,
    policyVersion: v.string(),
    browserRestriction: v.optional(analyticsChoice),
  },
  returns: v.object({ preference: analyticsPreference, analyticsId: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    if (args.policyVersion !== ANALYTICS_POLICY_VERSION) {
      throw new ConvexError({ code: "ANALYTICS_POLICY_CHANGED" });
    }
    const previous = user.analyticsPreference;
    // Withdrawal is immediate; throttle only rapid re-enablement so deletion targets cannot be spammed.
    if (args.choice === "on" && previous?.choice === "off" && Date.now() - previous.changedAt < 60_000) {
      throw new ConvexError({ code: "ANALYTICS_RETRY_LATER" });
    }
    const preference = {
      choice: args.choice,
      changedAt: previous?.choice === args.choice ? previous.changedAt : Date.now(),
      policyVersion: ANALYTICS_POLICY_VERSION,
      source: "account" as const,
      revision: (previous?.revision ?? 0) + (previous?.choice === args.choice ? 0 : 1),
    };
    const analyticsId = args.choice === "on" && previous?.choice === "off"
      ? crypto.randomUUID()
      : user.analyticsId ?? (args.choice === "on" ? crypto.randomUUID() : undefined);
    await ctx.db.patch(user._id, {
      analyticsPreference: preference,
      analyticsId,
    });
    if (args.choice === "off" && analyticsId) {
      const existing = await ctx.db.query("analyticsDeletionRequests")
        .withIndex("by_analyticsId", (q) => q.eq("analyticsId", analyticsId)).unique();
      if (!existing) await ctx.db.insert("analyticsDeletionRequests", {
        ownerUserId: user._id, analyticsId, requestedAt: Date.now(),
        // The worker admits requests only when server management authorization is configured.
        state: "blocked_authorization",
      });
    }
    return {
      preference,
      analyticsId: args.choice === "on" && args.browserRestriction !== "off" ? analyticsId : undefined,
    };
  },
});
