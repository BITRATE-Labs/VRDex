"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { OPTIONAL_JOBS, selectCoverage } = require("./ci-scopes.cjs");
const select = (files, names = ["ci:browsers"]) => selectCoverage({ eventName: "pull_request", labels: names.map(name => ({ name })), files });

test("a small timeline fix selects its flows and requested images without unrelated suites", () => {
  const files = ["apps/web/src/lib/timeline/plan-actions.ts", "apps/web/e2e/home-timeline.flow.spec.ts", "tests/web/timeline-saved-expiry.test.ts"];
  const narrow = select(files);
  assert.deepEqual(narrow.jobs, ["playwright-data-flow"]);
  assert.match("home-timeline.flow.spec.ts", new RegExp(narrow.flowPattern));
  assert.doesNotMatch("profile-submission.flow.spec.ts", new RegExp(narrow.flowPattern));
  for (const key of ["scripts", "restream", "media", "claimAuth", "analytics"]) assert.equal(narrow[key], false, key);
  assert.deepEqual(select(files, ["ci:visuals"]).jobs, ["playwright-data-flow", "playwright-public-preview", "playwright-image-diff"]);
});

test("profile and event changes select their own flows; host authority keeps broad checks", () => {
  const profile = select(["apps/web/src/app/[slug]/page.tsx"]);
  assert.match("profile-submission.flow.spec.ts", new RegExp(profile.flowPattern));
  assert.doesNotMatch("home-timeline.flow.spec.ts", new RegExp(profile.flowPattern));
  assert.equal(profile.media, false);
  assert.equal(select(["apps/web/src/app/_components/profile-public-page.tsx"]).claimAuth, false);
  assert.equal(select(["apps/web/src/lib/profile-claim.ts"]).claimAuth, true);
  const event = select(["apps/web/src/app/events/event-editor.tsx", "apps/web/e2e/event-editor-end.flow.spec.ts"]);
  assert.match("event-editor-end.flow.spec.ts", new RegExp(event.flowPattern));
  assert.equal(event.claimAuth, false);
  assert.equal(select(["apps/web/src/app/_components/event-public-page.tsx"]).claimAuth, false);
  assert.equal(select(["apps/web/src/app/events/[slug]/host/page.tsx"]).claimAuth, true);
});

test("player and shared controls select media or Storybook without all mutation flows", () => {
  const player = select(["apps/web/src/lib/now-playing.ts"]);
  assert.equal(player.media, true); assert.equal(player.flows, false);
  assert.equal(player.jobs.includes("playwright-hosted-data-flow"), false);
  const controls = select(["apps/web/src/components/ui/button.tsx"], ["ci:visuals"]);
  assert.deepEqual(controls.jobs, ["build-storybook", "storybook-component-preview", "storybook-image-diff"]);
});

test("full opt-in selects every optional job and heavy core checks even for docs", () => {
  const full = select(["docs/readme.md"], ["ci:full"]);
  assert.deepEqual(full.jobs, OPTIONAL_JOBS);
  for (const key of ["browsers", "visuals", "full", "scripts", "restream", "media", "claimAuth", "analytics"]) assert.equal(full[key], true, key);
  assert.equal(full.flowPattern, ".*");
  const { CORE_JOBS, evaluateVerification } = require("./visual-ci.cjs");
  const needs = Object.fromEntries([...CORE_JOBS, ...OPTIONAL_JOBS].map(job => [job, { result: "success" }]));
  needs["visual-selection"] = { result: "success", outputs: Object.fromEntries(Object.entries(full).map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value)])) };
  const artifacts = full.jobs.map(name => ({ name, expired: false }));
  assert.deepEqual(evaluateVerification({ needs, artifacts }).errors, []);
  needs["visual-selection"].outputs.flowPattern = "only-one-test";
  assert.match(evaluateVerification({ needs, artifacts }).errors.join(" "), /selection/i);
});

test("shared or unknown application changes retain broad coverage and mixed surfaces union", () => {
  assert.equal(select(["apps/web/src/app/layout.tsx"]).jobs.includes("broadcast-native-acceptance"), true);
  assert.equal(select(["apps/web/src/lib/new-shared-helper.ts"]).jobs.includes("playwright-hosted-data-flow"), true);
  assert.equal(select(["tsconfig.base.json"]).jobs.includes("broadcast-native-acceptance"), true);
  assert.equal(select(["tsconfig.base.json"], []).restream, true);
  assert.equal(select(["scripts/dev-helper.mjs"], []).restream, true);
  const mixed = select(["apps/web/src/lib/timeline/plan-actions.ts", "apps/web/src/lib/now-playing.ts"]);
  assert.equal(mixed.flows, true); assert.equal(mixed.media, true);
});

test("unlabelled PRs skip browsers; shared scripts/runtime retain baseline checks", () => {
  assert.deepEqual(select(["apps/web/src/lib/timeline/plan-actions.ts"], []).jobs, []);
  assert.equal(select(["scripts/operator.mjs"], []).scripts, true);
  assert.equal(select(["workers/restream/entrypoint.mjs"], []).restream, true);
  assert.equal(select(["convex/schema.ts"], []).restream, true);
  const main = selectCoverage({ eventName: "push", labels: [], files: ["docs/readme.md"] });
  assert.deepEqual(main.jobs, []); assert.equal(main.scripts, true); assert.equal(main.restream, true);
});

test("a narrow run's report requires exactly its selected jobs and rejects malformed snapshots", () => {
  const { CORE_JOBS, evaluateVerification } = require("./visual-ci.cjs");
  const coverage = select(["apps/web/src/lib/timeline/plan-actions.ts"], ["ci:visuals"]);
  const needs = Object.fromEntries([...CORE_JOBS, ...OPTIONAL_JOBS].map(job => [job, { result: CORE_JOBS.includes(job) || coverage.jobs.includes(job) ? "success" : "skipped" }]));
  needs["visual-selection"] = { result: "success", outputs: Object.fromEntries(Object.entries(coverage).map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value)])) };
  const artifacts = coverage.jobs.map(name => ({ name, expired: false }));
  assert.deepEqual(evaluateVerification({ needs, artifacts }).errors, []);
  needs["playwright-data-flow"].result = "skipped";
  assert.match(evaluateVerification({ needs, artifacts }).errors.join(" "), /playwright-data-flow/);
  for (const jobs of [undefined, "not-json", JSON.stringify(["unknown-job"]), JSON.stringify(["playwright-data-flow", "playwright-data-flow"])]) {
    needs["visual-selection"].outputs.jobs = jobs;
    assert.match(evaluateVerification({ needs, artifacts }).errors.join(" "), /selection/i);
  }
});
const { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

test('stories inside mapped surfaces retain component coverage', () => {
  for (const file of ['apps/web/src/components/event/card.stories.tsx', 'apps/web/src/components/profile/card.stories.tsx']) {
    const coverage = select([file], ['ci:visuals']);
    for (const job of ['build-storybook', 'storybook-component-preview', 'storybook-image-diff']) assert.ok(coverage.jobs.includes(job), `${file}: ${job}`);
  }
});

test('mapped flow and public patterns select existing tagged specifications', () => {
  const directory = 'apps/web/e2e';
  const specs = readdirSync(directory).filter(file => file.endsWith('.spec.ts'));
  for (const file of ['apps/web/src/lib/timeline/plan-actions.ts', 'apps/web/src/app/[slug]/page.tsx', 'apps/web/src/app/events/event-editor.tsx']) {
    const coverage = select([file], ['ci:visuals']);
    for (const [key, tag] of [['flowPattern', '@flow'], ['publicPattern', '@visual']]) {
      assert.ok(specs.some(spec => new RegExp(coverage[key]).test(spec) && readFileSync(join(directory, spec), 'utf8').includes(tag)), `${file}: ${key}`);
    }
  }
  assert.match(readFileSync(join(directory, 'home-timeline.visual.spec.ts'), 'utf8'), /await captureRouteScreenshot\(page, test\.info\(\)/);
});

test('main selection needs no comparison base or git diff', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vrdex-ci-selector-'));
  try {
    const event = join(directory, 'event.json');
    const output = join(directory, 'output');
    writeFileSync(event, '{}');
    const result = spawnSync(process.execPath, ['.github/scripts/visual-ci.cjs'], { encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, BASE_SHA: '0'.repeat(40), GITHUB_STEP_SUMMARY: '' } });
    assert.equal(result.status, 0, result.stderr);
    const coverage = JSON.parse(result.stdout);
    assert.equal(coverage.scripts, true); assert.equal(coverage.restream, true);
    assert.deepEqual(coverage.jobs, []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
