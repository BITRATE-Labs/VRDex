import { Suspense } from "react";

import { SupportRequestForm } from "./support-request-form";
import { Card } from "@/components/ui/card";
import { PageContainer, PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact VRDex",
  description: "Report an ownership dispute, transfer or recover a profile, or send feedback.",
};

export default function SupportPage() {
  return (
    <PageShell>
      <PageContainer max="3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Contact VRDex</h1>

        <Card>
          {/* `useSearchParams` reads the `?topic=` deep link the claim page and
              the footer send people through, and the App Router requires a
              boundary around any client component that calls it. */}
          <Suspense>
            <SupportRequestForm />
          </Suspense>
        </Card>
      </PageContainer>
    </PageShell>
  );
}
