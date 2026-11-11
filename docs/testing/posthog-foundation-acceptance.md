# PostHog foundation acceptance

Implementation branch, November 10, 2026. Production activation is not authorized.

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

Executor discovers `persons-bulk-delete`, accepting distinct IDs with `delete_events` and `delete_recordings`. It is irreversible and returns 202 for an asynchronous deletion request. No deletion was executed. Runtime backend management authorization is not established by the ingestion key or the operator's Executor connection. Activation requires a working supported backend authorization route and acknowledgement/retry evidence. No new credential is created by this changeset.

## Evidence

Synthetic browser acceptance intercepts all PostHog transport with a fake key. Desktop and mobile checks cover independent Limited envelopes, absence of SDK visitor IDs in local/session storage, Off silence, Full navigation, opaque guest continuity across reload, cross-tab withdrawal and a delayed flag/recording configuration response after Off. A 503 regression test verifies old captures do not retry after Off/On. Supported beacon capture is intentionally best effort; server outbox retries are unchanged.

The Account Privacy entry is available without a profile selection in the local fixture. This is not proof of hosted account switching, failed authenticated saves or cross-device propagation. Those remain acceptance dependencies.

Focused Convex checks cover preference authorization, stable UUIDs within a consent period, UUID rotation after withdrawal, idempotent blocked deletion requests, legacy-row suppression, On/Off/On queue invalidation and bounded suppressed-row cleanup. Existing proof/claim tests preserve authoritative outcomes while explicitly distinguishing consented and legacy telemetry.

Terraform validates locally and its mocked-provider test checks production/Full filters on every existing trend plus journey-based milestone joins. No provider plan was applied. Executor's current project read confirms recording remains disabled and replay retention remains 30 days. Effective billing limits are not yet verified.

Visual inspection found that the initial translucent panel let footer text show through. The final panel uses the shared opaque surface token and fits desktop/mobile widths. Keyboard Escape returns focus to the explicit opener. Real replay contents and hosted masking/mobile-player performance are unverified.

Existing analytics/sanitizer/route baseline: 28 tests passed. Dependency installation completed using the frozen lockfile; an earlier attempt ran before installation completed and failed to resolve tsx, then passed after installation.
