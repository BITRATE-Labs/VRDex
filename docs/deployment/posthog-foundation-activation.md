# PostHog foundation activation

Implementation approval covers code and review. Production recording and provider settings remain unapplied.

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
- Provision an approved runtime management authorization route and implement/verify supported withdrawal deletion for account and guest Full identities. Current account requests are persisted as `blocked_authorization`; the guest withdrawal path and provider worker are incomplete. No provider deletion is claimed. The ingestion key and operator Executor connection do not supply runtime management authorization.
- Verify account switching, delayed account preferences and failed-save retry against an isolated authenticated backend. Local guest browser checks and Convex unit tests do not prove hosted auth behavior.
- Use an existing isolated staging target or proven staging-only recording restriction for synthetic public/private/form replay acceptance. Do not enable shared-project recording globally just to test it. Confirm masking, receipt and basic mobile/player responsiveness. This hosted check is pending.

## Rollback

Disable project recording first on masking or performance failure. Leave application authorization and optional-capture preferences intact. Disable interim collection independently if its acceptance changes. Do not erase consent history or revive terminally suppressed telemetry during rollback.
