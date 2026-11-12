import {expect,test} from '@playwright/test';

test('fixture photos show synthetic linked provenance on demand @flow @fixture',async({page})=>{
 const requests:string[]=[];
 page.on('request',request=>{if(/\/assets\/fixture-aurora-profile-image$/.test(request.url()))requests.push(request.url());});
 await page.goto('/playwright-dj-aurora',{waitUntil:'networkidle'});
 const card=page.locator('#media-fixture-aurora-profile-image');
 expect(requests).toHaveLength(0);
 await card.locator('summary').click();
 await expect(card.getByText('Uploaded by',{exact:true})).toBeVisible();
 await expect(card.getByRole('link',{name:'Afterglow Social',exact:true}).first()).toHaveAttribute('href','/playwright-afterglow-social');
 for(const step of ['Uploaded','Approved','Published'])await expect(card.getByText(step,{exact:true})).toBeVisible();
 await expect(card.getByRole('link',{name:'DJ Aurora',exact:true}).first()).toHaveAttribute('href','/playwright-dj-aurora');
 await expect(card.getByText('Unavailable',{exact:true})).toHaveCount(0);
 expect(requests).toHaveLength(1);
 await card.locator('summary').click();
 await card.locator('summary').click();
 expect(requests).toHaveLength(1);
});
