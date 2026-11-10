# Broadcast output credentials

Community event hosts can save their own VRCDN, Twitch or Custom RTMP connection through the authenticated setup route. The browser submits a key once; Convex stores connection metadata and a secret reference. Saving does not test the connection.

## Configuration

| Setting | Scope and owner | Recreation or rotation |
| --- | --- | --- |
| `VRDEX_EVENT_OUTPUT_BROKER_TOKEN` | Next server and Convex, deployment operator | Generate at least 32 random characters, replace both bindings together. Never expose with a `NEXT_PUBLIC_` prefix. |
| `VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX` | Convex and ECS dispatcher, deployment operator | Account and region prefix ending in `:secret:`. Configure Convex from Terraform output `managed_output_secret_arn_prefix`; Terraform injects the same value into the enabled dispatcher when the managed namespace is enabled. Change only when migrating retained credential references. |
| `VRDEX_EVENT_OUTPUT_SECRET_REGION` | Next server only, deployment operator | Explicit Secrets Manager region, matching the ARN prefix. Do not use Vercel's ambient `AWS_REGION`. |
| `VRDEX_EVENT_OUTPUT_BROKER_ROLE_ARN` | Vercel Next server only, deployment operator | Dedicated broker IAM role assumed through the installed Vercel OIDC credential provider. Required on Vercel. Self-hosted AWS workloads may omit it and use their workload role, with the explicit region still required. |
| `managed_output_secret_namespace` | restream-worker Terraform | Set to `vrdex/broadcast/` to enable; defaults to disabled. |
| `output_broker_role_name` | restream-worker Terraform | Existing self-hosted server role. Alternative to managed Vercel role creation. Null exports the policy without attaching it. |
| `vercel_output_broker` | restream-worker Terraform | Null by default. Set `{}` with the managed namespace to create a dedicated production Vercel OIDC role using the existing team provider. |

The secret namespace is `vrdex/broadcast/<communityId>/<eventId>/<requestUUID>`. Each replacement creates a new secret, leaving previously referenced credentials intact. Worker startup reads only the configured namespace in the deployment account and region. Existing deployment-owned account registries and exact dispatcher secret mappings continue to work.

## Hosted broker deployment

Reuse the existing team OIDC provider managed by `infra/terraform/profile-assets`, with a dedicated broker role. Do not expand the profile-assets or VRCLinking role. The production trust must allow `sts:AssumeRoleWithWebIdentity` only from issuer `https://oidc.vercel.com/basicbit`, audience `https://vercel.com/basicbit`, and subject `owner:basicbit:project:vr-dex-web:environment:production`. Staging needs its own explicit trust and environment binding; previews receive neither by default.

The broker role policy is the checked-in `output_broker_policy_json`: `CreateSecret`, `DescribeSecret`, `TagResource` and `DeleteSecret` only under the managed account/region `vrdex/broadcast/*` namespace. It does not permit reading stream keys. The ECS execution role separately needs `GetSecretValue` for that namespace. Terraform can create the dedicated role and its production trust, or attach the policy to an existing self-hosted role. These options are mutually exclusive.

Deployment order:

1. Review the dedicated broker role trust and namespace policy; set `managed_output_secret_namespace = "vrdex/broadcast/"` and `vercel_output_broker = {}` through Terraform. Read `output_broker_role_arn` for the Vercel role binding. Defaults target `basicbit` / `vr-dex-web`; a self-hosted installation may provide its exact team, project and dedicated role names.
2. Configure `VRDEX_EVENT_OUTPUT_SECRET_REGION` and `VRDEX_EVENT_OUTPUT_BROKER_ROLE_ARN` on the intended Vercel environment. Configure the shared broker token on that server environment and its matching Convex deployment without printing the value.
3. Configure `VRDEX_EVENT_OUTPUT_SECRET_ARN_PREFIX` on Convex using the Terraform output. Terraform manages the enabled ECS dispatcher's matching prefix alongside the namespace policies; when the managed namespace is disabled, it omits that dispatcher variable. Deploy the backend, worker/dispatcher and web code through their normal release paths. Redeploy the Vercel environment after runtime variable changes.
4. Verify metadata-only configuration and identity first. A real connection test requires the host's explicit test choice and an authorized output; configuration alone does not prove publication or decoded playback.

## Authority and retries

`prepareConnection` checks the current host, event permission, expected revision, explicit broadcast permissions, and stopped worker state. Its two-minute grant binds the event, community, host, provider, sanitized server, playback URL and request UUID. A SHA-256 key fingerprint binds retries without persisting the raw key. The broker uses only the generated grant name and the same host token. `commitConnection` additionally requires the server broker token, validates the exact generated ARN, checks ownership again and commits the revision atomically. Browser-supplied ARNs cannot authorize publication.

Provisioning allows ten new grants per community in any ten-minute window, shared across its events. Exact idempotent retries reuse the existing grant without consuming another slot. The indexed check and grant insertion run in the same transaction. Legacy grants without `createdAt` remain valid but do not count toward the new window.

Blank-key edits preserve the existing credential only when provider and server stay the same. A changed provider or server requires a replacement key. An active session or unreconciled worker blocks edits.

On an uncertain commit response, the broker replays the same grant before considering cleanup. A definitive abandonment transaction makes later commits impossible before scheduling a staged orphan for seven-day recovery deletion. If Convex is unreachable, retain the secret rather than deleting a potentially referenced key. Operators reconcile secrets tagged `Project=VRDex` and `Purpose=broadcast-output` against grants and output references before deletion. Retained old credential secrets require the same reference check against session and output records; no automatic destructive garbage collector runs. Grant and orphan metadata are retained for manual reconciliation; expiry only removes permission to commit, it does not delete metadata or a secret. Do not delete a grant while its secret may still be referenced by any output or session.

## Custom output transport

Connection tests allow ten new jobs per community per ten minutes. Exact retries reuse their existing job and do not consume another allowance. Queue waiting is bounded to two minutes; the first worker lease freezes a maximum 60-second runtime. Success requires decoded matching video and confirmed process/task-definition cleanup. Completed test records are eligible for hourly cleanup after 30 days, at most 50 per terminal state per pass; unfinished or ambiguously stopped sessions retain their records. This also bounds the retained test idempotency window.

Custom output uses the selected program encoding directly. Immediately before publication, its transport resolves IPv4 addresses and rejects local, link-local, private, multicast and documentation ranges. A local tunnel connects to the pinned public address; RTMPS verifies the original hostname with Node TLS. FFmpeg receives the loopback endpoint and cannot resolve the upstream hostname independently. The tunnel closes with its sender. IPv6-only ingest servers are currently unsupported.

Twitch uses the existing conservative allocation that includes a Twitch transcode. Custom RTMP copies the encoded primary program. Connection tests share ordinary admission and cleanup rather than allocating outside capacity controls.

No real provider connection is established by deterministic unit tests. Provider rehearsal remains separate from local and mocked transport evidence.
