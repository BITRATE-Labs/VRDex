# Compact analytics choice

## Agreed presentation

BASIC's latest direction supersedes the earlier Off/Limited/Full selector. Limited is an internal interim state before a user chooses, not a selectable option. The public choice is **Off / On**, with On meaning normal Full analytics. Keep a direct Privacy policy link, no benefit pitch and no explanatory paragraphs in the main UI. The policy contains the full explanation. Include only any minimum required disclosure at the initial consent point; exact wording remains under review.

## KISS revision

BASIC rejected region-based logic for the initial version. The [current design](../superpowers/specs/2026-11-10-posthog-foundation-design.md) replaces the previous regional-policy proposal with one flow for everyone.

Current target: internal Limited until there is a saved Off/On choice. On enables account-linked events and masked replay when available, after an explicit valid choice. Off stops optional analytics; it never means a return to Limited. The same control is available from the footer and Account > Privacy. Do not display an unset preference as Off, because interim collection may still be active.

Recommended presentation: offer the two actions once on the first visit in a small nonblocking panel. Equal access to Off and On, no preselected On and no forced decision. Dismissing keeps Limited and remembers that the offer was shown; do not repeat it on every page or visit. The footer lets someone return later. This gives the On option visibility without gating the task or adding a campaign/prompting system. The timing and layout remain recommendations for BASIC's review.

Replay masking stays simple: reuse the existing setup, run a synthetic smoke check and existing tests, and fix demonstrated failures only. Do not add a masking subsystem or more user-facing settings.

This removes geolocation, region tables and runtime exemption logic while aiming to retain useful default audience counts. Verify the actual Limited data flow against consent-exemption criteria before production activation; the label, absence of account IDs or in-memory persistence alone does not establish exemption. Tighten collection toward aggregate-only data if necessary. This is an implementation acceptance check, not another policy menu. If PostHog cannot support that configuration, report the concrete limitation rather than silently changing the default. Full replay still needs valid consent where required. [CNIL audience-measurement criteria](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience)

## Policy and acceptance

Keep provider, purposes, data categories, cross-visit/account linking, replay, masking, access, retention and deletion in the policy. Required minimal consent information must remain at the choice where necessary. The change to two public choices does not by itself approve a policy draft or production activation.

Verify the control is reachable without sign-in, decline is as easy as allow, closing never upgrades Limited to Full, saves preserve restrictions, and the user returns to the original task. The policy link should land directly on the analytics section. Test mobile, keyboard and screen-reader use with screenshot/VLM review.

The earlier Mobbin reference review remains supporting evidence for a permanent settings entry and explicit save feedback only. It does not establish compliance. The [audit](posthog-usage-audit-2026-11-10.md) retains the source/live evidence. This short document supersedes the earlier presentation and regional-policy proposal.
