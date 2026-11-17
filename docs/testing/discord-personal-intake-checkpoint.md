# Personal Discord intake checkpoint

The implementation adds selected-message capture to the existing private event
intake editor. It retains account linking, tentative extraction, poster removal,
explicit review and the separate contribution/owner publication paths. It has
not been activated on the live Discord application or deployed by this task.

## Verified locally

| Check | Evidence |
| --- | --- |
| Personal intake backend | 16 transaction tests passed: actor isolation, ambiguity, replay, poster-only quota, leases, removal/retry, discard, owner authority, revision conflicts and preserved private lineup identity/confirmation |
| Event regression checkpoint | 164 owner, contribution, correction, lineup and inventory tests passed; the later private-lineup/confirmation checkpoint passed 30 tests |
| Web suite | All 1,218 tests passed after the review fixes |
| Discord gateway | All 44 tests passed |
| Browser journeys | 24 desktop/mobile checks passed, including light/dark overflow checks, source replay masking, poster choice/removal and failed-download recovery, sign-in return, resume, delayed version handoff/retry, resolved contribution navigation, operation switching and owner denial |
| Types | Backend, web, gateway and API contracts passed |
| Docs and lint | Markdown lint, Docusaurus build and web ESLint passed |
| Local backend | Anonymous bootstrap/health passed using the existing CI-pinned backend version and isolated ports |

The unrestricted Windows backend run encountered failures in three unchanged
restream cases and hung on a POSIX process-group cancellation fixture. That owned
test process tree was stopped. A second run excluding those three case names
completed with 3,442 passes and one unrelated Windows ESM-path failure in
`now-playing-artwork.test.ts`. Its error was `ERR_UNSUPPORTED_ESM_URL_SCHEME`
for an absolute `C:` import. These results do not establish a green full backend
suite. The affected intake/event suites passed; Linux CI remains the full-suite
acceptance check.

## CI bootstrap correction

The first PR run failed before broadcast browser acceptance: its unpinned local
Convex backend returned component-analysis data incompatible with CLI 1.32.0.
The main workflow now shares the backend-verification job's existing version pin
with browser bootstraps. This matches the successful isolated local bootstrap.
The pinned Linux run passed all selected checks. Later review fixes receive their
own current-head CI and review on the PR.

## Independent review

The reviewer found private-content tracing, a failed multiple-poster retry path,
and removal of legacy participant-only performers during lineup edits. Each has
a regression that failed before its fix and passed afterward. Private source
status comes from the stored draft, so manual extraction also omits trace content.
The focused intake, correction and lineup checkpoint passed all 205 tests.

## PR review corrections

Automated review found shared-flow regressions in manager poster publication and
contributor search terms, an owner-authority mismatch, and a preparation/version
race. The fixes keep poster access bound to the authorized draft, reuse the
contributor-aware search projection in artwork and legacy-route updates, and
compute owner intent with the owner writer's permission predicate. Genuine owner
revocation still stops publication without falling back to a contribution.

The editor waits for the prepared draft version before remounting. Retry disables
editing through that handoff, so extraction cannot discard newly typed changes.
The delayed-subscription and delayed-retry browser regressions passed on desktop
and mobile. The affected backend checkpoint passed all 206 tests, and independent
re-review found no remaining major issues.

The next review pass also covered held connector publications, whose unconfirmed
associations need the original publication search context when artwork is attached.
Personal contribution publication keeps the editor mounted until navigation and
uses the returned event path even when deduplication finds someone else's event.
Returning from an update target to New event restores the original accepted import
fields and suggestions while preserving a later explicit poster removal. Switching
between update targets rebases suggestions on the import, without carrying another
target's lineup into the new event. These paths have backend or desktop/mobile
regressions. The final local browser checkpoint passed all 24 checks.

Repeated imports retain existing row keys and order, normalize lineup positions,
and allocate unused short keys for appended rows. A regression covers collisions
with earlier imports and repeated incoming keys. All 87 API contract tests passed.

## Visual evidence

The screenshots use fictional fixture content and production editor components.
They were inspected for hierarchy, control placement, poster presentation,
readability, contrast and horizontal overflow. The existing editor's main heading
and navigation stay above the contextual Discord controls. Private source controls
and suggestions are inside the existing replay-blocking selector.

| View | Screenshot |
| --- | --- |
| Desktop light | [Review](./assets/discord-personal-intake-2026-11-16/desktop-discord-review-light.png) |
| Desktop dark | [Review](./assets/discord-personal-intake-2026-11-16/desktop-discord-review-dark.png) |
| Mobile light | [Review](./assets/discord-personal-intake-2026-11-16/mobile-discord-review-light.png) |
| Mobile dark | [Review](./assets/discord-personal-intake-2026-11-16/mobile-discord-review-dark.png) |

## Activation remains separate

BASIC approved the exact utility labels `Continue without poster` and
`Keep current artwork` on 2026-11-17. Existing short utility labels are reused
for the other controls. The [gateway runbook](../deployment/discord-gateway.md#personal-message-command)
describes the command registration, portal setting, deployment and rollback.

The authenticated Developer Portal, live user-install settings, direct-install
eligibility and current Discord-client behavior were not inspected or changed.
Local mobile Chromium is not an iOS or Android Discord acceptance test. Before
activation, use authorized fixture messages in a guild without bot membership,
a personal DM and a group DM, including denied external public replies and a
review beyond the interaction token lifetime. No real private message or paid
model evaluation was collected by these checks.

## Reference

See the [implementation plan](../superpowers/plans/2026-11-16-discord-personal-event-intake.md),
[source policy](../backend/event-intake-sources.md#personal-discord-sources) and
[original scope](../planning/discord-personal-event-intake-scope-2026-11-16.md).
