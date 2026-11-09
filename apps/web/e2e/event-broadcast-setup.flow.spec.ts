import { expect, test } from "@playwright/test";
test.beforeEach(async({page})=>{
 await page.route("**/api/event-broadcast/connections",async route=>{
  const body=route.request().postDataJSON();
  expect(body.permissionsAccepted).toBe(true);expect(body.streamKey).toBe("fixture-not-a-secret");expect(body.expectedRevision).toBe(0);
  await route.fulfill({json:{connection:{outputId:"fixture-output",revision:1,provider:body.provider,serverUrl:body.serverUrl,playbackLinks:[],testState:"not_tested"}}});
 });
});
test("setup parses world links and only matching worker proof completes the optional test @flow @fixture",async({page},info)=>{
 await page.goto("/playwright/event-operator/setup");await expect(page.getByRole("heading",{name:"Connect your stream",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Custom",exact:true}).click();await page.getByLabel("Server URL",{exact:true}).fill("bad-url");await page.getByLabel("Stream key",{exact:true}).fill("fixture-not-a-secret");await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Continue",exact:true}).click();await expect(page.getByRole("alert")).toHaveText("Enter a valid server URL starting with rtmp:// or rtmps://.");
 await page.getByRole("button",{name:"VRCDN",exact:true}).click();await page.getByLabel("Stream key",{exact:true}).fill("fixture-not-a-secret");await page.getByRole("button",{name:"Continue",exact:true}).click();
 await page.getByLabel("Playback URL",{exact:true}).fill("https://panel.vrcdn.live/preview/afterglow-demo");await expect(page.getByRole("button",{name:"Copy PC URL",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Copy Quest URL",exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath("setup-playback-links.png"),fullPage:true});await page.getByRole("button",{name:"Continue",exact:true}).click();await expect(page.getByRole("link",{name:"Skip test",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Test connection",exact:true}).click();await expect(page.getByRole("status")).toHaveText("Testing connection…");await expect(page.getByRole("heading",{name:"Connection test passed",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Complete worker proof",exact:true}).click();await expect(page.getByRole("heading",{name:"Connection test passed",exact:true})).toBeVisible();await expect(page.getByRole("link",{name:"Back to broadcast",exact:true})).toBeVisible();await page.screenshot({path:info.outputPath("setup-passed.png"),fullPage:true});
});
test("setup cancellation and failure remain retryable @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator/setup");await page.getByLabel("Stream key",{exact:true}).fill("fixture-not-a-secret");await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByLabel("Playback URL",{exact:true}).fill("https://example.com/live");await page.getByRole("button",{name:"Continue",exact:true}).click();await page.getByRole("button",{name:"Test connection",exact:true}).click();await page.getByRole("button",{name:"Cancel test",exact:true}).click();await expect(page.getByRole("link",{name:"Skip test",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Test connection",exact:true}).click();await page.getByRole("button",{name:"Fail test",exact:true}).click();await expect(page.getByRole("alert")).toContainText("The test");await expect(page.getByRole("button",{name:"Test connection",exact:true})).toBeEnabled();
});
test("unsaved connection changes can be retained @flow @fixture",async({page})=>{
 await page.goto("/playwright/event-operator/setup");await page.getByLabel("Stream key",{exact:true}).fill("fixture-not-a-secret");await page.getByRole("link",{name:"Back to broadcast",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();await page.getByRole("button",{name:"Keep editing",exact:true}).click();await expect(page.getByLabel("Stream key",{exact:true})).toHaveValue("fixture-not-a-secret");
});
