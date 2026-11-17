# Personal Discord intake checkpoint

The implementation adds selected-message capture to the existing private event
intake editor. It retains account linking, tentative extraction, poster removal,
explicit review and the separate contribution/owner publication paths. It has
not been activated on the live Discord application or deployed by this task.

## Verified locally

| Check | Evidence |
| --- | --- |
| Personal intake backend | 15 transaction tests passed: actor isolation, ambiguity, replay, poster-only quota, leases, removal/retry, discard, owner authority, revision conflicts and preserved private lineup identity/confirmation |
| Event regression checkpoint | 164 owner, contribution, correction, lineup and inventory tests passed; the later private-lineup/confirmation checkpoint passed 30 tests |
| Web suite | All 1,216 tests passed |
| Discord gateway | All 44 tests passed |
| Browser journeys | 12 desktop/mobile checks passed, including light/dark overflow checks, source replay masking, poster choice/removal, sign-in return, resume and owner denial |
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

Review the exact new three-word utility labels `Continue without poster` and
`Keep current artwork` before shipping. Existing short utility labels are reused
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
