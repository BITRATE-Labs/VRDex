import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EventIntakeForm } from "../event-intake-form";
import { PageContainer, PageActions, PageShell } from "@/components/ui/page-shell";
export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ draft?: string; community?: string }> }) {
  const params = await searchParams;
  return <PageShell className="py-10"><PageContainer max="6xl"><PageActions><Link className={buttonVariants({ variant: "secondary" })} href="/account/events">My events</Link></PageActions><EventIntakeForm heading={<h1 className="text-3xl font-semibold">Add event</h1>} draftId={params.draft} initialCommunitySlug={params.community} /></PageContainer></PageShell>;
}
