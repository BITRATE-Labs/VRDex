# Contributor collection checkpoint

## Local evidence, 2026-09-14

Current policy: [simple contribution permissions](../superpowers/specs/2026-11-11-simple-contribution-policy-design.md).
The `roles-v1` ordinary/trusted/superadmin limits apply in every environment.
Temporary allowance and capacity-request workflows are removed. Tests use the
same policy with role fixtures and controlled time, without a synthetic identity
allowlist. Ordinary contributors retain six creations per rolling day and three
open proposals; trusted roles receive 1,000 of each. Superadmins retain shared
operational safeguards while contributor quotas are inapplicable.

The measurements below are historical local evidence from September 14, 2026,
not hosted throughput guarantees. The reproduction script now uses standing roles.

Run the local workflow with PowerShell:

```powershell
$env:TSX_TSCONFIG_PATH = 'apps/web/tsconfig.json'
node --import tsx scripts/prove-contributor-collection-local.ts
node --conditions=import --import tsx --test tests/backend/contribution-capacity-load.test.ts
```

The workflow committed 30 profile/link items and 20 actual decoded PNG proposals
(10 URL, 10 local), then completed 14 independent approvals, one rejection and 5 separately
granted trusted publications. It replayed an admission after a simulated lost
response, verified its in-progress status, and refused a changed declaration
before transfer. Its injected object map retained 80 objects. A
stored WebP candidate was decoded and visually inspected. This is real local
command and image-validation evidence with simulated storage, not S3, browser
authentication, or installed-client rendering evidence.

The load test admitted and completed 1,100 proposals across two actors and 110
targets, reached 1,000 open proposals for one actor, and refused the next proposal.
All transactions fit a configured 2,000,000-byte read budget. On the initial local
run, elapsed time was 31.82 seconds; admission p50 was 21.99 ms, p95 47.96 ms and
maximum 164.29 ms. The first actor retained 1,324,000 bytes and zero processing
reservations. These are `convex-test` timings with a simulated clock, not hosted
latency, concurrency throughput, or billed database-read measurements. Concurrent
finalization, downgrade, revocation and interrupted deletion have separate tests.

## Capacity and operational interfaces

`vrdex_contribution_capacity` returns policy version, grants-derived tier, scopes,
feature availability, limits, usage, remaining capacity and rolling retry time.
It explicitly reports `reservation: false`. Backlog/byte saturation has no invented
retry time. `vrdex_contribution_status` supports cursor, state, batch and exact
operation receipt lookup. A filtered page can be empty with more pages available.
Temporary capacity requests and per-batch allowance decisions are no longer
part of the workflow. Existing history is retained without granting capacity.

Retained batch envelopes have a separate quota, including empty, archived and
legacy batches. The bound is 1,000 for ordinary actors and 10,000 for
trusted and superadmin actors, matching the active-row policy scale. Current trust
determines admission. Archiving does not release this quota, and an existing
caller key still replays at or above the bound. `BATCH_ENVELOPE_LIMIT` refuses
new keys without deleting audit or receipt rows. No counter backfill is needed.
Admission and capacity discovery paginate at most the current limit plus one
indexed batch rows with an 8 MiB byte budget. A final document may cross that
budget; its 1 MiB document ceiling leaves headroom under the transaction limit.
`usage.retainedBatchesIsLowerBound` marks any incomplete count. If the page ends
before proving a count below quota, `BATCH_ENVELOPE_COUNT_INCOMPLETE` refuses new
keys. Existing keys still replay. Operators can inspect oversized legacy cleanup
metadata and sum every `reconcilePage(kind: "batches")` page for the exact count;
reconciliation also uses the byte budget and at most 40 rows per page. Exact
reconciliation alone does not override admission or delete retained records.
Batch reconciliation counts active rows only in non-archived batches. Revision
reconciliation excludes rows whose private payload has expired.

The active trusted-contributor, media-reviewer, and trusted-publisher roles select
the same contribution capacity. Editing and publication checks remain separate.
Superadmins may explicitly publish validated media on public unclaimed targets.
Admission follows current roles; expiry permits admitted work to finish, while
revocation without another qualifying role blocks finalization. Intake pause,
source policy, target processing, and deployment budgets remain enforced.

New local and legacy URL intake share creation limits and the reservation ledger.
Admission quota refusals are terminal receipts; an in-progress attempt remains
distinct. Fresh delegation is checked before replay. Bytes include source,
quarantine and derivatives, and are released only after confirmed deletion.
Published objects transfer to a separate published-storage counter. Deployment
byte admission includes that counter. Held objects remain charged.

Fresh admission refusals are limited to 256 retained receipts per actor across
OAuth clients. Existing receipt replay and successful upload admission remain
available at the limit. A further fresh refusal returns
`UPLOAD_REFUSAL_RECEIPT_LIMIT` with no durable operation ID or receipt; it is
not a status-queryable command outcome. The indexed count reads at most 256
rows and 8 MiB; an incomplete read fails closed. Historical receipts remain
retained. Expired source-host minute counters are removed in bounded scheduled
pages, with continuation for a full page. Historical requests remain available as inert audit records; they no longer
change admission or capacity.

`contributionOperations.inventory` is an internal super-admin paginated query
(at most 40 reservations) returning object-key inventory, page totals, pending
age, cleanup lag, reviewed count in the past day, failed reserved bytes and an
explicit query-read count. Sum every page, take minima for oldest timestamps,
and deduplicate keys before reconciling with storage. Page results are not global
totals. Failed reserved bytes are a cost input, not a billed-cost claim. Hosted
read billing, derivative amplification, reviewer throughput and cleanup latency
still require measurement against the approved deployment and storage inventory.

## Checked-in configuration

All variables below are Convex deployment-scoped, owned by the self-hosting
operator; BASIC approves changes on BASIC's deployments. Recreate them from this
table and `convex/_contributionPolicy.ts`; never put secret values in git.

| Name | Default | Meaning |
| --- | --- | --- |
| `VRDEX_CONTRIBUTION_BATCHES_ENABLED` | false | Bulk collection intake switch |
| `VRDEX_CONTRIBUTION_INTAKE_PAUSED` | false | Stops new intake and finalization, preserves reads and decisions |
| `VRDEX_CONTRIBUTION_DEPLOYMENT_BYTES` | 100 GiB | Proposed unmeasured deployment storage bound |
| `VRDEX_CONTRIBUTION_DEPLOYMENT_CONCURRENCY` | 16 | Proposed unmeasured import bound |
| `VRDEX_CONTRIBUTION_HOST_FETCHES_PER_MINUTE` | 30 | Proposed unmeasured initial source-host fetch bound |

These shared bounds apply in every environment and to every role. Global values
are conservative operator choices requiring measurement, not
universal safe production values. Existing upload, cleanup-readiness, storage,
OAuth and publication switches remain required. Source-host admission counts
initial fetch requests; SSRF/redirect restrictions remain in the fetch adapter.

## Rollout, reconciliation and rollback

1. Deploy additive readers/indexes first with intake disabled. Old records omit
   new ledger and publication fields; readers tolerate them and do not invent
   historical reviewer attribution.
2. Keep intake paused while running `contributionOperations.backfill` in cursor
   pages of 40, then `backfillSubmissions`, then `backfillArchivedPayloads`, each
   from a null cursor until its `isDone` result. These internal mutations never
   enable policy or issue grants. Inspect every unresolved count. Consumed approved
   intents retain committed receipts and published accounting; cleanup excludes
   their published keys even if a reservation state is inconsistent. Archived
   payload scheduling derives from `archivedAt` plus 30 days and preserves existing
   cursors and legal holds. Missing, invalid or future archive timestamps remain
   unresolved without a deletion deadline; resolve their history before rollout.
   A retention-version marker makes completed scheduling repeatable without
   rescheduling already expired payloads.
3. Page `inventory`, compare unique object keys and actual S3 HEAD/list sizes,
   and reconcile actor, target, deployment and published counters. Missing objects,
   untracked legacy records and unknown sizes block elevated rollout. Backfill
   conservatively reserves unknown legacy sizes. Do not certify accounting from
   a database-only inventory.
   Pending legacy submissions reserve declared source bytes plus worst-case
   derivative capacity, then settle actual source/download/display bytes on seal.
4. Prove cleanup retries, held-object exclusion, published transfer, lost-response
   replay and intake pause on the exact approved dedicated deployment. Archived
   private manifest payloads expire after 30 days, except unresolved review and
   legal hold; retained bytes/revisions are released only when payloads expire.
   Minimal receipts and publication audits remain indefinitely pending an explicit
   owner-approved retention/deletion policy.
5. Owner approves exact initial recipients, grant expiry/reconsideration terms,
   reviewer staffing and measured operational bounds. Proposed initial recipients
   and staffing are not yet selected. Do not promote accounts from volume alone.
6. Roll back with `VRDEX_CONTRIBUTION_INTAKE_PAUSED=true` and bulk intake disabled.
   Keep readers, review/withdrawal, receipt tables and scheduled cleanup deployed.
   Do not remove schema fields or roll back to writers that ignore reservations.

## Unrun external gates and exact opt-in sequence

No hosted bucket, deployment, grant, OAuth client or configuration was changed.
Each target and mutation needs direct owner approval before these steps:

1. Approve the exact isolated deployment, test profiles/accounts, bucket/prefix,
   client registrations, scopes and cleanup owner. Add that deployment identity
   to the reviewed allowlist before selecting the proposed policy. Confirm it is
   absent from all production runtime identities.
2. Run the existing [dedicated S3 proof](local-media-upload.md#dedicated-s3-proof)
   with `--approved-test-bucket=EXACT_APPROVED_BUCKET`. Its four generated keys
   under `profile-assets/proof/local-upload/<uuid>/` are deleted in `finally`.
3. Through installed Codex and Claude Code, discover capacity, create/append one
   50-row collection (30 profile/link plus 20 real media), transfer both URL/local
   candidates, and verify own status and stable cross-client receipts. Independently
   review 15 and explicitly publish 5 using the separate grant. Read the actual
   stored previews in both clients and save screenshots with operation IDs.
4. In the authenticated browser, verify independent reviewer and contributor
   sessions, local-time status, stored-image rendering, rejection, withdrawal,
   pause and permission revocation. Capture screenshots and VLM review.
5. Archive manifests, withdraw/reject remaining test proposals, and verify cleanup
   acknowledgements against the exact generated keys. Remove test publications
   through approved owner/admin commands, preserve audit receipts, then revoke
   temporary grants and restore the approved disabled configuration. Record any
   held objects that cannot yet be deleted.

Actual S3 transfer, Clerk sessions, Codex/Claude rendering, hosted multi-user load,
costs, cleanup-lag measurements and reviewer staffing remain unverified gates.

## Implementation validation, November 11, 2026

The approved role policy and review fixes are implemented on the isolated local
branch `codex/simple-contribution-policy`. No push, merge, account-role change,
production deployment, or logo publication was performed for this change.

Validation on the implementation:

| Check | Result |
| --- | --- |
| Backend regression set | 3,278 passed across 180 test modules |
| Excluded backend modules | Four unchanged Windows/FFmpeg or stalled-teardown modules, listed below |
| Targeted web/MCP adapters | 27 passed |
| API contracts | 85 passed |
| MCP package | 13 passed |
| Desktop/mobile contribution form | Four Storybook browser checks passed |
| Backend, web, contracts, MCP types | Passed |
| Local Convex compile and health | Passed on isolated local ports 34910/34911 |
| Markdown and changed web-module lint | Passed |

The unrestricted backend run was not green. Excluded modules are
`event-broadcast-output.test.ts`, `event-broadcast-renderer.test.ts`,
`event-twitch-input.test.ts`, and `now-playing-artwork.test.ts`. Observed failures
were an FFmpeg encoder pipe closure, renderer timing, Windows descendant-process
teardown, and Windows absolute-path ESM loading. Their source was unchanged.
Test children belonging to the stalled runs were stopped after identity checks.
This exclusion is a verification limit, not proof those modules are healthy.

A fresh independent branch review found three Important issues. All three have
regressions observed failing before their fixes and passing afterward:

- Replacement review now uses bounded resumable source/replacement pagination.
  Tests traverse 20 and 55 proposals, page size one, split windows, authority
  revocation, malformed/foreign cursors, and source changes without duplication.
- Browser completion rechecks current claim/public-profile eligibility before
  writes, matching the existing authenticated MCP paths.
- Capacity discovery reports effective shared ceilings, aggregate deployment and
  published-byte usage, and shared remaining bytes/concurrency, including lower
  stored operational limits.

Implementation decisions and limits:

- Native worktree creation returned no result twice. Git fallback provided an
  isolated checkout, which is not app-managed. The shared checkout was untouched.
- The existing shared profile editor already supports the approved public fields.
  Reusing it avoids a redundant admin editor, without adding new field privileges.
- Nullable quota enforcement and allowance removal were committed together to keep
  callers consistent. They should be reviewed as one change.
- Already admitted uploads may finish privately after media-kit intake is hidden
  or disabled. Claims and loss of public profile eligibility still block
  completion, and a private candidate cannot bypass publication checks.
- The latest operator PR-readiness instructions supersede the plan's old fixed
  waiting-window wording. No pushed-head or merge-ready claim is made here.
- The approved numerical budgets have not been proven against hosted workloads.
- Hosted deployment, current account grants, installed Executor tool-definition
  refresh, and signed-in browser/account acceptance remain unverified. They must
  be checked after separately authorized deployment. Fixture authentication and
  local compilation do not establish live-account proof.

Source evidence: implementation commits `514eb77c2`, `5863577cd`, `5f79b8471`,
and `d9d2cc5af`, based on `440f37c80aecb3d2b867592ef0470b3f7200df90`.

### PR review follow-up

- Capacity discovery reads at most 101 retained envelopes or 512 KiB and labels
  incomplete totals as lower bounds. Open-status counting stops at the actor's
  quota rather than reading that quota for every status.
- A regression reproduced the discovery read-budget failure with 1,000 open
  proposals carrying 4 KiB source URLs, 1 KiB source descriptions and 1 KiB
  private reasons, plus 10,000 retained envelopes. The fixed query and clean
  over-ceiling admission refusal pass with Convex's default transaction limits.
  This fixture proves that workload, not every possible metadata combination
  or hosted throughput. The existing 1,100-admission/completion load test also
  passes with its explicit 2,000,000-byte transaction read budget.
- Explicit stored operational byte and processing limits apply even when a
  superadmin has no contributor quota. Shared deployment usage and remaining
  figures are visible only to superadmins.
- Browser and MCP review clients now follow empty source checkpoints. MCP
  traversal is bounded to 40 continuations per call and remains resumable.
- Ordinary-tier refusal sentences retain their previously approved wording.
  Trusted-tier numerical substitutions follow the approved capacity pattern.

### Second PR review follow-up

Capacity discovery reads at most 101 recent creation records for the rolling-day
sample, with `creations24hIsLowerBound` marking an incomplete total. Remaining
daily capacity is null when the sample cannot determine it. The large-source
regression now passes with a stricter 8 MiB transaction read budget, including
the exact 1,000-open count and clean admission refusal.

Retained envelope totals now use an optional counter on the existing manifest
ledger. First creation bootstraps an exact bounded legacy count, then every new
idempotency key increments it atomically with the envelope insert. Replay and
archive leave it unchanged. No deployment migration is required for the prior
1,000-envelope policy. Incomplete unusually large legacy records remain
fail-closed rather than guessing a count. A regression reaches 10,000 envelopes
with 9 MB of retained cleanup metadata and a 32 KB read budget, including a
concurrent last-slot race, replay, and archive.

The browser now follows an empty page after manual pagination even if earlier
rows are visible or the page is already cached. Consecutive empty continuations
stop after 40 requests. Four production-component browser assertions pass across
desktop and mobile for initial/later checkpoints and bounded subscriptions.
