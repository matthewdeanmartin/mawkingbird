import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = path.resolve('dist-mockingbird/browser');
await fs.mkdir('.test-results', { recursive: true });
const mime = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) file = path.join(root, 'index.html');
    try {
      if (!(await fs.stat(file)).isFile()) file = path.join(root, 'index.html');
    } catch {
      file = path.join(root, 'index.html');
    }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch {
    res.statusCode = 500;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('mastodon_mock_token', 'radio-browser-fixture');
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
  });
  const account = {
    id: '1',
    username: 'music',
    acct: 'music',
    display_name: 'Music',
    note: '',
    avatar: '',
    avatar_static: '',
    header: '',
    header_static: '',
    url: `${base}/accounts/1`,
    locked: false,
    bot: false,
    created_at: '2020-01-01T00:00:00Z',
    followers_count: 10,
    following_count: 5,
    statuses_count: 2,
    emojis: [],
    fields: [],
    source: { privacy: 'public', sensitive: false, language: 'en', note: '', fields: [] },
  };
  const audio = {
    id: '10',
    account,
    content: '<p>A recording from the garden.</p>',
    created_at: '2026-10-24T12:00:00Z',
    edited_at: null,
    spoiler_text: '',
    sensitive: false,
    visibility: 'public',
    url: `${base}/statuses/10`,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    poll: null,
    emojis: [],
    media_attachments: [
      {
        id: 'audio-1',
        type: 'audio',
        url: `${base}/sample-10.wav`,
        preview_url: null,
        description: 'Birdsong',
        meta: { original: { duration: 20 } },
      },
    ],
  };
  // Real decodable local audio: browser playback and ended events are exercised.
  const samples = 8000 * 30;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  await page.route('**/sample-*.wav', (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers()['range'] ?? '');
    const start = Number(range?.[1] ?? 0);
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: 'audio/wav',
      headers: {
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
      },
      body: wav.subarray(start, end + 1),
    });
  });
  const second = {
    ...audio,
    id: '9',
    url: `${base}/statuses/9`,
    media_attachments: [
      { ...audio.media_attachments[0], id: 'audio-2', url: `${base}/sample-9.wav` },
    ],
  };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname.includes('verify_credentials') || url.pathname.endsWith('/lookup'))
      body = account;
    else if (url.pathname.endsWith('/statuses') || url.pathname.endsWith('/timelines/home'))
      body = url.searchParams.has('max_id') ? [] : [audio, second];
    else if (url.pathname.endsWith('/lists')) body = [{ id: '2', title: 'Music makers' }];
    else if (url.pathname.includes('/instance'))
      body = { domain: 'localhost', title: 'Radio fixture', version: '4.5.0', configuration: {} };
    await route.fulfill({ json: body });
  });
  await page.goto(`${base}/radio`);
  await page.getByRole('heading', { name: 'Radio', exact: true }).waitFor();
  await page.getByLabel(/Account handle/).fill('music');
  await page.getByRole('button', { name: 'Find audio', exact: true }).click();
  await page.getByText('Reached the end of the available feed.').waitFor();
  assert.match(await page.locator('.radio-page').innerText(), /found 2 audio posts/);
  assert.equal(await page.locator('.radio-page audio').count(), 2);
  await page.getByRole('button', { name: 'Play audio by Music', exact: true }).first().click();
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio[data-radio]');
    return audio && !audio.paused && audio.currentTime > 0.1;
  });
  const startedAt = await page.locator('audio[data-radio]').evaluate((audio) => audio.currentTime);
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  await page.getByRole('heading', { name: 'Radio Studio', exact: true }).waitFor();
  assert.equal(await page.locator('audio[data-radio]').evaluate((audio) => audio.paused), false);
  assert.ok(
    (await page.locator('audio[data-radio]').evaluate((audio) => audio.currentTime)) >= startedAt,
  );
  await page.locator('app-radio-dock a').click();
  await page.locator('app-radio-controls').waitFor();
  await page.locator('audio[data-radio]').evaluate((audio) => {
    audio.currentTime = audio.duration - 0.2;
  });
  await page
    .waitForFunction(() =>
      document.querySelector('audio[data-radio]')?.src.endsWith('/sample-9.wav'),
    )
    .catch(async (error) => {
      console.log(
        'audio diagnostic',
        await page
          .locator('audio[data-radio]')
          .evaluate((audio) => ({
            time: audio.currentTime,
            duration: audio.duration,
            paused: audio.paused,
            src: audio.src,
            ended: audio.ended,
            error: audio.error?.message,
          })),
        errors,
      );
      throw error;
    });
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio[data-radio]');
    return audio && !audio.paused && audio.currentTime > 0;
  });
  await page
    .locator('app-radio-controls')
    .getByRole('button', { name: 'Pause', exact: true })
    .click();
  assert.equal(await page.locator('audio[data-radio]').evaluate((audio) => audio.paused), true);
  await page
    .locator('app-radio-controls')
    .getByRole('button', { name: 'Full screen', exact: true })
    .click();
  await page.locator('app-radio-controls.fullscreen').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('app-radio-controls')?.classList.contains('fullscreen'),
  );
  await page.screenshot({ path: '.test-results/radio-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-results/radio-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page
    .locator('app-radio-dock')
    .getByRole('button', { name: 'Stop Radio', exact: true })
    .click();
  assert.equal(await page.locator('audio[data-radio]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'Radio browser checks passed: discovery, real audio, navigation continuity, automatic advance, pause, fullscreen, mobile overflow and stop; no page errors.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
