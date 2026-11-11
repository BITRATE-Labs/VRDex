import { NextResponse } from "next/server";
import { fetchPublicProfileBySlug } from "@/convex/server";
import { previewVideoLink } from "../video-link";

export async function GET(request: Request) {
  if (process.env.VRDEX_ENABLE_PLAYWRIGHT_FIXTURES !== "true") return new Response(null, {status:404});
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64) return new Response(null, {status:400});
  const result = await fetchPublicProfileBySlug(slug, "person", {includeLiveState:false});
  if (result.kind !== "live") return new Response(null, {status:503});
  const links = result.profile?.outboundLinks.flatMap(link => {
    try { return [previewVideoLink(link.url)]; } catch { return []; }
  }) ?? [];
  return NextResponse.json({links:[...new Map(links.map(link => [link.key, link])).values()]}, {headers:{"Cache-Control":"private, no-store"}});
}
