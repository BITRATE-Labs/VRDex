import { twitchLoginFromUrl } from "./_twitchLinks";
export type TwitchStream = { user_login: string; title: string; started_at: string; game_name: string; viewer_count: number };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export async function requestTwitchToken(clientId: string, clientSecret: string, fetcher = fetch): Promise<{ accessToken: string; expiresAt: number } | null> {
  const response = await fetcher("https://id.twitch.tv/oauth2/token", { method: "POST", body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }), signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`Twitch token request returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  return record(payload) && typeof payload.access_token === "string" && payload.access_token.length > 0 && payload.access_token.length <= 4096 && typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) && payload.expires_in > 0
    ? { accessToken: payload.access_token, expiresAt: Date.now() + Math.min(payload.expires_in, 60 * 86_400) * 1000 } : null;
}
export async function requestTwitchStreams(logins: readonly string[], clientId: string, token: string, fetcher = fetch): Promise<{ streams: TwitchStream[]; retryAt?: number; unavailable?: boolean; unauthorized?: boolean }> {
  if (logins.length < 1 || logins.length > 100 || logins.some(login => twitchLoginFromUrl(`https://twitch.tv/${login}`) !== login.toLowerCase())) throw new Error("Invalid Twitch stream batch");
  const url = new URL("https://api.twitch.tv/helix/streams");
  url.searchParams.set("first", "100");
  for (const login of new Set(logins)) url.searchParams.append("user_login", login);
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId }, signal: AbortSignal.timeout(4000) });
  const reset = Number(response.headers.get("Ratelimit-Reset"));
  const limited = response.status === 429 || response.headers.get("Ratelimit-Remaining") === "0";
  const retryAt = limited && Number.isFinite(reset) && reset * 1000 > Date.now() ? reset * 1000 : limited ? Date.now() + 60_000 : undefined;
  if (response.status === 401) return { streams: [], unavailable: true, unauthorized: true };
  if (response.status === 429) return { streams: [], retryAt, unavailable: true };
  if (!response.ok) throw new Error(`Twitch streams request returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  if (!record(payload) || !Array.isArray(payload.data) || payload.data.length > 100) throw new Error("Invalid Twitch stream response");
  const streams = payload.data.map(value => {
    if (!record(value) || typeof value.user_login !== "string" || twitchLoginFromUrl(`https://twitch.tv/${value.user_login}`) === null || typeof value.title !== "string" || typeof value.started_at !== "string" || !Number.isFinite(Date.parse(value.started_at)) || typeof value.game_name !== "string" || typeof value.viewer_count !== "number" || (!Number.isSafeInteger(value.viewer_count) || value.viewer_count < 0)) throw new Error("Invalid Twitch stream response");
    return { user_login: value.user_login.toLowerCase(), title: value.title, started_at: value.started_at, game_name: value.game_name, viewer_count: value.viewer_count };
  });
  return { streams, ...(retryAt === undefined ? {} : { retryAt }) };
}
