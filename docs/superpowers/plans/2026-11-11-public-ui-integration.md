# Public UI integration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Integrate the accepted public UI checkpoint onto current main as one reviewable PR, preserving newer behavior and proving authorization and user flows.

**Architecture:** Build a fresh integration branch from main and transplant checkpoint changes by feature group. Root layout owns shared navigation; public content uses existing projections and primitives; host access uses the existing community capability model. Fixture responses remain isolated from production.

**Tech Stack:** Next.js, TypeScript, Convex, existing CSS/Tailwind primitives, Playwright and Storybook.

**Spec:** [Approved design](../specs/2026-11-11-public-ui-integration-design.md), approved by BASIC November 11.

## Review brief

Keep the approved UI and adapt it to current main. The accepted checkpoint remains intact for comparison. Work proceeds in six tasks below, with one PR after the groups integrate successfully. This is integration of existing code, not a rewrite or a new round of visual design.

BASIC approved native execution November 11. The groups share layout, event, fixture and test files. A fresh whole-branch reviewer checks the integrated result before readiness.

## Global Constraints

- One integration branch and one PR, grouped commits.
- Reuse Next.js, TypeScript, Convex and shared UI primitives. No dependency or framework change is proposed.
- Preserve accepted labels and existing outcome/error prose. Any substantive new public prose during integration must be shown to BASIC before shipping.
- No per-event assignments or automatic VRChat role synchronization are included.
- No new provider retrieval is included.
- Keep ordinary supportRequests and profileSuppressionRequests separate.
- Disabled fixtures and production use the real backend and must not fall back to fabricated history or authority.
- No production deployment is authorized by this plan. Do not merge as part of a merge-ready review task.
- Apply the latest user-supplied AGENTS instructions. Readiness requires terminal acceptable checks and refreshed current-head feedback, with no fixed waiting period.

## Review Focus

1. Missing Clerk/Convex configuration must not break public rendering or change analytics consent. Task 1 owns this.
2. Failed/stale providers and long URLs must preserve copy actions and player disposal. Task 2 owns this.
3. Topic changes or failed support submission must not send stale profile context or route feedback into suppression. Task 3 owns this.
4. Anonymous, wrong-community and revoked hosts must lose direct page/status access as well as the button. Task 4 owns this.
5. Schedule gaps, tied times, untimed and missing-link sets must not silently select a different performer. Task 4 owns this.

## Working conventions and file ownership

All paths below are repository-relative. Preserve the checkpoint branch and caches; do not use the shared D:/bench/VRDex checkout for implementation. Use the worktree skill at execution time to create a fresh sibling checkout on codex/public-ui-integration from refreshed origin/main. If that name/path already exists, inspect it and choose an unused suffix.

Before editing, generate the full accepted inventory with:

```powershell
git diff --name-status 7bdee240d^ 7bdee240d
```

This inventory is authoritative for mechanical caller migrations, fixture changes and affected docs not individually listed below. Assign each inventory entry to its owning task before transplanting. Adapt hunks against current main; do not cherry-pick the entire checkpoint over overlapping newer files. Keep all accepted behavior accounted for, including file deletions. If a hunk is already on main, record that and retain the newer implementation.

For browser commands below, run through pnpm --filter web exec playwright test with both --project=desktop-chromium and --project=mobile-chromium. Local fixtures require VRDEX_ENABLE_PLAYWRIGHT_FIXTURES=true outside production. Use the checked-in playwright.config.mjs startup path by default. If attaching to a running local server, set PLAYWRIGHT_TEST_PORT to its verified port and PLAYWRIGHT_SKIP_WEBSERVERS=true. Leave PLAYWRIGHT_BASE_URL unset for fixture smoke tests; it selects hosted coverage and can skip fixtures.

Do not send real reports, support requests, provider commands or emails during verification. Use supported local mutation fixtures and test identities. Observe actual pass/skip counts.

## Task 1: Shared shell and controls on current main

**Files:** Create components/ui/site-header.tsx and site-header.module.css under apps/web/src; add public/brand/vrdex-wordmark-light.svg. Modify app/layout.tsx, components/ui/page-shell.tsx, site-footer.tsx, field.tsx and components/auth-page-shell.tsx. Migrate every old PageNav/BrandLink caller in the accepted inventory, including account, developer, auth and fixture pages. Update docs/engineering/design-system.md and add e2e/site-shell.spec.ts.

**Interfaces:** SiteHeader(): JSX.Element belongs inside the existing root provider tree. PageActions remains for contextual actions; PageNav/BrandLink callers disappear. Select retains native props, ref and caller styles. Preserve current-main analytics providers and consent behavior.

- [ ] Add the checkpoint shared-shell assertions before implementation. Assert one banner/footer, one visible logo, expected nav targets, and no overflow on the six existing representative routes. Extend site-shell.spec.ts to verify dark/light logo switching and no-configuration public rendering. Run it against main and record actual missing behavior without manufacturing failures for already-compliant routes.
- [ ] Transplant shell/control changes and caller migrations together. Preserve current main's analytics/Clerk/Convex/playback nesting and footer privacy controls. Keep light VR #17212D, DEX #547EAE, the pale dark-mode asset and accepted sizing/alignment. Keep dropdown arrow inset and keyboard selection. Avoid stylesheet imports in plain-Node-rendered shared fields.
- [ ] Run site-shell.spec.ts, analytics-gate.spec.ts and analytics-preference.spec.ts; then pnpm typecheck:web and the existing plain Node profile-rendering test. Expect no failed cases or unexpected skips. Capture and visually inspect desktop/mobile headers in both themes.
- [ ] Review the task diff and commit as feat: integrate shared public site shell. Include only task-owned callers/tests/docs.

## Task 2: Profile links, streams, media and world references

**Files:** Modify app/_components/profile-public-page.tsx, profile-vrcdn-streams.tsx, public-profile-links.tsx, public-media-asset-card.tsx, world-public-page.tsx, timeline/event-detail-content.tsx and components/ui/copy-value-row.tsx. Modify convex/_profileWorldCredits.ts, src/convex/playwright-fixtures.ts and app/api/v0/profiles/[slug]/assets/[assetId]/route.ts. Add the checkpoint profile-links.fixture.spec.ts, world-presentation.spec.ts and media-history.fixture.spec.ts. Retain affected existing media/profile tests, stories and docs/backend/profile-schema.md from the inventory.

**Interfaces:** CopyValueRow keeps existing props and adds the checkpoint composition/compact behavior without breaking default callers. World credits add optional heroImageUrl through the existing safe HTTPS helper. getPlaywrightPublicMediaDetailsFixture(slug, assetId) returns PublicProfileMediaDetails or null only under the non-production fixture gate.

- [ ] Bring over profile/card/media/world assertions first. Cover exact full clipboard values, Discord copied state, verified-label precedence, Twitch as a normal card, no obsolete Open preview action, metadata inside disclosure, linked history actors, lazy one-time history reads and decoded world images. Add explicit fixture-disabled and production-gate checks to tests/web/public-media-details-route.test.ts: known synthetic IDs must use the real path, never synthetic success, when either gate disallows fixtures. Run targeted tests and record expected failures on the unmodified surfaces.
- [ ] Integrate the accepted source, safe credit image projection, fixture history, stories and caller changes. Keep native player lifecycle and provider-live rules. Retain missing-image/history fallbacks. Fixture payloads must pass PublicProfileMediaDetailsSchema and existing API guards; no real media records are created.
- [ ] Run tests/web/profile-rendering-boundary.test.ts, backend profile-foundation world-credit cases and tests/backend/public-media-details.test.ts. Run profile-links.fixture.spec.ts, world-presentation.spec.ts, media-history.fixture.spec.ts and public-media-details.flow.spec.ts. Run the VRCDN startup/offline/ended lifecycle cases in public-routes.smoke.spec.ts with fixture coverage enabled. Expect preserved full copying, no autoplay and disposal after close/replacement.
- [ ] Capture profile links/streams/media and world references at desktop/mobile widths, waiting for image decode. Review visually, then commit as feat: integrate profile media and world presentation with affected docs/stories.

## Task 3: Contact lookup and report dialog

**Files:** Modify app/support/page.tsx and support-request-form.tsx; add support-profile-field.tsx. Modify app/events/event-identity-picker.tsx and event-contribution-controls.tsx; update their standalone revision fixture. Add e2e/support-request.flow.spec.ts and update event-contribution.flow.spec.ts and public-routes.ts. Update docs/backend/community-submissions.md.

**Interfaces:** SupportProfileField({ required, disabled }) produces existing profileSlug/profileType/displayName form fields. EventIdentityPicker adds an optional label while retaining default event-editor behavior. EventContributionControls accepts optional controlled reportOpen/onReportClose and retains its standalone trigger fallback. Neither support/suppression mutation contract changes.

- [ ] Port the checkpoint interaction tests before source. Extend support-request.flow.spec.ts and the existing revision fixture to assert feedback without a profile, selected canonical slug/type/name, manual missing-listing entry, explicit suppression type, contact required for recovery/transfer/dispute, request-type/deep-link resets, disabled pending controls and retained draft/actionable error on failed mutation. Verify submitted topic and payload through fixture interception, with no real requests. Run to identify absent behavior.
- [ ] Integrate the single form card, conditional context, public live lookup/manual fallback, message/contact order and removal of Back to discovery. Integrate the native report dialog and tooltip-ready triggers, preserving existing report/remove/correct/takeover permissions and message validation. Do not merge the support and suppression stores or change delivery/rate limits.
- [ ] Run support-request.flow.spec.ts, event-contribution.flow.spec.ts and support/privacy public-route smoke cases. Run tests/backend/support-requests.test.ts. Check keyboard lookup, dialog Escape/Close/focus return and live outcome announcements. Also run event-lineup.flow.spec.ts identity selection cases to prove the optional picker label did not alter existing event authoring.
- [ ] Review desktop/mobile contact and report-dialog renders. Commit as feat: integrate contact lookup and report dialog with tests/docs.

## Task 4: Event presentation and narrow host authority

**Files:** Modify app/_components/event-public-page.tsx, event-host-view.tsx and timeline detail/schedule CSS; remove event-dj-links.tsx. Modify `convex/events.ts`, `schema.ts`, `_clubModel.ts`, `_communityAuthority.ts`, src/convex/server.ts and account/communities/[slug]/club-workspace-model.ts. Update public-event and event-lineup fixtures. Modify event-host-view.flow.spec.ts, event-lineup.flow.spec.ts, event-lineup.snapshots.spec.ts, tests/web/event-host-view.test.ts, event-host-status-boundary.test.ts, tests/backend/event-broadcast-worker.test.ts, event-broadcast-resources.test.ts and club-staff.test.ts. Remove tests/web/event-dj-links.test.ts after moving its useful coverage. Update docs/backend/event-schema.md.

**Interfaces:** getHostAccess({ slug, communitySlug }): boolean and getHostBySlug({ slug, communitySlug }): authorized projection or null share current authority checks. host_events is a community role capability. fetchHostEventBySlug keeps its request-scoped result shape while removing denied-auth public fallback. Existing broadcast APIs are preserved.

- [ ] Port authorization tests first. Assert owner/manage_events/host_events access, operations-only/media-only denial, wrong-community denial, unpublished and published anonymous denial, role and grant revocation, and host-only denial of event mutation/broadcast operations. Add assignment coverage using existing clubStaff mutations and restrictions, not raw inserts alone. Run backend and server-route tests before implementation.
- [ ] Port host timing tests. Freeze time and assert earliest future timed row, position tie-break, untimed exclusion, no future row hiding, upcoming row with no links staying selected, offline links remaining copyable and selected-source/VRCDN/first-link priority. Assert status failure does not disable copying. Distinguish scheduled selection from the newer broadcast getNextEventMediaSource contract.
- [ ] Integrate host_events validators, role-editor label and read authority. Gate action visibility, reactive query, direct server route and status route alike. Preserve current-main browser-session/role grant rules and broadcast control paths. Keep fixture bypasses production-disabled. Do not grant event editing or broadcast access from host_events.
- [ ] Integrate accepted event poster/lineup layout and banner icons from Tasks 1 and 3. Remove DJ accordion/raw VRCDN entries, retain ordinary event links, and link DJ names. Add the compact rundown and schedule shortcut with explicit singular muted previews. Account for all obsolete DJ-link tests in the new owner surfaces before deleting them.
- [ ] Run the host/server/backend matrix and event-host-view.flow.spec.ts, event-lineup.flow.spec.ts, event-contribution.flow.spec.ts and current-main event-operator.flow.spec.ts. Validate calendar HTTP content as ICS, icon tooltips on pointer hover/keyboard focus and report focus return. Expect no unauthorized backend data, commands or autoplay.
- [ ] Use a test tenant to sign in as owner, assign a host-only role through actual staff controls, sign in as that host, verify rundown and edit/control denial, then revoke and verify UI/direct/status denial. If unavailable, record missing evidence and keep non-ready status; fixtures cannot replace this check.
- [ ] Capture event/host/report at desktop/mobile widths, review visually and commit as feat: integrate event host rundown and scoped access with tests/docs.

## Task 5: Timeline reconciliation and integrated acceptance

**Files:** Modify home-search-page.tsx, home-browse-provider.tsx, home-browse.module.css, discovery/discovery-event-card.tsx, discovery/discovery.module.css and timeline/home-schedule.tsx under app/_components. Update inventory-owned timeline tests/specs and docs/superpowers/specs/2026-10-26-home-timeline-design.md. Review all shared fixture and public-routes changes from earlier tasks together.

**Interfaces:** Keep current-main timeline query/controller contracts, activity retention, saved interests and timezone rendering. Change only the accepted presentation around them.

- [ ] Bring the accepted timeline spacing/panel/empty-state assertions onto main's current tests. Preserve tests for past-24-hour activity retention and temporal query bounds. Run before source changes and identify expected visual/assertion differences.
- [ ] Integrate the floating 520px desktop detail panel, full-screen phone panel, compact club artwork, Schedule/divider padding and removal of generic empty-range copy. Preserve main's current retention and schedule semantics. Ensure calendar/report/host behavior agrees between event-page and timeline entry paths.
- [ ] Run home-timeline.flow.spec.ts, home-timeline-time-regressions.flow.spec.ts, home-timeline.visual.spec.ts, analytics-gate.spec.ts and analytics-preference.spec.ts. Inspect keyboard close, retained scroll/selection, timezone rendering and phone overflow.
- [ ] Run pnpm lint:web, pnpm typecheck:web, pnpm typecheck:backend, pnpm test:web, pnpm test:backend, pnpm verify:docs and pnpm build:web. Reproduce any failures separately against refreshed main before attribution. The old Windows worker failure count is historical; retain current-main fixture repairs. Do not remove dispatch assertions or call the whole suite passing with failures/skips.
- [ ] Refresh only affected screenshot baselines through pnpm test:e2e:snapshots:update and affected Storybook snapshot tooling described in docs/testing/playwright-image-diffing.md. Review actual desktop/mobile images, including image decode, both logo themes, empty/long-label and missing-data states. Rerun comparisons without update mode. Do not blanket-accept image diffs.
- [ ] Complete an inventory reconciliation: every checkpoint entry is integrated, already present, or deliberately superseded by current main with a reason. Check for duplicate shell controls, dead imports/exports, orphaned snapshots and fixture leakage. Commit as test: verify integrated public UI and refresh reviewed baselines.

## Task 6: One PR and final review

**Files:** Update docs/planning/event-design-jam-2026-11-05.md with the integration branch/PR and exact final verification evidence. Carry this design and plan onto that branch. Update affected canonical docs alongside any final fixes, not only the historical jam log.

**Interfaces:** The integrated branch and exact head are the review target. The accepted checkpoint remains an immutable comparison artifact.

- [ ] Request a fresh whole-branch code review after the integration checks. Address valid findings in scoped fixes and rerun their affected checks. Review authorization, fixture exclusion, analytics/provider preservation, support routing and lifecycle behavior explicitly.
- [ ] Prepare one PR describing final user-visible behavior and material manual evidence/limits. Add ci:browsers and ci:visuals before its normal run. Push the current head through the normal repository workflow; review existing feedback before any follow-up push. A pending signed-in test, failing check or unavailable baseline keeps the PR draft/non-ready.
- [ ] Wait for required and informational checks to finish for the exact pushed head. Refresh ordinary comments, inline threads, formal reviews and mutable AI-review summaries. Reply with dispositions and resolve handled threads; refresh again after fixes. Confirm clean mergeability and no blocking feedback before reporting merge-ready. Apply no fixed 30-minute wait.
- [ ] Present the PR URL, reviewed visual evidence, exact checks and remaining limits. Stop at review/merge-ready status. Do not merge or deploy without the applicable separate instruction.

## Self-review and evidence

Spec coverage maps to Tasks 1-5; integration/readiness maps to Task 6. The five Review Focus cases have explicit owners and assertions. Interfaces retain existing contracts except the optional picker label, additive safe world image, controlled report dialog and dedicated host access queries. No new dependencies, retrieval workers or infrastructure are planned.

Accepted checkpoint: 7bdee240d533b4d4736a24cdc6a5e5d785cb1c6e. Approved design commit before policy/status alignment: bbb89d250. Main was observed at 440f37c80aecb3d2b867592ef0470b3f7200df90 during planning; refresh again before execution. Local caches remain outside Git. Prior jam tests are historical evidence and do not substitute for the integrated branch checks.

This plan has been checked for spec coverage, interface consistency, review-focus coverage and proportion. BASIC approved this plan and native execution November 11. Integration is in progress on codex/public-ui-integration.
