# Homepage Live now implementation plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task by task. Read the linked design first.

Goal: deliver the approved compact homepage Live now row for current event performers, using shared cached observations and the retained event player.

Architecture: use the existing Convex scheduler for bounded background refresh and persistent observations, plus a public projection that rechecks visibility and current source. Reuse pure provider parsing/probing and canonical current-slot/end inference; keep provider credentials server-side. The homepage consumes cache only and creates no media until Play.

Tech stack: existing Next.js, React, TypeScript, Convex and playback owner. No new dependency required.

Spec: [approved design](../specs/2026-11-12-home-live-now-design.md), approved event-performer scope by BASIC on November 12. Also reuse docs/planning/home-radio-preview-2026-11-07.md and existing fixture checkout as reference, not as a clean integration base.

## Constraints

- Current event performers only. Explicit enabled event stream takes precedence. No current eligible source means no browse entry, regardless of later streams.
- Hybrid DJ/event discovery, explicit Play, one retained owner, no autoplay and no station category wording.
- Keep actual current performer metadata during healthy overtime playback. Missing profiles get names without invented links. Ambiguous profile-to-event association is not guessed.
- Active listeners retain existing authorization/recovery behavior. Removing stale browse results is not a stop command.
- Provider polling must be bounded, deduplicated and single-owner. Configuration off by default until separate qualification/activation. No production enablement, credentials, billing changes or deployment as part of source work.
- Artwork first. No stream screenshot, hidden player, media connection, iframe or Web Audio on Home before Play. Thumbnail research remains independent.
- Preserve source edits in old home-radio-jam and other worktrees. Start isolated from verified current remote main.

## Review focus

1. A missing current stream cannot inherit a past/future performer's liveness.
2. Source edits or visibility changes must invalidate an otherwise-fresh observation before public projection or Play.
3. Timeout, rate limiting, missing credentials and Twitch omitted/restricted broadcasts cannot become false confident offline claims.
4. Overlapping scheduler ticks, partial failures and a busy candidate pool cannot multiply probes or permanently starve candidates.
5. Fresh Home renders and ordinary navigation must not create media or block the schedule on provider I/O.

## Task 1: shared candidate and observation cache

Files: create convex/eventLive.ts for query/mutation ownership, convex/eventLiveActions.ts for provider I/O, convex/_eventLive.ts for pure projection/selection helpers; update convex/schema.ts and convex/crons.ts. Reuse the current public event/roster projections and parser/probe implementations. If sharing provider code requires a move, preserve existing web callers through a thin re-export, with existing tests retained. Do not duplicate a second parser or probe policy.

Interfaces: public query eventLive:listPublic returns bounded eligible live entries containing public event identity, host/current-performer identity when available, canonical source identity and observation expiry. Internal candidate selection, lease claims and writes stay internal; validate provider responses at the network boundary. Client Play resolves the current public request rather than trusting a stale cached grant or private URL.

- [ ] Add failing backend/pure tests for all five review-focus cases. Include explicit event-stream precedence, inferred ends, unlinked current performer, untimed barriers, empty results and event publication changes.
- [ ] Implement persistent status/observation/expiry records keyed by normalized provider identity. Avoid a new public provider write API. Bound scans through existing indexed/public event selection, with cursor/fairness and no whole-profile sweep.
- [ ] Add a disabled-by-default scheduled refresh. Implementation defaults: at most20 distinct current sources per60-second tick, at most4 simultaneous probes, existing5-second VRCDN deadline,90-second observation expiry. Record and cap work honestly; if a full candidate pool cannot remain fresh under the cap, exclude stale entries and rotate fairly. No future-performer preflight in this slice.
- [ ] Batch eligible Twitch requests using server token and actual response rate-limit headers. Preserve unavailable distinctions and documented missing credential behavior. No new credentials provisioned. VRCDN uses existing GET-and-cancel behavior only behind the disabled refresh gate.
- [ ] Run the focused backend/provider tests, existing affected provider tests, generated types and schema checks. Commit coherent source and docs.

## Task 2: real homepage entry and hybrid navigation

Files: update apps/web/src/app/_components/home-search-page.tsx, create home-live-now.tsx beside it, use existing shared design tokens and event-playback-provider.tsx owner. Existing event-playback-request.ts/current-slot logic is being repaired in codex/player-regressions-20261112; coordinate exact shared contract without cherry-picking an unfinished worktree. Reuse the compact reviewed mockup, not its dev-only fixture controls.

- [ ] Add failing focused browser/backend projection tests: empty or expired cache hides row, fresh source yields one card, missing current source yields none, page load has zero media requests, Play retains one owner across event/DJ/Home navigation, unknown association is not guessed.
- [ ] Render cached entries above the schedule without awaiting provider I/O. Preserve separate event and DJ links, host identity and accessible Play controls. Do not mount a player per card. Use actual retained current metadata for active entries.
- [ ] Connect explicit Play through fresh public authorization/current-slot resolution. A stale card must not start a removed or newly missing source. Cached status is discovery evidence, not an authorization token.
- [ ] Supply desktop/mobile fixture states through existing guarded routes, visually inspect both, and verify missing-source and empty behavior. Preserve original image containment and minimal approved utility copy.
- [ ] Run relevant types/lint/unit/browser checks, selecting ci:browsers and ci:visuals before normal PR CI. Commit the frontend and its docs together.

## Task 3: review and qualification handoff

Files: carry the approved design and this plan into docs/superpowers/specs and docs/superpowers/plans in the implementation checkout. Update docs/planning/player-performance-and-live-index-2026-11-06.md and relevant deployment/configuration docs so old assumptions do not contradict this slice.

- [ ] Document polling off by default, exact config names/scope, self-host setup, cap/expiry/lease semantics and rollback. State no production activation has occurred.
- [ ] Run one bounded synthetic scheduled-cycle qualification proving deduplication, lease recovery, expiry, fairness and read-only public projection. Record worst-case probe count and function duration, without claiming provider capacity proof.
- [ ] Produce one normal source PR with no provider changes. Inspect exact-head checks and all review/comment/thread/sticky surfaces; resolve valid feedback and repeat after fixes. Never merge or deploy from this assignment.
- [ ] Handoff source readiness separately from activation. Before enablement, resolve/explicitly accept issue217 viewer-slot uncertainty, verify actual provider credentials and configured budgets through existing authority, then qualify live output. Homepage work does not enable native audio relay or broadcasting.

## Self-review

The plan covers approved hybrid discovery, current source, freshness, no-autoplay, identities, bounded background work, provider limits, self-hosting, tests, visual proof and source delivery. Runtime enablement, true audio-only relay and screenshot capture are deliberately independent. The proposed cap limits background VRCDN reads to at most28800/day if continuously full, not a bill or measured live population.
