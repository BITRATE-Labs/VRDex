import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { hostedTargetRunsCurrentRevision } from "../../apps/web/e2e/clerk-auth";

const { request } = createRequire(new URL("../../apps/web/package.json", import.meta.url))("@playwright/test");

test("candidate auth uses the full dedicated head even when GITHUB_SHA names the merge commit", async t => {
  const previous = { base: process.env.PLAYWRIGHT_BASE_URL, candidate: process.env.CANDIDATE_HEAD_SHA, github: process.env.GITHUB_SHA };
  let commit: string | undefined = "a".repeat(40);
  let status = 200;
  const server = createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ commit }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.PLAYWRIGHT_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.CANDIDATE_HEAD_SHA = "a".repeat(40);
  process.env.GITHUB_SHA = "b".repeat(40);
  const client = await request.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  t.after(async () => {
    await client.dispose();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const [key, value] of Object.entries({ PLAYWRIGHT_BASE_URL: previous.base, CANDIDATE_HEAD_SHA: previous.candidate, GITHUB_SHA: previous.github })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  assert.equal(await hostedTargetRunsCurrentRevision(client), true);
  commit = "a".repeat(7) + "c".repeat(33);
  assert.equal(await hostedTargetRunsCurrentRevision(client), false, "Matching short prefixes do not establish candidate identity");
  commit = undefined;
  assert.equal(await hostedTargetRunsCurrentRevision(client), false);
  status = 404;
  assert.equal(await hostedTargetRunsCurrentRevision(client), false);
});
