import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

async function hash(receipt: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(receipt))), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const start = internalMutation({
  args: {}, returns: v.object({ analyticsId: v.string(), receipt: v.string() }),
  handler: async (ctx) => {
    const analyticsId = crypto.randomUUID();
    const receipt = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await ctx.db.insert("analyticsGuestReceipts", { analyticsId, receiptHash: await hash(receipt), createdAt: Date.now() });
    return { analyticsId, receipt };
  },
});

export const withdraw = internalMutation({
  args: { receipt: v.string() }, returns: v.boolean(),
  handler: async (ctx, { receipt }) => {
    if (!/^[a-f0-9]{64}$/.test(receipt)) return false;
    const receiptHash = await hash(receipt);
    const guest = await ctx.db.query("analyticsGuestReceipts").withIndex("by_receiptHash", (q) => q.eq("receiptHash", receiptHash)).unique();
    if (!guest) return false;
    if (guest.withdrawnAt !== undefined) return true;
    if (!guest.analyticsId) return false;
    await ctx.db.insert("analyticsDeletionRequests", { analyticsId: guest.analyticsId, requestedAt: Date.now(), state: "pending" });
    await ctx.db.patch(guest._id, { withdrawnAt: Date.now() });
    return true;
  },
});
