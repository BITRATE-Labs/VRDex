# PostHog foundation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if BASIC selects that method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver working normal product analytics and masked replay with a public Off/On choice and an internal Limited interim state.

**Architecture:** Repair the existing PostHog integration and shared capture boundaries. Keep one browser/account preference and use existing Convex identity and outbox patterns. No region routing, consent framework or masking redesign.

**Tech stack:** Next.js, React, TypeScript, posthog-js 1.376.2, Convex, Terraform, node:test, Playwright.

**Spec:** [Approved foundation design](../specs/2026-11-10-posthog-foundation-design.md). BASIC approved the design on November 10, 2026, and requested this implementation plan. [Presentation constraints](../../planning/posthog-choice-presentation-2026-11-10.md) and [audit evidence](../../planning/posthog-usage-audit-2026-11-10.md) travel with it.

## Global constraints

- Public control: Off / On. Limited is derived from no choice and never selectable.
- No region detection, custom consent engine, new project, dependency or credential creation.
- No benefit pitch or long frontend explanations. Policy contains full detail. Exact required consent/policy sentences still require BASIC's copy approval before shipping.
- Keep project 447783 and current 30-day replay retention. No production recording activation, deployment or provider apply in this implementation task.
- Preserve existing authorization, outbox retries/idempotency, URL sanitizers and private-route masking.
- Existing public journeys and broadcast PR #447/instance/recap owners retain their behavior.
- No experiments, surveys, new groups/retention definitions, source maps, error-tracking integration or player metrics.

## Review focus

1. Missing or malformed browser storage must not overwrite a known account/browser Off restriction. Task 2 tests it.
2. A stale remote-config callback must not restart replay after Off. Task 3 tests it.
3. Full to Off to Full must never revive old queued events. Task 4 tests it.
4. Auth unavailable, restoring or changing accounts must not block rendering or attribute events to the wrong account. Tasks 2/3 test it.
5. An unset preference must not look like Off, and dismissing the offer must not become consent. Task 5 tests it.

## File map and execution setup

| Responsibility | Files |
| --- | --- |
| SDK lifecycle and capture | Modify `apps/web/src/app/PostHogProvider.tsx`, `apps/web/src/lib/posthog.ts`; create `apps/web/src/lib/analytics-preference.ts` and one `apps/web/src/app/_components/analytics-preferences.tsx` for shared state/control. Preserve `apps/web/src/instrumentation-client.ts`'s existing history setup. |
| Account preference | Modify `convex/schema.ts`, `convex/accounts.ts`; create `convex/analyticsPreferences.ts`. Reuse `_identity.ts`'s auth boundary; modify provisioning only if needed. |
| Existing events | Modify `_claimAnalytics.ts`, `claimAnalytics.ts`, `claimAnalyticsDelivery.ts` and actual callers found by the mandatory inventory. Audit direct browser captures and mirrored flag/person-property helpers. |
| UI | Modify footer, root/provider placement, and account/privacy page integration. Reuse Button, Notice, field primitives and existing native-dialog patterns without extracting a new UI framework. |
| Configuration/reporting | Existing PostHog/Vercel Terraform stacks, environment definitions and baseline workflow. |
| Tests/docs | Existing PostHog, replay-route, claim and auth tests; new preference tests and one browser spec; canonical analytics/deployment docs and policy source identified in Task 1. |

- [ ] Inspect status and applicable AGENTS files. Start an isolated worktree from the agreed base using `superpowers:using-git-worktrees`; never reset/pull/overwrite the shared checkout. Carry only these design/plan artifacts into it. Do not commit unrelated untracked files.
- [ ] Read `pstack-plugin:typescript-best-practices`, `convex:convex-expert`, and the test/verification skills when execution reaches their domains. Use Executor for PostHog discovery and current docs. Never assume audit settings remain current.
- [ ] Keep one PR with `ci:browsers` and `ci:visuals`. Commit each independently tested task. No subagents unless the selected execution method or applicable skill explicitly authorizes them.

## Task 1: Prove the smallest viable Limited configuration

**Files:** Existing provider/helper, `apps/web/src/instrumentation-client.ts`, deployment env docs; create a short sanitized evidence note under `docs/testing/`.

**Interface produced:** Frozen internal types used below: `AnalyticsChoice = 'off' | 'on'`; `AnalyticsMode = 'off' | 'limited' | 'full'`; deployment category `development | preview | staging | production`. No stored `limited` preference.

- [ ] Read the installed PostHog skill through Executor and current SDK docs. Inspect SDK capabilities for memory persistence, person-profile suppression, capture disabling, disabling console/network/canvas recording and disposal/reset. Record the supported calls, not a guessed API.
- [ ] Inventory actual event producers with `rg -n 'posthog|captureProductEvent|event_intake_run|event_sync_apply|enqueueClaimAnalyticsEvent' apps convex scripts workers`. Record each producer, its account/workflow ownership and capture boundary. Live intake/sync receipts do not prove their producer exists in this checkout; identify external owners instead of editing invented files.
- [ ] Locate the real public privacy-policy source and its route. The existing `/privacy/suppression` is a redirect to a support request, not a policy. If no policy exists, include one minimal public policy page and matching docs in Task 5, with exact prose held for owner review.
- [ ] Use a synthetic local browser and intercepted transport to prove a Limited payload contains only allowed events, route classes and bounded properties, no replay or persisted visitor identity, no IP/geolocation enrichment and no eventual account merge. Inspect generated SDK envelope fields as well as application properties. Confirm provider reuse/contract conditions for the intended default audience measurement from official sources.
- [ ] Tighten Limited to independent aggregate counts if page-lifecycle correlation prevents eligibility. Do not add cookieless hashing or a new transport/framework as an unreviewed workaround. If the existing provider cannot meet the requirement, record the precise blocker before implementing a default that would violate the spec. Do not silently substitute Off or Full.
- [ ] Discover the supported provider deletion operation and required authorization for consent withdrawal. Existing ingestion keys are not management credentials. Record an existing approved authorization route if available; if absent, mark provider deletion/activation as blocked without creating credentials or pretending deletion succeeded.
- [ ] Save the payload/settings evidence with tokens and identifiers omitted; commit the evidence/docs only. Later tasks consume this verified SDK configuration.

## Task 2: Implement preference persistence and account identity

**Files:** New `apps/web/src/lib/analytics-preference.ts`, `convex/analyticsPreferences.ts`; modify schema/viewer; new `tests/web/analytics-preference.test.ts`, `tests/backend/analytics-preferences.test.ts`.

**Interfaces:** Export `resolveAnalyticsMode(browserChoice: AnalyticsChoice | undefined, accountChoice: AnalyticsChoice | undefined, accountResolved: boolean): AnalyticsMode | undefined`. `undefined` means temporarily unresolved, not Limited. Add authenticated mutation `analyticsPreferences.set({ choice: 'off' | 'on', policyVersion: string, browserRestriction?: 'off' | 'on' })`, returning the saved preference and analytics UUID only when effective Full. The viewer exposes its caller's optional choice, preference revision and permitted analytics UUID. Server policy version comes from an accepted checked-in version, not arbitrary client assertions.

- [ ] Write failing unit assertions for default Limited, explicit Off, account Off beating browser On, browser Off beating account On, unresolved account returning undefined, and malformed storage ignored without removing a known restriction. Example: `assert.equal(resolveAnalyticsMode(undefined, undefined, true), 'limited')`.
- [ ] Write failing convex-test cases: unauthenticated mutation denied; no explicit Limited accepted; caller changes only their own account; stable random UUID generated once for On; actual choice changes increment revision; Off never returns account identity. Test repeated/concurrent On saves.
- [ ] Run `node --import tsx --test tests/web/analytics-preference.test.ts` and `node --conditions=import --import tsx --test tests/backend/analytics-preferences.test.ts`; expect failures for missing behavior before implementation.
- [ ] Implement optional account preference `{choice, changedAt, policyVersion, source, revision}` and `analyticsId`. Use existing current-user helpers. Preference storage is independent from SDK storage. Off takes effect locally before remote persistence; On waits for successful authenticated persistence. Preserve local restriction on save error.
- [ ] Add storage-event synchronization for browser changes and consume reactive viewer preference for signed-in devices. Do not add polling or a message bus. Follow existing Convex generated-code workflow without production push.
- [ ] Run the focused tests and relevant typechecks; expect zero failures. Commit preference/schema/viewer/tests together.

## Task 3: Repair ordinary tracking and enforce browser modes

**Files:** Provider/helper, shared preference component's lifecycle, Convex provider placement; existing discovery/search/lookup/claim/auth/temporal capture and flag consumers from Task 1; existing `tests/web/posthog.test.ts`, new `apps/web/e2e/analytics-preference.spec.ts`.

**Interfaces consumed:** Task 1 modes/configuration and Task 2 resolved preference/viewer. Keep existing `captureProductEvent` event contracts; apply eligibility at one shared SDK/capture boundary, including direct `.capture()` callers, person-property mirrors and automatic events.

- [ ] Write failing transport assertions: default Limited emits only its allowlist; Off emits no PostHog requests; pending auth emits nothing; On emits normal pageviews, permitted autocapture and product events. Assert one initial and one soft-navigation pageview, including back/forward and query-only URL redaction.
- [ ] Add a focused SDK-adapter test with a deferred initialization/remote-config callback: choose Off before resolving it and assert recorder/capture remain stopped. Test Limited to On clears the earlier ID before identify, and On A to logout/B never attributes B to A.
- [ ] Run focused tests to prove failure, then implement one supported history-change capture path. Set `ui_host`, register deployment category before capture, preserve the existing instrumentation-client history behavior, and avoid duplicate initialization under Strict Mode/remounts.
- [ ] Use Task 1's SDK settings for each mode. Suppress replay outside Full, clear/discard pending data on downgrade, and never merge Limited history. Re-register environment after reset. No event buffer across auth/mode transitions.
- [ ] In None/Limited use backend grants and checked-in rollout defaults for existing feature access, with Featured still hidden. Add assertions for lookup/temporal access independent of analytics permission.
- [ ] Verify receipt coverage of existing auth and temporal emitters with synthetic fixtures; repair demonstrated transport defects only. Add explicit environment configuration to Vercel/workflows and backend deployment definitions, with invalid/missing configuration failing closed for analytics only.
- [ ] Run `node --import tsx --test tests/web/analytics-preference.test.ts tests/web/posthog.test.ts tests/web/session-replay-routes.test.ts` and the browser spec under the repo's existing fixture harness. Expect no duplicate pageviews or prohibited requests. Commit code, tests and env docs together.

## Task 4: Make backend events and withdrawal honor the same choice

**Files:** Claim helper/outbox/delivery, schema, preference mutation; all user-event producer callers from Task 1. Extend `tests/backend/claim-analytics.test.ts` and preference tests. Create one internal provider-deletion action module only if no existing operation can be reused.

**Interfaces:** Extend claim analytics context with validated optional request restriction, preserving journey/source fields. Optional outbox context contains owner user ID for enforcement, original deployment category and preference revision. These internal IDs are never emitted. Account choice plus browser restriction must both allow Full before enqueue/delivery.

- [ ] Write failing tests for absent/Off preference, browser Off with account On, nonauthenticated producers, legacy untagged queue rows, retries after revoked permission, and On to Off to On. The last case must permanently suppress old rows even though current choice is On again. Preserve duplicate insert-ID and original-timestamp assertions.
- [ ] Run `node --conditions=import --import tsx --test tests/backend/analytics-preferences.test.ts tests/backend/claim-analytics.test.ts`; confirm new assertions fail.
- [ ] Pass the validated browser restriction through existing claim/workflow request arguments and all callers. Enqueue optional user events only for authenticated eligible Full. Delivery rechecks owner preference revision. Skip legacy/ineligible rows terminally; retain authoritative application outcomes and existing lease/retry behavior.
- [ ] On accepted Off save, invalidate pending telemetry and schedule the supported provider deletion for retained consent-based Full data. Reuse Convex scheduling and persisted job state with bounded retry; no general queue abstraction. Verify success only after provider acknowledgement. If authorization from Task 1 is unavailable, leave the action unenabled and report that activation dependency, not a successful deletion.
- [ ] Test deletion idempotency, transient failure/retry and repeated Off saves. Keep identifier mapping long enough to complete a required deletion, without sending new optional events. A failed preference save still stops browser capture but does not falsely claim remote deletion.
- [ ] Run focused tests and backend typechecks; commit server callers, generated contract updates, tests and canonical claim analytics docs together.

## Task 5: Add the binary control and policy entry

**Files:** Shared `analytics-preferences.tsx`, footer, layout/provider wiring, `apps/web/src/app/account/privacy/page.tsx`; existing policy source from Task 1 or new `apps/web/src/app/privacy/page.tsx` if missing. Extend the browser spec and account visual fixtures.

**Interface produced:** Export one shared control/context to reopen the same Off/On choice from footer/account. Persist offer-dismissed separately from explicit choice; no user-selectable Limited.

- [ ] Add failing browser cases for first-visit nonmodal offer, equal Off/On reachability, dismiss/reload without recurrence, reopening from footer, account settings without a selected profile, and failed-save retry. Assert dismissal keeps Limited and unset is never presented as Off.
- [ ] Implement the small panel/control using existing primitives. Do not reuse a blocking event-intake modal for the first offer. Handle keyboard focus and announcement of save/error using existing patterns. Browsing stays usable while the panel is open.
- [ ] Draft only the minimum necessary consent/policy text. Present exact new sentences to BASIC for copy approval before shipping; approval of this design does not approve prose not yet written. Keep event types/provider/purposes/identity/replay/retention/deletion details in the policy, with no benefit pitch in the panel.
- [ ] Run `pnpm --filter web exec playwright test analytics-preference.spec.ts --project=desktop-chromium --project=mobile-chromium` through the existing configured test server. Capture desktop/mobile panel and account settings screenshots; inspect with VLM for fit, hierarchy, focus and unwanted explanatory filler.
- [ ] Commit the UI/tests/docs after local verification; keep unresolved exact-copy review explicitly in the PR handoff.

## Task 6: Reporting, replay smoke check and delivery

**Files:** Existing PostHog Terraform insights/dashboard filters, deployment/analytics docs; synthetic acceptance evidence under `docs/testing/`. No new dashboards unless existing reports cannot display needed receipts.

- [ ] Add meaningful configuration assertions for production/mode filtering using the existing Terraform/scripts test pattern. Verify claim journey joins remain on journey ID and counts are labeled milestone reach, not an ordered user funnel. Do not relabel historical untagged traffic.
- [ ] Update current auth/claim insights and environment docs. Run Terraform formatting/validation without provider apply. Read current settings through Executor, verifying project 447783 before relying on them.
- [ ] In an already approved isolated staging target or proven staging-only restriction, exercise one synthetic public page, private account screen and form. Confirm recording receipt and existing masking/token redaction. No real session content, masking redesign, new project or credential. If no safe hosted target is available, finish offline tests and mark hosted acceptance pending.
- [ ] Compare basic mobile responsiveness/player usability with recording off/on during this smoke check; pursue only demonstrated regressions. Record sanitized counts/settings and screenshot evidence, not raw recordings or access-bearing URLs.
- [ ] Run `pnpm lint:web`, `pnpm typecheck:web`, `pnpm typecheck:backend`, `pnpm test:web`, `pnpm test:backend`, `pnpm verify:docs`, plus the targeted browser/visual checks above. Use the worktree guard normally. Expect zero unexpected failures; report pre-existing failures separately rather than masking them.
- [ ] Self-review against the spec, apply unslop to prose, then obtain one whole-branch code review using the selected execution method. Triage all feedback before pushing follow-ups. Commit final fixes and push the implementation PR with the browser/visual labels.
- [ ] If tasked with merge-ready delivery, wait at least 30 minutes from the latest commit timestamp, then refresh checks, comments, inline threads, formal reviews and sticky summaries for the exact head. Address valid feedback and repeat the post-window refresh after any new commit. Include the PR URL in readiness reporting.
- [ ] Prepare a separate production settings diff: project, allowed Full sessions, sampling, unchanged retention, effective billing limit and rollback. Do not apply it. List remaining copy approval, Limited eligibility, provider deletion authorization and hosted acceptance only where actually unresolved.

## Self-review and handoff

Every spec requirement maps to Tasks 1–6; no speculative PostHog products were added. Interface names and mode meanings are consistent. Limited eligibility, management authorization and exact public prose are real acceptance/deployment dependencies, not implemented facts. Native execution is recommended because these tasks share preference and lifecycle interfaces and one implementer can keep the changes smaller.

BASIC approved this plan and native execution on November 10, 2026. Implementation evidence and remaining acceptance dependencies live in the [acceptance record](../../testing/posthog-foundation-acceptance.md). Production recording remains a separate approval.
