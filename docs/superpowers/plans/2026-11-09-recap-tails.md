# Automatic recap tails implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically include observed instance tails in recaps with an optional operator cutoff.

**Architecture:** One bounded shared recap-window resolver determines effective boundaries. Existing recap jobs, readers and edit UI consume that rule and preserve published scheduling.

**Tech Stack:** Convex, TypeScript, React, Next.js, existing tests and Storybook.

**Spec:** ../specs/2026-11-09-recap-tails.md, approved in chat November 9.

## Global constraints

- Preserve raw observations, public schedule, privacy and current connection boundaries.
- Existing event-management permission and event_recaps visibility control edits. No public API event mutation bypass.
- Preserve interpolation, gap handling and exclusive-end sample inclusion; reject unsupported ranges.
- No population-definition changes, queue capture, closure markers, production migrations or blanket historical recomputation in this PR.
- Use existing concise utility labels. No new explanatory product prose. No em dashes.

## Review focus

- A cutoff edited while a continuation is queued must prevent stale publication.
- Multiple instances need correct timestamp aggregation and canonical alias deduplication.
- Missing observations after a manual cutoff retain unknown coverage rather than extrapolation.
- Legacy events without end and extreme or invalid ranges fail consistently.
- A viewer must never mutate cutoff through a UI or direct backend call.

## Task 1: Deliver the complete recap slice

**Files:** convex/schema.ts; convex/communityTelemetry.ts; convex/clubAnalytics.ts; a small shared helper if justified; convex/_generated/api.d.ts if needed; apps/web/src/app/account/communities/[slug]/club-analytics.tsx; existing story fixtures; tests/backend/community-telemetry*.test.ts or a dedicated recap test; targeted Storybook browser test; docs/backend/community-group-telemetry.md.

**Interfaces:** Optional recap end override separate from event.endAt; existing recap query exposes effective end and override/mode needed by editor. Mutation validates permission, scope and end range, updates override and schedules recalculation. The shared resolver must support stale continuation detection and bounded association/session reads. Preserve stable rollup identity across calculation version changes.

- [x] Write failing regressions for automatic tails, set/clear override, aliases/overlap, absent scheduled end, post-closure observations, gaps, invalid ranges, permissions and stale continuations.
- [x] Run the failing tests, then implement the smallest cohesive backend change, including scheduler refresh behavior and schema/API callers.
- [x] Add inline Recap end editor using existing date/time primitives and local-time behavior. Show effective range; preserve view-only access. Cover save, clear to Automatic and failure state without new explanatory prose.
- [x] Run focused backend tests, typechecks, script contracts if affected and local Convex bootstrap. Add/execute desktop/mobile visual assertions respecting PLAYWRIGHT_CAPTURE_SCREENSHOTS.
- [x] Update public developer docs and approved spec traceability without private IDs or machine-specific links. Self-review, commit, and report evidence. Do not push, merge, deploy or change production data; coordinator handles PR delivery and review.

## Coordinator follow-up

- [ ] Complete independent review and PR delivery, including CI selection.
- [ ] Inventory recaps affected by the existing recent-event cron and continuing attached observations before any separately authorized rollout.
