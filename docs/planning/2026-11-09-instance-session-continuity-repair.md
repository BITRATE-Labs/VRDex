# Historical repair for fragmented instance sessions

## Proposed outcome

**Current recommendation:** consolidate only the seven reviewed BITRATE fragments into one historical instance, while preserving their observations and old detail links. Fixing ingestion prevents future fragmentation but leaves these existing rows unchanged.

**Locked decision:** BASIC authorized the forward fix, regression coverage and this repair plan on November 9, 2026. Production repair execution remains unapproved. The forward fix is merged and deployed through [PR #442](https://github.com/BITRATE-Labs/VRDex/pull/442). No repair mutation is included in that fix or this proposal.

The November 9 read-only inventory contains 523 instance observations across the seven fragments: 299 already belong to the earliest session and 224 would change ownership. It also contains 564 community observations, no event associations, no relevant recap jobs across all five community events and no active same-location session. A fresh post-deployment snapshot confirms these facts and has the same historical fingerprint as the pre-deployment inventory. Refresh it again immediately before any eventual execution.

The user should see one Recent instances row and one complete detail history. Missing observations remain gaps. The final end time should display Unknown unless new evidence establishes a genuine closure.

**Current recommendation, revised after inventory:** perform one guarded atomic repair for this exact scope rather than staging partial writes. The measured inventory is small enough to rehearse as a single transaction. Reject changed or oversized inventories before writing; do not silently split the operation. This replaces the earlier staged-job proposal and avoids exposing a partially consolidated history.

The main judgment is whether to approve a narrow consolidation with retained aliases. It costs a small schema/read-path change in the later repair implementation, but preserves existing session links and provides an audit trail. Deleting six rows would be simpler initially, but would break those links and discard the original session records. Broad grouping by locator is rejected because a genuine close and later reuse must remain separate.

## Confirmed scope and uncertainty

The November 9 investigation identified seven sessions with identical full provider location, integration, connection epoch and world. They span November 7 at 8:14 PM through November 8 at 10:03 PM, America/Indianapolis. Six internal gaps last about 12 to 14 minutes. Every inferred closure falls exactly on the second successful zero-instance poll. No event-instance associations existed on those seven rows at inspection time.

BASIC reports one lobby open roughly 27 hours. The retained aggregate records establish repeated inferred closures, not physical uninterrupted occupancy. Raw historical provider responses and exact collector release identities were not recovered. The final physical closure time is unknown. Consolidation must not fabricate occupancy, replace zero-count community observations, or create an event association merely because this lobby overlapped a BITRATE event.

Keep exact production IDs and row exports in a private execution manifest. Do not widen this inventory to other communities or matching locators without another review.

## Forward fix and repair order

1. Completed: ship and verify the ingestion correction through the normal release process. PR #442 passed its post-window audit and production deployment; regression coverage preserves explicit closure and confirmed close/reopen.
2. Implement alias-aware readers and an atomic apply/rollback mutation, then test them against an isolated copy of the seven fragments. The current preparation tools are read-only and cannot execute the repair.
3. Refresh production evidence and produce an exact manifest, before/after preview, rollback package and validation results.
4. Obtain BASIC's approval for that concrete repair. Execute only the approved manifest, then verify the signed-in list and detail views.

These are separate release and data-operation steps. This document authorizes none of them beyond the already requested forward implementation and repair preparation.

## Proposed repair implementation

### 1. Build a read-only manifest and preview

Add dedicated session-repair tooling rather than repurposing `communityTelemetryRepair`, whose current inventory and targets repair hour, day and event calculations, not session identities.

The manifest pins the deployment, integration, epoch, canonical session ID, six source session IDs, exact expected row fields, per-session observation counts and content hashes, association inventory, and affected recap jobs. Use the earliest session as canonical. Record original session rows and original observation-to-session assignments in the rollback package.

Read observations by `by_sessionId_observedAt` in pages of at most 100. Complete every page before declaring the inventory complete. Reject missing rows, duplicate observation idempotency keys, overlapping fragment intervals, different identities/epochs, explicit closure evidence between fragments, alias chains, changed associations or an incomplete page traversal. New evidence of genuine closure blocks consolidation for human review.

The preview must show one proposed canonical session, six retained aliases, unchanged observation identities/counts/populations, unchanged community totals and coverage, and the exact dependent records needing updates. Set the canonical first/last observation from the actual data. Clear inferred closure and keep state open with stale freshness, so it reads Unknown rather than Still open. Do not carry forward the final inferred close as a confirmed end.

### 2. Preserve old links and publish atomically

**Candidate direction:** add optional `mergedIntoSessionId` to `instanceSessions`, populated only by the reviewed repair. The six original rows remain as aliases with their original fields intact. Reads resolve at most one alias hop after the same community, integration, epoch and category checks used for ordinary sessions. Reject cycles and cross-scope aliases. Normal ingestion continues to match only canonical sessions.

Prepare one internal apply mutation bound to the approved manifest ID and fingerprint. Re-read the seven sessions, all observation ownership and dependent records inside that transaction, then reject any mismatch before writing. Move only the 224 listed observation owners to the canonical ID, patch the canonical session, retain six aliases and write the rollback receipt in the same transaction. Observation IDs and immutable values remain unchanged. A duplicate apply returns the existing receipt without repeating writes. A previously rolled-back manifest must not silently reapply.

The mutation must validate actual transaction headroom, including rollback receipt size, before writing. Keep indexed reads bounded and reject overflow. A failure or conflict leaves the old view intact through transaction rollback. Canonical detail/summary queries must consume the full approved observation set without duplicating samples or bridging gaps. See [Convex transaction limits](https://docs.convex.dev/production/state/limits#transactions).

Exclude aliases from history and live results. Continue bounded pagination through pages containing only aliases, including Home's three-row compact list. Old direct session links resolve to the canonical detail view. Preserve permissions, connection boundaries and explicit-close behavior. Do not expose private repair metadata through public projections.

Test the actual apply and rollback mutations before requesting execution approval. The read-only preparation snapshot, offline preview and its tests are review evidence, not an implemented repair. Do not begin production execution until alias support, the mutation, a fresh manifest and rollback behavior are reviewable.

### 3. Reconcile dependent calculations

Refresh `eventInstanceAssociations` and `communityTelemetryEventRecapJobs.pendingSessions` inventory immediately before repair. If associations have appeared since the investigation, stop for review rather than silently reassigning or confirming them. Cancel or finish affected recap jobs before canonical activation, then restart only the reviewed jobs from retained observations.

Community hour/day rollups derive from `communityPopulationObservations`. Identity consolidation alone must leave those inputs and numerical outputs unchanged, so do not blanket-recompute them. Use the existing calculation-repair preview only if a separately identified calculation change requires it. Per-instance summary reads must include all seven fragments' actual observations. Event recaps are recomputed only for explicitly confirmed affected associations.

## Verification required before approval

| Check | Required result |
| --- | --- |
| Seven-fragment fixture and exact captured gaps | One canonical history row and complete observations |
| Old session links | All seven IDs open the same authorized detail |
| Three newest rows are aliases | Compact list still reaches the canonical row |
| Missing observations | No invented counts, interpolation or closure |
| Explicit close followed by active reuse | Separate sessions; manifest rejected |
| Different world, locator, integration or epoch | Manifest rejected |
| Changed rows/associations after preview | Execution stops before activation |
| More than 100 observations | Complete bounded reads, one atomic write transaction |
| Error or conflict before commit | Original read view unchanged |
| Duplicate apply or replay after rollback | No duplicate writes or silent reapplication |
| Rollback after activation | Original list/detail view and assignments restored |
| Staff without category access and public readers | Existing access boundaries preserved |

Run backend lifecycle/repair/analytics tests and typechecking. Use actual-component browser coverage for compact-list pagination and alias navigation. Capture signed-in desktop/mobile evidence after the approved repair. A completed migration cursor alone is not acceptance.

## Rollback and stop conditions

Keep all seven original session rows and immutable observation values. Rollback restores the original session fields and all 224 ownership assignments in one guarded transaction using the approved manifest. It must verify the recorded post-repair fingerprint first. Any subsequent ingestion, association change or changed repaired field blocks automatic rollback for review. Observation values and community aggregates stay unchanged.

Stop if the deployment or epoch differs, the source rows changed, another repair owns the same sessions, observation counts/hashes differ, dependencies changed, or a provider-confirmed closure contradicts the proposed continuity. Never bypass a stop with a wider inventory or inferred count replacement. Inspect new ingestion against this historical locator before activation; a newly created session since the snapshot requires a fresh preview.

## Evidence and delivery reference

- Investigation: November 9, 2026, chat `01a1c048-3a6c-7cd3-b7ea-597018d107d3`. Private captured evidence includes seven session rows and indexed boundary polls; an assert-based consistency check passed.
- Release: `9bd54c30753f46405e7ab6b84f098974218b5e02`, [main release run 42625754434](https://github.com/BITRATE-Labs/VRDex/actions/runs/42625754434). Production Convex function deployment and live Vercel commit were independently verified; historical snapshot unchanged afterward.
- Source baseline: `f6f342a864282100071da2b341eca5dea23fd2e7`.
- Preparation evidence: the private inventory contains 523 instance observations and 564 community observations. The offline preview preserves all values and records 224 ownership changes plus six retained aliases; its four tests pass. Neither alias-aware readers nor apply/rollback mutations are implemented by this document.
- Forward implementation: `convex/communityTelemetry.ts` removes miss-based closure and the scan of all open sessions. `tests/backend/community-telemetry.test.ts` covers 27-hour continuity, stale/recovered liveness, one-row history and explicit-close reuse.
- Existing calculation workflow: [Statistics calculation repair](../deployment/group-telemetry-collector.md#statistics-calculation-repair).
- Owning behavior: [Community group telemetry](../backend/community-group-telemetry.md#observation-model).
