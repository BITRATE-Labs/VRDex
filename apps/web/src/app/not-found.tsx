import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { PageActions, PageShell } from "@/components/ui/page-shell";

export default function NotFound() {
  return (
    <PageShell className="grid place-items-center">
      <div className="flex flex-col items-center gap-5 text-center">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">404</h1>
        <p className="text-base text-muted sm:text-lg">This page could not be found.</p>
        <PageActions className="justify-center">
          <Link className={buttonVariants({ size: "lg", variant: "primary" })} href="/search">
            Search
          </Link>
          <Link className={buttonVariants({ size: "lg", variant: "secondary" })} href="/discovery">
            Discovery
          </Link>
        </PageActions>
      </div>
    </PageShell>
  );
}
