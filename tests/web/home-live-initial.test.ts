import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function reader(fetchQuery: () => Promise<unknown>) {
  const dependencies: Record<string, unknown> = {
    "convex/nextjs": { fetchQuery }, "react": { cache: (value: unknown) => value },
    "@/lib/server/auth": {}, "@convex-generated-api": { api: { eventLive: { listPublic: "live" } } },
    "@/lib/server/public-search-query": {}, "@/lib/server/twitch-live": {},
    "@/lib/server/vrcdn-live": {}, "./playwright-fixtures": {}, "@/lib/profile-claim": {},
  };
  const exports: { fetchPublicLiveEvents?: () => Promise<unknown[]> } = {};
  const code = ts.transpileModule(readFileSync("apps/web/src/convex/server.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, setTimeout, clearTimeout,
    process: { env: { NEXT_PUBLIC_CONVEX_URL: "https://synthetic.convex.cloud" } },
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  assert.ok(exports.fetchPublicLiveEvents);
  return exports.fetchPublicLiveEvents;
}

test("homepage live snapshot gives up promptly when the backend does not respond", async () => {
  let requests = 0;
  const read = reader(() => { requests++; return new Promise(() => {}); });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    read(), new Promise<string>(resolve => { deadline = setTimeout(() => resolve("deadline exceeded"), 1500); }),
  ]).finally(() => clearTimeout(deadline));
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
  assert.equal(requests, 1);
});

test("homepage live snapshot preserves fresh data and treats backend errors as empty", async () => {
  const fresh = { expiresAt: Date.now() + 90_000 };
  const result = await reader(async () => ({ entries: [fresh, { expiresAt: Date.now() - 1 }], complete: true }))();
  assert.equal(result.length, 1);
  assert.equal(result[0], fresh);
  const failed = await reader(async () => { throw Error("Unavailable"); })();
  assert.equal(failed.length, 0);
});
