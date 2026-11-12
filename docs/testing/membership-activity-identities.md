# Membership activity implementation verification

This implements the [approved design](../superpowers/specs/2026-11-11-membership-activity-identities-design.md). Evidence below is local, not deployment or live provider acceptance.

## Implemented behavior

Authorized activity queries resolve latest locally cached VRChat names and unique visible verified VRDex profiles using exact provider IDs. Future role events preserve validated role and actor fields. Event-recorded evidence remains separate from cached names. Rows show readable actions, role names and staff attribution, profile links and keyboard-operated details. Missing history stays unresolved.

Query errors clear named history through the existing error boundary. Retry remounts it. Count-only session storage restores up to 250 previously loaded rows in the original 25-row pages, preserving the identity lookup budget per page. Further rows remain available through Load more. Filters remain in the existing analytics URL.

## Independent review and fixes

A fresh GPT-6 Astra reviewer inspected the whole implementation. It found a false-unique match when one eligible profile's proof history overflowed and another profile verified. A failing mixed-case test reproduced it. The fix treats that identity as unresolved and omits its VRDex link. A bounded precheck protects the existing shared verifier, whose behavior is unchanged.

The reviewer also found an actor-link separator encoded outside UTF-8. An actor-VRDex fixture reproduced it; the source byte was corrected and a replacement-character assertion now passes. Coverage also checks deduplicated reads, page verification budget exhaustion and long names. No review findings remain deferred.

PR review also corrected replay target-ID casing, synchronized generated API declarations, bounded count restoration, preserved 25-row page boundaries on return, restored an explicit response allowlist, added descriptive accessible link/disclosure names, and honored the screenshot capture opt-out. The page verification budget remains bounded and fails closed; restoring history now uses the same pages as loading it initially.

A further review pass found that role-name retention depended on a valid role ID and malformed optional ingest strings could reject a whole page. Both regressions failed before the fixes. Role fields now validate independently, and invalid optional name/actor/role strings are omitted while core audit validation, immutable conflicts and scan verification remain enforced.

## Local evidence

- Worker suite: 270 passed after the replay-casing and independent role-name regressions.
- Focused membership, identity, proof-verification and automatic-statistics backend suite: 69 passed after PR review fixes, including malformed optional evidence, empty legacy names and an exact public response shape.
- Storybook desktop/mobile assertions: 8 passed, including role labels, actor/target links, accessible details, bounded pagination restoration and access-loss/retry using real hooks with synthetic transport.
- Repository backend and web type-check scripts passed with the isolated checkout's frozen-lockfile dependencies.
- Focused frontend lint and whitespace checks passed.

Desktop/mobile screenshots received VLM review: readable role context, visible keyboard focus and no horizontal clipping. Local PNGs are under `.cache/artifacts/membership-roles-storybook-{desktop,mobile}.png` in the implementation checkout.

## Remaining release evidence

Actual authenticated sign-in return, live VRChat role payloads and provider navigation were not exercised. Field semantics come from the pinned community specification cited by the worker and deployment guide. Storybook data is synthetic.

No historical replay, general resolver, migration, production write, merge or deployment was performed. Comparable workspace screens remain follow-up work. Merge and deployment remain separately gated.

## Broader suite limits

The full backend and web unit suites were also attempted. They reported failures in the unmodified VRCDN CBR-envelope, renderer transition-anchor and profile-statistics protocol tests, then did not terminate promptly. Those broad runs were interrupted; no full-suite green result is claimed. The 67 focused backend tests and six membership browser checks were rerun successfully using the isolated locked dependencies afterward. These unrelated failures need their owning workstreams' diagnosis before any whole-repository readiness claim.
