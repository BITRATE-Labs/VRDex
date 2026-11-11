import assert from "node:assert/strict";
import test from "node:test";
import { previewVideoLink } from "./video-link";

test("prototype recognizes provider pages separately from direct media", () => {
  assert.equal(previewVideoLink("https://www.twitch.tv/guestdj").provider, "Twitch");
  assert.equal(previewVideoLink("https://panel.vrcdn.live/preview/alpha").provider, "VRCDN");
  for (const url of ["https://youtu.be/M7lc1UVf-VE", "https://www.youtube.com/watch?v=M7lc1UVf-VE", "https://youtube.com/live/M7lc1UVf-VE"])
    assert.equal(previewVideoLink(url).key, "youtube:M7lc1UVf-VE");
  assert.equal(previewVideoLink("https://media.example.org/feed.m3u8").provider, "Video link");
  for (const url of ["javascript:alert(1)", "https://youtube.com.evil.test/watch?v=M7lc1UVf-VE", "https://youtube.com/watch?v=invalid", "https://user:password@media.example.org/feed.mp4", "https://example.org/page", "http://example.org/feed.mp4"])
    assert.throws(() => previewVideoLink(url));
});
