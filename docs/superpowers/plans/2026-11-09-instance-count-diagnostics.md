# Instance count diagnostics implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans for this plan.

**Goal:** Retain paired aggregate count fields and give BASIC a live queue UX prototype.

**Architecture:** Add optional diagnostic fields through the existing single-poll pipeline. Keep an isolated Storybook prototype independent from production account screens.

**Tech Stack:** TypeScript, Convex, existing Node worker, React, Recharts and Storybook.

**Spec:** ../specs/2026-11-09-instance-count-diagnostics.md

## Global constraints

No new requests, player identities, public diagnostics, population correction, fabricated historical fields or production deployment. Preserve older workers and records. Prototype uses labelled sample data only.

## Task 1: Retain paired count evidence

Files: workers/group-telemetry/vrchat-client.mjs and its snapshot tests; convex/communityTelemetry.ts, schema.ts, clubAnalytics.ts; appropriate worker-route/backend tests; docs/backend/community-group-telemetry.md.

- [x] Trace every ingestion and series projection caller. Write failing tests for independent counts, missing/null/zero, malformed/bounded platforms, conflicting values, private permissions and old observations/workers.
- [x] Implement optional userCount, queueSize, platforms without modifying population. Bound and validate both worker and backend trust boundaries. Confirm the HTTP control route forwards fields through its existing instance payload.
- [x] Expose optional fields only in authorized instance-series reads. Keep population summaries and public projections unchanged.
- [x] Run focused worker/backend tests, typechecks and local Convex compile. Update backend-first rollout docs. Report exact files, tests and limitations. Do not commit until coordinator coordinates with prototype work; no push/deploy.

## Task 2: Live UX preview

Files: new isolated instance-population chart component, dedicated Storybook stories and a targeted desktop/mobile browser test. Do not edit production club chart or account route.

- [x] Build a small working prototype using existing primitives/library. Solid Population, Windows and Android lines and a dashed Queue on one axis, exact table, diagnostic disclosure, measured-zero versus unknown and automatic confirmed closure marker. Show Queue automatically when a sample is positive, with no visibility toggle.
- [x] Add labelled sample cases and do a desktop/mobile visual pass with no overflow. Respect screenshot selection contract; do not create backend writes.
- [x] Start/reuse Storybook on a task-specific local port, open the exact preview in the built-in browser and keep it available for BASIC. Record URL, fixture limits and remaining design decisions.

## Review focus

Malformed optional data must not be stored; missing fields never become zero. Diagnostic access must not widen. Queue is not stacked or added to population. Chart gaps and unknown closure must remain explicit. Backend-first rollout prevents new worker payloads hitting old validators. Prototype and capture commits must remain separate and reviewable.
