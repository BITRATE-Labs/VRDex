# Production instance history chart implementation plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development to implement this plan task by task.

**Goal:** Replace the real private instance-detail graph with the agreed population, platform and automatic queue presentation.

**Architecture:** Keep the existing paginated private query and raw-population summaries. Add an instance-specific gap-preserving adapter and chart, integrate them into InstanceDetailContent, then make the preview use that same chart.

**Tech Stack:** Existing TypeScript, React, Recharts, Convex and Playwright.

**Spec:** [Production design and acceptance criteria](../specs/2026-11-09-instance-history-chart.md).

## Global constraints

- Population remains n_users. No corrections, clipping, queue addition or historical reconstruction.
- Missing diagnostics remain unknown; measured zero remains zero.
- No queue or closure toggle. Queue appears only if a complete-session sample is positive.
- Keep existing instance-history permissions, canonical aliases, pagination and raw summary math.
- No production sample data, new dependencies, provider calls, public projections or unrelated shared-chart refactor.
- Planning does not authorize merging, deployment or production data writes.

## Review focus

- A positive queue value found after page 1 must still display the line once complete.
- Session gaps break every series; missing Android alone breaks only Android.
- Legacy records and repaired aliases remain readable without diagnostics.
- Closure can occur between samples and before the final observation; the marker must not shorten the tail.
- Unequal polling times and multi-day tails must preserve elapsed spacing and understandable local dates.

## Task 1: Prepare real instance chart points

**Files:** Create apps/web/src/app/account/communities/[slug]/club-instance-chart-model.ts and tests/web/club-instance-chart-model.test.ts. Reuse club-analytics-model.ts and convex/_clubAnalyticsMath.ts without changing summary calculations.

**Interfaces:** Export InstanceObservation as SeriesPoint plus optional userCount, queueSize and platforms. Export InstanceChartPoint with at, label, population, windows, android, queueSize, userCount and platforms; missing numeric values are null. Export instanceChartPoints(observations: InstanceObservation[]): InstanceChartPoint[].

- [ ] Write failing model tests using observed points at t, t+3 minutes and t+12 minutes. Assert one shared gap, independently retained diagnostics, zero versus null and no fabricated fields on that gap. Add breakBefore, singleton, platform-only missing, empty map, contradictory counts and counts above 80 cases.
- [ ] Run `node --import tsx --test tests/web/club-instance-chart-model.test.ts` and verify the intended failure.
- [ ] Implement the adapter using observedChartPoints as the existing population/gap authority and a timestamp lookup for source diagnostics. Respect coverage; do not interpolate counters or infer missing platforms.
- [ ] Run the new model test and `node --import tsx --test tests/web/club-analytics-model.test.ts`. Both must pass; commit only this tested task.

## Task 2: Integrate the production chart and retire parallel prototype rendering

**Files:** Create apps/web/src/app/account/communities/[slug]/club-instance-chart.tsx. Modify club-instances.tsx, apps/web/src/components/instance-population-chart-preview.tsx, its stories and apps/web/e2e/instance-population-chart-preview.storybook.spec.ts. Add real-page scenarios to apps/web/src/components/club-analytics.stories.tsx and browser coverage to apps/web/e2e/club-analytics.storybook.spec.ts.

**Interfaces:** ClubInstanceChart({ points, closedAt }: { points: InstanceChartPoint[]; closedAt: number | null }). InstanceDetailContent passes instanceChartPoints(metrics.results) only when metrics.complete, and session.closedAt. Summary metrics continue to consume the unchanged query results.

- [ ] Write failing browser checks on the actual instance-detail fixture for the locked labels, platform paths, automatic queue presence/absence, exact table, diagnostics, closure marker without a toggle and population after closure. Include an 110/135 disagreement and missing individual platform samples.
- [ ] Add a paginated fixture with more than 500 observations and its only positive queue on a later page. Assert the complete chart includes it. Add a multi-day fixture with irregular spacing and a closure between sample timestamps.
- [ ] Implement ClubInstanceChart with the existing chart primitives and preview styling. Use numeric timestamp XAxis, zero-based shared YAxis, unstacked lines, connectNulls=false, isolated dots and full local timestamps. Include per-platform lines only when known; include Queue only when positive somewhere. Its exact table always preserves known zero versus Unknown.
- [ ] Replace only the ClubChart call in InstanceDetailContent. Retain event association/actions, loading/error states, complete pagination, summary cards, Data completeness and Back behavior. Do not change the shared ClubChart.
- [ ] Reduce the prototype to a fixture wrapper around ClubInstanceChart. Keep sample generation and Sample case controls outside the production module. Add NoQueue, Legacy, PartialPlatforms, ClosedTail and MultiDay fixtures without real identities.
- [ ] Run web typecheck, targeted ESLint, the model tests and targeted instance-detail/preview Playwright checks for desktop and mobile. Include existing club-instance-freshness and instance-session-repair coverage. Use ci:browsers and ci:visuals on the PR.

Verification commands for Task 2, using the task's existing Storybook port:

```powershell
pnpm typecheck:web
$env:PLAYWRIGHT_STORYBOOK_PORT = "6019"
$env:PLAYWRIGHT_REUSE_STORYBOOK = "true"
pnpm --filter web exec playwright test --config playwright.storybook.config.mjs instance-population-chart-preview.storybook.spec.ts club-analytics.storybook.spec.ts club-instance-freshness.storybook.spec.ts instance-session-repair.storybook.spec.ts
```

- [ ] Capture and inspect desktop/mobile screenshots of the real instance detail, table, diagnostic section, multi-day chart and closure tail. Confirm no document overflow or clipped annotations; verify numeric spacing rather than evenly spaced samples. Update backend/operator docs for the real chart behavior and commit the integration.

## Task 3: Prove the account route and prepare release

**Files:** Extend apps/web/e2e/club-analytics.flow.spec.ts and existing localFixtures/club fixture helpers only where the isolated authenticated local route needs data. Existing analytics flow and its fixture endpoint are loopback-only; preserve that restriction. Update docs/backend/community-group-telemetry.md and docs/testing/playwright-visual-preview.md if the new acceptance path changes their instructions. Reuse .github/workflows/vercel-preview-deploy.yml and group-telemetry-release.yml.

- [ ] Run the real authenticated account route against isolated Convex fixture observations. Check Home/Instances/Analytics entry paths, direct canonical and alias links, Back navigation and forbidden-reader denial. No authentication bypass, production fixture route or production dataset copy.
- [ ] Dispatch the existing on-demand preview for the exact PR/head and record the URL, backend deployment identity, test identities/roles and synthetic fixture scope. Verify the rendered page, not just workflow success. Do not point the loopback-only analytics fixture endpoint at a hosted backend. If hosted auth or approved isolated fixture provisioning is unavailable, record that precise acceptance gap and retain the real authenticated local-page evidence. Do not add a public seeding endpoint or call Storybook equivalent acceptance.
- [ ] Review #445's six recorded broad-suite failures. Fix change-caused failures; establish baseline/platform attribution for others and report anything unresolved. Run required CI plus the focused backend capture and summary/repair suites. Do not claim merge-ready while blocking failures or reviews remain.
- [ ] Prepare a release checklist with exact backend/web/collector SHAs, backend-first ordering, old-worker compatibility, natural paired-sample readback, legacy-history and original-link checks, raw-summary comparison and immutable rollback versions. Release remains a separate authorized step after review and the 30-minute readiness window.

The real-route flow must run through the existing local Clerk test harness with VRDEX_E2E_CLUB_ANALYTICS enabled, development Clerk credentials and a loopback PLAYWRIGHT_CONVEX_URL. Use `pnpm --filter web exec playwright test club-analytics.flow.spec.ts --project=desktop-chromium` with that harness. A skip is not acceptance. Extend existing cleanup to remove only this run's synthetic data and test accounts.

## Completion evidence

The deliverable is a working private account instance page backed by retained observations, with the same component exercised in stories and browser tests. Record the actual route preview, desktop/mobile evidence, authorization results, exact-head checks and remaining provider uncertainty. No standalone Storybook-only completion, speculative historical backfill or new event-recap aggregation.
