import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { eventOutputSecretsClient } from "../../../../lib/server/event-output-secret-store";
import { convexAuthToken } from "../../../../lib/server/auth";
import { provisionConnection } from "../../../../../../../scripts/event-output-secret-broker.mjs";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Request unavailable." }, { status: 403, headers });
  const token = await convexAuthToken(); if (!token) return Response.json({ error: "Sign in to continue." }, { status: 401, headers });
  if (Number(request.headers.get("content-length") ?? 0) > 16384) return Response.json({ error: "Invalid connection request." }, { status: 400, headers });
  try {
    const body = await request.text(); if (body.length > 16384) throw Error();
    const input = JSON.parse(body);
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!); client.setAuth(token);
    const prepare = makeFunctionReference<"mutation">("eventBroadcastConnections:prepareConnection");
    const commit = makeFunctionReference<"mutation">("eventBroadcastConnections:commitConnection");
    const abandon = makeFunctionReference<"mutation">("eventBroadcastConnections:abandonConnection");
    const result = await provisionConnection({ input, brokerToken: process.env.VRDEX_EVENT_OUTPUT_BROKER_TOKEN, secrets: eventOutputSecretsClient(), abandon: (args: Record<string, unknown>) => client.mutation(abandon, args), prepare: (args: Record<string, unknown>) => client.mutation(prepare, args), commit: (args: Record<string, unknown>) => client.mutation(commit, args) });
    return Response.json(result, { headers });
  } catch (error) {
    const knownErrors=["Enter a valid stream server URL.","Enter a valid RTMP or RTMPS server URL.","Enter a VRCDN ingest server URL.","Enter a Twitch ingest server URL.","Enter a valid playback URL.","Enter an HTTPS playback URL.","Enter a stream key for this connection.","Enter a valid stream key.","Connection changed. Reload and try again.","An event media worker session is already active for this event."];
    const message=error instanceof Error?error.message:"";
    const detail=knownErrors.find(candidate=>message.includes(candidate))??"Could not save the connection. Check the server and key, then try again.";
    return Response.json({error:detail,...(message.includes("Connection request expired.") ? {retryWithNewRequest:true} : {})},{status:400,headers});
  }
}
