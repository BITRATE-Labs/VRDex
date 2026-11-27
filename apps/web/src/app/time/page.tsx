import { PageContainer, PageShell } from "@/components/ui/page-shell";

import { TemporalParser } from "./temporal-parser";

export default function TimePage() {
  return (
    <PageShell tone="public">
      <PageContainer max="4xl">
        <TemporalParser>
          <header className="py-5 sm:py-8">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl" id="time-heading">VRDex Time</h1>
            <p className="mt-3 max-w-2xl text-base leading-6 text-foreground">
              Turn phrases like <strong className="font-semibold">“next Friday at 8”</strong> into an exact time or range.
            </p>
          </header>
        </TemporalParser>
      </PageContainer>
    </PageShell>
  );
}
