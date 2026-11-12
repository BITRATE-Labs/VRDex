# PostHog foundation activation

Current recommendation: activate normal event tracking first, after signed-in
acceptance and exact public-copy review. Keep Limited collection and replay
disabled for that step. This gets usable analytics without making replay
acceptance or no-consent collection a prerequisite. Production settings remain
unapplied and require BASIC's separate approval.

`NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED` defaults false. While disabled, optional browser capture, the proposed panel, footer/account control and draft `/privacy` page are unavailable. Enable it only after the dependencies below are accepted. Existing account preferences alone cannot enable browser collection. Synthetic browser CI explicitly enables it with a fake ingestion key and intercepted transport, then verifies the disabled configuration separately.

## Current verified settings

Executor read project 447783, VRDex Analytics, on November 11, 2026 UTC. Replay remains disabled. Recording retention is 30 days. Project console/performance collection is enabled, while the new browser configuration explicitly disables console content and performance collection. No real recording contents were read.

After PR 454 merged, the production web identity endpoint reports the merged
source with matching browser/server backend bindings. The merge's backend
deployment job also passed. `/privacy` still returns 404 while foundation
activation is disabled.

The current `events-retention-get` read confirms no custom project or
organization window, an 84-month grandfathered default and an 84-month plan
maximum. It also reports no currently applied query window or scheduled
deletion, `default_period_deletes=false`, and a first pass on March 3, 2027.
These are distinct fields; the plan maximum alone is not proof of active
deletion. No retention setting was changed. See [PostHog's retention guide](https://posthog.com/docs/data/events-retention).

The organization billing overview reports paid product analytics and replay
subscriptions, null usage limits, `no_billing_limit=false`, and no custom USD
limit for either product. These fields do not establish an effective spending
ceiling. No billing setting was changed. Keep proxy request volume visible;
recording sample rate alone does not bound analytics or Vercel costs.
Refresh the effective billing limits and exact provider settings diff
immediately before the separate production approval.

Signed-in analytics acceptance uses the existing isolated preview workflow,
a fake ingestion key and intercepted transport. See
[PR 460](https://github.com/BITRATE-Labs/VRDex/pull/460) for execution results.
Require the exact-head report to contain both named device passes; a workflow
definition or general account-suite pass is not that evidence.

## Proposed production change

| Setting | Current | Proposed after acceptance |
| --- | --- | --- |
| Project | 447783 | Same project |
| `NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED` | False | True in the production Vercel build |
| Browser eligibility | Foundation disabled | Explicit effective Full only |
| `NEXT_PUBLIC_POSTHOG_LIMITED_ENABLED` | False | Unchanged; no capture before a choice |
| Recording | Disabled | Unchanged for initial event tracking |
| Recording sample | Unset | Unchanged for initial event tracking |
| Recording retention | 30 days | Unchanged |
| Console, network bodies/headers, canvas | Project/local settings vary | Explicitly disabled in the SDK |
| Event reporting | Mixed environments/historical traffic | Production + Full filters on existing reports |

Reuse the existing project ingestion key, host and server-side event delivery.
No additional runtime management key is needed. Apply the existing reporting
filter diff separately through its Terraform workflow after approval. Rebuild
the web app when changing its public foundation flag. Historical analytics and
all retention settings stay unchanged.

## Dependencies before activation

- Review exact public panel/policy copy. The policy draft still needs the concrete event-retention value and broader site-policy review.
- Correct the draft policy's privacy-request destination before activation: `owner_opt_out` enters listing suppression, not general analytics deletion. Reuse the existing general support intake (`/support?topic=feedback`) for an explicit request and operator verification; do not automatically interpret it as listing suppression. No live request was submitted during this check. Ordinary Off must stop future collection without deleting history. No automatic deletion worker, guest receipt service or additional runtime management key is required for the preference control.
- Verify account switching, delayed account preferences and failed-save retry against an isolated authenticated backend. Local guest browser checks and Convex unit tests do not prove hosted auth behavior.
- Measure proxied ingest requests per Full session during the pilot. Browser event batching is intentionally disabled to keep consent-bound dispatch independent; sampling alone does not bound Vercel transfer cost.
- Legacy `analyticsDeletionRequests` rows from the superseded automatic-Off design remain inert. They are not explicit deletion requests and must not be replayed against the provider. Keep them untouched until their operational cleanup is separately scoped.

## Later collection changes

Limited collection remains disabled until its actual no-consent eligibility and
provider reuse conditions are established. Synthetic payload stripping alone
does not establish legal eligibility. This does not block Full-only collection.

Replay remains disabled until a synthetic public/private/form check uses an
existing isolated target or a proven staging-only restriction. Do not enable
shared-project recording globally just to test it. Confirm masking, receipt and
basic mobile/player responsiveness. Then prepare a bounded Full-session pilot
with a proposed 10% sample, unchanged 30-day retention and separate owner
approval. Do not redesign masking without a demonstrated failure.

## Rollback

For initial event tracking, set the foundation flag false and rebuild the web
app. Leave account preferences and historical events intact. If replay is later
enabled, disable project recording first on masking or performance failure.
Do not erase consent history or revive terminally suppressed telemetry during
rollback.

## Verification reference

- Merged source: `ee72d709c40651fef57f532464e9ddf218fb9495`.
- [Backend deployment run](https://github.com/BITRATE-Labs/VRDex/actions/runs/43133906640).
- [Public web deployment identity](https://vrdex.net/api/deployment).
- PostHog project 447783, read through Executor on November 11, 2026.
