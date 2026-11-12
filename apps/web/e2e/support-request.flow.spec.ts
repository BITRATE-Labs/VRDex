import { expect, test } from '@playwright/test';

test('general support needs no profile and optional context stays removable @flow @fixture',async({page})=>{
 await page.goto('/support',{waitUntil:'networkidle'});
 await expect(page.getByLabel('Profile type',{exact:true})).toHaveCount(0);
 await page.getByLabel('Request type').selectOption('feedback');
 await page.getByLabel('Message',{exact:true}).fill('The site search is not working.');
 await expect.poll(()=>page.locator('form').evaluate(form=>(form as HTMLFormElement).checkValidity())).toBe(true);
 await page.getByText('Related profile (optional)',{exact:true}).click();
 await page.getByLabel('Profile type',{exact:true}).selectOption('community');
 await expect(page.getByRole('combobox',{name:'Find profile',exact:true})).toBeVisible();
 await page.getByLabel('Request type').selectOption('transfer');
 await expect(page.getByLabel('Profile type',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Contact for follow-up',{exact:true})).toHaveAttribute('required','');
});

test('listing requests use live profile selection and retain manual fallback @flow @fixture',async({page},info)=>{
 await page.goto('/playwright/event-intake?source=support&topic=owner_opt_out',{waitUntil:'networkidle'});
 await page.getByLabel('Profile type',{exact:true}).selectOption('person');
 await page.getByRole('combobox',{name:'Find profile',exact:true}).fill('Aurora');
 await page.getByRole('option').filter({hasText:'Aurora'}).first().click();
 await expect(page.locator('input[name="profileSlug"]')).toHaveValue('aurora');
 await expect(page.locator('input[name="displayName"]')).toHaveValue('Aurora');
 await page.screenshot({path:info.outputPath('support-selected-profile.png'),fullPage:true});
 await page.getByRole('button',{name:'Clear',exact:true}).click();
 await page.getByRole('button',{name:'Enter a link or name',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Missing listing');
 await page.getByLabel('Message',{exact:true}).fill('Please review this missing listing.');
 expect(await page.locator('form').evaluate(form=>(form as HTMLFormElement).checkValidity())).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('feedback sends no stale profile and stays outside suppression @flow @fixture', async ({page}) => {
 await page.goto('/playwright/event-intake?source=support&topic=owner_opt_out',{waitUntil:'networkidle'});
 await page.getByLabel('Profile type',{exact:true}).selectOption('person');
 await page.getByRole('combobox',{name:'Find profile',exact:true}).fill('Aurora');
 await page.getByRole('option').filter({hasText:'Aurora'}).first().click();
 await page.getByLabel('Request type').selectOption('feedback');
 await page.getByLabel('Message',{exact:true}).fill('The calendar download fails.');
 await page.getByRole('button',{name:'Send request',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('fixture-support-submission')!))).toEqual({name:'supportRequests:submitSupportRequest',args:{topic:'feedback',message:'The calendar download fails.'}});
 await expect(page.getByRole('status')).not.toBeEmpty();
 await expect(page.getByLabel('Request type')).toHaveValue('');
});

test('manual suppression keeps explicit type and deep links reset context @flow @fixture', async ({page}) => {
 await page.goto('/playwright/event-intake?source=support&topic=owner_opt_out',{waitUntil:'networkidle'});
 await page.getByLabel('Profile type',{exact:true}).selectOption('community');
 await page.getByRole('button',{name:'Enter a link or name',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Missing club');
 await page.getByLabel('Message',{exact:true}).fill('Please remove my community listing.');
 await page.getByRole('button',{name:'Send request',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('fixture-support-submission')!))).toEqual({name:'suppressions:requestProfileSuppression',args:{requestType:'owner_opt_out',profileType:'community',displayName:'Missing club',requesterNote:'Please remove my community listing.'}});
 await page.evaluate(()=>history.pushState({},'', '?source=support&topic=recovery'));
 await expect(page.getByLabel('Request type')).toHaveValue('recovery');
 await expect(page.getByLabel('Profile type',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('Message',{exact:true})).toHaveValue('');
 for (const topic of ['recovery','transfer','ownership_dispute']) {
  await page.getByLabel('Request type').selectOption(topic);
  await expect(page.getByLabel('Contact for follow-up',{exact:true})).toHaveAttribute('required','');
 }
});

test('pending support disables context and failure retains the draft @flow @fixture', async ({page}) => {
 await page.goto('/playwright/event-intake?source=support&topic=owner_opt_out',{waitUntil:'networkidle'});
 await page.getByLabel('Profile type',{exact:true}).selectOption('person');
 await page.getByRole('button',{name:'Enter a link or name',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Missing person');
 await page.getByLabel('Message',{exact:true}).fill('Please review this profile listing.');
 await page.evaluate(()=>{sessionStorage.setItem('fixture-support-defer','true');sessionStorage.setItem('fixture-support-fail','true');});
 await page.getByRole('button',{name:'Send request',exact:true}).click();
 await expect(page.getByLabel('Request type')).toBeDisabled();
 await expect(page.getByLabel('Profile type',{exact:true})).toBeDisabled();
 await expect(page.getByLabel('Name',{exact:true})).toBeDisabled();
 await page.evaluate(()=>window.dispatchEvent(new Event('fixture-support-release')));
 await expect(page.locator('form').getByRole('alert')).toHaveText('Tell us a little more about what you need.');
 await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Missing person');
 await expect(page.getByLabel('Message',{exact:true})).toHaveValue('Please review this profile listing.');
 await expect(page.getByRole('button',{name:'Send request',exact:true})).toBeEnabled();
});
