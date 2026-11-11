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

Existing analytics/sanitizer/route baseline: 28 tests passed. Dependency installation completed using the frozen lockfile; an earlier attempt ran before installation completed and failed to resolve tsx, then passed after installation.
