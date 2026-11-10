import assert from "node:assert/strict";
import { it } from "node:test";
import { broadcastPlaybackLinks, checkBroadcastServer } from "../../apps/web/src/lib/broadcast-connection";
it("connection fields reject invalid and credential-bearing URLs with useful copy",()=>{
 for(const value of ["bad-url","https://example.com/live","rtmp://user:password@example.com/live","rtmp://example.com/live?key=private"]){assert.throws(()=>checkBroadcastServer(value),/Enter a valid server URL starting with rtmp/);}
 assert.equal(checkBroadcastServer("rtmps://live.twitch.tv:443/app"),"rtmps://live.twitch.tv:443/app");
 for(const value of ["bad-url","https://user:password@example.com/live","https://example.com/live?token=private"]){assert.throws(()=>broadcastPlaybackLinks(value),/Enter a valid playback URL/);}
});
it("VRCDN previews expose separate PC and Quest URLs without inventing test results",()=>{
 const links=broadcastPlaybackLinks("https://panel.vrcdn.live/preview/afterglow-demo");
 assert.equal(links.length,2);assert.equal(links[0].label,"PC URL");assert.match(links[0].url,/^rtspt:/);assert.equal(links[1].label,"Quest URL");assert.match(links[1].url,/^https:.*afterglow-demo/);
 assert.deepEqual(broadcastPlaybackLinks("https://example.com/live"),[{platform:"web",label:"World URL",url:"https://example.com/live"}]);
});
