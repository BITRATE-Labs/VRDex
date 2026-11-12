import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkIdentity, checkCoverage } from './candidate-preview-acceptance.mjs';

const expected = { head: 'a'.repeat(40), backend: 'https://candidate.convex.cloud', clerkKey: `pk_test_${Buffer.from('dev.clerk.accounts.dev$').toString('base64')}` };
const identity = { commit: expected.head, environment: 'preview', convexBrowser: expected.backend, convexServer: expected.backend, clerkFrontendApi: 'https://dev.clerk.accounts.dev' };
test('candidate identity rejects missing, stale and split backend environments before writes', () => {
  assert.doesNotThrow(() => checkIdentity(identity, expected));
  for (const patch of [{ commit: 'a'.repeat(7) }, { commit: 'b'.repeat(40) }, { environment: 'production' }, { convexBrowser: 'unknown' }, { convexServer: 'https://staging.convex.cloud' }, { clerkFrontendApi: 'https://other.clerk.accounts.dev' }]) {
    assert.throws(() => checkIdentity({ ...identity, ...patch }, expected));
  }
  assert.throws(() => checkIdentity(identity, { ...expected, head: '' }));
  assert.throws(() => checkIdentity(identity, { ...expected, clerkKey: expected.clerkKey.replace('pk_test_', 'pk_live_') }));
});
const report = (status = 'passed') => ({ suites: [{ specs: [{ title: 'required mutation', tests: [{ projectName: 'desktop-chromium', results: [{ status }] }] }] }] });

test('selected analytics acceptance cannot pass without its desktop and mobile results', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'candidate-analytics-'));
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  });
  const artifacts = path.join(directory, 'apps/web/playwright-artifacts');
  mkdirSync(artifacts, { recursive: true });
  const stub = path.join(directory, 'fetch.mjs');
  writeFileSync(stub, 'globalThis.fetch = async () => Response.json(JSON.parse(process.env.CANDIDATE_TEST_IDENTITY));');
  const devices = ['desktop-chromium', 'mobile-chromium'];
  const namedReport = (titles, projects = devices) => ({ suites: [{ specs: titles.map(title => ({ title,
    tests: projects.map(projectName => ({ projectName, results: [{ status: 'passed' }] })),
  })) }] });
  const save = (name, data) => writeFileSync(path.join(artifacts, `candidate-${name}.json`), JSON.stringify(data));
  save('mutation', namedReport(['profile submission writes through to public profile and discovery @flow'], ['desktop-chromium']));
  save('auth', namedReport([
    'a Clerk session resolves to a verified Convex identity and clears on sign-out @auth-session-staging',
    'a signed-out browser is sent to sign-in with its return path @auth-session-staging',
  ]));
  const accountTitles = ['account overview', 'account privacy', 'managed events', 'media contributions', 'media review access', 'developer tokens'];
  save('account', namedReport(accountTitles));
  const run = selected => spawnSync(process.execPath, ['--import', pathToFileURL(stub).href,
    fileURLToPath(new URL('./candidate-preview-acceptance.mjs', import.meta.url)), 'report'], {
    cwd: directory, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, VRDEX_ENABLE_E2E_CLERK_AUTH: 'true', VRDEX_ENABLE_E2E_AUTH_HELPERS: 'true',
      VRDEX_E2E_BROWSER_TOKEN: 'synthetic', CLERK_SECRET_KEY: 'sk_test_synthetic',
      PLAYWRIGHT_BASE_URL: 'https://candidate.vercel.app', CANDIDATE_HEAD_SHA: expected.head,
      CANDIDATE_CONVEX_URL: expected.backend, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: expected.clerkKey,
      VRDEX_ANALYTICS_ACCEPTANCE: String(selected), CANDIDATE_TEST_IDENTITY: JSON.stringify(identity) },
  });
  assert.equal(run(false).status, 0);
  assert.equal(JSON.parse(readFileSync(path.join(artifacts, 'candidate-report.json'))).analyticsAcceptance, false);
  assert.notEqual(run(true).status, 0, 'missing analytics results must fail the selected lane');
  accountTitles.push('signed-in analytics preserves identity, retries offline and separates accounts');
  save('account', namedReport(accountTitles));
  assert.equal(run(true).status, 0);
  assert.equal(JSON.parse(readFileSync(path.join(artifacts, 'candidate-report.json'))).analyticsAcceptance, true);
  assert.equal(JSON.parse(readFileSync(path.join(artifacts, 'candidate-report.json'))).coverage.account, 14);
});
test('coverage requires actual named passes in each expected device, rejecting empty, skipped and failed reports', () => {
  const required = ['required mutation'];
  assert.equal(checkCoverage(report(), required, ['desktop-chromium']), 1);
  for (const candidate of [{}, { suites: [] }, report('skipped'), report('failed'), report('interrupted')]) {
    assert.throws(() => checkCoverage(candidate, required, ['desktop-chromium']));
  }
  assert.throws(() => checkCoverage(report(), required, ['desktop-chromium', 'mobile-chromium']));
  assert.throws(() => checkCoverage(report(), ['different mutation'], ['desktop-chromium']));
  assert.throws(() => checkCoverage({ ...report(), errors: [{ message: 'teardown failed' }] }, required, ['desktop-chromium']));
});

test('preflight failure retains a sanitized artifact without printing a rejected secret', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'candidate-acceptance-'));
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  });
  const rejectedSecret = 'sk_live_synthetic-rejected-value';
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./candidate-preview-acceptance.mjs', import.meta.url)), 'preflight'], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, VRDEX_ENABLE_E2E_CLERK_AUTH: 'true', VRDEX_ENABLE_E2E_AUTH_HELPERS: 'true', VRDEX_E2E_BROWSER_TOKEN: 'synthetic', CLERK_SECRET_KEY: rejectedSecret },
  });
  assert.equal(result.status, 1);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(rejectedSecret));
  const evidence = JSON.parse(readFileSync(path.join(directory, 'apps/web/playwright-artifacts/candidate-failure.json'), 'utf8'));
  assert.equal(evidence.status, 'failed');
  assert.equal(evidence.stage, 'preflight');
});
