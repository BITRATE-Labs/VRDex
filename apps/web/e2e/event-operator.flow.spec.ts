import { devices, expect, test, type Page } from "@playwright/test";
import { fixtureNow } from "../src/app/playwright/event-operator/fixture-state";
import path from "node:path";
// These routes use production components with explicit transport/authority fixtures.
test.beforeEach(async ({page})=>{await page.route("**/operate/status?*",route=>route.fulfill({json:{}}));});
async function confirm(page:Page,label:string){await expect(page.getByRole("dialog")).toBeVisible();await page.getByRole("dialog").getByRole("button",{name:label,exact:true}).click();}
async function details(page:Page){const summary=page.getByText("Broadcast details",{exact:true});if(!await page.getByText("Observed output",{exact:true}).isVisible())await summary.click();}
async function next(page:Page){await page.getByRole("button",{name:"Next DJ: Aurora",exact:true}).click();await confirm(page,"Next DJ: Aurora");}
test("anonymous operator route redirects before private content @flow @fixture",async({page})=>{
 await page.goto("/playwright-afterglow-social/events/playwright-event-host-view/operate");await expect(page).toHaveURL(/sign-in/);await expect(page.getByRole("heading",{name:"Broadcast",exact:true})).toHaveCount(0);
});
test("confirmed source changes preserve actual output while preparing, and Cancel keeps it @flow @fixture",async({page},info)=>{
 await page.goto("/playwright/event-operator");await expect(page.getByRole("heading",{name:"Broadcast",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Copy PC URL",exact:true})).toHaveCount(1);await expect(page.getByRole("button",{name:"Copy Quest URL",exact:true})).toHaveCount(1);await expect(page.getByRole("button",{name:"Copy Playback URL",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Observe live",exact:true}).click();await page.getByRole("button",{name:"Hold preparation",exact:true}).click();
 await page.getByRole("button",{name:"Take Custom",exact:true}).click();await expect(page.getByLabel("Command count")).toHaveText("0");await confirm(page,"Put Custom on air");
 await expect(page.getByText("Preparing",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Cut to slate",exact:true})).toBeEnabled();
 await details(page);await expect(page.getByText("Observed output",{exact:true}).locator("..")).toContainText("Aurora");
 await page.getByRole("group",{name:"Preparation",exact:true}).getByRole("button",{name:"Cancel",exact:true}).click();await confirm(page,"Cancel switch");
 await expect(page.getByText("Preparing",{exact:true})).toHaveCount(0);await expect(page.getByText("Observed output",{exact:true}).locator("..")).toContainText("Aurora");
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:info.outputPath("operator-confirmed-control.png"),fullPage:true});
});
test("Stop and Cut remain available during a slow command, all live changes confirm @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");await page.getByRole("button",{name:"Hold request",exact:true}).click();await next(page);
 await expect(page.getByRole("button",{name:"Cut to slate",exact:true})).toBeEnabled();await expect(page.getByRole("button",{name:"Stop",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:"Cut to slate",exact:true}).click();await confirm(page,"Hold slate");
 await page.getByRole("button",{name:"Stop",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click();
 await expect(page.getByRole("dialog")).toHaveCount(0);await page.getByRole("button",{name:"Stop",exact:true}).click();await confirm(page,"Stop broadcast");await expect(page.getByText("Stopping",{exact:true})).toBeVisible();
});
test("failed commands, expired observations and revoked permissions never imply live success @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");await page.getByRole("button",{name:"Fail commands",exact:true}).click();await next(page);await expect(page.getByText("Command failed",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Stale observation",exact:true}).click();await details(page);await expect(page.getByText("Observed output",{exact:true}).locator("..")).toContainText("Unknown");
 await page.getByRole("button",{name:"Revoke capability",exact:true}).click();await expect(page.getByRole("button",{name:"Stop",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"Cut to slate",exact:true})).toBeDisabled();await expect(page.getByRole("link",{name:"Host view",exact:true})).toBeVisible();
});
test("stopped broadcast starts a chosen destination without claiming observed live output @flow @fixture",async({page},info)=>{
 await page.goto("/playwright/event-operator");await page.getByRole("button",{name:"End session",exact:true}).click();await expect(page.getByLabel("Primary output",{exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Start",exact:true}).click();await expect(page.getByLabel("Started output")).toHaveText("primary");await details(page);await expect(page.getByText("Observed output",{exact:true}).locator("..")).toContainText("Starting");
 const health=page.getByRole("heading",{name:"Output health",exact:true}).locator("..");
 await expect(health.getByText("Twitch",{exact:true}).locator("..")).toContainText("Unknown");
 await expect(health.getByText("VRCDN",{exact:true}).locator("..")).toContainText("starting");
 await page.screenshot({path:info.outputPath("operator-primary-starting.png"),fullPage:true});
});

test("direct video status follows fresh worker evidence and clears after Stop @flow @fixture",async({page},info)=>{
 const statusRequests:string[][]=[];
 await page.route("**/operate/status?*",route=>{
  statusRequests.push((new URL(route.request().url()).searchParams.get("ids") ?? "").split(",").filter(Boolean));
  return route.fulfill({json:{}});
 });
 const videoUrl="https://media.example.com/fixture.ts";
 await page.route(videoUrl,route=>route.fulfill({contentType:"video/mp2t",path:path.resolve("e2e/fixtures/persistent-synthetic.mpegts"),headers:{"access-control-allow-origin":"*"}}));
 await page.goto("/playwright/event-operator");
 await expect.poll(()=>statusRequests.length).toBeGreaterThan(0);
 const providerIds=new Set(statusRequests.flat());
 await page.getByRole("textbox",{name:"Or paste a link",exact:true}).fill(videoUrl);
 await page.getByRole("button",{name:"Check source",exact:true}).click();
 const preview=page.getByRole("region",{name:"Quick switch preview",exact:true});
 await expect(preview.getByRole("status")).toHaveText("Direct video");
 await preview.scrollIntoViewIfNeeded();
 await expect.poll(()=>preview.locator("video").evaluate(node=>node instanceof HTMLVideoElement ? node.currentTime : 0)).toBeGreaterThan(0);
 expect(statusRequests.flat().every(id=>providerIds.has(id))).toBe(true);
 const take=preview.getByRole("button",{name:/^Put .* on air$/});
 const label=await take.innerText();
 await take.click();await confirm(page,label);
 await expect(preview.getByRole("status")).toHaveText("On air");
 await page.screenshot({path:info.outputPath("operator-direct-video-on-air.png"),fullPage:true});
 await page.getByRole("button",{name:"Stale observation",exact:true}).click();
 await expect(preview.getByRole("status")).toHaveText("Direct video");
 await page.getByRole("button",{name:"End session",exact:true}).click();
 await expect(page.getByRole("region",{name:"Broadcast output",exact:true})).toContainText("Off air");
 await preview.getByRole("button",{name:"Close preview",exact:true}).click();
 await page.screenshot({path:info.outputPath("operator-status-clarity.png"),fullPage:true});
});

test("Quick switch expires provider liveness instead of retaining an old Live label @flow @fixture",async({page})=>{
 await page.clock.install();
 await page.route("**/operate/status?*",route=>route.fulfill({json:{"vrcdn:aurora":{state:"live",observedAt:fixtureNow}}}));
 await page.goto("/playwright/event-operator");
 await page.getByRole("textbox",{name:"Or paste a link",exact:true}).fill("vrcdn:aurora");
 await page.getByRole("button",{name:"Check source",exact:true}).click();
 const preview=page.getByRole("region",{name:"Quick switch preview",exact:true});
 await expect(preview.getByRole("status")).toHaveText("live");
 await page.clock.fastForward(60_001);
 await expect(preview.getByRole("status")).toHaveText("Not checked");
});

test("an on-air input keeps its fresh provider failure visible @flow @fixture",async({page},info)=>{
 await page.route("**/operate/status?*",route=>route.fulfill({json:{"vrcdn:aurora":{state:"offline",observedAt:fixtureNow}}}));
 await page.goto("/playwright/event-operator");
 const source=page.getByRole("article",{name:"Aurora",exact:true});
 await expect(source.getByText("offline",{exact:true})).toBeVisible();
 await source.getByRole("button",{name:"Take Aurora",exact:true}).click();await confirm(page,"Put Aurora on air");
 await details(page);
 await expect(page.getByText("Observed output",{exact:true}).locator("..")).toContainText("Aurora");
 await expect(source.getByText("offline",{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath("operator-offline-input.png"),fullPage:true});
});
test("replacing or removing live inputs requires confirmation and quality applies next start @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");await page.getByRole("button",{name:"Replace Custom",exact:true}).click();await page.getByLabel("Source label",{exact:true}).fill("Replacement");await page.getByLabel("Video or stream link",{exact:true}).fill("https://www.twitch.tv/replacement");await page.getByRole("button",{name:"Replace source",exact:true}).click();await expect(page.getByRole("article",{name:"Replacement",exact:true})).toHaveCount(0);await confirm(page,"Replace source");
 const source=page.getByRole("article",{name:"Replacement",exact:true});await expect(source).toBeVisible();await source.getByRole("button",{name:"Remove Replacement",exact:true}).click();await confirm(page,"Remove source");await expect(source).toHaveCount(0);
 await page.getByText("Stream settings",{exact:true}).click();await page.getByRole("combobox",{name:"Resolution",exact:true}).selectOption("720");await page.getByRole("combobox",{name:"Audio bitrate",exact:true}).selectOption("320");await page.getByRole("button",{name:"Save settings",exact:true}).click();await expect(page.getByText("Next start",{exact:true}).locator("..")).toContainText("720p30 · 320 kbps");await expect(page.getByText("Active",{exact:true}).first().locator("..")).toContainText("720p30");
});
test("custom source validates links, supports direct video, and removal confirms @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");await page.getByText("Add input",{exact:true}).click();await page.getByLabel("Source label",{exact:true}).fill("New source");await page.getByLabel("Video or stream link",{exact:true}).fill("https://example.invalid/private");await page.getByRole("button",{name:"Add source",exact:true}).click();await expect(page.getByText("Save failed",{exact:true})).toBeVisible();
 await page.getByLabel("Video or stream link",{exact:true}).fill("https://media.example.com/open-decks.mp4");await page.getByRole("button",{name:"Add source",exact:true}).click();const source=page.getByRole("article",{name:"New source",exact:true});await expect(source.getByRole("link",{name:"Open",exact:true})).toHaveAttribute("href","https://media.example.com/open-decks.mp4");await source.getByRole("button",{name:"Remove New source",exact:true}).click();await confirm(page,"Remove source");await expect(source).toHaveCount(0);
});

test("cancelled and rejected live replacements retain the draft until a successful save @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");
 await page.getByRole("button",{name:"Replace Custom",exact:true}).click();
 const label=page.getByLabel("Source label",{exact:true}),url=page.getByLabel("Video or stream link",{exact:true});
 await label.fill("Retained draft");await url.fill("https://www.twitch.tv/replacement");
 await page.getByRole("button",{name:"Replace source",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click();
 await expect(label).toHaveValue("Retained draft");await expect(url).toHaveValue("https://www.twitch.tv/replacement");
 await page.getByRole("button",{name:"Replace source",exact:true}).click();await page.keyboard.press("Escape");await expect(label).toBeEnabled();
 await url.fill("https://example.invalid/private");await page.getByRole("button",{name:"Replace source",exact:true}).click();await confirm(page,"Replace source");
 await expect(page.getByText("Command failed",{exact:true})).toBeVisible();await expect(label).toHaveValue("Retained draft");await expect(url).toHaveValue("https://example.invalid/private");
 await url.fill("https://www.twitch.tv/replacement");await page.getByRole("button",{name:"Replace source",exact:true}).click();await confirm(page,"Replace source");
 await expect(page.getByRole("article",{name:"Retained draft",exact:true})).toBeVisible();await expect(label).toHaveValue("");await expect(url).toHaveValue("");
});
test.describe("mobile operator",()=>{test.use({viewport:devices["Pixel 7"].viewport,isMobile:true,hasTouch:true,deviceScaleFactor:devices["Pixel 7"].deviceScaleFactor});test("controls and diagnostics fit the viewport @flow @fixture",async({page},info)=>{
 await page.goto("/playwright/event-operator");await page.getByRole("button",{name:"Observe live",exact:true}).click();await details(page);await page.getByText("Diagnostics",{exact:true}).click();await expect(page.getByText("CPU",{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:info.outputPath("operator-mobile.png"),fullPage:true});
});});
test('editor broadcast inputs preserve legacy VRCDN selection through save, reload and reset @flow @fixture',async({page})=>{
 await page.goto('/playwright/event-lineup?editor');
 await page.getByRole('navigation',{name:'Event editor',exact:true}).getByRole('button',{name:'Lineup',exact:true}).click();
 const rows=page.locator('[data-lineup-row]');
 await rows.nth(2).getByRole('combobox',{name:'Broadcast input',exact:true}).selectOption('vrcdn:lumen-main');
 await rows.first().getByRole('combobox',{name:'Broadcast input',exact:true}).selectOption('twitch:aurora');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Unpublish and save draft',exact:true}).click();
 // The existing fixture starts published; accept its normal unpublish confirmation.
 await expect(page.getByRole('button',{name:'Save draft',exact:true})).toBeVisible();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('event-lineup-fixture-v1-submission')!));
 expect(stored.lineup[2].selectedStreamId).toBe('removed-source');
 expect(stored.lineup[2].broadcastInput).toEqual({kind:'vrcdn',streamId:'lumen-main'});
 expect(stored.lineup[0].broadcastInput).toEqual({kind:'twitch',channel:'aurora'});
 await page.reload();
 await page.getByRole('navigation',{name:'Event editor',exact:true}).getByRole('button',{name:'Lineup',exact:true}).click();
 await expect(rows.first().getByRole('combobox',{name:'Broadcast input',exact:true})).toHaveValue('twitch:aurora');
 await rows.first().getByRole('combobox',{name:'Broadcast input',exact:true}).selectOption('');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('event-lineup-fixture-v1-submission')!).lineup[0].broadcastInput)).toBeNull();
});


test("Quick switch searches people, previews their source and confirms before taking it @flow @fixture",async({page},info)=>{
 await page.route("https://stream.vrcdn.live/**",route=>route.abort());
 await page.goto("/playwright/event-operator");await page.getByRole("combobox",{name:"Performer",exact:true}).fill("aur");
 const results=page.getByRole("listbox",{name:"Performer",exact:true});await expect(results.getByRole("option")).toContainText("Aurora");await page.screenshot({path:info.outputPath("person-lookup.png"),fullPage:true});await results.getByRole("option").click();
 await page.getByRole("combobox",{name:"Stream",exact:true}).selectOption("https://stream.vrcdn.live/live/aurora.live.ts");await expect(page.getByLabel("Or paste a link",{exact:true})).toHaveValue("https://stream.vrcdn.live/live/aurora.live.ts");
 await page.getByRole("button",{name:"Check source",exact:true}).click();await expect(page.getByRole("region",{name:"Quick switch preview",exact:true})).toBeVisible();await page.getByRole("button",{name:"Put Aurora on air",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();await expect(page.getByLabel("Command count")).toHaveText("0");await page.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click();await expect(page.getByLabel("Command count")).toHaveText("0");
});

test("a confirmation cannot apply after the worker epoch changes @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");await page.getByRole("button",{name:"Take Custom",exact:true}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 // A subscription can replace authority while the native modal is open.
 await page.getByRole("button",{name:"New epoch",exact:true}).evaluate(button=>{if(button instanceof HTMLElement)button.click();});
 await page.getByRole("dialog").getByRole("button",{name:"Put Custom on air",exact:true}).click();
 await expect(page.getByLabel("Command count")).toHaveText("0");await expect(page.getByText("Command failed",{exact:true})).toBeVisible();
});
test("Quick switch keeps uncertain request IDs and renews completed checks @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");await page.getByLabel("Or paste a link",{exact:true}).fill("https://www.twitch.tv/aurora");
 await page.getByRole("button",{name:"Fail commands",exact:true}).click();await page.getByRole("button",{name:"Check source",exact:true}).click();await expect(page.getByRole("region",{name:"Quick switch",exact:true}).getByRole("alert")).toContainText("Couldn’t check");
 await page.getByRole("button",{name:"Allow commands",exact:true}).click();await page.getByRole("button",{name:"Check source",exact:true}).click();await expect(page.getByRole("region",{name:"Quick switch preview",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Check source",exact:true}).click();await expect(page.getByRole("button",{name:"Check source",exact:true})).toBeEnabled();
 const keys=(await page.getByLabel("Preparation request keys",{exact:true}).textContent())!.split(",");
 expect(keys).toHaveLength(3);expect(keys[0]).toBe(keys[1]);expect(keys[2]).not.toBe(keys[1]);
});

test("legacy stream settings stay visible until an admitted profile is saved @flow @fixture",async({page},info)=>{
 await page.goto("/playwright/event-operator?legacySettings=1");
 await page.getByText("Stream settings",{exact:true}).click();
 const resolution=page.getByRole("combobox",{name:"Resolution",exact:true});
 const rate=page.getByRole("combobox",{name:"Frame rate",exact:true});
 const audio=page.getByRole("combobox",{name:"Audio bitrate",exact:true});
 const save=page.getByRole("button",{name:"Save settings",exact:true});
 const nextStart=page.getByText("Next start",{exact:true}).locator("..");
 await expect(nextStart).toContainText("480p60 · 160 kbps");
 await expect(resolution).toHaveValue("480");await expect(rate).toHaveValue("60");await expect(audio).toHaveValue("160");await expect(save).toBeDisabled();
 for(const height of ["480","1080"]) await expect(resolution.locator(`option[value="${height}"]`)).toHaveAttribute("disabled", "");
 await expect(rate.locator('option[value="60"]')).toHaveAttribute("disabled", "");await expect(audio.locator('option[value="160"]')).toHaveAttribute("disabled", "");
 await page.getByRole("complementary",{name:"Destination",exact:true}).screenshot({path:info.outputPath("legacy-settings.png")});
 await resolution.selectOption("720");await expect(rate).toHaveValue("60");await expect(save).toBeDisabled();
 await rate.selectOption("30");await expect(audio).toHaveValue("160");await expect(save).toBeDisabled();
 await audio.selectOption("320");await expect(save).toBeEnabled();
 await resolution.press("ArrowUp");await expect(resolution).toHaveValue("720");
 await rate.press("ArrowDown");await expect(rate).toHaveValue("30");
 await audio.press("ArrowUp");await expect(audio).toHaveValue("320");
 await expect(nextStart).toContainText("480p60 · 160 kbps");await save.click();
 await expect(nextStart).toContainText("720p30 · 320 kbps");
 await expect(page.getByText("Active",{exact:true}).first().locator("..")).toContainText("720p30 · 160 kbps");
 await page.getByRole("complementary",{name:"Destination",exact:true}).screenshot({path:info.outputPath("qualified-settings.png")});
});
