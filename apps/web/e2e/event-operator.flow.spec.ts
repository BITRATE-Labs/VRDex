import { devices, expect, test, type Page } from "@playwright/test";
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
test("stopped broadcast starts a chosen destination without claiming observed live output @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");await page.getByRole("button",{name:"End session",exact:true}).click();await expect(page.getByLabel("Primary output",{exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Start",exact:true}).click();await expect(page.getByLabel("Started output")).toHaveText("primary");await details(page);await expect(page.getByText("Observed output",{exact:true}).locator("..")).toContainText("Unknown");
});
test("replacing or removing live inputs requires confirmation and quality applies next start @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");await page.getByRole("button",{name:"Replace Custom",exact:true}).click();await page.getByLabel("Source label",{exact:true}).fill("Replacement");await page.getByLabel("Video or stream link",{exact:true}).fill("https://www.twitch.tv/replacement");await page.getByRole("button",{name:"Replace source",exact:true}).click();await expect(page.getByRole("article",{name:"Replacement",exact:true})).toHaveCount(0);await confirm(page,"Replace source");
 const source=page.getByRole("article",{name:"Replacement",exact:true});await expect(source).toBeVisible();await source.getByRole("button",{name:"Remove Replacement",exact:true}).click();await confirm(page,"Remove source");await expect(source).toHaveCount(0);
 await page.getByText("Stream settings",{exact:true}).click();await page.getByRole("combobox",{name:"Resolution",exact:true}).selectOption("1080");await page.getByRole("button",{name:"Save settings",exact:true}).click();await expect(page.getByText("Next start",{exact:true}).locator("..")).toContainText("1080p30");await expect(page.getByText("Active",{exact:true}).first().locator("..")).toContainText("720p30");
});
test("custom source validates links, supports direct video, and removal confirms @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator");await page.getByText("Add input",{exact:true}).click();await page.getByLabel("Source label",{exact:true}).fill("New source");await page.getByLabel("Video or stream link",{exact:true}).fill("https://example.invalid/private");await page.getByRole("button",{name:"Add source",exact:true}).click();await expect(page.getByText("Save failed",{exact:true})).toBeVisible();
 await page.getByLabel("Video or stream link",{exact:true}).fill("https://media.example.com/open-decks.mp4");await page.getByRole("button",{name:"Add source",exact:true}).click();const source=page.getByRole("article",{name:"New source",exact:true});await expect(source.getByRole("link",{name:"Open",exact:true})).toHaveAttribute("href","https://media.example.com/open-decks.mp4");await source.getByRole("button",{name:"Remove New source",exact:true}).click();await confirm(page,"Remove source");await expect(source).toHaveCount(0);
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
