# Membership activity implementation verification

This implements the [approved design](../superpowers/specs/2026-11-11-membership-activity-identities-design.md). Evidence below is local, not deployment or live provider acceptance.

## Implemented behavior

Authorized activity queries resolve latest locally cached VRChat names and unique visible verified VRDex profiles using exact provider IDs. Future role events preserve validated role and actor fields. Event-recorded evidence remains separate from cached names. Rows show readable actions, role names and staff attribution, profile links and keyboard-operated details. Missing history stays unresolved.

Recoverable page errors preserve loaded rows and open details. Live page subscriptions remain active, so permission loss clears history immediately. Errors are recoverable only when the backend explicitly marks a failure after authorization; unknown or access failures clear history. Retry refreshes failed pages while retaining their boundaries, and invalid cursors restart pagination. Count-only session storage retains a bounded high-water mark and restores up to 250 rows in the original 25-row pages. Further rows remain available through Load more. Filters remain in the existing analytics URL.

## Independent review and fixes

A fresh GPT-6 Astra reviewer inspected the whole implementation. It found a false-unique match when one eligible profile's proof history overflowed and another profile verified. A failing mixed-case test reproduced it. The fix treats that identity as unresolved and omits its VRDex link. A bounded precheck protects the existing shared verifier, whose behavior is unchanged.

The reviewer also found an actor-link separator encoded outside UTF-8. An actor-VRDex fixture reproduced it; the source byte was corrected and a replacement-character assertion now passes. Coverage also checks deduplicated reads, page verification budget exhaustion and long names. No review findings remain deferred.

PR review also corrected replay target-ID casing, synchronized generated API declarations, bounded count restoration, preserved 25-row page boundaries on return, restored an explicit response allowlist, added descriptive accessible link/disclosure names, and honored the screenshot capture opt-out. The page verification budget remains bounded and fails closed; restoring history now uses the same pages as loading it initially.

A further review pass found that role-name retention depended on a valid role ID and malformed optional ingest strings could reject a whole page. Both regressions failed before the fixes. Role fields now validate independently, and invalid optional name/actor/role strings are omitted while core audit validation, immutable conflicts and scan verification remain enforced.

The recovery review corrected transient errors clearing history and interrupted restoration shrinking the saved count. Independent review then found cursor invalidation and retry-boundary cases. Regressions now cover new events during normal loading and retry, invalid cursors, permission loss during a transient failure, and denial followed by Retry and restored access. Every non-final page pins its end boundary to the following page's start. A failed first page no longer claims empty history, and the backend retains the original diagnostic cause before classifying errors for the UI. No blocking findings remain from that review.

Provider-controlled member, actor and role names render inside native bidirectional isolation elements. Directional formatting in a name cannot reorder surrounding action labels or links; recorded Unicode evidence remains unchanged. A directional-override fixture verifies browser isolation and receives desktop/mobile screenshot review.

Full independent review also found that pinned windows could trigger unbounded optional identity reads and that unbroken actor names could overflow their column. Optional cache/association lookups now stop after 200 distinct identities; remaining identities keep validated VRChat links without database reads. A 1,000-identity regression verifies the fixed 400 cache/association-query bound. Unbroken actor names wrap inside their column, with a targeted desktop/mobile screenshot assertion.

Ingest enforces the worker's metadata relationships too: recorded actor names require a validated actor ID, and role fields are retained only on assignment/removal events. A backend `convex-test` case round-trips returned cursors, pins both page boundaries, changes the refresh id and inserts a newer row, verifying contiguous unique results and final-page exhaustion. This exercises the backend function contract; deployed runtime acceptance remains separate.

Automatic invalid-cursor recovery recognizes wrapped, native system and message forms and restarts once per failure episode. It re-arms only after all current pages load successfully and the restoration target is reached or the query is exhausted. A repeated rejection before full recovery stops restoration and shows Retry, rather than issuing an unbounded query loop. Catchable identity-enrichment failures are logged and return authorized core audit rows without identity decorations. Platform-enforced query limits can still abort the request. Collector rollback order and additive-schema compatibility are documented in the deployment guide.

Page assembly follows the installed Convex hook's model: concatenate all available requested pages and use only the final page's completion state. Retry preserves established boundaries and leaves the final page open-ended. The backend's optional `scopeUnavailable: true` field clears every cached page immediately, even if other queries are still pending; cursor encoding carries no availability meaning. The pinned SDK forwards cursor/endCursor to the database syscall, but not the subscription-refresh id. Real backend cursor acceptance and runtime cost remain unmeasured here.

## Local evidence

- Worker suite: 270 passed after the replay-casing and independent role-name regressions.
- Focused membership, identity, proof-verification and automatic-statistics backend suite: 74 passed after PR review fixes, including returned-cursor round trips, event-specific metadata relationships, bounded identity reads for expanded windows, failure-tolerant identity enrichment, explicit scope availability, malformed optional evidence, empty legacy names and an exact public response shape.
- Storybook desktop/mobile assertions: 40 passed, including role labels, actor/target links, accessible details, bounded restoration, native/persistent cursor rejection, repeated recovery episodes, completed page windows, unavailable scopes, transient recovery, first-page errors, reactive boundary changes, bidirectional-name isolation and access-loss/retry using real hooks with synthetic transport. The local run used four workers.
- Repository backend and web type-check scripts passed with the isolated checkout's frozen-lockfile dependencies.
- Focused frontend lint and whitespace checks passed.

Desktop/mobile screenshots received VLM review: readable role context, visible keyboard focus and no horizontal clipping. Local PNGs are under `.cache/artifacts/membership-roles-storybook-{desktop,mobile}.png` in the implementation checkout.

## Remaining release evidence

Actual authenticated sign-in return, live VRChat role payloads and provider navigation were not exercised. Field semantics come from the pinned community specification cited by the worker and deployment guide. Storybook data is synthetic.

No historical replay, general resolver, migration, production write, merge or deployment was performed. Comparable workspace screens remain follow-up work. Merge and deployment remain separately gated.

## Broader suite limits

The full backend and web unit suites were also attempted locally. They reported failures in the unmodified VRCDN CBR-envelope, renderer transition-anchor and profile-statistics protocol tests, then did not terminate promptly. Those local runs were interrupted. The focused backend and browser checks listed above passed using isolated locked dependencies. The PR's exact-head CI record supplies remote full-suite evidence; these local attempts alone do not establish whole-repository readiness.
