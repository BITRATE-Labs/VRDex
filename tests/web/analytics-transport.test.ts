import assert from "node:assert/strict";
import { it } from "node:test";
import type { PostHog } from "posthog-js";
import { guardAnalyticsRequests } from "../../apps/web/src/lib/analytics-transport";

it("preserves large fetch payloads and suppresses retired session requests", () => {
  type Request = Parameters<PostHog["_send_request"]>[0];
  const sent: Request[] = [];
  let current = true;
  const client = {
    version: "1.376.2",
    _send_request: (request: Request) => { sent.push(request); },
  };
  assert.equal(guardAnalyticsRequests(client, () => current), true);
  const data = { event: "$snapshot", properties: { $snapshot_data: "x".repeat(100_000) } };
  client._send_request({ url: "/ingest/s/", data, transport: "fetch" });
  assert.equal(sent[0].data, data);
  assert.equal(sent[0].transport, "fetch");
  current = false;
  client._send_request({ url: "/ingest/s/", data });
  assert.equal(sent.length, 1);
});

it("fails closed when an SDK upgrade has not revalidated the internal adapter", () => {
  const client = { version: "new-version", _send_request: () => {} };
  assert.equal(guardAnalyticsRequests(client, () => true), false);
});
