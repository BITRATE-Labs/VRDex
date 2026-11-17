import assert from "node:assert/strict";
import { test } from "node:test";
import { requestTwitchToken, requestTwitchStreams } from "../../convex/_twitchLiveProbe";

test("Twitch requests batch canonical logins and validate stream records", async () => {
  let requested = "";
  const result = await requestTwitchStreams(["aurora", "lumen"], "client", "token", async input => {
    requested = String(input);
    return Response.json({ data: [{ user_login: "Aurora", title: "Set", started_at: "2026-11-12T00:00:00Z", game_name: "Music", viewer_count: 2 }] });
  });
  const url = new URL(requested);
  assert.deepEqual(url.searchParams.getAll("user_login"), ["aurora", "lumen"]);
  assert.equal(url.searchParams.get("first"), "100");
  assert.equal(result.streams[0].user_login, "aurora");
  assert.equal(result.streams.some(stream => stream.user_login === "lumen"), false, "omission is not proof of offline");
  await assert.rejects(requestTwitchStreams(["../private"], "client", "token"));
  await assert.rejects(requestTwitchStreams(["aurora"], "client", "token", async () => Response.json({ data: [{}] })));
});
test("Twitch quota failures carry header-based backoff and never return live records", async () => {
  const reset = Math.ceil(Date.now() / 1000) + 240;
  const result = await requestTwitchStreams(["aurora"], "client", "token", async () => new Response(null, { status: 429, headers: { "Ratelimit-Reset": String(reset) } }));
  assert.equal(result.unavailable, true);
  assert.equal(result.retryAt, reset * 1000);
  assert.deepEqual(result.streams, []);
});
test("Twitch token response requires a bounded actual expiry", async () => {
  assert.equal(await requestTwitchToken("client", "secret", async () => Response.json({ access_token: "token" })), null);
  const token = await requestTwitchToken("client", "secret", async () => Response.json({ access_token: "token", expires_in: 3600 }));
  assert.equal(token?.accessToken, "token");
  assert.ok(token!.expiresAt > Date.now() + 3590_000);
});
