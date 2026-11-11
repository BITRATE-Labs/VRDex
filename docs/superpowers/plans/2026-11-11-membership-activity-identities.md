# Membership activity identities implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display recognizable people, readable membership actions and actual role context without guessing missing history.

**Architecture:** Enrich the existing authorized paginated activity query from local exact-ID caches and verified profile associations. Preserve a small validated actor/role projection for future provider events. The browser renders the approved Storybook layout using that projection and never fetches provider data per row.

**Tech stack:** Existing TypeScript, Convex, Next.js, Storybook and Node worker. No new dependency.

**Spec:** [Approved design](../specs/2026-11-11-membership-activity-identities-design.md).

## Review brief

Implement membership activity in one coherent PR with two testable stages: evidence/query changes, then the UI. The design preview is the visual reference, not a production data model. Existing historical rows gain names and links where local evidence supports them; missing role/actor history stays missing.

Recommendation: implement directly in this chat, followed by an independent branch review. These stages share one contract, so separate implementation agents would add coordination with little payoff. This is a proposed execution method, not a user selection.

The comparable-screen inventory remains ordered follow-up work. Do not turn this first slice into simultaneous changes to scheduled actions, invitations, staff history or event history. Historical replay, general provider resolution, production writes and deployment are outside this execution plan.

## Global constraints

- Latest known VRChat names in main rows; recorded names remain separate evidence in details.
- Retain current individual-history permissions, verified-event selection and integration/epoch isolation.
- Default 25-row pagination and backend 100-row cap remain unchanged.
- No provider requests from render, hover or the query. No fake public-profile references or broader destination queue.
- Exactly one visible verified person-profile match permits a VRDex link. No display-name matching, arbitrary first match or hidden candidate disclosure.
- Existing action freshness/authority requirements remain unchanged. Labels grant no authority.
- Approved copy is in the spec. New or materially changed public prose returns to BASIC.
- No implicit backfill or destructive schema change. Keep old worker payloads valid during rollout.

## Review focus

- Actor name must never label the affected person, including events with only actor metadata.
- Profile matching must reject ambiguous, overflowed, hidden, suppressed and directory-only candidates.
- Stale/current names must never overwrite event-recorded evidence or imply authority to act.
- Unknown event types and missing role fields must remain readable without fabricated people or roles.
- Permission loss and navigation return must not expose old rows or lose useful list state.

## File reach

| Files | Responsibility |
|---|---|
| `workers/group-telemetry/membership-audit.mjs`, its test | Validate and project event-specific target, actor and role evidence. |
| `convex/schema.ts`, `convex/clubMembership.ts` | Optional stored evidence, duplicate handling, authorized paginated output. |
| `convex/http.ts:298` | Existing `membership_scan_page` dispatch; verify the extended payload still reaches the validator. |
| New `convex/_membershipActivityIdentity.ts` | Small local exact-ID name/profile projection, using existing normalization and verification helpers. |
| `tests/backend/club-membership.test.ts`, existing connection-verification fixtures | Query scope, evidence and matching regression coverage. |
| `apps/web/src/app/account/communities/[slug]/club-membership.tsx` | Production row renderer, labels, links and inline details. |
| `apps/web/src/components/club-membership.stories.tsx`, `club-membership-design.stories.tsx` | Real-component fixtures and approved design reference. |
| `apps/web/e2e/club-membership.storybook.spec.ts` | Visual and keyboard/link assertions for the finished component. |
| `docs/deployment/group-telemetry-collector.md`, affected analytics docs | Document projected evidence, coverage limitations and worker compatibility. |

## Task 1: Preserve evidence and project local identities

Consumes `normalizeMembershipAuditPage(items, { groupId, startAt, endAt })`, the existing ingest mutation and `listActivity` query. Keep those entry points.

Produces optional validated actor ID/name and role ID/name evidence on events. Preserve generic target type/ID where the pinned event contract requires it. In the query, add `targetIdentity` and optional `actorIdentity` objects with display name, source, observation time, validated VRChat URL and optional eligible VRDex URL. Keep recorded-name evidence separate. Derive frontend types from the query rather than maintaining another independent contract.

The new local helper takes `(ctx: QueryCtx, ids: readonly string[])`, deduplicates normalized IDs and returns a map of those identity projections. It performs no writes or provider calls. Use existing connection-verification and visibility rules. Cap profile candidates at 20 plus one overflow sentinel per identity; any overflow returns no VRDex match.

- [ ] Establish assignment/unassignment role-field semantics against pinned community schema or separately authorized sanitized fixtures. Record the exact source. Do not invent provider keys. If role names are not supplied, retain the validated role ID and show the approved unavailable fallback unless an authorized existing role observation can name it.
- [ ] Extend worker fixture tests first. Assert that actor-only name evidence never becomes target-name evidence; assignment/unassignment produce the correct role fields; malformed optional metadata and future events preserve valid core audit evidence. Keep foreign-group and half-open-window checks.
- [ ] Run `node --test workers/group-telemetry/membership-audit.test.mjs` and confirm the new assertions fail before the change, then pass after the minimal projection change.
- [ ] Add optional schema/validator fields and preserve existing immutable conflicts. Duplicate audit IDs must not replace recorded evidence with current names. Old-format payloads still ingest. Add backend fixtures for duplicate events with absent versus conflicting optional evidence and explicitly choose preserve-first behavior, with no automatic enrichment on replay.
- [ ] Add local identity projection tests for repeated IDs, exact cache-key hits, absent/stale cache entries, actor/target separation, unique verified visible matches and ambiguous/overflow/hidden/suppressed/directory-only/revoked matches. Use existing historical display-proof semantics; do not turn stale display proof into action authority.
- [ ] Add the projection after existing `listActivity` authorization and pagination. Query only authorized local data. Do not reuse other subjects' temporary member/role read results. Verify existing public movement reads cannot return named details and that denied individual-history and wrong-epoch fixtures remain denied or absent.
- [ ] Run `node --conditions=import --import tsx --test tests/backend/club-membership.test.ts tests/backend/profile-connection-verification.test.ts tests/backend/automatic-group-statistics.test.ts`. Expected: all applicable assertions pass.
- [ ] Update affected collector/analytics documentation with the exact retained fields and historical limits, then checkpoint the evidence/query change.

## Task 2: Render the approved activity design

Consumes the enriched return type of `api.clubMembership.listActivity`. Produces the existing `MembershipActivityView` and `ClubMembershipActivity` interfaces updated for that return shape. Reuse Card, Notice, Button and local timestamps. If another consumer is later added, extract a small person-link renderer then; do not build a general identity component system now.

- [ ] Extend the existing Storybook fixtures with named role assignment/removal, missing actor, absent role metadata, unknown user, no/multiple VRDex matches, renamed roles, future event types and long names. Replace disabled mock links with tested fixture destinations in the real-component story. Keep the separate design mock clearly labeled or remove it once the real story replaces it.
- [ ] Add focused UI assertions: readable role labels rather than raw event types, target and actor remain distinct, missing metadata uses approved fallback, only eligible VRDex links render, and original IDs/types stay in details.
- [ ] Implement links, inline details and row layout matching the approved preview. VRChat uses validated IDs and opens externally; VRDex uses the canonical eligible profile slug. Add keyboard-visible focus and descriptive external-link names. No nested clickable rows.
- [ ] Preserve loaded rows during pagination or recoverable errors, add the approved Retry behavior, and verify permission loss clears both rows and open details. Use the existing workspace access/error conventions instead of inventing a separate authentication flow.
- [ ] Exercise direct analytics entry, existing sign-in return, range/day selection, pagination, VRDex navigation/back and VRChat new-tab return. Preserve range and loaded pages; add only the minimum existing route/state mechanism needed if current restoration fails.
- [ ] Run the focused membership Storybook visual test with `pnpm --filter web exec playwright test --config playwright.storybook.config.mjs club-membership.storybook.spec.ts`. Inspect desktop/mobile screenshots with VLM review and test keyboard details expansion. Expected: no clipping, readable names/roles and working intended interactions.
- [ ] Run relevant web/backend lint and type checks using repository scripts. Apply `ci:browsers` and `ci:visuals` before the PR run. Check docs drift, review the full branch, and follow exact-current-head feedback/check requirements before declaring readiness.

## Completion and rollout

Implementation completion means the approved component is backed by tested projections, with terminal acceptable PR checks and handled feedback at the pushed head. It does not mean deployed or live accepted. Collector release/deployment approval remains separate, especially where merge may trigger an automatic release. Report historical coverage honestly and keep general resolution/replay deferred.
