import { MediaReviewPanel } from "./media-review-panel";
import { PageContainer, PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default function MediaReviewPage() {
  return (
    <PageShell className="py-10">
      <PageContainer max="5xl">

        <MediaReviewPanel />
      </PageContainer>
    </PageShell>
  );
}
