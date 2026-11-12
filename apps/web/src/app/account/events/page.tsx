import { ManagedEventsPanel } from "./managed-events-panel";
import { PageContainer, PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default function ManagedEventsPage() {
  return (
    <PageShell className="py-10">
      <PageContainer max="5xl">

        <ManagedEventsPanel />
      </PageContainer>
    </PageShell>
  );
}
