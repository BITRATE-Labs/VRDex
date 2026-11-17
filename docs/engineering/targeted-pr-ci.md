# Targeted PR checks

Small changes should run the checks that cover the affected behavior. This reduces
runner work and merge time together. The complete suite remains available through
`ci:full`. This implementation keeps the existing build and production-release
dependencies; it does not start builds earlier or add runner parallelism.

The repository CI-label owner creates `ci:full` once. To recreate it, use
`gh label create ci:full --color 5319e7 --description "Complete PR acceptance suite"`.
Label names and behavior remain defined by the checked-in selector.

## Selection

| Change | Selected browser coverage with `ci:browsers` |
| --- | --- |
| Timeline and home schedule | Home/timeline flows |
| Profile surface | Profile and media-contribution flows |
| Event surface | Event flows |
| Player | Native media acceptance and Storybook |
| UI primitives or stories | Storybook assertions |
| Shared, authority-sensitive or unmapped application code | Broad existing coverage |

`ci:visuals` adds the corresponding captures and image comparisons. `ci:full`
selects every existing optional job, all flows, native media, script contracts
and restream acceptance. Docs-only changes do not select browser jobs unless the
full suite is explicitly requested. Mixed changes union their affected surfaces.

The path map lives in `.github/scripts/ci-scopes.cjs`. Unknown application paths
remain broad. Narrowing a new surface requires a mapping and a test proving what
runs and what skips. Renames use both old and new paths in the comparison.

## Baseline and evidence

Lint, types, unit tests, docs, API/MCP verification, backend bootstrap and the web
build remain baseline checks. The broad script-test invocation is selected for
script, workflow, backend, package or worker changes. Native restream work is
selected for its runtime, shared dependencies and CI changes. Main retains both.

The report validates the immutable selected-job list. Selected jobs require
success and current artifacts. Unselected jobs must skip and appear as
NOT SELECTED. Missing, malformed or inconsistent selection fails verification.
Label removal preserves historical failures; it does not reclassify an old run.

## Validation and limits

Contract tests cover narrow timeline/profile/event/player/Storybook changes,
mixed and unknown changes, nested stories, existing tagged spec matches, full
opt-in, core selection and report handling. Push runs require no PR comparison
base. Broadcast acceptance uses the shared job selection without a second gate.
Workflow tests preserve the build/release dependency graph, auth guards and full
native checks whenever they are selected. No runtime or preview deploy credential
scope is expanded.

Observed successful full-browser PR runs before this change took about 42 and
56 minutes. Selection removes unrelated work; exact savings still need a timed
hosted run. Broad shared changes intentionally keep substantial coverage.
