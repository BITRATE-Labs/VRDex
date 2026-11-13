import { test, expect } from "@playwright/test";
import path from "node:path";

test("real root provider waits for trial eligibility and retains audio through navigation @fixture", async ({ page, baseURL }, info) => {
  test.setTimeout(45000);
  let releaseEligibility!: () => void, eligibilityRequested!: () => void;
  const eligibility = new Promise<void>(resolve => { releaseEligibility = resolve; });
  const requested = new Promise<void>(resolve => { eligibilityRequested = resolve; });
  let opens = 0, legacy = 0; const lanes: string[] = [];
  const context = { kind: "profile", profileId: "profile", linkId: "Alpha" };
  await page.route("**/api/media-relay/trial", async route => {
    if (route.request().method() === "GET") {
      eligibilityRequested(); await eligibility;
      await route.fulfill({ json: { trialId: "trial", context, streamId: "Alpha", expiresAt: Date.now()+60000, href: "/playwright/event-playback" } });
    } else {
      opens++; expect(route.request().postDataJSON()).toMatchObject({ trialId: "trial", context, streamId: "Alpha" });
      await route.fulfill({ json: { kind: "ready", grant: { id: "grant", streamKey: "vrcdn/Alpha/1", context, contextRevision: 1, issuedAt: Date.now(), expiresAt: Date.now()+60000, renditions: ["video","audio"] },
        videoPlaylist: "https://relay.fixture.invalid/video.m3u8", audioPlaylist: "https://relay.fixture.invalid/audio.m3u8", metadata: { displayName: "Trial DJ", artworkAssetId:null, artworkRevision:null } } });
    }
  });
  await page.route("https://stream.vrcdn.live/**", async route => { legacy++; await route.abort(); });
  await page.route("https://relay.fixture.invalid/**", async route => {
    const pathname = new URL(route.request().url()).pathname, audio = pathname.includes("audio");
    if (pathname.endsWith("m3u8")) {
      lanes.push(audio ? "audio" : "video");
      await route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:46\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:${audio ? 15 : 45},\nhttps://relay.fixture.invalid/${audio ? "audio" : "video"}.ts\n#EXT-X-ENDLIST\n`, headers: { "Access-Control-Allow-Origin":"*" } });
    } else await route.fulfill({ contentType:"video/mp2t", path:path.resolve(`e2e/fixtures/${audio ? "persistent-synthetic-audio.mpegts" : "persistent-synthetic.mpegts"}`), headers:{"Access-Control-Allow-Origin":"*"} });
  });
  await page.route("http://127.0.0.1:3210/api/**", route => route.fulfill({ json: { status:"success", value: route.request().postDataJSON()?.path === "profiles:getPublicBySlug" ?
    { id: "profile", slug: "playwright/event-playback", displayName: "Trial DJ", outboundLinks: [{type:"vrcdn",url:"https://stream.vrcdn.live/live/Alpha.live.mp4"}] } : null } }));
  await page.goto(`${baseURL}/playwright/event-playback?kind=native-trial&relayTrial=trial`);
  await requested;
  await page.getByRole("button", {name:"Play trial",exact:true}).click();
  await page.waitForTimeout(150);
  expect(opens).toBe(0); expect(legacy).toBe(0); await expect(page.locator("audio,video")).toHaveCount(0);
  releaseEligibility();
  await expect(page.locator("video")).toHaveCount(1);
  await expect.poll(()=>page.locator("video").evaluate(node=>(node as HTMLVideoElement).currentTime),{timeout:15000}).toBeGreaterThan(0.5);
  await page.getByRole("button",{name:"Audio only",exact:true}).click();
  const audio = page.locator("audio");
  await expect.poll(()=>audio.evaluate(node=>(node as HTMLAudioElement).currentTime),{timeout:10000}).toBeGreaterThan(0.5);
  const original = await audio.elementHandle(), before = await audio.evaluate(node=>(node as HTMLAudioElement).currentTime);
  await page.getByRole("link",{name:"Browse",exact:true}).click();
  await expect.poll(()=>audio.evaluate(node=>(node as HTMLAudioElement).currentTime)).toBeGreaterThan(before+0.5);
  expect(await audio.evaluate((node, prior)=>node===prior,original)).toBe(true);
  expect(opens).toBe(1); expect(legacy).toBe(0); expect(lanes).toEqual(["video","audio"]);
  await page.getByRole("region",{name:"Event playback",exact:true}).screenshot({path:info.outputPath("native-trial-retained-audio.png")});
  await page.getByRole("button",{name:"Close event playback",exact:true}).click();
  await expect(page.locator("audio,video")).toHaveCount(0);
  await page.route("**/api/media-relay/trial", async route => {
    if (route.request().method() === "POST") await route.fulfill({status:503}); else await route.fallback();
  });
  await page.goto(`${baseURL}/playwright/event-playback?kind=native-trial&relayTrial=trial`);
  await page.getByRole("button",{name:"Play trial",exact:true}).click();
  await expect(page.getByText("Stream unavailable",{exact:true})).toBeVisible();
  const shell = page.getByRole("region",{name:"Event playback",exact:true});
  expect((await shell.boundingBox())!.height).toBeLessThan(220);
  await shell.screenshot({path:info.outputPath("native-trial-compact-failure.png")});
  await expect(page.locator("audio,video")).toHaveCount(0);
});

for(const [eligibilityFails,savedAudio] of [[false,false],[true,false],[true,true]]) test(`pending trial preserves ordinary other-stream playback when eligibility ${eligibilityFails ? "fails":"matches another source"}${savedAudio ? " with saved Audio":""} @fixture`,async({page,baseURL})=>{
  let release!:()=>void, requested!:()=>void,opens=0,legacy=0;
  const gate=new Promise<void>(resolve=>{release=resolve;}),seen=new Promise<void>(resolve=>{requested=resolve;});
  if(savedAudio) await page.addInitScript(()=>localStorage.setItem("vrdex.playback-mode","audio"));
  await page.route("**/api/media-relay/trial",async route=>{
    if(route.request().method()==="POST"){opens++;await route.abort();return;}
    requested();await gate;
    await route.fulfill({json:eligibilityFails ? null : {trialId:"trial",context:{kind:"profile",profileId:"profile",linkId:"Alpha"},streamId:"Alpha",expiresAt:Date.now()+60000,href:"/playwright/event-playback"}});
  });
  await page.route("https://stream.vrcdn.live/**",async route=>{
    expect(route.request().url()).toBe("https://stream.vrcdn.live/live/Beta.live.ts");legacy++;
    await route.fulfill({contentType:"video/mp2t",path:path.resolve("e2e/fixtures/persistent-synthetic.mpegts"),headers:{"Access-Control-Allow-Origin":"*"}});
  });
  await page.route("http://127.0.0.1:3210/api/**",route=>route.fulfill({json:{status:"success",value:route.request().postDataJSON()?.path==="profiles:getPublicBySlug" ? {id:"profile",slug:"playwright/event-playback",displayName:"Trial DJ",outboundLinks:[{type:"vrcdn",url:"vrcdn:Beta"}]}:null}}));
  await page.goto(`${baseURL}/playwright/event-playback?kind=native-trial&relayTrial=trial`);await seen;
  await page.getByRole("button",{name:"Play other",exact:true}).click();
  expect(opens).toBe(0);expect(legacy).toBe(0);release();
  if(savedAudio){
    await page.getByRole("button",{name:"Video",exact:true}).click();
    await page.getByRole("button",{name:"Play",exact:true}).click();
  }
  await expect.poll(()=>page.locator("video").evaluate(node=>(node as HTMLVideoElement).currentTime),{timeout:15000}).toBeGreaterThan(0.5);
  expect(opens).toBe(0);expect(legacy).toBe(1);
  await expect(page.getByRole("button",{name:"Audio only",exact:true})).toHaveCount(0);
  if(eligibilityFails && !savedAudio){
    const previous=await page.locator("video").elementHandle();
    await page.locator("video").dispatchEvent("error");
    await page.getByRole("button",{name:"Try again",exact:true}).click();
    await expect.poll(()=>page.locator("video").evaluate(node=>(node as HTMLVideoElement).currentTime),{timeout:15000}).toBeGreaterThan(0.5);
    expect(await previous!.evaluate(node=>node.isConnected)).toBe(false);expect(legacy).toBe(2);
  }
  await page.getByRole("button",{name:"Close event playback",exact:true}).click();
});
