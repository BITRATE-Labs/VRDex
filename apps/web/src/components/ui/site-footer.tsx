import Link from "next/link";
import { AnalyticsSettingsButton } from "@/app/_components/analytics-preferences";

/**
 * The only global surface that links anything but the nav's three utilities.
 *
 * Both support routes below were unreachable before this existed. `/developers`
 * was linked from nowhere outside `/developers`, and the request form was linked
 * from nowhere at all, which is how a structured intake for opt-out and
 * pre-claim safety review sat unused behind a URL nobody could find. A support
 * page nobody can reach is not a support page, so the entry point ships with it.
 *
 * Four links, deliberately. This is a way out of a dead end, not a sitemap, and
 * everything else here is already reachable from discovery or the nav. The repo
 * link is here on the same grounds: the project is open source under MIT, and
 * the code is unreachable from anywhere else on the site.
 */
const FOOTER_LINK_CLASS = "text-muted underline-offset-4 transition hover:text-foreground hover:underline";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border px-4 py-8 text-sm sm:px-10 lg:px-16">
      <nav
        aria-label="Site"
        className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6"
      >
        <span className="font-mono text-xs uppercase text-muted">VRDex</span>
        <AnalyticsSettingsButton />
        <Link className={FOOTER_LINK_CLASS} href="/support">Contact</Link>
        <Link className={FOOTER_LINK_CLASS} href="/support?topic=owner_opt_out">Privacy request</Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:contents">
          <Link className={FOOTER_LINK_CLASS} href="/developers/api">Developers</Link>
          <a className={FOOTER_LINK_CLASS} href="https://github.com/BASIC-BIT/VRDex" rel="noreferrer" target="_blank">GitHub</a>
        </div>
      </nav>
    </footer>
  );
}
