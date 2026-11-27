import type { ReactNode } from "react";

import { Notice } from "@/components/ui/notice";
import { PageContainer, PageShell } from "@/components/ui/page-shell";
import { AUTH_UNAVAILABLE_COPY } from "@/lib/auth-copy";
import { cn } from "@/lib/cn";

/**
 * Shared chrome for the sign-in and sign-up routes. Both mount a Clerk component
 * on an optional catch-all segment, because Clerk's path routing advances through
 * nested URLs — a verification step lands on something like
 * `/sign-in/factor-one`, which would 404 on a single static page.
 */
export function AuthPageShell({
  children,
  compact,
  condensed,
  headingId,
  integrated,
  subtitle,
  title,
  visuallyHiddenTitle,
}: {
  children: ReactNode;
  compact?: boolean;
  condensed?: boolean;
  headingId: string;
  integrated?: boolean;
  subtitle?: string;
  title: string;
  visuallyHiddenTitle?: boolean;
}) {
  return (
    <PageShell className={cn("flex py-6 sm:py-8", condensed && "max-sm:py-3")}>
      <PageContainer className="gap-0" max="4xl">

        <div
          className={compact
            ? "flex flex-1 items-start justify-center py-4 sm:items-center sm:py-14"
            : "flex flex-1 items-center justify-center py-10 sm:py-14"}
        >
          <section
            aria-labelledby={headingId}
            className={cn(
              "w-full max-w-md",
              integrated && "max-w-[25rem] rounded-panel border border-border bg-surface-strong",
            )}
          >
            <header className={cn(
              integrated ? "border-b border-border px-5 py-4 sm:px-7" : "text-center",
              condensed && "max-sm:px-4 max-sm:py-2.5",
            )}>
              <h1
                id={headingId}
                className={cn(
                  "text-3xl font-semibold sm:text-4xl",
                  integrated && "text-2xl sm:text-3xl",
                  visuallyHiddenTitle && "sr-only",
                )}
              >
                {title}
              </h1>
              {subtitle && (
                <p className={cn(
                  "text-sm leading-6 text-muted",
                  !visuallyHiddenTitle && "mt-2",
                  integrated && "[overflow-wrap:anywhere]",
                  condensed && "max-sm:mt-1",
                )}>
                  {subtitle}
                </p>
              )}
            </header>

            <div className={cn("flex justify-center", !integrated && "mt-6")}>{children}</div>
          </section>
        </div>
      </PageContainer>
    </PageShell>
  );
}

/** Shown when this environment has no auth credentials. See `AUTH_UNAVAILABLE_COPY`. */
export function AuthUnavailableNotice() {
  return (
    <Notice className="py-5 leading-7" variant="dashed">
      {AUTH_UNAVAILABLE_COPY}
    </Notice>
  );
}
