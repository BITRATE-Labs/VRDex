import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

for (const mode of ['sequence', 'automatic', 'event-stream']) test(`composed public page retains ${mode} playback after consumer unmount @fixture`, async ({ page, baseURL }, testInfo) => {
  test.setTimeout(45000);
  // Checked-in generated MPEG-TS uses the production loader/MSE decoder without
  // requiring an FFmpeg binary in the default browser CI lane.
  const transport = 'http://127.0.0.1:6799';
  let opened = 0;
  const serve = async (route: import('@playwright/test').Route) => {
    opened++;
    await route.fulfill({ contentType: 'video/mp2t', path: path.resolve('e2e/fixtures/persistent-synthetic.mpegts'), headers: { 'access-control-allow-origin': '*' } });
  };
  await page.route(`${transport}/**`, serve);
  await page.route('https://stream.vrcdn.live/live/fixture.live.ts', serve);
  try {
    await page.goto(`${baseURL}/playwright/event-lineup-live?composed&${mode === 'automatic' ? 'automatic&' : ''}transport=${encodeURIComponent(transport)}`);
    if (mode === 'event-stream') {
      await page.getByRole('button', { name: 'event-stream', exact: true }).click();
    }
    await expect(page.locator('video')).toHaveCount(0);
    await page.getByRole('button', { name: 'Play Lineup live', exact: true }).click();
    const video = page.locator('video:not([hidden])');
    await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime), { timeout: 20000 }).toBeGreaterThan(1);
    await expect(page.locator('video')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Audio only', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Video', exact: true })).toHaveCount(0);
    if (mode !== 'event-stream') await page.getByRole('button', { name: 'Eligible', exact: true }).click();
    const sourceCount = mode === 'event-stream' ? 1 : 2;
    await expect(page.locator('video')).toHaveCount(sourceCount);
    expect(opened).toBe(sourceCount);
    if (mode === 'automatic') await page.screenshot({ path: testInfo.outputPath('automatic-viewer.png'), fullPage: true });
    const original = await video.elementHandle();
    const before = await video.evaluate(node => (node as HTMLVideoElement).currentTime);
    await page.getByRole('button', { name: 'Unmount', exact: true }).click();
    await expect(page.locator('[data-event-playback-inline]')).toHaveCount(0);
    await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(before + 1);
    expect(await video.evaluate((node, previous) => node === previous, original)).toBe(true);
    await page.getByRole('button', { name: 'Close event playback', exact: true }).click();
    await expect(page.locator('video')).toHaveCount(0);
    expect(await original!.evaluate(node => node.isConnected)).toBe(false);
    expect(opened).toBe(sourceCount);
  } finally { await page.goto('about:blank'); }
});

test('live MPEG-TS releases old buffers while current playback advances @fixture', async ({ page, baseURL }, info) => {
  test.skip(process.env.EVENT_PLAYBACK_PROOF !== 'true', 'Opt-in real loopback MPEG-TS transport');
  test.setTimeout(90000);
  const { startProofServer } = await (new Function('url', 'return import(url)'))(pathToFileURL(path.resolve('../../scripts/event-playback-proof.mjs')).href);
  const transport = await startProofServer();
  try {
    await page.goto(`${baseURL}/playwright/event-lineup-live?composed&transport=${encodeURIComponent(transport.url)}`);
    const startedAt = performance.now();
    await page.getByRole('button', { name: 'Play Lineup live', exact: true }).click();
    const video = page.locator('video:not([hidden])');
    await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime), { timeout: 20000 }).toBeGreaterThan(0);
    const startupMs = performance.now() - startedAt;
    await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime), { timeout: 55000 }).toBeGreaterThan(38);
    const media = await video.evaluate(node => {
      const video = node as HTMLVideoElement;
      return { currentTime: video.currentTime, bufferedStart: video.buffered.start(0), bufferedEnd: video.buffered.end(video.buffered.length - 1), paused: video.paused };
    });
    expect(media.paused).toBe(false);
    expect(media.bufferedStart).toBeGreaterThan(10);
    expect(media.currentTime - media.bufferedStart).toBeLessThanOrEqual(31);
    await info.attach('live-buffer.json', { body: JSON.stringify({ startupMs, ...media }), contentType: 'application/json' });
    await page.getByRole('button', { name: 'Close event playback', exact: true }).click();
    await expect.poll(async () => (await (await fetch(`${transport.url}/stats`)).json()).active).toBe(0);
  } finally { await page.goto('about:blank'); await transport.close(); }
});


test('automatic sequence advances on continuous decoded silence near the set end @fixture', async ({ page, baseURL }) => {
  test.skip(process.env.EVENT_PLAYBACK_PROOF !== 'true', 'Opt-in real loopback MPEG-TS transport');
  test.setTimeout(90000);
  const { startProofServer } = await (new Function('url', 'return import(url)'))(pathToFileURL(path.resolve('../../scripts/event-playback-proof.mjs')).href);
  const transport = await startProofServer();
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const observations: Array<{ video: HTMLMediaElement; analyser: AnalyserNode }> = [];
    class Context extends Native {
      sourceVideo?: HTMLMediaElement;
      createMediaElementSource(video: HTMLMediaElement) { this.sourceVideo = video; return super.createMediaElementSource(video); }
      createAnalyser() { const analyser = super.createAnalyser(); if (this.sourceVideo) observations.push({ video: this.sourceVideo, analyser }); return analyser; }
    }
    Object.assign(window, { AudioContext: Context, composedAudio: observations });
  });
  try {
    await page.goto(`${baseURL}/playwright/event-lineup-live?composed&automatic&kind=silent&transport=${encodeURIComponent(transport.url)}`);
    await page.getByRole('button', { name: 'Play Lineup live', exact: true }).click();
    const current = page.locator('video:not([hidden])');
    const selection = page.getByRole('combobox', { name: 'Performer', exact: true });
    await expect.poll(() => current.evaluate(v => (v as HTMLVideoElement).currentTime), { timeout: 20000 }).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Eligible', exact: true }).click();
    await expect.poll(() => page.locator('video[hidden]').evaluate(v => (v as HTMLVideoElement).currentTime), { timeout: 20000 }).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Boundary', exact: true }).click();
    const before = await current.evaluate(v => (v as HTMLVideoElement).currentTime);
    await expect.poll(() => current.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(before + 1.5);
    const rms = await page.evaluate(() => {
      const observations = (window as unknown as { composedAudio: Array<{ video: HTMLMediaElement; analyser: AnalyserNode }> }).composedAudio;
      const active = observations.findLast(({ video }) => video.isConnected && !video.hidden)!;
      const samples = new Float32Array(active.analyser.fftSize); active.analyser.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    });
    expect(rms).toBeLessThan(0.000001);
    await expect(selection).toHaveValue('a');
    await expect(selection).toHaveValue('b', { timeout: 25000 });
    await expect.poll(() => current.evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Close event playback', exact: true }).click();
    await expect(page.locator('video')).toHaveCount(0);
    await expect.poll(async () => (await (await fetch(`${transport.url}/stats`)).json()).active).toBe(0);
  } finally { await page.goto('about:blank'); await transport.close(); }
});


test('event editor defaults to automatic and can select an event stream @fixture', async ({ page }, testInfo) => {
  await page.goto('/playwright/event-editor');
  await page.getByRole('navigation', { name: 'Event editor' }).getByRole('button', { name: 'Review', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Advanced' }).click();
  const mode = page.getByRole('combobox', { name: 'Watch mode', exact: true });
  await expect(mode).toHaveValue('automatic');
  await mode.selectOption('event_stream');
  await expect(mode).toHaveValue('event_stream');
  await mode.selectOption('automatic');
  await mode.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('automatic-editor.png') });
});


test('mixed community lineup offers Play only for the actual current linked performer @fixture', async ({ page }, testInfo) => {
  let mediaRequests = 0;
  await page.route('http://127.0.0.1:6799/**', route => { mediaRequests++; return route.abort(); });
  await page.goto('/playwright/event-lineup-live?composed&automatic&transport=http%3A%2F%2F127.0.0.1%3A6799');
  const play = page.getByRole('button', { name: 'Play Lineup live', exact: true });
  await expect(play).toBeVisible();
  await page.getByRole('button', { name: 'missing', exact: true }).click();
  await page.getByRole('button', { name: 'Next slot', exact: true }).click();
  await expect(play).toHaveCount(0);
  await expect(page.locator('[data-event-playback-inline]')).toHaveCount(0);
  await expect(page.locator('video')).toHaveCount(0);
  expect(mediaRequests).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('missing-current-performer.png'), fullPage: true });
  await page.getByRole('button', { name: 'Before window', exact: true }).click();
  await expect(play).toBeVisible();
  expect(mediaRequests).toBe(0);
});


test('a slow valid MPEG-TS response starts on its original connection @fixture', async ({ page }, testInfo) => {
  test.setTimeout(30000);
  let opened = 0;
  await page.route('http://127.0.0.1:6799/**', async route => {
    opened++;
    await new Promise(resolve => setTimeout(resolve, 7000));
    await route.fulfill({ contentType: 'video/mp2t', path: path.resolve('e2e/fixtures/persistent-synthetic.mpegts'), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/playwright/event-lineup-live?composed&automatic&transport=http%3A%2F%2F127.0.0.1%3A6799');
  await page.getByRole('button', { name: 'Play Lineup live', exact: true }).click();
  const video = page.locator('video:not([hidden])');
  await expect.poll(() => video.evaluate(node => (node as HTMLVideoElement).currentTime), { timeout: 15000 }).toBeGreaterThan(1);
  expect(opened).toBe(1);
  await expect(page.getByRole('button', { name: 'Audio only', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('slow-start-legacy-controls.png') });
  await page.getByRole('button', { name: 'Close event playback', exact: true }).click();
});


test('saved audio preference blocks automatic legacy video until explicit Video recovery @fixture', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vrdex.playback-mode', 'audio'));
  let opened = 0;
  await page.route('http://127.0.0.1:6799/**', async route => {
    opened++;
    await route.fulfill({ contentType: 'video/mp2t', path: path.resolve('e2e/fixtures/persistent-synthetic.mpegts'), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/playwright/event-lineup-live?composed&automatic&transport=http%3A%2F%2F127.0.0.1%3A6799');
  await page.getByRole('button', { name: 'Play Lineup live', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enable playback', exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect(opened).toBe(0);
  await expect(page.getByRole('button', { name: 'Audio only', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Video', exact: true }).click();
  await page.getByRole('group', { name: 'Lineup live controls', exact: true }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('video:not([hidden])').evaluate(node => (node as HTMLVideoElement).currentTime), { timeout: 15000 }).toBeGreaterThan(1);
  expect(opened).toBe(1);
});


test('current-source eligibility updates at the slot boundary without a visibility event @fixture', async ({ page }) => {
  await page.clock.install();
  await page.goto('/playwright/event-lineup-live?composed&automatic&transport=http%3A%2F%2F127.0.0.1%3A6799');
  await page.getByRole('button', { name: 'Before window', exact: true }).click();
  const play = page.getByRole('button', { name: 'Play Lineup live', exact: true });
  await expect(play).toBeVisible();
  await page.getByRole('button', { name: 'missing', exact: true }).click();
  await page.getByRole('button', { name: 'Just before boundary', exact: true }).click();
  await expect(play).toBeVisible();
  await page.evaluate(() => { Date.now = () => 1_240_000; });
  await page.clock.runFor(5100);
  await expect(play).toHaveCount(0, { timeout: 1000 });
  await page.getByRole('button', { name: 'Before window', exact: true }).click();
  await page.getByRole('button', { name: 'missing-first', exact: true }).click();
  await expect(play).toHaveCount(0);
  await page.getByRole('button', { name: 'Just before boundary', exact: true }).click();
  await page.evaluate(() => { Date.now = () => 1_240_000; });
  await page.clock.runFor(5100);
  await expect(play).toBeVisible({ timeout: 1000 });
  await expect(page.locator('video')).toHaveCount(0);
});
