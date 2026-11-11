import type { PostHog } from "posthog-js";

type RequestClient = Pick<PostHog, "version" | "_send_request">;

export function guardAnalyticsRequests(client: RequestClient, isCurrent: () => boolean): boolean {
  // shortcut: this exported SDK hook is internal; revalidate it with browser regressions on any SDK upgrade.
  if (client.version !== "1.376.2" || typeof client._send_request !== "function") return false;
  const send = client._send_request.bind(client);
  client._send_request = (request) => {
    if (isCurrent()) send(request);
  };
  return true;
}
