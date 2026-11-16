# Claude pull request review

## Status

Current implementation. The reviewer is a bounded, read-only second opinion;
it does not replace CI, human judgment, or the repository's merge-ready gate.

VRDex uses BASIC's shared reusable reviewer, Basic PR Review
([`BITRATE-Labs/basic-pr-review`](https://github.com/BITRATE-Labs/basic-pr-review)),
called by `.github/workflows/basic-pr-review.yml`. The model is still Claude.
The reviewer logic, limits, and publishing live in that repository, and its
[README](https://github.com/BITRATE-Labs/basic-pr-review#readme) is the
reference for current behavior. This repository keeps only the caller and its
review contract in `REVIEW.md`. The shared reviewer replaced a repository-owned
reviewer and its control and reconciliation workflows on 2026-11-03.

## When it runs

The caller runs on `pull_request_target`, so its workflow definition comes from
the trusted default branch. The shared workflow reviews same-repository,
non-draft, human-authored pull requests that target the default branch when they
are opened, reopened, pushed to, marked ready, or retargeted, and when a skip
label is removed. Forks and bot-authored pull requests are rejected before any
credential is requested.

Drafts are reviewed only on request: adding the `request-pr-review` label to an
open pull request, draft or not, reviews its current head. The label is removed
after the review publishes so it can be added again.

The `skip-pr-review` label, or the older `skip-claude-review`, opts a pull
request out. Create or recover the labels with the checked-in commands below;
`--force` keeps the description and color reproducible:

```powershell
gh label create skip-claude-review --repo BITRATE-Labs/VRDex --color 6E7781 --description "Skip the bounded Claude PR review" --force
gh label create request-pr-review --repo BITRATE-Labs/VRDex --color 1D76DB --description "Ask basic-pr-review to review the current head, draft or not" --force
```

## Trust and permissions

The shared workflow checks out the trusted base, uses the pull request head only
to compute the diff, and deletes it before the token is fetched. It never runs
project scripts, dependency installers, builds, tests, or hooks from the pull
request. Claude receives only the Read tool. `REVIEW.md` and root `AGENTS.md`
are read from the base commit, so a pull request can propose changes to them
but cannot weaken its own review.

The caller cannot add steps or inputs to the shared workflow, and it can only
grant fewer permissions than the shared workflow asks for.

## Credential and infrastructure

The canonical subscription OAuth credential stays in AWS Secrets Manager at
`/basic/shared/claude-code-oauth-token` in `us-east-2`. The shared workflow
assumes `basic-shared-claude-github-review` through GitHub OIDC. The role trusts
only the shared workflow at its `v1` tag (`...review.yml@refs/tags/v1`), run
from the default branch, for enrolled repositories. No long-lived Anthropic or
AWS credential belongs in VRDex repository secrets, source, logs, artifacts, or
comments.

The caller pins `@v1`, not a commit SHA, so a reviewer release reaches VRDex
without any change here. Only the shared repository's owner can move that tag.
The role, its trust, and the release procedure are owned in `BASIC-BIT/basic-infra`
(`terraform/stacks/shared-secrets`, `docs/shared-claude-oauth.md`). To roll the
caller back, pin a known-good commit SHA instead, which also needs a matching
trust entry in basic-infra.

## Cost controls

Draft (unless requested), fork, bot, and skipped pull requests do not spend
review quota. Input size, time, and turn limits are set in the shared workflow.

The reviewer uses the shared Claude Code subscription rather than an Anthropic
API key. There is no dollar ceiling. If usage is too high, prefer a narrower
trigger policy over silently weakening review depth.

## Result format and follow-up

The shared reviewer owns one sticky comment headed "Basic PR Review". A
completed comment names the reviewed head and base, lists source-linked findings
by priority, and ends with an explicit Important-finding line. Failures say they
are not an approval. It never edits code, opens inline threads, resolves
comments, or pushes a branch.

It also sets a `basic-pr-review` commit status on the pull request head:
success when a review is published or the pull request is exempt, failure when
the review ran and did not complete, and nothing (pending) while unreviewed. It
is not a required check.

Recycler work stays with the implementing human or agent:

1. Read the current sticky result together with all other review surfaces.
2. Classify each finding as apply, reject with reason, split to follow-up, or
   ask one focused question.
3. Make the smallest correct patch and run relevant verification.
4. Reply to and resolve handled review threads before pushing.
5. After every push, once checks finish, re-read checks, ordinary comments,
   review threads, formal reviews, and mutable sticky summaries before calling
   the pull request merge-ready.

Each review names the commits it covered, so compare those against the current
head and base.
