import assert from "node:assert/strict";
import test from "node:test";
import { checkIngestUrl, setupPlaybackLinks, serverPresets } from "./destination-setup";

test("setup separates ingest credentials from public playback", () => {
  assert.equal(checkIngestUrl("rtmps://ingest.example.invalid/live").hostname, "ingest.example.invalid");
  for (const value of ["https://example.invalid/live", "rtmp://user:secret@example.invalid/live", "javascript:alert(1)"])
    assert.throws(() => checkIngestUrl(value));
  const links = setupPlaybackLinks("https://panel.vrcdn.live/preview/afterglow-demo");
  assert.deepEqual(links.map(link => link.label), ["PC URL", "Quest URL"]);
  assert.equal(links[0]?.url, "rtspt://stream.vrcdn.live/live/afterglow-demo");
  assert.equal(setupPlaybackLinks("https://media.example.invalid/stream.m3u8")[0]?.label, "World URL");
  for (const value of ["rtmp://ingest.example.invalid/live", "https://user:secret@example.invalid/live", "javascript:alert(1)"])
    assert.throws(() => setupPlaybackLinks(value));
});

test("malformed URLs get useful messages and provider presets are valid", () => {
  assert.throws(() => checkIngestUrl("bad url"), {message:"Enter a valid server URL starting with rtmp:// or rtmps://."});
  assert.throws(() => setupPlaybackLinks("bad url"), {message:"Enter a valid playback URL starting with https:// or rtspt://."});
  assert.equal(checkIngestUrl(serverPresets.Twitch).hostname, "live.twitch.tv");
  assert.equal(checkIngestUrl(serverPresets.VRCDN).hostname, "ingest.vrcdn.live");
});
