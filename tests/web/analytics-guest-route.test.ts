import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("guest consent route rejects cross-origin and oversized requests, bounds attempts, and keeps receipts out of error responses", () => {
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { POST } from "./apps/web/src/app/api/analytics/guest/route.ts";
    let calls = 0;
    let fail = false;
    let recognized = true;
    globalThis.fetch = async (_url, init) => {
      calls++;
      if (fail) throw new Error("private-receipt-value");
      const body = JSON.parse(init.body);
      const value = body.path === "analyticsGuest:start" ? { analyticsId: "guest-uuid", receipt: "a".repeat(64) } : recognized;
      return new Response(JSON.stringify({ status: "success", value }), { headers: { "content-type": "application/json" } });
    };
    const url = "https://app.example.test/api/analytics/guest";
    const request = (body, origin = "https://app.example.test") => new Request(url, {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal((await POST(request({ action: "start" }, "https://attacker.test"))).status, 403);
    assert.equal((await POST(request({ action: "start", extra: "x".repeat(5000) }))).status, 413);
    assert.equal((await POST(request({ action: "withdraw", receipt: "known-analytics-id" }))).status, 400);
    assert.equal(calls, 0);
    // Next may reconstruct its internal URL with localhost instead of the browser-facing host.
    const proxied = (origin) => new Request("http://localhost:3033/api/analytics/guest", {
      method: "POST", headers: { host: "127.0.0.1:3033", origin, "content-type": "application/json" }, body: JSON.stringify({ action: "probe" }),
    });
    assert.equal((await POST(proxied("http://127.0.0.1:3033"))).status, 400);
    assert.equal((await POST(proxied("http://localhost:3033"))).status, 403);
    assert.equal((await POST(proxied("https://127.0.0.1:3033"))).status, 403);
    const started = await POST(request({ action: "start" }));
    assert.equal(started.status, 200);
    assert.match(started.headers.get("cache-control"), /no-store/);
    assert.deepEqual(await started.json(), { analyticsId: "guest-uuid", receipt: "a".repeat(64) });
    assert.equal((await POST(request({ action: "withdraw", receipt: "a".repeat(64) }))).status, 200);
    recognized = false;
    assert.equal((await POST(request({ action: "withdraw", receipt: "b".repeat(64) }))).status, 409);
    recognized = true;
    fail = true;
    const failure = await POST(request({ action: "start" }));
    assert.equal(failure.status, 503);
    assert.doesNotMatch(await failure.text(), /private-receipt/);
    fail = false;
    for (let i = 0; i < 30; i++) await POST(request({ action: "start" }));
    const before = calls;
    const limited = await POST(request({ action: "start" }));
    assert.equal(limited.status, 429);
    assert.equal(calls, before);
    assert.ok(calls <= 30, "guest consent uses the existing public write limit");
  `], { cwd: process.cwd(), env: { ...process.env, TSX_TSCONFIG_PATH: "apps/web/tsconfig.json", CONVEX_URL: "http://127.0.0.1:3230", CONVEX_ADMIN_TOKEN: "synthetic-admin-test", VRDEX_RATE_LIMIT_STORE: "memory", NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED: "true", NODE_ENV: "test" }, stdio: "pipe" });
});
