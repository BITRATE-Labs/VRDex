import Link from "next/link";
import { notFound } from "next/navigation";
import { ANALYTICS_FOUNDATION_ENABLED } from "@/lib/analytics-preference";
import { PageContainer, PageShell } from "@/components/ui/page-shell";

export default function PrivacyPolicyPage() {
  if (!ANALYTICS_FOUNDATION_ENABLED) notFound();
  return <PageShell className="py-10"><PageContainer max="4xl">

    <article className="max-w-2xl space-y-6 text-sm leading-relaxed" data-ph-no-capture>
      <h1 className="text-3xl font-semibold">Privacy policy</h1>
      <p>Last updated: November 10, 2026.</p>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Analytics choices</h2>
        <p>Before you choose, Limited analytics counts selected page views and interactions without a persistent visitor identifier, account link or session replay. Off stops optional analytics. On allows usage analytics and masked session replay through PostHog.</p>
        <p>With analytics On, visits and interactions can be linked across visits and, when signed in, to your VRDex account through a random analytics identifier. We do not use your email, display name or connected account identifiers as your analytics identifier.</p>
        <p>Usage events include navigation, clicks, searches, lookups, authentication, claims and time parsing. We use these events to understand product use and diagnose problems. Search text and private form values are excluded from our product events.</p>
      </section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Session replay</h2>
        <p>When enabled, replay records page activity such as navigation, clicks and scrolling. Form inputs are masked, and marked private areas are blocked. Recordings are kept for 30 days. Console content, network request bodies and canvas recording are disabled.</p>
      </section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Changing your choice</h2>
        <p>Open Usage &amp; privacy in the footer or Account Privacy to change your choice. A browser Off choice takes precedence over an account On choice. Turning analytics Off stops new optional collection and requests deletion of retained analytics associated with your account identifier.</p>
        <p>Usage events remain until deletion or their configured retention period expires. Analytics choices do not remove records needed to operate your account, manage profiles and events, process payments or protect the service.</p>
      </section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Privacy requests</h2>
        <p>For access, correction, deletion or other privacy requests, <Link href="/support?topic=owner_opt_out" className="underline underline-offset-4">contact VRDex</Link>.</p>
      </section>
    </article>
  </PageContainer></PageShell>;
}
