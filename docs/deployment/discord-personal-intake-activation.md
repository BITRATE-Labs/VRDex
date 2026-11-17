# Personal Discord intake activation

BASIC authorized production activation on November 17, 2026, after PRs
[#472](https://github.com/BITRATE-Labs/VRDex/pull/472) and
[#476](https://github.com/BITRATE-Labs/VRDex/pull/476) merged.

## Provider configuration

The production Discord application is `VRDex`, ID `1516492492189466625`.
User Install was enabled in the Developer Portal with `applications.commands`
only. Guild Install retains `applications.commands`, `bot` and its existing
permissions. The HTTP Interactions Endpoint URL remains empty. Gateway intents
were unchanged. The signed-in `basic_bit` account installed the app successfully.

Live command readback returned `Add event` as a message command with user
installation type `1` and contexts `0`, `1`, `2`. The existing `/vrdex` command
remains guild-only with Manage Server permissions.

The [gateway release](https://github.com/BITRATE-Labs/VRDex/actions/runs/44102181587)
completed rollout and registration from `6b2909f58`. ECS task definition
`vrdex-discord-gateway:3` runs one healthy task with image digest
`sha256:22563134b4ec6c1a86f64dab55bc1d08fc50fee1bcdc993e1126c3f5de9262a1`.
ECR maps that digest to the same commit. A fresh production heartbeat was observed.

## Website extraction repair

An actual selected-message draft reached the editor with its poster but returned
503 during preparation. The website had a sensitive `OPENAI_API_KEY` configured,
but lacked `VRDEX_EVENT_INTAKE_AI_ENABLED`. The shared extractor therefore returned
its disabled fallback. Convex's separate flag was already enabled.

The website flag was bootstrapped as `true`, production only, on project
`vr-dex-web`, ID `prj_Pyki3UJLHa2rRLbAhB1yQP6fmiA0`, team
`team_GoHh5xUc96fAIAqJoG55A71S`. The Vercel variable ID is `3hGEaZ7sFNj6Pcx1`.
The checked-in Vercel resource and conditional import adopt that exact variable;
remove the one-time import after a successful apply. The existing API key was
neither read nor changed.

Deployment `dpl_311rG8UqPJf32N4bQHFqAWyHRQxc` rebuilt the same merged commit
`c1c081b03b1b337597e01f290d824a77c9800c81` with this setting and reached READY.
The production website identifies both browser and server Convex targets as
`superb-pig-954`, with production Clerk at `clerk.vrdex.net`.
The [matching backend deployment](https://github.com/BITRATE-Labs/VRDex/actions/runs/44107438998)
completed successfully.

## Acceptance and remaining checks

Retrying the same saved poster-only draft changed preparation from 503 to 200.
The editor retained its poster, displayed tentative title/date suggestions and
asked for information absent from the poster. No event was published or accepted
on the user's behalf. Private source content, draft identifiers and screenshots
are excluded from this public operator record.

Terraform formatting and validation passed, as did Markdown lint. Independent
review found no remaining Important issue in the production-only resource and
conditional import. The first Terraform apply still needs to adopt the bootstrap.

This proves one account installation and one live selected-message draft recovery.
Separate guild-without-bot, DM, group-DM, denied-public-reply and iOS/Android
acceptance remain pending. Public app description/banner changes remain separate.

For rollback, use the [gateway runbook](./discord-gateway.md#personal-message-command).
Setting the website extraction flag to `false` also disables extraction in the
ordinary website intake editor; it does not turn off Convex connector extraction.
