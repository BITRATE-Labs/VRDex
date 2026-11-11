# PostHog foundation acceptance

Implementation branch, November 10, 2026. Production activation is not authorized.

The changeset adds the shared Off/On control, opaque account analytics identity, mode-aware browser capture, backend consent enforcement and production-only reporting filters. Limited is internal and its collection remains unenabled pending eligibility. The withdrawal follow-up adds the worker and guest ownership proof. Hosted provider deletion, authenticated acceptance and exact public copy remain activation dependencies.

## Verified boundaries

Executor's PostHog documentation search confirms `persistence: "memory"`, `set_config`, and the public SDK configuration reference. Memory persistence alone retains identity for a page lifecycle. The proposed Limited boundary therefore strips SDK-generated properties and uses independent event IDs. It disables automatic capture, remote configuration, replay and geo-IP enrichment. Its synthetic payload test must pass before use.

Sources: [SDK configuration](https://posthog.com/docs/libraries/js/config), [persistence](https://posthog.com/docs/libraries/js/persistence), [collection controls](https://posthog.com/docs/privacy/data-collection).

Limited's eligibility without prior consent and provider contractual reuse conditions remain unverified. The implementation keeps internal Limited distinct from Off but leaves default collection unenabled until this check is resolved. This is an activation dependency, not a consent exemption claim. Full and replay activation also retain their policy and deployment gates.

## Producer inventory

- Browser events use `lib/posthog.ts`, discovery/search/lookup components, claim-flow, temporal-parser, nav-utilities and profile-vrcdn-streams. Automatic SDK events pass the same `before_send` boundary.
- Backend claim events use `_claimAnalytics.ts`, profileClaims, profileConnections and discordVerification, followed by the existing claimAnalytics outbox/delivery.
- `communityTelemetry.ts` is authoritative application telemetry, not a PostHog producer.
- Recent `event_intake_run` and `event_sync_apply` receipts have no emitter in this checkout. Their external owner remains unknown; this changeset does not invent one.
- No public policy source exists. `/privacy/suppression` is a support redirect. A minimal `/privacy` policy draft is included for owner review.

## Withdrawal

Executor discovers `persons-bulk-delete`, accepting distinct IDs with `delete_events` and `delete_recordings`. It is irreversible and returns 202 for an asynchronous deletion request. The follow-up worker resolves the exact person, retains that target before submission, validates both queue acknowledgements and `deletion_errors`, and polls exact person status before marking completion. Missing matches or status are not treated as successful deletion. A lease recovers crashed delivery; failures retain the target and expose aggregate operational counts. Completed mappings and withdrawn guest receipts expire after 30 days.

The follow-up reuses the existing repository `POSTHOG_API_KEY` through the backend deployment workflow. No new key is created or read into chat. Runtime management authorization is not established by the ingestion key or operator Executor connection. Hosted provisioning and real-provider synthetic deletion are still pending; no live deletion is claimed.

Guest deletion is authorized by a separate 256-bit receipt, stored only as a hash on the server. Its endpoint reuses the internal Convex client and shared IP limiter, rejects cross-origin/oversized requests and cannot accept an arbitrary deletion target. Browser storage and Web Locks preserve receipt ownership across reload and tabs. Failed withdrawal keeps the receipt until server queue acceptance; re-enablement creates a new guest ID. Guest person profiles remain separate from authenticated account identities.

November 11 follow-up evidence: 44 synthetic analytics/playback browser cases pass on desktop and mobile. The new regression verifies the emitted guest ID matches its receipt, survives reload, stops on Off, retries after a failed withdrawal and changes on re-enablement. Focused backend/web checks cover leases, stale workers, provider acknowledgements/status, ownership, failure bounds and completed-only cleanup. Provider traffic is intercepted throughout these tests.

## Evidence

Synthetic browser acceptance intercepts all PostHog transport with a fake key. Desktop and mobile checks cover independent Limited envelopes, absence of SDK visitor IDs in local/session storage, Off silence, Full navigation, opaque guest continuity across reload, cross-tab withdrawal and a delayed flag/recording configuration response after Off. A 503 regression verifies retired captures do not retry after Off/On. Normal fetch transport handles an actual synthetic snapshot payload larger than 64 KB. Active-session and server outbox retries remain available.

The first beacon-based fix was rejected during whole-branch review because replay buffers can exceed browser beacon quotas. The final guard uses the installed SDK's exported internal `_send_request` method, verified at runtime, and fails closed for unvalidated SDK versions. No SDK dependency upgrade or new transport framework was added. This internal-hook dependency must be revalidated on upgrade.

Whole-branch review also reproduced a cross-account journey reuse and a token leak in SDK-generated previous-page metadata. Regression tests now check caller/authoritative workflow ownership and sanitize previous-page/session-entry URL properties. A real Off-mode ordinary-grant lookup check covers both single and bulk results, including the fetch gates.

The Account Privacy entry is available without a profile selection in the local fixture. This is not proof of hosted account switching, failed authenticated saves or cross-device propagation. Those remain acceptance dependencies.

Focused Convex checks cover preference authorization, stable UUIDs within a consent period, UUID rotation after withdrawal, idempotent blocked deletion requests, legacy-row suppression, On/Off/On queue invalidation and bounded suppressed-row cleanup. Existing proof/claim tests preserve authoritative outcomes while explicitly distinguishing consented and legacy telemetry.

Terraform validates locally and its mocked-provider test checks production/Full filters on every existing trend plus journey-based milestone joins. No provider plan was applied. Executor's current project read confirms recording remains disabled and replay retention remains 30 days. Effective billing limits are not yet verified.

Visual inspection found that the initial translucent panel let footer text show through. The final panel uses the shared opaque surface token and fits desktop/mobile widths. Keyboard Escape returns focus to the explicit opener. Real replay contents and hosted masking/mobile-player performance are unverified.

Existing analytics/sanitizer/route baseline: 28 tests passed. Dependency installation completed using the frozen lockfile; an earlier attempt ran before installation completed and failed to resolve tsx, then passed after installation.

## PR follow-up verification

PR review found three additional gaps: proposed copy was not deployment-gated, browser Off was not forwarded when continuing a claim, and unresolved auth cleared the prior outcome. The default-false foundation gate now hides the draft policy and controls and prevents optional browser collection. Claim continuation forwards the current restriction and terminally suppresses the owned journey before adapter work; cancellation also forwards the restriction. Auth history survives an unresolved interval and still resets on withdrawal.

Further review fixes bind adopted guest choices to the first account, clear SDK persistence on withdrawal, pin the SDK exactly and verify the installed version. Granted lookup/temporal access now uses backend authorization consistently across analytics modes; the obsolete flag-refresh helper was removed. Batching remains deliberately disabled, with proxy request volume added to pilot acceptance.

An unresolved or disabled browser mode no longer masquerades as an explicit Off action when continuing a claim. The first authenticated visit consumes a guest marker even when the account already has its own preference. Limited no longer calls the SDK's persistent consent opt-in; its browser regression checks every local/session storage entry and cookie, allowing only the application's offer-dismissal receipt. The existing internal delivery-health query exposes a bounded blocked-deletion count without identifiers. Unfulfilled requests retain each distinct analytics identifier rather than losing deletion targets through owner-level deduplication.

Playback remains outside Convex's provisioning gate so auth reconciliation cannot unmount the persistent owner. A root-boundary regression protects that placement, and the synthetic browser lane includes existing retained-media/layout-transition tests. Analytics output directories are separate children of `test-results`, preserving public-smoke artifacts. The latency insight now excludes receipts without measured latency. Account withdrawal remains immediate; re-enabling within 60 seconds of withdrawal is rejected to bound deletion-request churn. Repeated same-choice saves remain idempotent.

Follow-up local checks passed 46 backend cases, 12 preference/transport/root-boundary cases, 42 enabled analytics/playback browser cases and two disabled-gate cases. The browser configuration runs synthetic intercepted transport and separately tests disabled presentation/capture on desktop and mobile. Types, lint and Terraform validation/mocked reporting checks passed. Linux CI includes both configurations in the selected public-smoke lane. Original broad local results below precede these follow-ups; current Linux CI verifies the complete branch.

The coarse auth-outcome tracker also lives outside the provider component so provisioning remounts preserve anonymous-to-authenticated transitions. Limited envelopes preserve the non-identifying project ingestion token; both the sanitizer unit check and actual intercepted SDK payload assert its presence.

## Original implementation verification

Selected Linux CI exposed five existing dense-fixture setup failures across data flow and both visual lanes: the loader honestly reported partial after its bounded initial page budget, while tests assumed immediate completeness. Their shared setup now uses the visible More action and still requires ready. All three failed data-flow cases pass against an isolated anonymous local backend, preserving query limits, retry counts, roster contents and focus assertions. The two dense visual cases reached all final content assertions locally but differ at native screenshot rendering; committed baselines remain unchanged and Linux comparison remains required. The existing 17 pagination unit cases also pass.

- Web focused checks: 43 passed. Backend focused checks: 101 passed.
- Desktop/mobile analytics browser spec: 16 passed. Screenshots received direct visual inspection after the opaque-panel fix.
- Web broad suite: 1,119 passed with the unchanged `vrdex-mcp.test.ts` synchronous child-probe hang excluded.
- Backend broad suite: 3,303 passed with six named Windows-sensitive fixture cases excluded: VRCDN hold CBR, renderer transition anchors, two F1 dispatch-failure fixtures, TERM-ignoring descendant cancellation, and the public artwork fixture's unsupported Windows ESM path.
- Lint, web/backend typechecks and the local Terraform validation/mocked reporting test passed. Documentation build is checked with the final evidence commit.

The unfiltered suites were attempted and are not reported green. The earlier full web run also hit a stdio protocol timeout that passed in isolation. Linux CI remains required; local exclusions do not change committed CI selection or tests.

## Review images

- [Desktop offer](posthog-foundation/offer-desktop.png)
- [Mobile offer](posthog-foundation/offer-mobile.png)

These show proposed copy in a synthetic local fixture, not approved production copy or hosted authentication/replay acceptance.
