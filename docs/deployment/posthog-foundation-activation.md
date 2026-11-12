# PostHog foundation activation

## Production activation, November 12, 2026

BASIC explicitly approved enabling production analytics and replay. Executor
enabled the production Vercel build flag and project 447783 recording with a
10% session sample. Recording retention remains 30 days. Off stops future
collection and preserves history. Limited collection remains disabled.

The production rebuild uses the already-merged application source. The Vercel
Terraform stack adopts the bootstrapped production flag through an import
block. PostHog recording settings were applied through Executor using this
PATCH, which also documents the recreation path for the VRDex operator:

```json
{"id":447783,"session_recording_opt_in":true,"session_recording_sample_rate":"0.10"}
```

Keep the existing SDK masking and console/network-body/canvas exclusions.
Do not introduce a management runtime key or automatic deletion worker.

### Activation evidence

- Production deployment `dpl_23MqGsb2KLyqzZnhbwWFpbqjDiAK` is READY, built
  from main commit `83ff387d25a8e48625227675c2aa25a065ee1bf3`.
- An isolated synthetic browser generated a production Full pageview and
  `auth_session_restore_completed`. Executor confirmed both stored events for
  that exact synthetic distinct ID at 05:59:33 UTC on November 12.
- The probe observed no ingest requests before choosing On or after choosing
  Off. Its automated-browser signals were suppressed in the isolated probe
  only, leaving production's bot filter enabled.
- The selected synthetic session sent a replay snapshot to `/ingest/s/` with
  HTTP 200. Executor then confirmed recording
  `01a1ce5c-0e87-7c76-b9da-62c69e5f663b` in project 447783, with a 30-day
  retention period. Only that synthetic recording's metadata was read.
- This is synthetic guest browser proof. It does not repeat the hosted
  signed-in account acceptance in PR 460 or measure real mobile performance.

The sections below describe the pre-activation evidence and superseded staged
recommendation. The approval above supersedes their event-only/replay-off
sequencing and separate activation approval requirement. It does not establish
blanket legal compliance or verify a real user's analytics session.

## Pre-activation record

`NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED` defaults false outside the configured production build. While disabled, optional browser capture, the panel, footer/account control and `/privacy` page are unavailable. Existing account preferences alone cannot enable browser collection. Synthetic browser CI explicitly enables it with a fake ingestion key and intercepted transport, then verifies the disabled configuration separately.

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
- The draft policy now routes privacy requests to the existing general support intake (`/support?topic=feedback`), so they do not enter listing suppression. Verify operator handling of an explicit analytics-deletion request before activation. No live request was submitted during this check. Ordinary Off must stop future collection without deleting history. No automatic deletion worker, guest receipt service or additional runtime management key is required for the preference control.
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
