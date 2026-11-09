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
- Connection tests use ordinary admission and reservations, a two-minute queue bound, at most 60 seconds of worker runtime, decoded per-job identity proof and actual task cleanup before success. Old, cancelled, replaced and terminal worker proofs cannot pass.
- Protected direct MP4/WebM/TS/HLS acquisition, bounded nested requests, finite preroll, video-only silence and durable return to hold at EOF.
- Quick-check sources expire after 30 minutes when no active control/session references them. New provisioning grants and tests each have a community limit of ten per ten minutes; exact retries are free. Cleaned terminal test jobs become eligible for bounded hourly deletion after 30 days.

## Verified locally

| Evidence | Result |
| --- | --- |
| Combined backend/control/source/media suites | 332 passed after merging current main; final setup/limit suite 16 passed |
| Web state, authority, preview, adapters and validation | 34 passed |
| Full web suite after current-main integration | 1164 passed |
| Credential broker, transport and test-screen suites | 18 passed |
| Production-component browser flows | 15 passed, including desktop, mobile, lookup, confirmations, setup and refresh recovery |
| Packaged Linux renderer and timing | 68 passed |
| Packaged Linux Twitch acquisition/process cleanup | 9 passed |
| Packaged Linux connection test encoding/readback | 10 passed |
| Packaged direct-media proof | MP4, WebM, TS, HLS and silent MP4 decoded, retained finite preroll and reached EOF |
| Image build and source correspondence | Smoke passed; all 137 packaged file hashes matched this checkout |
| Backend/web types and edited UI lint | Passed |
| Terraform | Formatted, initialized without a backend, and validated; no plan or apply |

Desktop/mobile screenshots were inspected with visual review. Browser fixtures use explicit synthetic transports and do not establish signed-in provider delivery. The two Windows-only AWS executable fixtures were repaired portably; native Linux checks cover the process/pipe behavior Windows cannot establish.

Fresh whole-branch review found and recycled real gaps in provider readback, PC/Quest persistence, stale test receipts, setup recovery, preview transport casing, automatic recovery and Hold confirmations. The reviewer rechecked both final control fixes and independently passed six regressions.

## Remaining release evidence

The new image/source mix still requires measured Fargate evidence before live rollout. Current main retains its qualified 720p30/AAC320/no-Twitch B0 allocation for the pinned recovery image; that evidence does not qualify this rebuilt image, direct-media mix or Custom destination. No fixture measurement replaced admission evidence. Real broker-role configuration, additive deployment/migration rehearsal, owned-provider publication, real browser audio/network playback and separate PC/Quest device checks remain open. Uploads/custom slate media remain follow-up work; YouTube is [issue 446](https://github.com/BITRATE-Labs/VRDex/issues/446).

Current main was merged before the final PR run. The resolution preserves browser auth waiting for both operator queries and setup, audio-aware allocation, publication stop before awaited acknowledgment, bounded transient-control retries, and the retained/native public playback paths.

The broader Windows backend run stopped at a native process-group cleanup failure; the matching packaged Linux check passed. Normal PR CI independently passed the complete backend suite, types, lint, Terraform and CodeQL. Documentation formatting and generated-declaration drift were identified for correction; remaining CI jobs are tracked on [PR 447](https://github.com/BITRATE-Labs/VRDex/pull/447).

No real stream, provider publication, credential write or deployment has been performed.
