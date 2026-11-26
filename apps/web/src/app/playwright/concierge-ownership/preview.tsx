"use client";

import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { ConciergeOwnershipPanel } from "@/app/account/concierge-ownership-panel";
import { PageContainer, PageShell } from "@/components/ui/page-shell";

const client = {
  async query() {
    return {
      profileId: "fixture-profile",
      profileName: "Afterglow",
      slug: "afterglow",
      userId: "fixture-recipient",
      recipientName: "Test Organizer",
      email: "organizer@example.com",
    };
  },
  async mutation(_function: unknown, args: { expectedProfileId: string; expectedUserId: string; reason: string }) {
    if (args.expectedProfileId !== "fixture-profile" || args.expectedUserId !== "fixture-recipient" || !args.reason) {
      throw new Error("Assignment requires the reviewed profile, account and reason");
    }
    return { slug: "afterglow" };
  },
  logger: { warn() {} },
} as unknown as ConvexReactClient;

export function ConciergeOwnershipPreview() {
  return (
    <PageShell className="py-10">
      <PageContainer max="5xl">
        <ConvexProvider client={client}>
          <ConciergeOwnershipPanel />
        </ConvexProvider>
      </PageContainer>
    </PageShell>
  );
}
