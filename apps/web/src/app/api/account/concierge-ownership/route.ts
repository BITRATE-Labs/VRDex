import { clerkClient } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { ConvexError } from "convex/values";

import { api, internal } from "@convex-generated-api";
import { convexAuthToken } from "@/lib/server/auth";
import { convexAdminHttpClient } from "@/lib/server/convex-http";

export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  const reject = (error: string, status: number) => Response.json({ error }, { headers, status });
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return reject("Request unavailable.", 403);
  }
  const token = await convexAuthToken();
  if (!token) return reject("Sign in to continue.", 401);

  try {
    const raw = await request.text();
    if (raw.length > 4096) return reject("Invalid assignment request.", 400);
    const { slug, email, expectedProfileId, expectedUserId, reason } = JSON.parse(raw) as Record<string, unknown>;
    if (typeof slug !== "string" || typeof email !== "string" || typeof reason !== "string" ||
        typeof expectedProfileId !== "string" || typeof expectedUserId !== "string") {
      return reject("Invalid assignment request.", 400);
    }
    const target = await fetchQuery(api.conciergeOwnership.prepareAssignment, { slug, email }, { token });
    if (target.profileId !== expectedProfileId || target.recipientId !== expectedUserId) {
      return reject("Profile or account changed. Review the assignment again.", 409);
    }

    const recipient = await (await clerkClient()).users.getUser(target.recipientClerkId);
    const primaryEmail = recipient.primaryEmailAddress;
    if (recipient.id !== target.recipientClerkId ||
        primaryEmail?.emailAddress !== target.email ||
        primaryEmail.verification?.status !== "verified") {
      return reject("No unique verified account for that email.", 409);
    }
    const result = await convexAdminHttpClient().mutation(internal.conciergeOwnership.assignProfile, {
      slug, email, reason, expectedProfileId: target.profileId, expectedUserId: target.recipientId,
      operatorId: target.operatorId, actor: target.actor, verifiedClerkId: recipient.id,
    });
    return Response.json(result, { headers });
  } catch (failure) {
    const message = failure instanceof ConvexError && typeof failure.data?.message === "string"
      ? failure.data.message : "Could not complete the assignment.";
    return reject(message, 400);
  }
}
