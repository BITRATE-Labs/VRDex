# PostHog foundation activation

Implementation approval covers code and review. Production recording and provider settings remain unapplied.

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

Signed-in analytics acceptance is being added to the existing isolated preview
workflow. Its selected run uses a fake ingestion key and intercepted transport.
Hosted analytics results remain pending until the exact-head report contains
both device passes; a workflow definition or general account-suite pass is not
that evidence.

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
- Verify that the existing Privacy request intake can receive and route an explicit analytics-deletion request for operator verification and handling. Ordinary Off must stop future collection without deleting history. No automatic deletion worker, guest receipt service or additional runtime management key is required for the preference control.
- Verify account switching, delayed account preferences and failed-save retry against an isolated authenticated backend. Local guest browser checks and Convex unit tests do not prove hosted auth behavior.
- Use an existing isolated staging target or proven staging-only recording restriction for synthetic public/private/form replay acceptance. Do not enable shared-project recording globally just to test it. Confirm masking, receipt and basic mobile/player responsiveness. This hosted check is pending.
- Measure proxied ingest requests per Full session during the pilot. Browser event batching is intentionally disabled to keep consent-bound dispatch independent; sampling alone does not bound Vercel transfer cost.
- Legacy `analyticsDeletionRequests` rows from the superseded automatic-Off design remain inert. They are not explicit deletion requests and must not be replayed against the provider. Keep them untouched until their operational cleanup is separately scoped.

## Rollback

Disable project recording first on masking or performance failure. Leave application authorization and optional-capture preferences intact. Disable interim collection independently if its acceptance changes. Do not erase consent history or revive terminally suppressed telemetry during rollback.

## Verification reference

- Merged source: `ee72d709c40651fef57f532464e9ddf218fb9495`.
- [Backend deployment run](https://github.com/BITRATE-Labs/VRDex/actions/runs/43133906640).
- [Public web deployment identity](https://vrdex.net/api/deployment).
- PostHog project 447783, read through Executor on November 11, 2026.
