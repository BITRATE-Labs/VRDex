# YouTube input feasibility

## Recommendation

Current recommendation, November 9, 2026: implement YouTube link recognition and official local player preview separately from shared-output eligibility. Do not mark a YouTube URL ready for the restream worker until a permitted acquisition path and decoded-media proof exist. This preserves the locked interaction without claiming a capability the current worker does not have.

The full requested delivery is not yet feasible through a documented standard YouTube API alone. This is an engineering finding, not a ruling that every possible licensed integration is impossible. Obtain a supported acquisition agreement or use a creator-supplied original/encoder feed. The latter can deliver the content through a qualified direct-media or existing ingest path, but it is not arbitrary YouTube-URL restream support and must not be described as such.

## Verified source contracts

- `convex/_eventBroadcastSources.ts` accepts canonical VRCDN and Twitch inputs only.
- `workers/restream/input-manager.mjs` dispatches to the Twitch factory or VRCDN factory, owns at most two physical acquisition handles, and waits for transport readiness. There is no YouTube factory.
- `workers/restream/event-worker.mjs` supplies those two factories. Its Twitch integration imports the specifically pinned Twitch plugin in `twitch_input.py`; the presence of Streamlink is not generic YouTube support.
- `program-renderer.mjs` and `input-supervisor.mjs` consume decoded, timestamped video frames and PCM audio. A browser iframe does not produce that worker input contract.

## Provider evidence

The [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) documents visible embedded playback, controls, player state and errors. It does not document a raw video/audio pull endpoint for this restream worker. Its documented unavailable/embedding-disabled and autoplay errors need local preview handling.

The [LiveStreams API](https://developers.google.com/youtube/data/live/reference/rest/v3/liveStreams) configures media sent **to** YouTube. Its ingestion address is an upload destination, not a downloadable live source. [LiveBroadcasts](https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts) manages broadcast events and provides monitor embed HTML; that is not a raw source API either.

The [developer policies](https://developers.google.com/youtube/terms/developer-policies), sections III.D.7, III.E.1 and III.I, restrict undocumented API access, copying without written approval, audiovisual modification and background players. A hidden browser/capture approach is not established as an approved alternative by those documents. YouTube's [service terms](https://www.youtube.com/static?template=terms), Permissions and Restrictions, separately constrain downloading, retransmission, automated access and public/noncommercial use. Content-owner permission does not itself establish YouTube's permission for a particular acquisition method.

YouTube documents a user-operated [download of the user's own uploaded videos](https://support.google.com/youtube/answer/56100?hl=en). That can supply an original-file workflow subject to the user's rights and the documented limits. It is not a server API for arbitrary watch URLs or a live pull source.

## Options and disposition

| Approach | What it can establish | Disposition |
| --- | --- | --- |
| Official visible iframe | Local preview and playback state, with normal provider errors. | Supported preview approach. It does not establish decoded worker input or rights to rebroadcast. |
| Creator supplies original file or simultaneous encoder feed | A separate direct-media/ingest source that can be validated through existing worker seams. | Practical content path after that format is qualified. Requires explicit selection; cannot silently substitute for a pasted YouTube URL. |
| Provider-approved/licensed acquisition | Potential direct source-to-shared-output integration with an agreed delivery mechanism. | Candidate for full YouTube URL support. No such agreement or delivery endpoint was provided or verified in this task. |
| Extractor or hidden-browser capture | Possible technical experiments, with new transport/browser/audio-capture/runtime requirements. | Not a supported implementation choice on current evidence. Do not install or ship it as if permission and reliability were settled. |

## Required acceptance for a future acquisition adapter

Once the mechanism is established, prove an owned finite video and owned live source through the actual two-handle acquisition manager, matching decoded readiness, promotion, uninterrupted shared encoding and public output. Cover private/deleted/embedding-disabled videos, age/region restrictions, expired source URLs, ads, stalls, disconnects, cancellation, seek/start position, finite EOF and worker restart without unrequested replay. Package the runtime reproducibly and remeasure admission capacity, memory, startup time and egress cost. Provider availability or a successful iframe callback is insufficient evidence.

## Scope and unresolved item

This was read-only code and official-document research. No downloader/capture package, provider account operation, real playback, media publication or cost benchmark was run. The concrete unresolved item is a permitted raw-media acquisition mechanism for arbitrary YouTube URLs. Local preview and other source work can continue independently, but the parent delivery must retain this gap rather than declare YouTube broadcasting complete.
