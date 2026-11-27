import { notFound } from "next/navigation";
import { EventOperatorFixture } from "./preview";
export default async function Page({ searchParams }: { searchParams: Promise<{ legacySettings?: string; lineupAssignment?: string }> }) {
  if (process.env.VRDEX_ENABLE_PLAYWRIGHT_FIXTURES !== "true") notFound();
  const params = await searchParams;
  return <EventOperatorFixture legacySettings={params.legacySettings === "1"} lineupAssignment={params.lineupAssignment === "1"} />;
}
