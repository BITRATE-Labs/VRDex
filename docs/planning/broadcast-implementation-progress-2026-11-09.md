# Broadcast implementation progress

Plan: [locked broadcast implementation](../superpowers/plans/2026-11-09-locked-broadcast-implementation.md).

## Delivery contract

BASIC requested the remaining plan as one delivery on November 9, 2026. YouTube was then explicitly deferred to issue 446. Implementation is authorized; deployment and live-provider operations retain their existing gates.

## Execution rulings

- Switch from serial execution to the repository's parallel-worktree delivery skill after the shared control/source foundation passed 101 backend and 17 web checks. Reason: setup/provisioning, direct-media acquisition and production layout are independently testable and now have stable enough contracts. Cost: root must resolve integration seams and run fresh whole-branch review. All leaves converge into one local delivery; no leaf publishes or deploys.
- YouTube was explicitly removed from this delivery by BASIC. Track direct broadcasting and yt-dlp/alternative acquisition investigation in [issue 446](https://github.com/BITRATE-Labs/VRDex/issues/446). Do not silently claim browser embed playback satisfies it.

- Use this existing isolated design-jam worktree and preserve the accepted fixture as reference. The initial checkout was detached at `d2f2febba`; implementation starts on `codex/broadcast-locked-flow`.
- The shell sandbox launcher cannot acquire its helper lock. Read/test commands use the approved escalated route; file edits still use apply_patch.
- Begin with control semantics because the presentation depends on the corrected contract. Task ordering is an engineering dependency, not a separate release.
- Keep the execution record here with the human-facing plan rather than adding a second planning system. No task is complete until its scoped checks pass.

## Implemented

- Locked production workspace and connection wizard, shared header, person lookup, pasted links, contextual player controls, copyable PC/Quest links and optional test return.
- Captured live confirmations check session, intent, source identity and revision. Next preserves mode and a durable lineup cursor across recovery and temporary takeovers. Resume uses the last observed source.
- Community-scoped credential provisioning, immutable running destinations, pinned Custom RTMP/RTMPS transport and preserved deployment-owned bindings.
- Unmapped optional destination credentials leave the primary broadcast available; primary credential resolution stays strict. Seven optional-output and legacy-binding regressions passed after the final review fix.
- Connection tests use ordinary admission and reservations, a two-minute queue bound, at most 60 seconds of worker runtime, decoded per-job identity proof and actual task cleanup before success. Old, cancelled, replaced and terminal worker proofs cannot pass.
- Protected direct MP4/WebM/TS/HLS acquisition, bounded nested requests, finite preroll, video-only silence and durable return to hold at EOF. Worker replacement also returns a selected direct-media input to hold, requiring an explicit take instead of risking replay after a lost completion receipt.
- Quick-check sources expire after 30 minutes when no active control/session references them. New provisioning grants and tests each have a community limit of ten per ten minutes; exact retries are free. Cleaned terminal test jobs become eligible for bounded hourly deletion after 30 days.

## Verified locally

| Evidence | Result |
| --- | --- |
| Combined backend/control/source/media suites | 335 passed after current-main integration and recovery review fixes |
| Web state, authority, preview, adapters and validation | 34 passed |
| Full web suite after current-main integration | 1164 passed |
| Credential broker, transport and test-screen suites | 18 passed |
| Production-component browser flows | 22 passed together, including desktop/mobile, legacy metadata, passed-test editing, active-test recovery, retained replacement drafts, request renewal and non-JSON save errors |
| Packaged Linux renderer and timing | 68 passed |
| Packaged Linux Twitch acquisition/process cleanup | 9 passed |
| Packaged Linux connection test encoding/readback | 10 passed |
| Packaged direct-media proof | MP4, WebM, TS, HLS and silent MP4 decoded, retained finite preroll and reached EOF |
| Image build and source correspondence | Smoke passed; all 138 packaged file hashes matched this checkout |
| Offline implementation closure and program-result contracts | 123 passed in Linux with canonical LF source bytes |
| Backend/web types and edited UI lint | Passed |
| Terraform | Formatted, initialized without a backend, and validated; no plan or apply |
| Documentation site | Production build passed after replacing MDX-unsafe preview links |

Desktop/mobile screenshots were inspected with visual review. Browser fixtures use explicit synthetic transports and do not establish signed-in provider delivery. The two Windows-only AWS executable fixtures were repaired portably; native Linux checks cover the process/pipe behavior Windows cannot establish.

Fresh whole-branch review found and recycled real gaps in provider readback, PC/Quest persistence, stale test receipts, setup recovery, preview transport casing, automatic recovery and Hold confirmations. The reviewer rechecked both final control fixes and independently passed six regressions.

The final recovery pass also separates connection-test teardown from source controls, recreates failed preview transports on retry, and retains live replacement drafts through cancellation or a rejected save. The worker lifecycle suite passed 197 tests; five local-preview tests and the immediate test-renderer cleanup regression passed.

While a connection test is active, ordinary source controls are disabled and their backend commands are rejected. Stop and test cancellation remain available. Control, connection-test and rendered-state regressions passed 102 tests.

Confirmed expired or irreversibly abandoned connection requests receive a new request ID on retry. Uncertain commits retain their original ID, including a committed grant replayed after expiry. Grant and broker regressions passed 13 tests.

Quick switch also retains uncertain preparation IDs and renews completed checks, so an expired temporary source cannot leave the form stuck. Restoring a deployment-owned VRCDN account clears incompatible managed metadata; all ten connection tests pass, including successful worker scheduling after restoration.

Two older browser tests now exercise native preview controls instead of requiring the removed Monitor button. They retain audio ownership, rename, disposal, retry, replacement, responsive fallback and no-resume coverage. Both corrected tests pass locally. Non-JSON gateway responses also retain the setup draft and use the existing friendly retry message.

Finite selection now closes preroll before starting a fresh pacing clock. The rebuilt packaged image passed all five offline media cases. After 6.5 seconds of preroll, four-second MP4, WebM, HLS and silent MP4 inputs retained 3.8 to 3.9 seconds of progressing playback, with one active decoder at a time. Direct-media, input-manager and worker regressions passed 222 tests. The prepared frame and silence cover fresh-decoder startup for at most five seconds.

## Remaining release evidence

The new image/source mix still requires measured Fargate evidence before live rollout. Current main retains its qualified 720p30/AAC320/no-Twitch B0 allocation for the pinned recovery image; that evidence does not qualify this rebuilt image, direct-media mix or Custom destination. No fixture measurement replaced admission evidence. Real broker-role configuration, additive deployment/migration rehearsal, owned-provider publication, real browser audio/network playback and separate PC/Quest device checks remain open. Uploads/custom slate media remain follow-up work; YouTube is [issue 446](https://github.com/BITRATE-Labs/VRDex/issues/446).

Current main was merged before the final PR run. The resolution preserves browser auth waiting for both operator queries and setup, audio-aware allocation, publication stop before awaited acknowledgment, bounded transient-control retries, and the retained/native public playback paths.

The broader Windows backend run stopped at a native process-group cleanup failure; the matching packaged Linux check passed. Normal PR CI independently passed the complete backend suite, types, lint, Terraform and CodeQL on the preceding integration head. Documentation syntax, generated declarations and the offline import boundary were corrected. Current-head jobs and review follow-ups are tracked on [PR 447](https://github.com/BITRATE-Labs/VRDex/pull/447).

No real stream, provider publication, credential write or deployment has been performed.
