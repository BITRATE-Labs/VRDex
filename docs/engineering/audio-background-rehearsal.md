# Audio-only and background playback rehearsal

Status: bounded local implementation and qualification preparation. No production
audio relay or provider configuration is enabled by this work. The full video
relay's `RELEASE_BLOCKER` remains unchanged.

## Outcome and first slice

The intended experience is music continuing when a listener changes pages,
switches apps or locks an iPhone. Audio only must deliver audio bytes through a
native audio element, without downloading or decoding video in the browser.

The transport is already demonstrated. BASIC reported the October 28 protected
hosted synthetic audio/video tests and real VRCDN HLS video working on iPhone
Safari. The same single-upstream relay's copy-AAC audio-only playlist passed
FFprobe and a four-second decode; separate live audio-only phone acceptance was
pending. See the [original experiment record](../../scripts/mobile-media-spike/hosted/README.md)
and [approved shared-relay design](../superpowers/specs/2026-10-28-mobile-vrcdn-playback-design.md).

The first remaining phone target is explicit Audio only on one known public
VRCDN source through the existing protected test page and a finite sandbox.
Complete and integrate the selected shared native HLS path rather than replace
it with another standalone demo. Current-video-to-background
continuity and following the event across DJ changes remain required outcomes;
one-source audio proof does not establish either.

The existing native HLS adapter already has a real audio element and only loads
the selected rendition. It does not use Web Audio. That source implementation is
separate from provider availability, production activation and device acceptance.

## Smaller producer and delivery path

`startAudioPackager` is a bounded memory proof comparator, not a production
replacement for the approved shared copy-HLS worker. It uses
the existing guarded, public-address-pinned VRCDN source relay. A counted
fragmented-MP4 input pipe feeds one FFmpeg process. FFmpeg selects audio, excludes
video, and stream-copies AAC into approximately two-second HLS segments. No relay scratch
files or video segments are generated. The upstream still contains the source's
multiplexed video bytes; this is a client bandwidth/decode improvement, not an
upstream audio-only provider endpoint.

FFmpeg PUTs only to a random loopback sink. The sink caps each audio segment at
128 KiB and its playlist at 16 KiB, with at most two physical ingest requests.
The buffer retains at most nine segment objects and 1 MiB of segment payload.
Pending request buffers, temporary copies, Node, FFmpeg and HTTP buffers are
additional memory; a container/process memory limit still needs qualification.
The first output is inspected with a bounded, owned FFprobe before visibility;
non-AAC audio is refused instead of silently transcoded. Timestamp-reset warnings
stop the rehearsal. Diagnostics remain bounded and are never printed.
The buffer rejects foreign paths, changed immutable segments and playlist tags
that could introduce another network source. Old segments retire only after a
new complete playlist references existing objects. Publications expire after ten
seconds; stalled publication tears down the acquisition. An absolute lifetime
(at most fifteen minutes) and total upstream-byte limit are mandatory.

`createAudioDelivery` is a single-process finite rehearsal handler. It serves
only that buffer through one capability-scoped audio route. Every successful
playlist and segment request consumes its payload budget before response
construction, including copied-URL requests. Every request is reauthorized;
there is no CDN or cached-authorization bypass. The request count, payload bytes,
session deadline and physical authorization concurrency are bounded. Range,
conditional and HEAD requests are refused in this first qualification lane.
Native iPhone request compatibility with those restrictions is unverified.

The in-process counters do not survive restart or coordinate replicas. A hosted
rehearsal must have exactly one process, a finite lifetime and no automatic
restart/replacement that resets its allowance. This is not a production-scale
ledger or a hard total-cloud-dollar guarantee. Denied requests, upstream data,
compute and infrastructure can still cost money outside the delivered-media
allowance.

## Background authority and community events

The approved full relay's grants last twelve hours. Foreground JavaScript cannot be relied
on to renew them while iOS suspends the page. Gateway authorization therefore
has a candidate change using native playlist traffic to renew a still-valid grant in its final hour,
through the existing public `mediaRelayPlayback:refreshPlayback` capability.
That call carries only the grant ID, without the gateway credential. The gateway
reads authority before renewal and again afterward. It cannot renew an expired,
released or revoked grant, admit another source, or restart a failed source.
This changes the approved twelve-hour policy, which requires deliberate resume
after background expiry. Its mechanics are tested, but the policy change needs
a separate disposition before shipping. It is not required to repeat the
already-demonstrated short phone experiment.

Automatic community sequence authorization now follows the public event viewer
without requiring staff to turn on performer sequence. New admission must name
the shared selector's current slot. A future performer's URL cannot substitute
for a missing current URL. Existing valid listening grants retain post-window
continuation, and same-source identity rebind preserves the capability. Public
event/profile visibility, selected source, cancellation, context revision and
revocation checks remain binding. No profile-admission fallback is used.

This does not move event scheduling into native HLS. Following different DJs
while page JavaScript is suspended needs a reviewed server-side event audio
program or another proven native continuation design. Starting a second full
stream on backgrounding is not the proposed solution.

## Proposed finite phone rehearsal

Current recommendation: reuse the protected `vrdex-mobile-playback-test` page
and temporary Vercel Sandbox approach. Use one known public source, one iPhone
Air and one desktop Chrome listener, at most fifteen minutes. Proposed
bounds are 256 MiB total upstream input, 32 MiB aggregate delivered payload and
2,000 handler requests, with source/publication revalidation on each request.
A larger source bitrate can hit the upstream cap before fifteen minutes; the
correct behavior is to stop. These are proposed rehearsal bounds, not production
capacity or cost acceptance.

The old sandbox expired. Its checked-in rewrite is historical, not an available
origin. A new finite sandbox and test-project rewrite need an exact reviewed
team/project identity, source, lifetime, allocation and spend limit before
provisioning. Retain Vercel authentication. Scope the sandbox route with an
unguessable capability so knowledge of the sandbox hostname does not bypass
the finite allowance. Do not add a new LAN listener or firewall exception.
The existing hosted page and local evidence export should be reused unchanged
where possible; its success is still separate from production VRDex integration.

Required phone observations: start explicit audio by touch, navigate within
VRDex, switch apps, lock for several minutes beyond the buffered window, pause
and resume from the lock screen, return to the browser, interrupt with another
audio app, revoke the source and observe refusal, then stop and verify acquisition
cleanup. Use a shortened isolated grant fixture to cross the original grant
expiry, and qualify native renewal separately from ordinary buffer survival.
Record the iOS/browser version and actual audio result. Desktop mobile emulation
is not that evidence.

Video-to-background qualification must check whether Safari continues an audible
native video session or requires a gesture to hand off to audio. Do not promise
an automatic switch that relies on a suspended visibility handler. The existing
MPEG-TS/MSE fallback is not evidence of reliable locked-screen playback.

## Evidence and remaining gates

The new package tests run actual FFmpeg against a generated guarded input,
deliver its playlist and segment through the finite handler, and use FFprobe to
verify AAC audio without a video stream. Unit checks cover memory/output bounds,
copied-URL reservations, revocation, expiry and stalled-publication refusal.
Backend tests drive the real Convex grant renewal past its original expiry
without a page refresh and then revoke its source. They also cover automatic
community event admission and existing continuation constraints.

These tests do not establish native Safari playback, hosted process memory,
maximum-input containment, live VRCDN decoding, production configuration or
server-side lineup advancement. No test result lifts the full relay release
blocker. A separate readiness contract for a finite audio-only rehearsal must be
reviewed against its exact topology before any production enablement.

References: [relay release controls](media-relay-verification.md),
[delivery-ceiling analysis](media-relay-traffic-ceiling.md),
[Apple HLS authoring specification](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices/),
and [WebKit's iOS media-session implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/ios/MediaSessionManagerIOS.mm).
Those platform sources explain the native path and its constraints; this work
makes no blanket background-playback guarantee from documentation alone.
