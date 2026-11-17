import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex-generated-api";

import { NativeTrialOpenSchema } from "@vrdex/media-relay";
import { convexAuthToken } from "@/lib/server/auth";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
async function client() {
  const token = await convexAuthToken(), url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!token || !url) return null;
  const value = new ConvexHttpClient(url); value.setAuth(token); return value;
}
export async function GET() {
  const value = await client();
  return Response.json(value ? await value.query(api.mediaRelayPlayback.getNativeTrialConfiguration, {}) : null, { headers });
}
/** Signed viewer admission only. Deployment activation remains an internal operation. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || Number(request.headers.get("content-length") ?? 0) > 2048)
    return new Response(null, { status: 403, headers });
  const value = await client();
  if (!value) return new Response(null, { status: 401, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 2048) throw Error(); chunks.push(item.value); } }
    finally { await reader.cancel(); }
    const input = NativeTrialOpenSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const trial = await value.query(api.mediaRelayPlayback.getNativeTrialConfiguration, {});
    if (!trial || trial.trialId !== input.trialId) return new Response(null, { status: 403, headers });
    const args = { context: input.context, streamId: input.streamId, preferredMode: input.preferredMode };
    return Response.json(await value.mutation(api.mediaRelayPlayback.openPlayback, args), { headers });
  } catch { return new Response(null, { status: 400, headers }); }
}
