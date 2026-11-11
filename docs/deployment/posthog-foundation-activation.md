# PostHog foundation activation

Implementation approval covers code and review. Production recording and provider settings remain unapplied.

Provider withdrawal processing also defaults off through `POSTHOG_WITHDRAWAL_ENABLED`.
Provisioning the existing management key does not activate deletion. Enable the
worker only during approved hosted acceptance and production activation.

`NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED` defaults false. While disabled, optional browser capture, the proposed panel, footer/account control and draft `/privacy` page are unavailable. Enable it only after the dependencies below are accepted. Existing account preferences alone cannot enable browser collection. Synthetic browser CI explicitly enables it with a fake ingestion key and intercepted transport, then verifies the disabled configuration separately.

## Current verified settings

Executor read project 447783, VRDex Analytics, on November 11, 2026 UTC. Replay remains disabled. Recording retention is 30 days. Project console/performance collection is enabled, while the new browser configuration explicitly disables console content and performance collection. No real recording contents were read.

## Proposed production change

| Setting | Current | Proposed after acceptance |
| --- | --- | --- |
| Project | 447783 | Same project |
| Browser eligibility | Existing integration | Explicit effective Full only |
| Recording | Disabled | Bounded Full-session pilot |
| Recording sample | Unset | Start at 10%, owner review required |
| Recording retention | 30 days | Unchanged |
| Console, network bodies/headers, canvas | Project/local settings vary | Explicitly disabled in the SDK |
| Interim collection | New config defaults disabled | Enable only after its actual eligibility is established |
| Event reporting | Mixed environments/historical traffic | Production + Full filters on existing reports |

This is a proposal, not an applied settings diff. Read the effective billing limits and prepare the exact provider plan immediately before approval. Do not infer a spending cap from sample rate or a successful SDK request.

## Dependencies before activation

- Review exact public panel/policy copy. The policy draft still needs the concrete event-retention value and broader site-policy review.
- Establish Limited's actual no-consent eligibility and provider reuse conditions. Synthetic payload stripping alone does not establish legal eligibility.
- Verify the [server management key provisioning and withdrawal worker](convex-environments.md#posthog-withdrawal-authorization) after deployment. The implementation reuses the existing repository `POSTHOG_API_KEY`, handles account and receipt-authorized guest requests, checks provider acknowledgement/status, and retains unresolved targets. Local tests use synthetic transport; no live provider deletion is claimed. The ingestion key and operator Executor connection do not supply runtime management authorization.
- Verify account switching, delayed account preferences and failed-save retry against an isolated authenticated backend. Local guest browser checks and Convex unit tests do not prove hosted auth behavior.
- Use an existing isolated staging target or proven staging-only recording restriction for synthetic public/private/form replay acceptance. Do not enable shared-project recording globally just to test it. Confirm masking, receipt and basic mobile/player responsiveness. This hosted check is pending.
- Measure proxied ingest requests per Full session during the pilot. Browser event batching is intentionally disabled to keep consent-bound dispatch independent; sampling alone does not bound Vercel transfer cost.
- Read `claimAnalytics.deliveryOperationalHealth` for bounded blocked, pending, delivering, accepted and failed deletion counts. Completed mappings and withdrawn guest receipts are pruned after 30 days; unresolved targets remain intact. Verify the hosted worker and backlog before activation.

The November 11 Executor billing overview returned no custom dollar limit for product analytics or session replay, and both product usage limits were null. This does not establish a free or capped rollout. Keep existing billing settings unchanged in this code PR; confirm effective limits in the activation diff. Organization feature entitlements do not establish the configured event-retention period.

## Rollback

Disable project recording first on masking or performance failure. Leave application authorization and optional-capture preferences intact. Disable interim collection independently if its acceptance changes. Do not erase consent history or revive terminally suppressed telemetry during rollback.
