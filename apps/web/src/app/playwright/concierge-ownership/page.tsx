import { notFound } from "next/navigation";
import { ConciergeOwnershipPreview } from "./preview";

export default function ConciergeOwnershipFixturePage() {
  if (process.env.VRDEX_ENABLE_PLAYWRIGHT_FIXTURES !== "true") notFound();
  return <ConciergeOwnershipPreview />;
}
