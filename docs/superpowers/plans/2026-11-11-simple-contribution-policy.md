# Simple contribution permissions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let superadmins maintain public unclaimed profiles directly, give all three trusted roles the approved higher capacity, and remove temporary allowance workflows without expanding publication permissions.

**Architecture:** Reuse the shared profile editor and media lifecycle. Resolve editing authority, publication authority, and capacity independently from current authenticated account grants. Represent inapplicable superadmin contributor quotas explicitly, while retaining bounded processing and deployment safeguards.

**Tech stack:** TypeScript, Convex, Next.js, Zod contracts, node:test/convex-test, Playwright, existing Executor MCP proxy.

**Spec:** [Approved design](../specs/2026-11-11-simple-contribution-policy-design.md).

Status: approved for native execution on November 11, 2026.

## Review brief

The approved design fixes capacity and authority together because the same authenticated operations must report and enforce the same decisions. Implement six dependent tasks in order. Native execution in this session is recommended; the tasks share policy and authorization interfaces, so parallel implementation would add coordination work.

No new admin wizard, temporary grant, claimed-profile override, credential store, or publication permission is introduced. The website keeps its existing editing and review entry points. No new public explanatory copy is needed.

## Global constraints

- Trusted means any active `trusted_contributor`, `media_reviewer`, or `trusted_publisher` grant. Role combinations do not multiply capacity. Superadmin takes precedence.
- Trusted limits: 1,000 media contributions per rolling 24 hours; 1,000 open proposals; 12 admissions per minute; 20 GiB reserved bytes; four concurrent actor processing operations; 100 contributions per target per rolling day and 20 open proposals per target.
- Ordinary limits remain unchanged. Superadmins have no contributor count, open-proposal, cooldown, or actor byte quota; shared deployment and target processing/byte safeguards still apply.
- Claim protection, visibility, opt-out, suppression, legal hold, revision guards, upload validation, attribution, cleanup, and authenticated delegation remain enforced. Owners retain their existing claimed-profile editor.
- Trust capacity never grants publication or broader editing. No local/test-only product policy or identity allowlist.
- Preserve contribution/media audit history and published assets. Inspect existing records before removing historical schema fields. Do not add compatibility endpoints for removed workflow tools.
- No merge, production deployment, account grant, or production configuration change is authorized by this plan.

## Review focus

- A trusted approver can upload item seven but still cannot publish merely because of higher capacity. Task 1 and Task 3 pin this.
- A profile becomes claimed after preview or upload admission. Task 2 and Task 3 require fresh refusal without public mutation.
- A superadmin's capacity read must not scan unlimited submission history. Task 1 and Task 4 enforce bounded reads and nullable quotas.
- An expired or revoked grant changes admission immediately, without abandoning the cleanup of already stored bytes. Task 1 and Task 3 exercise this.
- A failed or replayed upload must not consume capacity twice or report publication. Task 3 and Task 6 exercise this.

## Preparation and isolation

- [ ] Resolve the pending native worktree request before requesting another checkout. The first `create_worktree` call did not return a result; do not assume it failed or create a duplicate.
- [ ] Use the native worktree tools and the declared VRDex worktree preference. Recheck current upstream and select the intended default branch; do not branch from unrelated work on the shared checkout. Record the exact base commit.
- [ ] Read the checkout's current AGENTS instructions. Preserve all unrelated changes. Transfer only the approved design and this plan, mark their approval date, and commit those documents in the isolated branch.
- [ ] Install pinned dependencies with the repository's Node 24 and pnpm setup, without copying credentials or rebinding a hosted Convex deployment. Run the targeted baseline tests below before editing product code. Record pre-existing failures separately.

## Task 1: Standing role-based capacity

**Files:** `convex/_contributionPolicy.ts`, `convex/_contributionCapacity.ts`, `convex/contributionCapacity.ts`, `convex/profileMediaSubmissions.ts`, `convex/contributionUploads.ts`, `convex/contributionBatches.ts`; `tests/backend/contribution-capacity.test.ts`, `tests/backend/contribution-capacity-rollout.test.ts`, `tests/backend/contribution-capacity-followups.test.ts`, `tests/backend/contribution-capacity-load.test.ts`.

**Interfaces:** Keep `effectiveContributionPolicy(db, actor)` as the shared resolver. Its tier becomes `ordinary | trusted | superadmin`. Contributor quotas `dailyActor`, `dailyTarget`, `openActor`, `openTarget`, `burst`, and `actorBytes` are `number | null`, with null meaning inapplicable. `burstWindowMs` stays numerical. Actor processing may be null for superadmin, while actual queue admission remains bounded by target/deployment limits. Keep unrelated manifest-envelope limits numerical.

- [ ] Add failing role-matrix tests using existing fixtures. Assert every trusted role independently gets the exact approved values, ordinary remains 6/day and 3 open, expired/revoked grants do not qualify, and superadmin quotas are null. Assert role resolution does not alter publication flags.
- [ ] Run `node --conditions=import --import tsx --test tests/backend/contribution-capacity*.test.ts` and confirm the new assertions fail for policy behavior.
- [ ] Replace synthetic/baseline switching with one shared ordinary/trusted/superadmin policy. Remove the test identity allowlist and synthetic deployment selector. Retain shared deployment configuration and intake pause. Route all capacity enforcement through the same resolved policy; do not add giant sentinel limits. Update all consumers of newly nullable limits atomically in this task, including admission guards and bounded count queries, so this commit does not temporarily break trusted or ordinary admission.
- [ ] Update capacity reads to return null for inapplicable quota/remaining values, skip irrelevant superadmin rolling-history scans, and keep actual technical capacity visible. Preserve bounded queries for limited tiers. Update aggregate profile counters only if existing indexed bounded reads cannot safely enforce the approved limits.
- [ ] Rerun the targeted policy tests, including exact boundary and burst-window assertions, then commit this tested task.

## Task 2: Shared routine editing authority

**Files:** `convex/profiles.ts`, `convex/_profilePermissions.ts`, `convex/_profileUpdates.ts`; `tests/backend/profile-write-authority.test.ts`; existing profile editor tests.

**Interfaces:** Extend the existing `resolveProfileEditSubject(db, profile, userId, contributeGranted?)` and field-permission helpers to derive routine superadmin authority from account grants. Reuse current browser/API/MCP update entry points and `expectedUpdatedAt`. Do not accept a caller-supplied admin boolean or treat superadmin as a profile owner.

- [ ] Add failing tests for a superadmin editing supported public fields on a public unclaimed profile through browser, REST, and MCP entry points. Assert attributed changes and matching editor capability responses.
- [ ] Add refusal tests for claimed non-owner, hidden, suppressed, opted-out, legal-held, stale-version, private-field, and insufficient-scope targets. Verify a superadmin who actually owns a claimed profile still uses the existing owner path. Verify ordinary/trusted editing permissions are unchanged.
- [ ] Run `node --conditions=import --import tsx --test tests/backend/profile-write-authority.test.ts` and confirm the new superadmin behavior fails before changes.
- [ ] Implement the shared authority path. Keep slug, ownership, private evidence, appearance, and moderation outside this routine public-data editor. Apply the same permissions to preview, capability discovery, and mutation. Preserve read-before-error ordering so inaccessible profiles do not leak existence.
- [ ] Rerun the tests and verify browser/MCP audit actors identify the real user and client, then commit this tested task.

## Task 3: Media admission, completion, management, and publication

**Files:** `convex/contributionUploads.ts`, `convex/profileMediaSubmissions.ts`, `convex/profileAssets.ts`, `convex/_profileAssets.ts`, `convex/_mediaReview.ts`; `tests/backend/contribution-uploads.test.ts`, `tests/backend/media-review-authority.test.ts`, `tests/backend/profile-media-submissions.test.ts`, `tests/backend/hosted-mcp-profile-media-contributions.test.ts`.

**Interfaces:** Retain `assertSubmissionRateLimits(ctx, userId, profileId, now)` and upload begin/complete receipt contracts. Derive superadmin permissions server-side through existing authenticated authority. Retain owner/contributor upload modes; no client-selectable admin upload mode. Make metadata-management and explicit publication commands honor the same routine target boundary.

- [ ] Add failing tests for superadmin admission above six/day and three open, trusted boundary counts, and trusted approver versus publisher behavior. Assert that completion alone never publishes.
- [ ] Add claim/visibility/hold race tests at completion and publication, including an otherwise valid replay after authority changes. Assert no public write, retained audit receipts, correct cleanup, and no double charging. Test expired delegation and insufficient scopes separately from account roles.
- [ ] Run the four targeted backend test files and confirm failures are behavioral, not fixture setup errors.
- [ ] Replace quota assumptions with Task 1 policy. Add the missing superadmin routine authority to media management and explicit publication without granting ordinary approvers publication rights. Recheck current profile state and privileges at effectful stages. Keep target/deployment byte and processing limits, image validation, quarantine, provenance, and cleanup gates.
- [ ] Verify profile-picture placement remains distinct from downloadable gallery logos. Rerun targeted tests, then commit this tested task.

## Task 4: Remove allowance workflows and update client contracts

**Files:** `convex/contributionCapacity.ts`, `convex/_contributionCapacity.ts`, `convex/contributionBatches.ts`, `convex/contributionUploads.ts`, `convex/_contributionTables.ts`, `convex/accountFeatureGrants.ts`; `packages/api-contracts/src/contribution-batches.ts`, `packages/api-contracts/src/index.ts`; `apps/web/src/lib/server/mcp-contribution-batches.ts`, `apps/web/src/lib/server/vrdex-mcp.ts`; associated backend/web/contract tests and `scripts/prove-contributor-collection-local.ts`.

**Interfaces:** Keep `vrdex_contribution_capacity` and contribution status/reconciliation tools. Remove `vrdex_contribution_capacity_request` and `vrdex_contribution_capacity_requests` from active tool discovery/routing. Remove allowance creation/decision/enforcement code. Existing account-grant administration remains the way standing roles are assigned.

- [ ] Add failing tests that removed tools cannot be discovered or invoked, capacity uses nullable superadmin quota fields, and shared enforcement still works without batch linkage. Test ordinary optional collections without allowance branches.
- [ ] Remove the request/decision handlers, allowance byte/row charging and revocation links, obsolete MCP scope/operation registrations, and synthetic proof configuration. Rewrite useful tests with ordinary role fixtures; delete tests proving only the removed mechanism.
- [ ] Inspect historical-record/schema relationships before deleting table fields. Keep inert historical records and references where deleting them would erase audit evidence or invalidate stored records. Do not ship a live request endpoint to support those records, or delete uploaded assets as cleanup.
- [ ] Run `pnpm test:api-contracts`, targeted `tests/web/contribution-*.test.ts`, and the affected backend suites. Search active code for `batch_allowance`, `batchAllowance`, `synthetic-v1`, and the removed tool names; remaining occurrences must be deliberate historical schema or regression-test evidence. Commit this tested task.

## Task 5: Existing browser editor and operational documentation

**Files:** `apps/web/src/app/_components/profile-edit-form.tsx`, `apps/web/src/app/_components/profile-media-contribution-editor.tsx`, existing account media contribution/review components; `apps/web/e2e/media-contribution.flow.spec.ts`, existing profile-submission flows; relevant stories; `docs/engineering/media-review-commands.md`, `docs/testing/contributor-collection-checkpoint.md`, `docs/planning/seed-import-model.md`.

**Interfaces:** Browser capability responses use Task 2 authority and Task 1 capacity. Show existing edit/upload/publish controls only when the matching permission is present. No new wizard, grant request, or admin-mode toggle.

- [ ] Add failing flow coverage for signed-in superadmin unclaimed editing and explicit media publication, a trusted approver without publish capability, a trusted publisher with explicit publication, and a claimed non-owner target. Include direct edit URL entry and sign-in return to the intended profile.
- [ ] Update the existing components to consume capabilities correctly, render nullable quota values without showing exhausted limits, and preserve clear pending versus published state. Reuse approved labels; any substantive new public copy needs separate exact-copy approval.
- [ ] Update the existing docs with the approved role matrix, exact limits, removed allowance workflow, optional collection status, and deferred claimed-profile override. Mark historical synthetic measurements as historical rather than current hosted policy.
- [ ] Run web typecheck, lint, targeted component tests, and the two relevant Playwright flows with the repository's configured test runtime. Capture desktop/mobile visual evidence where controls changed. Commit this tested task.

## Task 6: Whole-change verification and review handoff

**Files:** The branch as a whole; the plan's evidence/checklist section.

- [ ] Run `pnpm typecheck:backend`, `pnpm typecheck:web`, `pnpm typecheck:api-contracts`, `pnpm typecheck:vrdex-mcp`, `pnpm test:backend`, `pnpm test:api-contracts`, and `pnpm test:vrdex-mcp`. Run changed web tests and repository-required lint/docs/generated-contract checks. Use bounded logs and record failures honestly.
- [ ] Compile/push Convex only to the explicitly authorized local verification runtime using `pnpm verify:backend:local`; do not bind anonymous mode over an existing hosted account or deploy production. Confirm generated code is consistent. If the local runtime is unavailable, report that gap rather than treating typecheck as deployment proof.
- [ ] Review exact branch changes for unauthorized publication, claim/suppression bypass, unbounded scans, stale role use, unnecessary new abstractions, and source/credit exposure. Fix valid findings and repeat affected checks.
- [ ] Verify Executor's source/tool registration behavior. Refresh its tool definitions if the normal authorized development flow requires it; public app publication and live-account acceptance remain separately authorized. No live logo upload is proof of these changes before deployment.
- [ ] Present the exact changed behavior, verification, and remaining risks. Commit/push only intentional files under the repository's rules. If a PR is created, add `ci:browsers` and `ci:visuals` as applicable and attach the PR to this chat. Do not call it merge-ready before the required 30-minute exact-head review window and final checks refresh.

## Evidence and current limits

Plan source inspection used the existing local checkout; current upstream parity must be refreshed during preparation. The known default-branch ref at planning time was `25860865cc95c19e3035cf388feddad6f8534565`, not proof it is still current.

No product code, account grants, quotas, or production configuration were changed while writing this plan. Baseline tests and installed Executor acceptance have not yet run. A native worktree request was sent but returned no result, so its outcome must be resolved before another creation attempt.
