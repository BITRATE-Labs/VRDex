# Instance count chart release checklist

PR [#445](https://github.com/BITRATE-Labs/VRDex/pull/445) includes paired count capture and its production private instance-detail chart. This checklist prepares release; implementation approval does not authorize production deployment or historical data writes.

## Before merge

- [ ] Record the final pushed PR head, wait for its checks to finish, then refresh all feedback and readiness surfaces for that exact head.
- [ ] Pass backend, worker, web and docs checks plus ci:browsers and ci:visuals. Earlier Windows-only full-suite failures are not a substitute for current CI evidence.
- [ ] Review actual instance-page desktop/mobile evidence, a late positive queue after page 1, unknown/zero/partial platform data, multi-day time spacing and a closure between samples with later population.
- [ ] Confirm authenticated local-route and restricted-reader tests pass without skips, and the exact synthetic fixture/users clean up.
- [ ] Record exact-head hosted preview URL and backend identity. Keep its auth/fixture acceptance distinct from the fully exercised local route. Analytics seed helpers remain loopback-only; no hosted guard exception is permitted.

## Authorized deployment order

1. Record approved merge SHA and the current backend, web and immutable collector versions for rollback. These IDs are populated at release time, not guessed from the implementation branch.
2. Deploy the additive Convex schema/validators/private return fields. Verify old-worker payload acceptance first. Baseline Checks owns backend deployment; confirm its gate is enabled and that the exact SHA deployed.
3. Release the matching web build and versioned collector. The existing collector workflow follows successful main Baseline Checks; a direct dispatch must not precede additive backend readiness.
4. Verify web/backend/collector identity separately, including collector heartbeat release SHA. No source checkout or heartbeat alone proves paired capture.
5. On a naturally active authorized instance, read future retained observations through the existing private instance-series API. Confirm userCount, queueSize and platforms survive when the provider supplies them. Missing provider fields remain unknown. With no active instance, record runtime capture as pending rather than creating one.
6. Check the real private chart for that paired instance, an old sparse instance, an original repaired URL and a closed instance with a remaining population tail. Compare raw-population Peak/Average and event recap values before and after. No recap calculation or historical repair is part of this release.

## Recovery

Revert to the captured immutable web/collector versions if collection or rendering regresses. Retain additive backend support while any new collector can send diagnostic fields, and preserve already retained observations. Supplied malformed optional diagnostics reject snapshots, so investigate schema drift and restore collection rather than substitute zero or silently discard contradictory evidence.

## Acceptance record

Implementation/local evidence and the exact-head preview result are recorded in the PR. Production backend/web/collector versions, live paired sample and original-link results remain unverified until the separately authorized release. Historical queue/platform fields cannot be reconstructed from n_users.
