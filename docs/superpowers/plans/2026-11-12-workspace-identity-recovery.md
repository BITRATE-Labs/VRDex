# Workspace identity recovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Review each task and the complete branch.

**Goal:** Ship the approved people-first workspace controls, private bounded automatic name resolution, activity filters and owner-controlled historical evidence recovery.

**Architecture:** Keep operational target IDs and authorization unchanged. A private integration/epoch-scoped people module admits exact authorized source records, resolves names through the existing collector budgets and supplies read-only identity projections. Frontend views use one consistent profile-link/plain-name, VRChat and Details pattern. Historical role evidence is additive and provenance-labelled.

**Tech stack:** Existing Next.js, TypeScript, Convex, React, Storybook, Playwright and group-telemetry worker. No new dependencies or services.

**Spec:** [approved design](../specs/2026-11-12-membership-activity-recovery-design.md). BASIC approved implementation, independent review, PR creation and iteration until merge-ready on November 12, 2026. Merge and production deployment are outside this task.

## Global constraints

- Main names only link to a unique eligible visible verified VRDex profile, otherwise plain text. Every row has a separate Details control. VRChat controls have at least a 40-pixel target. Preserve Unicode isolation and accessible-name sanitation.
- Names never change selected target IDs, roles, action payloads, review mappings, revisions, permissions or execution states. Show full exact IDs in consequential confirmations.
- At most 100 targets in one invitation review, one active grant per actor/integration, 15-minute expiry. Existing invitation preview is not an eligibility token; add permission-checked lookup admission.
- Claim at most ten enrichment jobs; maximum two enrichment GETs/minute/account, subordinate to existing total budgets and higher-priority work. Success refresh after 24 hours on renewed interest, negative cache at least 24 hours, transient backoff and Retry-After respected.
- Retention follows the source-reference table in the spec. No public references or profiles created for private name lookup. Replaced epochs and lost authority stop requests and reject stale results.
- Historical recovery is owner-initiated, last 30 days, at most 10,000 entries, resumable/stoppable, exact audit matching and additive evidence. Role observations refresh at most every six hours when needed.
- Provider reads for the bounded checkpoint only; no live role/profile/membership changes. If unavailable, record that limit and keep provider recovery release-gated rather than inventing acceptance.
- Additive schema and response compatibility; backend/worker before clients at rollout. No production rollout in this task.
- Exact copy in approved design/previews is authorized; avoid new explanatory product prose. CI labels `ci:browsers` and `ci:visuals` before PR checks.

## Review focus

1. A name update during invitation confirmation must not replace the reviewed target or count.
2. Foreign source IDs, stale review grants, role/session loss and epoch replacement must not expose names or spend provider requests.
3. Multiple viewers, restored pages and worker replicas must not multiply jobs or evade shared budgets/cooldowns.
4. Retained names must remain useful during transient failure but disappear with their final source reference and cleanup deadline.
5. Filtered cursors, historical mismatches and uncertain operational outcomes must not duplicate, rewrite or misrepresent evidence.

## Task 1: private people admission, projection and collector resolution

**Files:** Create `convex/clubPeople.ts`, `convex/_clubPeople.ts`, `workers/group-telemetry/people-jobs.mjs`, corresponding backend/worker tests. Modify `convex/schema.ts`, `convex/http.ts`, `convex/crons.ts`, `convex/_generated/api.d.ts`, `convex/clubMembership.ts`, `workers/group-telemetry/worker.mjs` and the existing collector control-plane hint/cleanup paths as necessary. Reuse `_membershipActivityIdentity.ts` for visible profile matching, keeping its bounded/fail-closed behavior.

**Interfaces:** `clubPeople.requestView({communityProfileId,source}) -> {viewId,expiresAt}`; `clubPeople.readView({viewId}) -> {people,pendingCount,expiresAt}`. Sources are discriminated activity audit IDs, invitation review targets/destination, stored invitation batch, scheduled operation IDs, and exact `clubProviderReadRequests` member/request result. Derive canonical IDs from source records, except explicitly entered invitation targets admitted by its new permission-checked grant. Freeze/export the precise source validator in `_clubPeople.ts` and document it in the task report before frontend work begins.

Worker transport operations are `people_claim`, `people_result`, `people_release`, scoped to the authenticated account and exact current integration/epoch authority. Preserve existing worker fencing and budget rules. Store minimal ID/name/time/retry fields, not entire provider responses. Extend name projection with private observations and source/status fields; keep current public response fields compatible.

- [ ] Write failing backend tests for source permissions, grant replacement/expiry, exact ID matching, hidden/ambiguous profiles, stale-name fallback, negative caching, reference cleanup and epoch fencing. Tests must cover every source type.
- [ ] Write failing worker tests for name-only exact-user reads, per-request reservation, two/minute shared budget, priority, 429/auth behavior, restart/release and no artwork fetch.
- [ ] Implement the module, additive indexed tables, bounded sweeper and worker transport. Newly verified membership evidence admits work automatically; viewed sources admit only their actual targets. Pending work must influence normal worker scheduling so it does not wait indefinitely for unrelated collection.
- [ ] Run focused tests, backend typecheck and worker suite. Synchronize generated API declarations through the existing local codegen workflow. Commit and hand off exact API/types, test evidence and remaining limits.
- [ ] Independent task review and fixes before consuming the contract.

## Task 2: real invitations, scheduled actions and shared identity controls

**Files:** Create `apps/web/src/app/account/communities/[slug]/club-person.tsx` for the shared name/provider-control presentation and people-view hook. Modify `club-invitation-batches.tsx`, `club-scheduled.tsx`, `club-members.tsx`, `club-membership.tsx`, relevant production Storybook stories and `apps/web/e2e/` checks. Keep throwaway design stories as labelled references.

**Interfaces:** Consume Task 1's generated `requestView`/`readView` contract. Existing invitation/schedule/member mutations and their IDs/revisions remain authoritative. The shared presentation uses schema-derived people identities, plain fallbacks and one VRChat control, never person-name accordion behavior.

- [ ] Add failing browser checks for consistent name/Details targets, 40-pixel VRChat controls, name-first invitation/schedule rows, exact IDs in review/cancellation, actor profile links and non-person actions.
- [ ] Implement invitation review lookup grants and outcomes projection. Keep selection keyed by immutable IDs, current reviewed/effective ID distinctions, selected count and existing validation.
- [ ] Implement scheduled list, edit and cancellation identity presentation with viewer-local times, existing authoring timezone and revision/permission checks. No resend behavior for uncertain outcomes.
- [ ] Apply shared presentation to membership activity, members/requests and confirmation surfaces. Keep existing management actions explicit and separate from profile navigation. Add one truthful list-level pending-name status.
- [ ] Exercise real hooks with synthetic transport on desktop/mobile, including delayed name updates during confirmation, access loss, stale grants and long/directional names. Run focused lint and web typecheck. Commit and review the task diff.

## Task 3: activity filters, role observations and historical repair

**Files:** Modify `convex/clubMembership.ts`, `convex/schema.ts`, worker audit/collection/provider control paths, `club-membership.tsx` and analytics range/auth-return wiring. Create focused recovery helper/module and tests if needed rather than expanding unrelated modules.

**Interfaces:** Extend `listActivity` with optional exact `targetUserId` and event-kind filters applied before indexed pagination. Add `requestRecovery`, `stopRecovery`, recovery status and fenced worker claim/page/complete operations. Supplemental evidence keys use integration/epoch/audit ID with immutable core comparison; roles are observed by exact role ID with source/time.

- [ ] Add failing tests for server-side filters across pages and restored URL/auth return; empty scopes and persistent cursor recovery remain bounded.
- [ ] Implement role-name observations and additive projections, preserving recorded role-name priority and honest current-name provenance. Preserve last-known names after role deletion.
- [ ] Add failing tests for owner-only repair, durable checkpoints, stop/resume/idempotence, 30-day/10,000-entry bounds, provider budget, mismatched audit evidence, epoch/authority loss and no immutable rewrites.
- [ ] Implement the owner repair control/status and worker transport using exact current scope. Add a bounded read-only provider checkpoint tool or reuse the canonical existing route; document actual acceptance separately from fixtures and rollout.
- [ ] Run focused backend/worker/browser tests and both typechecks, update operational documentation, commit and review the task diff.

## Task 4: whole-branch verification, independent review and PR delivery

- [ ] Compare every approved requirement to production code, tests and current docs, including source cleanup and all related screens. Record any ruled implementation details in the local ledger.
- [ ] Run selected backend, worker, frontend and browser suites plus typechecks/lint/docs. Capture desktop/mobile screenshots and inspect the actual production components, not just throwaway mocks.
- [ ] Dispatch a fresh whole-branch independent review on the exact diff. Fix valid findings with failing-then-passing regression evidence and rerun affected checks.
- [ ] Open one PR with `ci:browsers` and `ci:visuals`, approved-copy provenance, meaningful verification and explicit provider/rollout limits. Do not merge or deploy.
- [ ] Iterate all valid PR feedback. Before each follow-up push, reply to and resolve handled threads. After the final pushed head's checks finish, refresh comments, sticky summaries, inline threads, formal reviews and mergeability. Stop only at clean merge-ready state, with the PR URL in the final handoff.
