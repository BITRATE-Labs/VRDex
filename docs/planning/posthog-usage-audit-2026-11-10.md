# PostHog usage audit, November 10, 2026

## Recommendation and decisions

Restore useful session replay first, after a synthetic staging acceptance run and BASIC's approval of the exact production settings. The connected project has replay disabled. The application already contains recording configuration and masking, so adding another replay integration would miss the cause.

Then fix navigation coverage and environment classification before treating dashboards as product evidence. Add account continuity only after choosing an opaque analytics identity and logout behavior. Focus product measurement on operators successfully publishing and returning to manage events, alongside visitors finding an event or useful profile link.

This is an investigation and proposal. No provider setting, retention, credential, deployment, or billing change was made. Unrelated checkout files were preserved. Broadcast release PR #447 and instance/recap implementation remain with their owners.

| Decision for BASIC | Recommendation | Tradeoff |
| --- | --- | --- |
| Production recording | Approve a separate, explicit activation after staging acceptance. Preserve the existing all-route decision and private DOM blocking. | Blocked editor pages explain navigation and timing, but cannot explain private editor interactions. |
| Sampling and retention | Start the closed-beta pilot at 100% of eligible production sessions with the existing 30-day replay retention, subject to a reviewed spend cap. Reassess after one week. | Better diagnosis at low volume, more transfer and recordings. Do not silently change retention. |
| Environment separation | Immediately require an environment property on every client and server event. Prefer a separate nonproduction project when entitlement and cost are verified. | A shared project is simpler, but every report needs reliable filters. A second project adds flag/configuration maintenance. |
| Identity | Use an opaque stable account analytics ID on authenticated sessions, reset on logout/account switch, and retain anonymous browsing. | Enables account retention and cross-device continuity, increases linkability. Never use email, Discord or VRChat IDs. |
| Consent and access | Review the applicable legal basis, notice, opt-out, deletion path and staff access before widening beyond closed beta. Review exact public copy separately. | Masking does not replace these decisions. |

## Verified target and evidence boundaries

Executor exposed `tools.posthog.exec` through the connected default OAuth account. An approved live `project-get {}` returned **VRDex Analytics, 447783**, organization `019e59b2-c822-0000-8123-12efe322af2d`. `organizations-get` resolved that organization to **BASIC BIT LLC**. Project timezone is UTC, person-on-events querying is enabled, and the connection has project admin access. The actor's personal identity was not exposed or inferred.

The source's locked target agrees with the connected project. This proves the connection and target, not the state of every Vercel or Convex environment variable. Live pageview aggregates provide stronger evidence of actual ingestion from production and staging. Build-time environment values and the exact currently deployed source commit were not independently read back.

Official project entry point recorded in the repository: [VRDex Analytics](https://us.posthog.com/project/447783/home).

## Why recordings are missing

| Layer | Observation | Meaning |
| --- | --- | --- |
| Source | `PostHogProvider.tsx` configures `session_recording`, masks inputs, blocks marked regions, and uses `/ingest`. No explicit replay-disable setting. | Replay setup exists. It does not override a disabled project. |
| Live project | `session_recording_opt_in: false` | Recording is currently disabled at the project level. This is a confirmed blocker. |
| Other live controls | Sample rate, minimum duration and linked flag are null; URL/event trigger lists are empty; trigger groups are null. | No positive evidence that sampling or triggers explain the current absence. Null does not establish every effective SDK default. |
| Retention | `session_recording_retention_period: 30d` | Existing configured retention, unchanged. Older recordings could expire independently. |
| Received events | Pageviews arrive from production and staging. Replay status/sample/flush properties were absent from the discovered pageview property schema. | Ingestion works for analytics. Recorder loading and snapshot transport remain unproven. Missing diagnostic fields are not proof of a blocked script. |

The present cause is disabled project recording. Historical recording availability, any additional browser/proxy failure after activation, and billing quota exhaustion remain unknown. Do not force-start recording or bypass project controls to diagnose this.

Automatic approval review rejected a one-recording metadata lookup because the response could expose private URLs and interaction details. It was not retried through another route. No recording content was inspected, and this report does not claim that stored recording count is zero.

The current [recording controls documentation](https://posthog.com/docs/session-replay/how-to-control-which-sessions-you-record) confirms that project disabling prevents manual starts too. The [troubleshooting guide](https://posthog.com/docs/session-replay/troubleshooting#check-the-replay-status-on-your-events) describes the SDK status, trigger, sampling and flush signals to use after activation.

## Current state and worthwhile gaps

| Area | Source and received evidence | Priority and scope |
| --- | --- | --- |
| SDK and proxy | Lockfile and received pageviews use `posthog-js 1.376.2`. Provider initializes in an effect, with defaults `2025-05-24`. Static assets and ingestion have separate proxy rewrites. Development calls `opt_out_capturing`. | Keep the integration. Test early-load events, persisted opt-out state, assets and snapshot transport. Set `ui_host` for correct provider links when using the proxy. |
| Navigation | `capture_pageview: true`, `capture_pageleave: true`; no dedicated navigation capture component was found. | P1: verify and explicitly use `history_change` for Next.js soft navigation, avoiding a second manual pageview path. Current docs distinguish SPA history capture from boolean capture. Test back/forward and query-only navigation with URL redaction. |
| Client events | Discovery, lookup, claim, authentication and temporal event contracts exist. Received taxonomy confirms search, lookup and browser claim events. | P1: reconcile contracts against received events. Authentication and temporal events were not in the recent received taxonomy. Determine deployment/usage/transport cause before calling this an instrumentation bug. |
| Server events | Claim outbox uses retries, leases, insert IDs, original timestamps and `claim:<journey UUID>` distinct IDs without person profiles. Claim lifecycle events, `event_intake_run` and `event_sync_apply` are received. | Preserve delivery and privacy boundaries. Verify outbox backlog and environment tags. Join claim conversion by `journey_id`, not browser/server distinct ID. Raw totals across these identities are not user conversion. |
| Identity | No PostHog `identify`, logout `reset`, or group calls found in app source. Recent taxonomy reports no `$identify` in 30 days. | P1 decision: authenticated continuity is absent. Anonymous browser retention is not account retention. Test user A, logout, user B and multiple tabs before shipping identity changes. |
| Environments | Terraform supplies the same project configuration to production/preview and configured staging. Some auth events have `deployment_category`, but it is not globally registered. | P1: add global environment classification and server equivalent. NODE_ENV production does not distinguish production from built previews. Filter test automation and staging explicitly. |
| Community analytics | Live `has_group_types: false`, empty group types. Existing club analytics reads Convex `clubAnalytics`, not PostHog. | P2: preserve operational club analytics. Add an opaque community group only to operator workflow events if community activation/retention is a real reporting need. Clear association on switch; do not assign public visitors to a community group. |
| Funnels and dashboards | Live dashboards include Claim adoption and verification, Authentication session health, and My App Dashboard. Saved insights include claim milestones/outcomes, auth health, generic DAU/WAU and Retention. Dashboard filters are `{}`. | P1: reuse existing assets. Validate individual query filters before reuse. Generic retention is not verified operator retention. The claim SQL counts milestone presence, not necessarily ordered transitions. Label it accordingly. |
| Errors and source maps | Project exception opt-in is null. No explicit exception capture or PostHog source-map upload was found in searched app/CI configuration. `$exception` is not seen in the recent taxonomy. | P2: sanitized browser errors and release-linked source maps, then server capture only where useful. Scrub messages, URLs and stack metadata. A live exception with a resolved original line is acceptance. |
| Performance | Project `capture_performance_opt_in: true`, but web-vitals opt-in is null and `$web_vitals` was not seen in 30 days. Auth latency buckets and a profile media anomaly event exist in source. | P2: enable/test useful vitals explicitly after approval. Add player start success/failure and time-to-first-play buckets with surface/provider/outcome, never stream URLs or tokens. Coordinate with the broadcast owner. |
| Flags | Three live flag definitions match source keys: seed-lookup-beta, temporal-parsing-beta and featured-discovery. The first two target mirrored authorized properties; featured rollout is 0%. | Keep flags as UI rollout controls. Convex remains authorization authority. Record exposure and outcome only for a defined product question. Live filter inspection alone does not prove every flag's active state or evaluation behavior. |
| Experiments and surveys | Live experiments table is empty. Survey settings are null; survey inventory was not verified. | Defer experiments until stable outcomes and enough independent operators exist. Consider one optional post-publication usefulness question later, with approved exact wording and no private free-text default. |

### Received environment diagnostic

A one-off, unfiltered diagnostic over the seven days preceding the November 10 read returned 25 pageviews from `vrdex.net`, three from `staging.vrdex.net`, and one from `www.vrdex.net`. All used SDK `1.376.2` and `$is_identified=false`. This is transport/configuration evidence, not a saved active-user metric or a production-only traffic estimate. Test-account filters were not applied. The last production receipt was November 10 at 13:24 UTC.

## Product questions to measure

1. Can a visitor find a useful event or profile? Measure search submission, result click and the relevant event/link action. Include direct profile/event entries so search is not treated as mandatory.
2. Can an operator claim a profile and publish a usable event? Reuse claim journey milestones, then add authoritative event draft/publish outcomes with bounded failure reasons and an opaque workflow ID.
3. Does the operator return to manage another event? Define weekly return to a meaningful operator action after first successful publication. Do not use pageviews as the activation event. BASIC must choose whether a returning community or returning person is the primary unit.
4. Does the watch experience work? Measure playback attempt, success, failure and startup latency by device class. Keep those changes with the broadcast owner.

Create one focused product dashboard from these definitions after event validation. Do not add generic dashboards merely because templates exist. Treat low-volume results as directional; defer A/B significance claims.

## Replay privacy, cost and performance

Existing input masking, `[data-ph-no-capture]` blocking, Clerk portal selectors and URL/person-property/snapshot URL sanitizers must remain. Route classification tests enforce private layouts. Public content is still captured outside blocked regions. Review embeds, public images, link attributes and dynamic portals using synthetic canary values, including late-mounted content.

Live console capture is enabled and IP anonymization is false. Network payload capture config is null. Recommend explicitly disabling console content and network bodies/headers for the pilot unless an approved diagnostic need exists. Do not assume DOM masking scrubs console output, arbitrary exception messages or network payloads. Review IP/geolocation policy separately. The existing account privacy controls concern profile visibility, not a demonstrated analytics opt-out.

Current [published pricing](https://posthog.com/pricing) includes 5,000 replay recordings, one million analytics events and 100,000 exceptions per month. [Replay pricing](https://posthog.com/session-replay) starts at $0.005 per recording beyond the allowance and reduces with volume. These are published allowances, not this organization's verified entitlement or remaining quota. Billing state and hard limits must be read before activation. Do not extrapolate monthly recordings from sparse pageviews.

Vercel proxy transfer adds cost outside PostHog. Measure transferred bytes and main-thread work on a modest mobile device with replay off/on, including a long timeline and active player. Keep canvas recording and network payload capture off unless separately justified. Replay is not video playback quality measurement. A lower session sample rate reduces volume, but does not eliminate recorder overhead for an included session.

## Implementation scope and acceptance

Work should reach the provider, shared analytics sanitizer/types, auth lifecycle owner, server event envelopes, proxy configuration if testing exposes a defect, Terraform PostHog/Vercel definitions, existing analytics tests, browser fixtures and canonical analytics/deployment docs. Preserve server retries, authorization separation and all redaction tests. Do not modify broadcast or instance/recap behavior in this slice.

1. Read back effective billing limits, environment targets and recorder controls. Record sanitized settings and the exact tested deployment. Use an isolated staging project or an explicitly approved staging configuration; do not enable production during the test.
2. Use synthetic users and fake token/content canaries. Exercise a direct event entry, search, profile, soft navigation, back/forward, sign-in, claim, account settings, handoff, invitation and Clerk portals. Assert exactly one pageview per intended navigation and no query, fragment or bearer token in event/person/replay metadata.
3. Verify private layouts, inputs, dynamic portals and error/console/network exclusions against outgoing payloads. View only synthetic test replay for visual masking acceptance. Existing tests alone do not prove remote recorder behavior.
4. Verify recorder script and `/ingest` snapshot requests, response status and stored synthetic replay availability. Check discovered diagnostic properties and sampling/minimum-duration behavior. If there are failures, distinguish script loading, buffering and flush transport before changing settings.
5. Verify anonymous-to-auth continuity, account switching and logout reset. Ensure a denied or revoked Convex grant still blocks private reads regardless of flag state. Confirm staging/test traffic stays out of production reports.
6. Reconcile one synthetic claim journey across browser and backend using its opaque UUID and insert IDs. Test retry delivery without counting duplicates. Confirm publication outcomes against the authoritative backend, coordinating with its owner.
7. Trigger one sanitized test exception and verify source-map symbolication for the exact release. Verify vitals and player metrics arrive without sensitive properties. Compare mobile load/interaction/player startup and proxy volume with replay off/on.
8. Only after BASIC approves production settings, apply the reproducible change, verify a fresh synthetic production session, and review aggregate capture health/cost after 24 hours and one week. Roll back by disabling recording if privacy or performance acceptance fails.

## Evidence appendix

- Checkout inspected at `d2f2febbafde7c02610f9fe10f93ef303d2c90a0`. Pre-existing untracked work was present; no reset, pull or overwrite was performed.
- Source: `apps/web/src/app/PostHogProvider.tsx`, `apps/web/src/lib/posthog.ts`, `apps/web/next.config.ts`, `pnpm-lock.yaml`, `convex/claimAnalytics.ts`, `convex/claimAnalyticsDelivery.ts`, `infra/terraform/posthog/main.tf`, `infra/terraform/vercel/main.tf`, `tests/web/posthog.test.ts`, `tests/web/session-replay-routes.test.ts`.
- Policy/product: `docs/agentic/product-analytics-and-feature-flags.md`, `docs/planning/product-direction.md`; club analytics source uses Convex queries.
- Live reads through Executor: project/organization identity, event/property schema, saved dashboards/insights, flag filters, experiment inventory, and sanitized event aggregates. Taxonomy snapshot approximately 15:27 UTC November 10. No session contents read.
- Additional official references: [navigation autocapture](https://posthog.com/docs/product-analytics/autocapture), [JavaScript configuration and opt-out](https://posthog.com/docs/libraries/js), [source maps](https://posthog.com/docs/error-tracking/stack-traces), [web vitals](https://posthog.com/docs/web-analytics/web-vitals).
- Not verified: exact production deployment commit/env readback, current organization quota/billing, stored replay count, complete survey inventory, current backend outbox health, live masking, real mobile overhead. No implementation or tests were run for this proposal.
