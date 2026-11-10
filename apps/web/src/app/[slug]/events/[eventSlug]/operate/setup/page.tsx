import { fetchQuery } from "convex/nextjs";
import { notFound, redirect } from "next/navigation";
import { api } from "@convex-generated-api";
import { convexAuthToken, signInPath } from "@/lib/server/auth";
import { EventBroadcastSetup } from "../../../../../_components/event-broadcast-setup";
export const dynamic = "force-dynamic";
export default async function BroadcastSetupPage({params}:{params:Promise<{slug:string;eventSlug:string}>}) {
  const {slug,eventSlug} = await params;
  const path = `/${slug}/events/${eventSlug}`;
  const token = await convexAuthToken();
  if (!token) redirect(signInPath(`${path}/operate/setup`));
  let status;
  try {status=await fetchQuery(api.events.getEventMediaControlStatus,{currentSlug:eventSlug},{token});}catch{notFound();}
  if (status.eventPath!==path || !status.canControl) notFound();
  return <EventBroadcastSetup currentSlug={eventSlug} eventPath={path} eventTitle={status.eventTitle}/>;
}
