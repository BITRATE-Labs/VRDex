# Broadcast implementation progress

Plan: [locked broadcast implementation](../superpowers/plans/2026-11-09-locked-broadcast-implementation.md).

## Delivery contract

BASIC requested the whole plan as one delivery on November 9, 2026. No independently released VRCDN/Twitch, direct-media or YouTube milestones. Implementation is authorized; deployment and live-provider operations retain their existing gates.

## Execution rulings

- Use this existing isolated design-jam worktree and preserve the accepted fixture as reference. The initial checkout was detached at `d2f2febba`; implementation starts on `codex/broadcast-locked-flow`.
- The shell sandbox launcher cannot acquire its helper lock. Read/test commands use the approved escalated route; file edits still use apply_patch.
- Begin with control semantics because the presentation depends on the corrected contract. Task ordering is an engineering dependency, not a separate release.
- Keep the execution record here with the human-facing plan rather than adding a second planning system. No task is complete until its scoped checks pass.

## Progress

- Control semantics: in progress.
- Added regression cases for automatic/manual Next, failed preparation retaining intent/output, and preserved manual-revision takeover coverage. Automatic Next failed before the fix and passes afterward. The complete control suite passes 72/72; backend typecheck passes.
- Changed protocol-2 target resolution and legacy completion mapping to preserve Next mode. This is not yet a complete control-task acceptance result; worker recovery, captured confirmations and Resume remain to be implemented/qualified.
- Combined control/worker run initially passed 250/253. One assertion encoded the old manual-Next behavior and its pinned-manual fixture was corrected; two admission tests fail identically on untouched HEAD. Their executable AWS stubs use a Unix shebang/chmod pattern on Windows. Keep those failures visible until verified in the supported worker test environment or repaired portably.
- Production presentation, provisioning, connection tests, integrated lookup/playback, direct media, YouTube qualification and full acceptance: pending.

No real stream, provider publication, credential write or deployment has been performed.
