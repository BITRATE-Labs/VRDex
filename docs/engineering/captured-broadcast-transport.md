# Captured broadcast transport clocks

The capacity test observes Twitch's AAC/FLV/RTMP output through a local receiver
that copies it into MPEG-TS. FLV timestamps use milliseconds. At 48 kHz, an AAC
unit contains 1,024 samples, or 21.333 milliseconds. Converting these timestamps
can produce a small overlap in decoded metadata while preserving every audio
payload and decoded sample.

Qualification must prove the observed conversion. A numerical tolerance or
rewritten timestamp cannot establish that proof.

## Scope

Captured transport evidence covers the complete observed local RTMP segment,
its copied recording and decoded output. It does not establish renderer-input
conservation, encoder priming or final padding, provider publication, device
playback, or the separate native `ProgramClock` proof.

The captured path currently supports `720p30` with the program audio setting
`320`. Twitch's destination encoder uses its existing 160-kbps AAC profile.
Other configurations still require their own admitted capacity evidence.

## Capture and verification

1. An owned local listener forwards bytes to the unchanged copy receiver and
   retains both RTMP directions. Capture runs inside the measured cgroup.
2. Production Stop fences publication through the existing sender. The proof
   allows a bounded receiver drain after that fence, then requires both socket
   ends and the receiver process to close. An incomplete captured tail rejects.
3. The verifier joins every observed AAC and video unit to the copied TS
   recording. Codec configuration, payload order, counts and timestamps must
   match the declared transport conversion.
4. The owned decoder retains its original PCM, cropped RGB and metadata. Private
   capture membership binds these bytes and row vectors to the recording.
5. Marker evaluation retains raw timestamps and sample/frame ordinals. It
   evaluates the existing predicates over the entire permitted joint clock
   domain before choosing relevant episodes, source epochs, full markers or
   boundary fragments. An ambiguous choice rejects.
6. Independent readback joins the retained files to the receipt, rederives the
   clock domain and timestamp replay, and checks the decoder population and row
   mapping. Final acceptance also requires an independent native decode and the
   ordinary image, resource, quality and cleanup checks.

Missing or duplicated units, payload or configuration changes, unexplained
timestamp changes and inconsistent domains reject. Unknown or mixed audio keeps
its existing classification. Existing timing and quality thresholds still apply.

## Evidence and authority

The compact marker record includes the transport domain, raw row mapping and
references to the transport and decoder proofs. Its checksum detects changes to
the description. Physical readback must compare that description with the
retained originals, including rejecting a narrower domain with a recomputed
checksum.

Shared observation and comparison helpers return facts. The physical capture
entry point owns its processes and sockets. It cannot accept a caller-supplied
process, serialized certificate or arbitrary registration callback as capture
authority. The native `ProgramClock` entry points retain their existing authority
checks and builtin restrictions.

The proof envelope retains the client/server RTMP streams, receiver diagnostics,
transport proof, decoder diagnostics, PCM/RGB/metadata channels and decoder proof
alongside `twitch.ts`. Each file has a declared cap and participates in the total
artifact budget and hashed multipart inventory. Exhausted budgets and missing
files reject. Synthetic captures use the local test key and contain no provider
credential.

## Required checks

The ordinary script tests cover malformed transport, missing and duplicated
units, configuration changes, raw timestamp mutations, forged or cross-recording
handles, altered decoder output and clock-domain boundary cases. A separate
required CI step runs the owned capture and decoder with the packaged Linux
runtime, mounting tests read-only and leaving `/app` untouched.

A short local test does not admit an allocation. A new full-length, exact-image
capacity receipt must pass before its evidence ID enters the measured map.
Failed receipts remain failed; captures that omitted the transport originals
cannot acquire this evidence retroactively.
