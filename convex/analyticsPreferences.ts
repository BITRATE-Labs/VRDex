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
    const preference = {
      choice: args.choice,
      changedAt: previous?.choice === args.choice ? previous.changedAt : Date.now(),
      policyVersion: ANALYTICS_POLICY_VERSION,
      source: "account" as const,
      revision: (previous?.revision ?? 0) + (previous?.choice === args.choice ? 0 : 1),
    };
    const analyticsId = user.analyticsId ?? (args.choice === "on" ? crypto.randomUUID() : undefined);
    await ctx.db.patch(user._id, {
      analyticsPreference: preference,
      analyticsId,
    });
    return {
      preference,
      analyticsId: args.choice === "on" && args.browserRestriction !== "off" ? analyticsId : undefined,
    };
  },
});
