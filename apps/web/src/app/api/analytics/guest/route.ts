import { z } from "@vrdex/api-contracts";
import { internal } from "@convex-generated-api";
import { optionalConvexAdminHttpClient } from "@/lib/server/convex-http";
import { apiRateLimitResponseHeaders, checkApiRateLimit, clientIpForRequest } from "@/lib/server/api-rate-limit";

const command = z.union([
  z.strictObject({ action: z.literal("start") }),
  z.strictObject({ action: z.literal("withdraw"), receipt: z.string().regex(/^[a-f0-9]{64}$/) }),
]);
const headers = { "cache-control": "private, no-store" };
const problem = (status: number) => Response.json({ status }, { status, headers });

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED !== "true") return problem(404);
  if (request.headers.get("origin") !== new URL(request.url).origin) return problem(403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return problem(415);
  try {
    const reader = request.body?.getReader();
    if (!reader) return problem(400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 512) { await reader.cancel(); return problem(413); }
      chunks.push(value);
    }
    let input: z.infer<typeof command>;
    try { input = command.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
    catch { return problem(400); }
    const limit = await checkApiRateLimit({ routeClass: input.action === "start" ? "analytics_guest_start" : "public_write", identity: { kind: "ip", value: clientIpForRequest(request) } });
    if (!limit.allowed) return Response.json({ status: 429 }, { status: 429, headers: { ...headers, ...apiRateLimitResponseHeaders(limit) } });
    const client = optionalConvexAdminHttpClient();
    if (!client) return problem(503);
    if (input.action === "start") return Response.json(await client.mutation(internal.analyticsGuest.start, {}), { headers });
    const recognized = await client.mutation(internal.analyticsGuest.withdraw, { receipt: input.receipt });
    return recognized ? Response.json({ accepted: true }, { headers }) : problem(409);
  } catch { return problem(503); }
}
