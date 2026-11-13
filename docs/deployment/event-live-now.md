# Event live discovery

## Status and activation

Homepage Live now reads shared cached observations for current public event sources. Entries use stable title order inside one horizontally scrolling row, so a busy night cannot expand the module over the schedule.
Source configuration is off by default. This document does not authorize provider
polling, production enablement, secret provisioning or relay/broadcast activation.

| Name | Scope | Default and purpose |
| --- | --- | --- |
| `EVENT_LIVE_ENABLED` | Convex backend | Unset or false. Only exact `true` enables refresh and public cache reads |
| `TWITCH_CLIENT_ID` | Convex backend | Required for Twitch discovery, existing app client identity |
| `TWITCH_CLIENT_SECRET` | Convex secret store | Required for Twitch discovery, never returned publicly |
| `VRDEX_CONNECTOR_TOKEN_KEY` | Convex secret store | Existing 32-byte base64 AES-GCM key, required for encrypted Twitch token reuse |

Before enabling, the release owner must verify the exact deployed source and
backend, provider credentials, workload and budget. Resolve or explicitly accept
[VRCDN viewer-accounting uncertainty](https://github.com/BITRATE-Labs/VRDex/issues/217).
A brief transport probe may consume a provider viewer slot. No recurring sweep
was launched during source qualification.

Manage these values through the repository's established exact-deployment Convex
operations. Record the approved target and activation in the release receipt.
Self-hosters use their own Twitch app and encryption key. Keep values in secret
stores. A missing credential or invalid encryption key makes Twitch unavailable,
without repeated token issuance or an offline claim.

The refresh uses existing AES-256-GCM connector encryption for its persisted app
token. Its cache is bound to the client credentials by a SHA-256 fingerprint and
expires before the provider token. Changing the client secret causes a new token
on the next eligible refresh. A provider 401 invalidates the token; transient
network errors preserve a still-valid token. Rotating the encryption key makes an
old cache unreadable and the next eligible refresh replaces it. Coordinate that
rotation with the other connectors sharing the key.

## Scope and selection

The first slice supports current VRCDN performer sequences and explicitly enabled
event streams expressed as canonical Twitch channel URLs or VRCDN URLs. It does
not add Twitch-only performers to the sequence player. Unsupported event sources
stay out of the row, even if a later performer has a usable source.

The same shared `joinLineupSlot` algorithm selects the unambiguous current slot
in the backend and browser player. Existing inferred ends and untimed-row rules
are preserved. Explicit enabled event streams retain precedence. Date-only,
cancelled, private or hidden events and missing current sources are excluded.

The public projection rechecks event, host and performer visibility plus current
source identity. Clicking Play fetches the current public event again and checks
its selected source and cache expiry before using the existing retained player.
Cache records never grant playback authorization. Fresh public lookups are fenced per retained owner so a slower earlier Play selection cannot replace a later click. A lookup that cannot finish within ten seconds releases Play for retry and never connects media. Active listener recovery and
healthy overtime playback remain independent of browse-result expiry.

A DJ profile shows the associated event entry only when one eligible cached event
matches that performer. Two simultaneous matches are not guessed. A truncated cache also withholds a DJ association instead of claiming uniqueness from a partial result. Existing
standalone profile stream controls remain available.

## Limits and failure behavior

Every minute one atomic lease owns refresh. Its 55-second deadline fences stale
writers and allows the next tick to recover after a crash. Two separate indexed
queries read at most 20 recent starts and 20 ongoing ends, each with its own
persistent cursor. A playback-only public projection omits unused worlds, participants and roster media kits to keep nested reads bounded. Convex permits one pagination operation per query, so the
scheduler combines these bounded results in a separate selection query.

Each cycle deduplicates canonical provider identities, chooses at most 20 sources
oldest-observed first, and opens at most four simultaneous VRCDN probes. Each
VRCDN read has the existing five-second timeout and cancels its media body.
Twitch sources share one Get Streams batch and a reusable encrypted app token.
Actual rate-limit reset headers control backoff. Restricted or omitted Twitch
results, malformed payloads, missing credentials, timeouts and other failures
remain unavailable, not confident offline observations.

Observations expire after 90 seconds. Public entries expire sooner at their selected slot or event boundary, so time alone cannot keep a past performer advertised while the next one lacks a source. Public reads scan at most 100 recent cache metadata records, deduplicate their
provider observation reads, and load at most 24 public event projections. Unavailable
metadata is excluded before spending the public-projection budget. The client also expires each entry on a timer if database
refresh stops. Convex subscriptions do not rerun merely because time passes, so server rendering filters absolute expiry again and each client schedules the remaining deadlines. See [Convex query time guidance](https://docs.convex.dev/understanding/best-practices/#dont-use-datenow-in-queries). A full or heavily paginated candidate pool can exceed the refresh
budget, so stale results disappear while cursors and oldest-observed selection
rotate work fairly. No unlimited fresh-coverage promise is made.

At a continuously full all-VRCDN budget, the upper bound is 28,800 brief reads per
day. This is neither a measured population nor a provider billing estimate.
Expired metadata older than a day is removed in bounded batches during refresh.
Only bounded aggregate result counts and duration are logged, without stream IDs,
profile names, raw provider payloads or credentials.

## Rollback and qualification

Set `EVENT_LIVE_ENABLED` away from exact `true` on the reviewed deployment. The
cron becomes a no-op and the public query returns no entries. This does not stop
an already-playing listener, change an event, enable relay or alter broadcasting.

Required source checks include public visibility/source edits, current-versus-
future eligibility, encrypted token reuse, rate-limit backoff, lease fencing,
expiry and work/concurrency caps. Browser checks cover zero pre-Play media,
source changes before Play, independent entry expiry and one retained player
across synthetic Home/event/DJ navigation. Desktop and mobile visuals are separate
from physical iPhone/background and real-provider qualification.
