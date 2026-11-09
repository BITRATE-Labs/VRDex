# Broadcast output credentials

Community event hosts can save their own VRCDN, Twitch or Custom RTMP connection through the authenticated setup route. The browser submits a key once; Convex stores connection metadata and a secret reference. Saving does not test the connection.

## Configuration

| Setting | Scope and owner | Recreation or rotation |
| --- | --- | --- |
| `VRDEX_EVENT_OUTPUT_BROKER_TOKEN` | Next server and Convex, deployment operator | Generate at least 32 random characters, replace both bindings together. Never expose with a `NEXT_PUBLIC_` prefix. |
| `VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX` | Convex and ECS dispatcher, deployment operator | Account and region prefix ending in `:secret:`. Use Terraform output `managed_output_secret_arn_prefix`. Change only when migrating retained credential references. |
| AWS workload credentials and region | Next server only, deployment operator | Use an existing workload role with `output_broker_policy_json`; avoid static access keys. |
| `managed_output_secret_namespace` | restream-worker Terraform | Set to `vrdex/broadcast/` to enable; defaults to disabled. |
| `output_broker_role_name` | restream-worker Terraform | Existing Next server role. Null exports the policy without attaching it. |

The secret namespace is `vrdex/broadcast/<communityId>/<eventId>/<requestUUID>`. Each replacement creates a new secret, leaving previously referenced credentials intact. Worker startup reads only the configured namespace in the deployment account and region. Existing deployment-owned account registries and exact dispatcher secret mappings continue to work.

## Authority and retries

`prepareConnection` checks the current host, event permission, expected revision, explicit broadcast permissions, and stopped worker state. Its two-minute grant binds the event, community, host, provider, sanitized server, playback URL and request UUID. A SHA-256 key fingerprint binds retries without persisting the raw key. The broker uses only the generated grant name and the same host token. `commitConnection` additionally requires the server broker token, validates the exact generated ARN, checks ownership again and commits the revision atomically. Browser-supplied ARNs cannot authorize publication.

Blank-key edits preserve the existing credential only when provider and server stay the same. A changed provider or server requires a replacement key. An active session or unreconciled worker blocks edits.

On an uncertain commit response, the broker replays the same grant before considering cleanup. A definitive abandonment transaction makes later commits impossible before scheduling a staged orphan for seven-day recovery deletion. If Convex is unreachable, retain the secret rather than deleting a potentially referenced key. Operators reconcile secrets tagged `Project=VRDex` and `Purpose=broadcast-output` against grants and output references before deletion. Retained old credential secrets require the same reference check against session and output records; no automatic destructive garbage collector runs.

## Custom output transport

Custom output uses the selected program encoding directly. Immediately before publication, its transport resolves IPv4 addresses and rejects local, link-local, private, multicast and documentation ranges. A local tunnel connects to the pinned public address; RTMPS verifies the original hostname with Node TLS. FFmpeg receives the loopback endpoint and cannot resolve the upstream hostname independently. The tunnel closes with its sender. IPv6-only ingest servers are currently unsupported.

Twitch uses the existing conservative allocation that includes a Twitch transcode. Custom RTMP copies the encoded primary program. Connection tests share ordinary admission and cleanup rather than allocating outside capacity controls.

No real provider connection is established by deterministic unit tests. Provider rehearsal remains separate from local and mocked transport evidence.
