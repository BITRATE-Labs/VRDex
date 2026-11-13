import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { probeVrcdnLiveState } from "./_vrcdnLiveProbe";
import { requestTwitchStreams, requestTwitchToken } from "./_twitchLiveProbe";
import { connectorKey, decryptSecret, encryptSecret } from "./_connectorCrypto";
import type { LiveSource } from "./_eventLive";

export const refresh = internalAction({ args: {}, returns: v.null(), handler: async ctx => {
  if (process.env.EVENT_LIVE_ENABLED !== "true") return null;
  const startedAt = Date.now();
  const claim = await ctx.runMutation(internal.eventLive.claimRefresh, {});
  if (!claim) return null;
  const [starts, ends] = await Promise.all([
    ctx.runQuery(internal.eventLive.refreshCandidates, { phase: "starts", cursor: claim.startsCursor }),
    ctx.runQuery(internal.eventLive.refreshCandidates, { phase: "ends", cursor: claim.endsCursor }),
  ]);
  const page = await ctx.runQuery(internal.eventLive.selectSources, { candidates: [...starts.candidates, ...ends.candidates] });
  const observations: Array<{ source: LiveSource; status: "live" | "offline" | "unavailable"; observedAt: number }> = [];
  const twitch = page.sources.filter(source => source.provider === "twitch");
  let twitchRetryAt = claim.twitchRetryAt;
  let twitchToken = claim.twitchToken;
  if (twitch.length) {
    const states = new Set<string>();
    const clientId = process.env.TWITCH_CLIENT_ID?.trim();
    const secret = process.env.TWITCH_CLIENT_SECRET?.trim();
    try {
      if (clientId && secret && (twitchRetryAt === undefined || twitchRetryAt <= Date.now())) {
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${clientId}\0${secret}`)));
        const fingerprint = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
        let token: string | null = null;
        if (twitchToken?.fingerprint === fingerprint && twitchToken.expiresAt > Date.now() + 60_000) {
          try { token = await decryptSecret(twitchToken.cipher); } catch { twitchToken = undefined; }
        }
        if (!token) {
          await connectorKey("encrypt");
          const issued = await requestTwitchToken(clientId, secret);
          if (issued) {
            token = issued.accessToken;
            twitchToken = { cipher: await encryptSecret(token), expiresAt: issued.expiresAt, fingerprint };
          }
        }
        if (token) {
          const result = await requestTwitchStreams(twitch.map(source => source.identity), clientId, token);
          twitchRetryAt = result.retryAt ?? 0;
          if (result.unauthorized) twitchToken = undefined;
          for (const stream of result.streams) states.add(stream.user_login);
        }
      }
    } catch { /* Transient failures neither establish offline status nor discard a valid cached token. */ }
    for (const source of twitch) observations.push({ source, status: states.has(source.identity) ? "live" : "unavailable", observedAt: Date.now() });
  }
  const pending = page.sources.filter(source => source.provider === "vrcdn");
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    for (let source = pending.shift(); source; source = pending.shift()) {
      try {
        const result = await probeVrcdnLiveState(source.identity, { signal: AbortSignal.timeout(5000) });
        observations.push({ source, status: result.state, observedAt: result.observedAt });
      } catch { observations.push({ source, status: "unavailable", observedAt: Date.now() }); }
    }
  }));
  await ctx.runMutation(internal.eventLive.finishRefresh, { token: claim.token, candidates: page.candidates, observations,
    startsCursor: starts.cursor, endsCursor: ends.cursor, ...(twitchRetryAt === undefined ? {} : { twitchRetryAt }), twitchToken: twitchToken ?? null });
  console.info(JSON.stringify({ event: "event_live_refresh", sources: page.sources.length,
    live: observations.filter(o => o.status === "live").length, offline: observations.filter(o => o.status === "offline").length,
    unavailable: observations.filter(o => o.status === "unavailable").length, durationMs: Date.now() - startedAt }));
  return null;
} });
