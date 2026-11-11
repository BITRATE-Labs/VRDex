import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function checkIdentity(identity, { head, backend, clerkKey }) {
  assert.match(head, /^[a-f0-9]{40}$/, "A full candidate head is required");
  assert.match(backend, /^https:\/\/[a-z0-9-]+\.convex\.cloud$/, "A Convex preview URL is required");
  assert.match(clerkKey, /^pk_test_/, "Only the Clerk development instance is permitted");
  const clerkOrigin = `https://${Buffer.from(clerkKey.slice(8), "base64").toString().replace(/\$+$/, "")}`;
  assert.equal(identity.commit, head, "Preview commit differs from candidate head");
  assert.equal(identity.environment, "preview", "Only a preview deployment is permitted");
  assert.equal(identity.convexBrowser, backend, "Browser backend differs from candidate backend");
  assert.equal(identity.convexServer, backend, "Server backend differs from candidate backend");
  assert.equal(identity.clerkFrontendApi, clerkOrigin, "Preview and runner use different Clerk instances");
  return identity;
}

export function checkCoverage(report, requiredTitles, projects) {
  assert.equal(report.errors?.length ?? 0, 0, "Playwright reported global errors");
  const executed = [];
  function visit(suites = []) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          executed.push({ title: spec.title, project: test.projectName, status: test.results?.at(-1)?.status });
        }
      }
      visit(suite.suites);
    }
  }
  visit(report.suites);
  assert.ok(executed.length > 0, "No browser tests executed");
  for (const title of requiredTitles) {
    for (const project of projects) {
      const matches = executed.filter(test => test.title === title && test.project === project);
      assert.equal(matches.length, 1, `Missing or duplicate coverage: ${project}: ${title}`);
      assert.equal(matches[0].status, "passed", `Required coverage did not pass: ${project}: ${title}`);
    }
  }
  assert.ok(executed.every(test => test.status === "passed"), "Coverage contains failed, skipped or unfinished tests");
  return executed.length;
}

async function main() {
  const env = process.env;
  assert.equal(env.VRDEX_ENABLE_E2E_CLERK_AUTH, "true", "Clerk auth acceptance must be enabled");
  assert.equal(env.VRDEX_ENABLE_E2E_AUTH_HELPERS, "true", "Preview auth helpers must be enabled");
  assert.ok(env.VRDEX_E2E_BROWSER_TOKEN, "Browser helper token is required");
  assert.match(env.CLERK_SECRET_KEY ?? "", /^sk_test_/, "Only a development Clerk secret is permitted");
  const target = new URL(env.PLAYWRIGHT_BASE_URL);
  assert.equal(target.protocol, "https:");
  assert.equal(target.origin, env.PLAYWRIGHT_BASE_URL, "An exact HTTPS preview origin is required");
  const response = await fetch(`${target.origin}/api/deployment`, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  assert.ok(response.ok, `Deployment identity unavailable: HTTP ${response.status}`);
  const identity = checkIdentity(await response.json(), {
    head: env.CANDIDATE_HEAD_SHA ?? "",
    backend: env.CANDIDATE_CONVEX_URL ?? "",
    clerkKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  });
  const evidence = { head: env.CANDIDATE_HEAD_SHA, deployment: target.origin, ...identity, observedAt: new Date().toISOString() };
  if (process.argv[2] === "report") {
    const read = name => JSON.parse(readFileSync(`apps/web/playwright-artifacts/${name}.json`, "utf8"));
    evidence.coverage = {
      mutation: checkCoverage(read("candidate-mutation"), ["profile submission writes through to public profile and discovery @flow"], ["desktop-chromium"]),
      auth: checkCoverage(read("candidate-auth"), [
        "a Clerk session resolves to a verified Convex identity and clears on sign-out @auth-session-staging",
        "a signed-out browser is sent to sign-in with its return path @auth-session-staging",
      ], ["desktop-chromium", "mobile-chromium"]),
      account: checkCoverage(read("candidate-account"), ["account overview", "account privacy", "managed events", "media contributions", "media review access", "developer tokens"], ["desktop-chromium", "mobile-chromium"]),
    };
  } else {
    assert.equal(process.argv[2], "preflight", "Expected preflight or report");
  }
  mkdirSync("apps/web/playwright-artifacts", { recursive: true });
  writeFileSync(`apps/web/playwright-artifacts/candidate-${process.argv[2]}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
