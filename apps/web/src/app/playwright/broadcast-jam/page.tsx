import { notFound } from "next/navigation";
import { BroadcastJam } from "./preview";
export default async function Page({ searchParams }: { searchParams: Promise<{ tools?: string }> }) {
  if (process.env.VRDEX_ENABLE_PLAYWRIGHT_FIXTURES !== "true") notFound();
  const params = await searchParams;
  return <BroadcastJam showTools={params.tools === "1"} />;
}
