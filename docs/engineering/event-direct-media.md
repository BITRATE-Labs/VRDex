# Direct media broadcast inputs

Custom broadcast sources accept canonical `{kind:"direct_media",url}` inputs.
The initial formats are HTTPS MP4, WebM, MPEG-TS and HLS. URL extensions select
an allowed demuxer; only matched decoded video and audio establish readiness.
Video-only sources generate timestamped silent PCM from decoded video frames.
YouTube acquisition is deferred to [issue 446](https://github.com/BITRATE-Labs/VRDex/issues/446).

## URL and fetch boundary

URLs require a public DNS hostname, HTTPS on port 443, a supported extension and
at most 2048 characters. Credentials, query strings, fragments, IP literals and
local hostnames are rejected. Timestamp-bearing and signed URLs remain outside
this admission rule. Browser preview uses native video, mpegts.js or hls.js;
the origin must permit browser playback and any required CORS requests.

The worker passes opaque loopback URLs to FFmpeg. The relay resolves and pins
public IPv4 on every upstream request, including redirects and HLS playlists,
segments, encryption keys and initialization maps. Mixed public/private DNS
answers fail. Three redirects are permitted, each with fresh validation.
HLS references are rewritten to opaque loopback routes. Playlist bodies are
recognized by content as well as extension, including disguised child playlists.
The decoder has explicit format and protocol allowlists, a 64 MiB single-allocation
limit, 9,437,184 pixels per decoded frame, 480,000 samples per decoded audio
frame and 16 input streams.

Each acquisition permits eight concurrent requests, 1024 recent playlist routes,
1 MiB manifests, 512 MiB per response and 16 GiB total, with a 12-hour lifetime.
Unused child routes expire after 60 seconds. DNS has a two-second deadline;
upstream inactivity has a five-second deadline. There are at most two physical
acquisitions, and disposal retains capacity until pending DNS and sockets close.

## Finite playback

MP4 and WebM are finite. HLS preflight inspects a bounded master-playlist tree
and marks it finite only when each media playlist has `EXT-X-ENDLIST`.
MPEG-TS is treated as live until clean EOF. Decoded finite candidates pause in
preroll until the program selects them. Paused preroll remains ready without
claiming progressing playback. A decoder error after finite playback begins is
terminal, so a partial announcement is not automatically replayed.

Clean direct-media EOF emits `ended:true`. The operator coordinator consumes this
observation through the fenced completion RPC, commits manual slate and clears
resume state. Worker recovery uses that committed intent. Live HLS and MPEG-TS
errors reconnect through the existing bounded supervisor.

## Local verification

Run the boundary suite with:

```powershell
node --import tsx --test tests/backend/event-direct-media.test.ts
```

Run `node scripts/event-direct-media-local-proof.mjs` inside the Linux worker
image. The script creates synthetic MP4, WebM, MPEG-TS, HLS and silent MP4 inputs,
passes them through the production relay and supervisor, and requires decoded
readiness, finite preroll stability and terminal EOF. Its injected synthetic
origin does not bypass DNS validation. A container with `--network none` is enough.
Windows FFmpeg does not support the worker's extended POSIX pipe descriptors.

This proof does not establish final-image allocation, continuous encoded output,
provider publication or browser/device acceptance. Those require the separate
broadcast integration and capacity gates.
