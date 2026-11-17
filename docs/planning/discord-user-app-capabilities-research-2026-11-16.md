# Discord user-installed app capabilities

Research checked November 16, 2026. Official Discord sources only. This note covers platform feasibility, not VRDex implementation or approval to collect messages.

## Recommendation

**Current recommendation:** use an explicit message context command to create a private event draft, then open authenticated VRDex review. User installation can support this in personal DMs, group DMs and guilds where the bot is absent. It does not grant ongoing conversation access. Keep a slash-command route for content and files the user explicitly supplies.

## Confirmed capabilities

| Question | Officially documented answer |
| --- | --- |
| Where can a user-installed app appear? | Across the installing user's guilds, DMs and group DMs. It respects the user's permissions. User installation needs no server-specific permission. [Application resource](https://docs.discord.com/developers/resources/application#user-context). |
| Is guild bot membership necessary? | Application commands work independently of a bot user in the guild. Register global commands supporting `USER_INSTALL` and the relevant contexts. [Application commands](https://docs.discord.com/developers/interactions/application-commands). |
| Which contexts? | `GUILD=0`, `BOT_DM=1`, `PRIVATE_CHANNEL=2`. The last means DMs with other users and group DMs. The user-install tutorial demonstrates commands in any guild, including guilds without the app installed. Default user-install scope is `applications.commands`. [User-install tutorial](https://docs.discord.com/developers/tutorials/developing-a-user-installable-app). |
| What does selecting a message supply? | A message context command targets one message, takes no arguments and supplies that message through interaction resolved data. Slash commands instead supply explicit options, including text and attachment options. Neither is a channel-history picker. [Application commands](https://docs.discord.com/developers/interactions/application-commands#message-commands). |
| Is privileged message-content access needed? | No for the selected message. The message on which a context menu command is used is an explicit exception to message-content restrictions. The exception covers message-content fields such as content, embeds, attachments and components. [Gateway message-content rules](https://docs.discord.com/developers/events/gateway#message-content-intent). |
| Can server admins block public replies? | `USE_EXTERNAL_APPS` allows public replies from user-installed apps absent a server install. Denial still permits use but makes replies ephemeral. Do not describe that denial as a blanket block on commands. [Permissions](https://docs.discord.com/developers/topics/permissions#bitwise-permission-flags). |
| Can results stay private? | Ephemeral responses are supported. Defer privately within three seconds, then edit the original response. Tokens last 15 minutes. User-only installs have a five-followup limit per interaction. [Interaction responses](https://docs.discord.com/developers/interactions/receiving-and-responding). |

Message objects define text, author, timestamps, attachment and embed fields. Interaction resolution describes messages as partial objects, so tolerate missing fields. Do not assume replied-to messages, forwarded snapshots or embed contents contain a complete announcement or lineage. [Message resource](https://docs.discord.com/developers/resources/message#message-object), [resolved data](https://docs.discord.com/developers/interactions/receiving-and-responding#resolved-data-structure).

Discord attachment URLs expire. Discord refreshes them in its own client, which is not a promise of permanent usability on VRDex. **Current recommendation:** process selected posters promptly and allow reattachment after expiry. BASIC selected using the poster as artwork by default, with a visible remove option before publication. A stored Discord URL alone is not durable poster storage. [Signed attachment URLs](https://docs.discord.com/developers/reference#signed-attachment-cdn-urls).

## Identity and access boundaries

An interaction identifies its actor through `member.user` in guilds or `user` in DMs. `authorizing_integration_owners["1"]` identifies the installing user and can differ from the actor on component interactions. **Current recommendation:** bind drafts and actions to the actor, validate ownership on every action, and do not treat possession of a draft link as authentication. [Interaction identity fields](https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object).

User installation is not a VRDex login. The commands install flow need not exchange an OAuth token. For website binding, Discord's `identify` scope permits `/users/@me`; the authorization-code flow supports session-bound `state` protection. **Current recommendation:** match Discord's stable user ID to an authenticated VRDex account using the existing provider link, or explicitly link it through a protected login flow. Discord identity does not establish community ownership or VRDex publication rights. [OAuth2](https://docs.discord.com/developers/topics/oauth2).

User-installed apps are limited to commands. Installation supplies no authority to monitor arbitrary conversations, fetch adjacent messages, or read history through a pasted private message link. Restricted OAuth scopes such as partner-only `dm_channels.read` and local-RPC `messages.read` are not substitutes. **Current recommendation:** gather more context only through additional deliberate selections or pasted/uploaded content. [Quick start](https://docs.discord.com/developers/quick-start/getting-started), [OAuth2 scopes](https://docs.discord.com/developers/topics/oauth2#oauth2-scopes).

## Desktop, mobile and distribution

Discord documents desktop/browser and mobile App Launcher use, plus slash commands. Message commands are documented as right-click or tap actions. The support article describes their Apps submenu on desktop but does not provide an exhaustive current iOS/Android interaction matrix. The App Directory is desktop/browser-only. **Unknown:** the exact menu placement and reliability of the complete select-to-VRDex journey on current iOS and Android clients. Verify those before promising parity. [Using apps](https://support.discord.com/hc/en-us/articles/21334461140375-Using-Apps-on-Discord), [command types](https://docs.discord.com/developers/interactions/application-commands#application-command-types).

Direct installation links are documented separately from Discovery. Discovery requires identity and application verification, then its own qualification criteria in the Developer Portal. Verification documentation still identifies a greater-than-100-server scaling requirement. Do not reinterpret that as a 100-user-install cap. **Unknown:** the current app's installation settings, verification and distribution eligibility; no authenticated Developer Portal state was inspected. [Install-link tutorial](https://docs.discord.com/developers/tutorials/developing-a-user-installable-app#installing-your-app), [Discovery requirements](https://docs.discord.com/developers/discovery/enabling-discovery), [app verification](https://support-dev.discord.com/hc/en-us/articles/23926564536471-How-Do-I-Get-My-App-Verified).

Privileged-intent review changed in June 2026 to 10,000 unique users accessible across guild installations, with annual reapplication. This is distinct from app verification and user installation. The proposed selected-message route does not need privileged message-content access. [Current intent review rules](https://support-dev.discord.com/hc/en-us/articles/40281523410967-Changes-to-Privileged-Intent-Access-for-Discord-Apps).

## Scope and acceptance implications

**Current recommendation:** one explicit message plus its available attachments/embeds is the smallest useful input. Separate-message lineup details need explicit additions or manual correction. No ambient history fetch, user token, self-bot or access-control bypass belongs in this design.

Publishing event facts is a separate user action. Installation is not consent from other message authors to publish their private text, names or attachments. Default to private draft processing and reviewed event fields; do not automatically make private source links, quotations or full payloads public. The public-source label must not imply official organizer authority merely because somebody submitted a Discord message.

Before implementation approval, test a fixture announcement in a guild without bot membership, a personal DM and a group DM; include text, embed and poster variants. Check desktop/browser, iOS and Android; denied external-public replies; an unlinked or mismatched VRDex account; missing or expired attachment; retry/duplicate invocation; and a review session lasting beyond the interaction token. These are proposed acceptance cases, not completed tests.

No runtime app, private message, production setting or publication was inspected or changed. No API calls or client acceptance tests were performed.
