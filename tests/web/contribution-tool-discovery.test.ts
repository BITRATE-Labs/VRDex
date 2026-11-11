import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("discovers standing capacity without exposing removed allowance request tools", () => {
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { createVrdexMcpHandler } from "./apps/web/src/lib/server/vrdex-mcp.ts";
    const handler = createVrdexMcpHandler({});
    try {
      const response = await handler.fetch(new Request("https://app.example.test/mcp", {
        method: "POST", headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }));
      const body = await response.text();
      assert.equal(response.status, 200, body);
      assert.ok(body.includes('"name":"vrdex_contribution_capacity"'), body);
      assert.ok(!body.includes('"name":"vrdex_contribution_capacity_request"'));
      assert.ok(!body.includes('"name":"vrdex_contribution_capacity_requests"'));
    } finally { await handler.close(); }
  `], { cwd: process.cwd(), env: { ...process.env, TSX_TSCONFIG_PATH: "apps/web/tsconfig.json" }, stdio: "pipe" });
});
