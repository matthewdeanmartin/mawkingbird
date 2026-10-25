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
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('[Mockingbird App] uncaught'))
      errors.push(message.text());
  });
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
    url: 'https://sea.example/@music',
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
    url: 'https://sea.example/@music/10',
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
  let accountPages = 0;
  let uploads = 0;
  let publications = 0;
  let externalScenario = false;
  let providerRequests = 0;
  const linkedAudio = {
    ...audio,
    id: '30',
    url: `${base}/statuses/30`,
    media_attachments: [],
    content:
      '<p>A release with alternatives.</p><a href="https://soundcloud.com/artist/track-one">SoundCloud</a> <a href="https://mixcloud.com/artist/mix-one/">Mixcloud</a> <a href="https://open.spotify.com/track/abc123">Spotify</a> <a href="https://music.apple.com/us/album/record/123?i=456">Apple Music</a>',
  };
  const linkedNext = {
    ...linkedAudio,
    id: '29',
    url: `${base}/statuses/29`,
    content: '<a href="https://soundcloud.com/artist/track-two">Another recording</a>',
  };
  const videoLink = {
    ...linkedAudio,
    id: '28',
    url: `${base}/statuses/28`,
    content: '<a href="https://www.youtube.com/watch?v=abcdefghijk">YouTube stays video</a>',
  };
  const youtubeMusic = {
    ...linkedAudio,
    id: '27',
    url: 'https://sea.example/@music/27',
    content:
      '<a href="https://music.youtube.com/watch?v=z71d3cWLwsw&si=6w5bILhLDRVOXzUO">Sea shanty</a>',
  };
  await page.route('https://www.youtube-nocookie.com/embed/**', async (route) => {
    providerRequests++;
    await route.fulfill({ contentType: 'text/html', body: '<p>YouTube Music fixture</p>' });
  });
  await page.route('https://open.spotify.com/embed/**', async (route) => {
    providerRequests++;
    await route.fulfill({ contentType: 'text/html', body: '<p>Spotify fixture</p>' });
  });
  await page.route('https://w.soundcloud.com/**', async (route) => {
    providerRequests++;
    assert.ok(!route.request().url().endsWith('api.js'), 'No provider SDK executes in the app');
    await route.fulfill({
      contentType: 'text/html',
      body: `
      <p>SoundCloud fixture: visible player</p>
      <button id="finish">Finish recording</button>
      <script>
        const send = (method, value) => parent.postMessage(JSON.stringify({method, value}), '*');
        addEventListener('message', event => {
          if (event.source !== parent) return;
          const data = JSON.parse(event.data);
          if (data.method === 'play') { send('play'); send('playProgress', {currentPosition: 5000}); }
          if (data.method === 'pause') send('pause');
          if (data.method === 'getDuration') send('getDuration', 90000);
          if (data.method === 'seekTo') send('playProgress', {currentPosition: data.value});
        });
        document.getElementById('finish').onclick = () => send('finish');
        send('ready');
      </script>
    `,
    });
  });
  const apiFixture = async (route) => {
    if (new URL(route.request().url()).hostname === 'sea.example') {
      assert.equal(
        route.request().headers().authorization,
        undefined,
        'Public Radio requests omit credentials',
      );
    }
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname === '/api/v2/media') {
      uploads++;
      body = audio.media_attachments[0];
    } else if (url.pathname === '/api/v1/statuses' && route.request().method() === 'POST') {
      publications++;
      const draft = route.request().postDataJSON();
      assert.equal(draft.status, 'Prepared locally');
      assert.equal(draft.visibility, 'private');
      assert.deepEqual(draft.media_ids, ['audio-1']);
      assert.ok(route.request().headers()['idempotency-key']);
      body = audio;
    } else if (/\/api\/v1\/statuses\/\d+$/.test(url.pathname)) body = audio;
    else if (url.pathname.includes('verify_credentials') || url.pathname.endsWith('/lookup'))
      body = account;
    else if (url.pathname.endsWith('/statuses') || url.pathname.endsWith('/timelines/home')) {
      if (url.pathname.includes('/accounts/')) accountPages++;
      body = url.searchParams.has('max_id')
        ? []
        : externalScenario
          ? [linkedAudio, linkedNext, videoLink, youtubeMusic]
          : [audio, second];
    } else if (url.pathname.endsWith('/lists')) body = [{ id: '2', title: 'Music makers' }];
    else if (url.pathname.includes('/instance'))
      body = {
        domain: 'localhost',
        title: 'Radio fixture',
        version: '4.5.0',
        usage: { users: { active_month: 1 } },
        configuration: {
          media_attachments: { supported_mime_types: ['audio/wav'], video_size_limit: 100_000_000 },
          statuses: { max_characters: 500 },
        },
      };
    await route.fulfill({ json: body });
  };
  await page.route('**/api/**', apiFixture);
  await page.goto(`${base}/radio`);
  await page.getByRole('heading', { name: 'Radio', exact: true }).waitFor();
  const sourceLabel = await page.locator('app-radio-page mb-field label').nth(0).boundingBox();
  const handleLabel = await page.locator('app-radio-page mb-field label').nth(1).boundingBox();
  assert.ok(Math.abs(sourceLabel.y - handleLabel.y) < 2, 'Radio source labels align');
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
        await page.locator('audio[data-radio]').evaluate((audio) => ({
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
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Find all my audio', exact: true }).click();
  await page.getByText('All available history has been scanned.').waitFor();
  assert.equal(await page.locator('.catalogue li').count(), 2);
  await page.getByRole('button', { name: 'Preview post', exact: true }).first().click();
  await page.locator('app-radio-studio app-status-card').waitFor();
  await page
    .getByLabel('Audio file', { exact: true })
    .setInputFiles({ name: 'recording.wav', mimeType: 'audio/wav', buffer: wav });
  await page.getByLabel('Post text', { exact: true }).fill('Prepared locally');
  await page.getByLabel('Audio description or transcript').fill('A local recording');
  assert.equal(uploads, 0, 'Staging never uploads');
  await page.getByRole('link', { name: 'Player', exact: true }).click();
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  assert.equal(
    await page.getByLabel('Post text', { exact: true }).inputValue(),
    'Prepared locally',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-results/radio-studio-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '.test-results/radio-studio-desktop.png', fullPage: true });
  const pagesBeforeReload = accountPages;
  await page.reload();
  await page.getByText('All available history has been scanned.').waitFor();
  assert.equal(await page.locator('.catalogue li').count(), 2);
  assert.equal(accountPages, pagesBeforeReload, 'Cached catalogue avoids rescanning on reload');
  assert.equal(
    await page.getByLabel('Post text', { exact: true }).count(),
    0,
    'Staged draft is session-only',
  );
  await page.getByRole('button', { name: 'Check for newer audio', exact: true }).click();
  await page.getByText('All available history has been scanned.').waitFor();
  assert.equal(accountPages, pagesBeforeReload + 1, 'Refresh stops at known history');
  await page
    .getByLabel('Audio file', { exact: true })
    .setInputFiles({ name: 'recording.wav', mimeType: 'audio/wav', buffer: wav });
  await page.getByLabel('Post text', { exact: true }).fill('Prepared locally');
  await page.getByRole('button', { name: 'Publish audio post', exact: true }).click();
  await page.getByText('Your audio post was published.', { exact: true }).waitFor();
  assert.equal(uploads, 1);
  assert.equal(publications, 1);
  externalScenario = true;
  await page.getByRole('link', { name: 'Player', exact: true }).click();
  await page.getByLabel('Account handle', { exact: false }).fill('music');
  await page.getByRole('button', { name: 'Find audio', exact: true }).click();
  await page.getByText('Reached the end of the available feed.').waitFor();
  assert.match(await page.locator('.radio-page').innerText(), /found 3 audio posts/);
  assert.equal(providerRequests, 0, 'Discovery never contacts providers');
  await page.getByRole('checkbox', { name: 'Native Mastodon audio only', exact: true }).check();
  await page.getByRole('button', { name: 'Find audio', exact: true }).click();
  await page.getByText('Reached the end of the available feed.').waitFor();
  assert.match(await page.locator('.radio-page').innerText(), /found 0 audio posts/);
  await page.getByRole('checkbox', { name: 'Native Mastodon audio only', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Find audio', exact: true }).click();
  await page.getByText('Reached the end of the available feed.').waitFor();
  assert.match(await page.locator('.radio-page').innerText(), /found 3 audio posts/);
  await page.getByRole('button', { name: 'Load Spotify player', exact: true }).click();
  await page.locator('iframe[title="Spotify"]').waitFor();
  assert.equal(providerRequests, 1, 'Only the chosen provider loads');
  await page
    .getByRole('button', { name: 'Listen on SoundCloud in Radio', exact: true })
    .first()
    .click();
  const dock = page.locator('app-radio-dock');
  await dock.getByRole('button', { name: 'Load SoundCloud player', exact: true }).click();
  await dock.locator('iframe[title="SoundCloud"]').waitFor();
  await dock.getByRole('button', { name: 'Play', exact: true }).click();
  await dock.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  assert.equal(
    await page.locator('iframe[title="Spotify"]').count(),
    0,
    'Radio closes an opaque inline player',
  );
  const requestsBeforeNavigation = providerRequests;
  await page.getByRole('link', { name: 'Studio', exact: true }).click();
  await dock.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  assert.equal(
    providerRequests,
    requestsBeforeNavigation,
    'Navigation keeps the same provider frame',
  );
  await dock.frameLocator('iframe').getByRole('button', { name: 'Finish recording' }).click();
  await page.waitForFunction(() =>
    document.querySelector('app-radio-dock iframe')?.getAttribute('src')?.includes('track-two'),
  );
  await dock.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-results/radio-embed-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await dock.getByRole('button', { name: 'Pause', exact: true }).click();
  await dock.getByRole('button', { name: 'Play', exact: true }).waitFor();
  await dock.getByRole('button', { name: 'Stop Radio', exact: true }).click();
  await page.locator('app-radio-dock').waitFor({ state: 'detached' });
  assert.equal(await page.locator('app-radio-dock iframe').count(), 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('link', { name: 'Player', exact: true }).click();
  const musicCard = page.locator('app-status-card').filter({ hasText: 'Sea shanty' });
  assert.equal(
    await musicCard.locator('app-video-player').count(),
    0,
    'Music has one audio embed, not a duplicate video player',
  );
  await musicCard.getByRole('button', { name: 'Load YouTube Music player', exact: true }).click();
  await musicCard.locator('iframe[title="YouTube Music"]').waitFor();
  externalScenario = false;
  const shared = await browser.newPage({ viewport: { width: 390, height: 844 } });
  shared.on('pageerror', (error) => errors.push(error.message));
  shared.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('[Mockingbird App] uncaught'))
      errors.push(message.text());
  });
  await shared.route('**/api/**', apiFixture);
  await shared.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await shared.goto(`${base}/radio?post=${encodeURIComponent(audio.url)}`);
  await shared.getByRole('button', { name: /Play audio by/ }).waitFor();
  assert.equal(await shared.locator('app-radio-dock').count(), 0, 'Shared links never autoplay');
  await shared.getByRole('button', { name: 'Copy Radio link', exact: true }).click();
  const copied = await shared.evaluate(() => navigator.clipboard.readText());
  assert.equal(new URL(copied).searchParams.get('post'), audio.url);
  await shared.locator('app-status-card details.danger-menu summary').click();
  const open = shared.getByRole('link', { name: 'Open in Radio', exact: true });
  assert.equal(new URL(await open.getAttribute('href'), base).searchParams.get('post'), audio.url);
  await open.click();
  await shared.goto(`${base}/radio?acct=music%40sea.example`);
  await shared
    .getByRole('button', { name: /Play audio by/ })
    .first()
    .waitFor();
  assert.equal(await shared.locator('app-radio-dock').count(), 0);
  await shared.getByRole('button', { name: 'Copy Radio link', exact: true }).click();
  assert.equal(
    new URL(await shared.evaluate(() => navigator.clipboard.readText())).searchParams.get('acct'),
    'music@sea.example',
  );
  assert.equal(await shared.getByRole('option', { name: 'Home feed', exact: true }).count(), 0);
  await shared.close();
  assert.deepEqual(errors, []);
  console.log(
    'Radio browser checks passed: anonymous shareable post/account links, post menu, clipboard, native audio, aligned labels, Studio, catalogue caching, explicit publication, external discovery, provider-specific consent, YouTube exclusion, persistent widget playback, automatic advance, pause, mobile layout and cleanup; no page errors.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
