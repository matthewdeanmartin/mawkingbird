import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { artifactDir } from './artifacts.mjs';

const root = path.resolve('dist-mockingbird/browser');
// Screenshots, outside the working tree (artifacts.mjs).
const results = artifactDir('radio-browser');
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const dockFitsColumn = async () => {
    await page.waitForFunction(() => {
      const element = document.querySelector('app-radio-dock');
      const dock = element?.getBoundingClientRect();
      const column = document.getElementById('main');
      // The dock is in the column's flow: inside its borders, plus a margin in full view.
      const inset =
        (element?.classList.contains('full-view') ? 16 : 0) +
        parseFloat(getComputedStyle(column).borderLeftWidth);
      const main = column?.getBoundingClientRect();
      return (
        dock &&
        main &&
        Math.abs(dock.left - main.left - inset) < 1 &&
        Math.abs(dock.width - main.width + inset * 2) < 1
      );
    });
  };
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
    url: 'https://sea.example/@music/9',
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
  // Library of Congress search and item JSON for Studio's Find Shareable.
  let catalogueRequests = 0;
  await page.route('https://www.loc.gov/**', async (route) => {
    catalogueRequests++;
    const url = new URL(route.request().url());
    assert.equal(
      route.request().headers().authorization,
      undefined,
      'Catalogue requests omit credentials',
    );
    await route.fulfill({
      json: url.pathname.startsWith('/audio')
        ? {
            results: [
              {
                url: 'https://www.loc.gov/item/2017701737/',
                title: 'Whiskey Johnny',
                contributor: ['brodeur, arthur'],
                date: '1939',
                rights: ['No known restrictions'],
              },
            ],
            pagination: {},
          }
        : {
            item: { title: 'Whiskey Johnny' },
            resources: [{ audio: 'https://tile.loc.gov/fixture/default.mp3' }],
          },
    });
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
          if (data.method === 'getCurrentSound') send('getCurrentSound', {title: 'Widget title ' + location.search.includes('track-two'), user: {username: 'artist'}});
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
      assert.deepEqual(draft.media_ids, ['audio-1']);
      assert.ok(route.request().headers()['idempotency-key']);
      body = audio;
    } else if (/\/api\/v1\/statuses\/\d+\/context$/.test(url.pathname))
      body = { ancestors: [], descendants: [] };
    else if (/\/api\/v1\/statuses\/\d+$/.test(url.pathname))
      body = url.pathname.endsWith('/9') ? second : audio;
    else if (url.pathname.includes('verify_credentials') || url.pathname.endsWith('/lookup'))
      body = account;
    else if (/\/api\/v1\/accounts\/\d+$/.test(url.pathname)) body = account;
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
  const nav = (name) => page.locator('nav.primary-nav').getByRole('link', { name, exact: true });
  const find = page.locator('app-find-singles-page');
  const progress = find.locator('p.progress');
  /** Scan an account's posts and wait for the end of its feed. */
  const findAudio = async (matches) => {
    await find.getByRole('tab', { name: 'Account', exact: true }).click();
    await find.getByLabel(/Account handle/).fill('music');
    await find.getByRole('button', { name: 'Find audio', exact: true }).first().click();
    await progress.filter({ hasText: `${matches} with music · Reached the end` }).waitFor();
  };
  await page.goto(`${base}/singles/find`);
  await page.getByRole('heading', { name: 'Singles', exact: true }).waitFor();
  const handleBox = await find.getByLabel(/Account handle/).boundingBox();
  const findButton = await find
    .getByRole('button', { name: 'Find audio', exact: true })
    .first()
    .boundingBox();
  const middle = (box) => box.y + box.height / 2;
  assert.ok(
    Math.abs(middle(handleBox) - middle(findButton)) < 2,
    'Find audio lines up with its box',
  );
  await findAudio(2);
  assert.equal(await find.locator('app-track-result').count(), 2);
  assert.equal(await page.locator('audio[data-radio]').count(), 0, 'Finding never plays');
  await find.getByRole('button', { name: 'Save all results', exact: true }).click();
  await find.getByText('Saved 2 singles.').waitFor();
  await find.getByRole('link', { name: 'Open Saved singles', exact: true }).click();
  await page.locator('app-singles-page li[mbItemRow]').nth(1).waitFor();
  await nav('Playlists').click();
  await page.getByRole('button', { name: 'New playlist', exact: true }).first().click();
  const playlist = page.locator('app-playlist-page');
  const tracks = playlist.locator('ol[mbItemList] > li');
  const name = playlist.getByLabel('Name', { exact: true });
  await name.fill('Sea songs');
  await name.press('Tab');
  await playlist.getByRole('heading', { name: 'Sea songs', exact: true }).waitFor();
  const candidates = playlist.locator('section.add li button');
  await candidates.first().click();
  await candidates.first().click();
  await tracks.nth(1).waitFor();
  await page.screenshot({ path: `${results}/radio-playlist-desktop.png`, fullPage: true });
  const restored = await page.context().newPage();
  restored.on('pageerror', (error) => errors.push(error.message));
  await restored.route('**/api/**', apiFixture);
  await restored.goto(page.url());
  await restored.locator('app-playlist-page ol[mbItemList] > li').nth(1).waitFor();
  assert.equal(
    await restored.locator('audio[data-radio]').count(),
    0,
    'Opening a playlist does not autoplay',
  );
  await restored.close();
  await playlist.getByRole('button', { name: 'Play', exact: true }).first().click();
  await page.locator('app-radio-dock:not(.full-view)').waitFor();
  await dockFitsColumn();
  await page.locator('app-radio-dock a.now').click();
  await page.locator('app-radio-dock.full-view').waitFor();
  assert.equal(await page.locator('app-radio-dock:not(.full-view)').count(), 0);
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio[data-radio]');
    return audio && !audio.paused && audio.currentTime > 0.1;
  });
  await dockFitsColumn();
  // Listen: one recording with its conversation; playback continues through Radio.
  await page.locator('app-radio-controls').getByRole('link', { name: 'Open in Listen' }).click();
  await page.getByRole('heading', { name: 'Listen', exact: true }).waitFor();
  await page
    .locator('app-listen-page')
    .getByRole('button', { name: 'Pause', exact: true })
    .waitFor();
  assert.equal(await page.locator('app-radio-dock').isVisible(), false, 'Listen replaces the dock');
  assert.equal(await page.locator('audio[data-radio]').evaluate((audio) => audio.paused), false);
  await page.screenshot({ path: `${results}/listen-desktop.png`, fullPage: true });
  await page.goBack();
  await page.locator('app-radio-dock.full-view').waitFor();
  const startedAt = await page.locator('audio[data-radio]').evaluate((audio) => audio.currentTime);
  await nav('Studio').click();
  await page.getByRole('heading', { name: 'Studio', exact: true }).waitFor();
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
  await page.screenshot({ path: `${results}/radio-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${results}/radio-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page
    .locator('app-radio-dock')
    .getByRole('button', { name: 'Stop Radio', exact: true })
    .click();
  assert.equal(await page.locator('audio[data-radio]').count(), 0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await nav('Studio').click();
  await page
    .locator('app-studio-page nav')
    .getByRole('link', { name: 'My audio', exact: true })
    .click();
  await page.getByRole('button', { name: 'Find all my audio', exact: true }).click();
  await page.getByText('All available history has been scanned.').waitFor();
  assert.equal(await page.locator('.catalogue li').count(), 2);
  await page.getByRole('button', { name: 'Preview post', exact: true }).first().click();
  await page.locator('app-radio-studio app-status-card').waitFor();
  await page
    .locator('app-studio-page nav')
    .getByRole('link', { name: 'New audio post', exact: true })
    .click();
  const composer = page.locator('app-studio-page app-compose textarea').first();
  await page
    .getByLabel('Audio file', { exact: true })
    .setInputFiles({ name: 'recording.wav', mimeType: 'audio/wav', buffer: wav });
  await page.locator('.details').getByText('WAV', { exact: true }).waitFor();
  await composer.fill('Prepared locally');
  assert.equal(uploads, 0, 'Staging never uploads');
  await nav('Singles').click();
  await page.locator('app-singles-page').waitFor();
  await nav('Studio').click();
  await page.locator('.filename').getByText('recording.wav', { exact: true }).waitFor();
  assert.equal(await composer.inputValue(), 'Prepared locally');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${results}/radio-studio-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${results}/radio-studio-desktop.png`, fullPage: true });
  const pagesBeforeReload = accountPages;
  await page.goto(`${base}/radio/studio?view=catalogue`);
  await page.getByText('All available history has been scanned.').waitFor();
  assert.equal(await page.locator('.catalogue li').count(), 2);
  assert.equal(accountPages, pagesBeforeReload, 'Cached catalogue avoids rescanning on reload');
  await page.getByRole('button', { name: 'Check for newer audio', exact: true }).click();
  await page.getByText('All available history has been scanned.').waitFor();
  assert.equal(accountPages, pagesBeforeReload + 1, 'Refresh stops at known history');
  await page
    .locator('app-studio-page nav')
    .getByRole('link', { name: 'New audio post', exact: true })
    .click();
  assert.equal(await page.locator('.filename').count(), 0, 'Staged recordings are session-only');
  await page
    .getByLabel('Audio file', { exact: true })
    .setInputFiles({ name: 'recording.wav', mimeType: 'audio/wav', buffer: wav });
  await page.getByRole('button', { name: 'Attach to post', exact: true }).click();
  await page.getByText(/Attached and processed/).waitFor();
  assert.equal(uploads, 1, 'Attaching uploads once');
  assert.equal(publications, 0, 'Attaching never publishes');
  await composer.fill('Prepared locally');
  await page
    .locator('app-studio-page app-compose')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await page.getByText('Your audio post was published.', { exact: true }).waitFor();
  assert.equal(uploads, 1);
  assert.equal(publications, 1);
  // Catalogues: search one and take a recording through Share to the composer.
  await nav('Singles').click();
  await page.locator('app-singles-tabs').getByRole('link', { name: 'Find', exact: true }).click();
  await find.getByRole('tab', { name: 'Catalogues', exact: true }).click();
  const panel = find.locator('app-catalogue-panel');
  await panel.getByLabel('Search recordings', { exact: false }).fill('whiskey');
  await panel.getByRole('button', { name: 'Search', exact: true }).click();
  await panel.getByText('No known restrictions', { exact: false }).waitFor();
  await panel.getByRole('button', { name: 'Share', exact: true }).click();
  const share = page.locator('app-share-page');
  await share.getByRole('heading', { name: 'Share music', exact: true }).waitFor();
  const preview = await share.locator('pre').innerText();
  assert.match(preview, /Whiskey Johnny/);
  assert.match(preview, /https:\/\/www\.loc\.gov\/item\/2017701737\//);
  assert.ok(catalogueRequests >= 2, 'Search, then the item lookup');
  await share.getByRole('button', { name: 'Write the post', exact: true }).click();
  const shareBox = share.locator('app-compose textarea').first();
  await shareBox.waitFor();
  assert.match(await shareBox.inputValue(), /Whiskey Johnny/);
  assert.equal(publications, 1, 'Sharing drafts a post; it does not publish one');
  await shareBox.fill('');
  externalScenario = true;
  await nav('Singles').click();
  await page.locator('app-singles-tabs').getByRole('link', { name: 'Find', exact: true }).click();
  await findAudio(3);
  assert.equal(await find.locator('app-track-result').count(), 3, 'YouTube videos are not audio');
  assert.equal(providerRequests, 0, 'Discovery never contacts providers');
  const nativeOnly = find.getByRole('checkbox', { name: /Only native Mastodon audio/ }).first();
  await nativeOnly.check();
  await progress.filter({ hasText: '0 with music · Reached the end' }).waitFor();
  await nativeOnly.uncheck();
  await progress.filter({ hasText: '3 with music · Reached the end' }).waitFor();
  await find.getByRole('button', { name: 'Save all results', exact: true }).click();
  await find.getByRole('link', { name: 'Open Saved singles', exact: true }).click();
  // In a feed, a post with several services keeps its players in one toolbar above its actions.
  await page.goto(`${base}/home`);
  const audioToolbar = page
    .locator('app-status-card mb-toolbar.audio-toolbar')
    .filter({ hasText: 'Load Spotify player' });
  await audioToolbar.waitFor();
  assert.equal(
    await audioToolbar.evaluate((el) => el.nextElementSibling.tagName),
    'MB-POST-ACTIONS',
  );
  await audioToolbar.getByRole('button', { name: 'Open on Mixcloud', exact: true }).waitFor();
  await page.screenshot({ path: `${results}/radio-post-toolbar.png`, fullPage: true });
  const musicCard = page.locator('app-status-card').filter({ hasText: 'Sea shanty' });
  assert.equal(
    await musicCard.locator('app-video-player').count(),
    0,
    'Music has one audio embed, not a duplicate video player',
  );
  await audioToolbar.getByRole('button', { name: 'Load Spotify player', exact: true }).click();
  await page.locator('iframe[title="Spotify"]').waitFor();
  assert.equal(providerRequests, 1, 'Only the chosen provider loads');
  await musicCard.getByRole('button', { name: 'Load YouTube Music player', exact: true }).click();
  await musicCard.locator('iframe[title="YouTube Music"]').waitFor();
  const requestsInFeed = providerRequests;
  // A playlist of the two SoundCloud recordings.
  await page.goto(`${base}/playlists`);
  await page.getByRole('button', { name: 'New playlist', exact: true }).first().click();
  await candidates.first().waitFor();
  const saved = await candidates.count();
  for (let added = 1; added <= saved; added++) {
    await candidates.first().click();
    await tracks.nth(added - 1).waitFor();
  }
  const others = tracks.filter({ hasNotText: 'SoundCloud' });
  for (let left = await others.count(); left > 0; left--) {
    await others.first().getByRole('button', { name: 'Remove', exact: true }).click();
    await others.nth(left - 1).waitFor({ state: 'detached' });
  }
  assert.equal(await tracks.count(), 2);
  await playlist.getByRole('button', { name: 'Play', exact: true }).first().click();
  const dock = page.locator('app-radio-dock');
  assert.equal(providerRequests, requestsInFeed, 'Radio asks before contacting a new provider');
  // One consent per provider loads the frame and starts it: no Load, no in-frame Play.
  await dock.getByRole('button', { name: 'Allow SoundCloud in Radio', exact: true }).click();
  await dock.locator('iframe[title="SoundCloud"]').waitFor();
  await dock.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await dock.locator('a.now .title').filter({ hasText: 'Widget title false' }).waitFor();
  await dockFitsColumn();
  await dock.locator('a.now').click();
  await page.locator('app-radio-dock.full-view').waitFor();
  await dock
    .locator('mb-toolbar')
    .getByRole('button', { name: 'Open on SoundCloud', exact: true })
    .waitFor();
  const controls = await dock
    .locator('mb-toolbar button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  assert.equal(controls.indexOf('Close player'), controls.indexOf('Stop Radio') + 1);
  await dockFitsColumn();
  await page.setViewportSize({ width: 1100, height: 1000 });
  await dockFitsColumn();
  await page.screenshot({ path: `${results}/radio-dock-tablet.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dockFitsColumn();
  await dock.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  const requestsBeforeNavigation = providerRequests;
  await nav('Studio').click();
  await dock.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  assert.equal(
    providerRequests,
    requestsBeforeNavigation,
    'Navigation keeps the same provider frame',
  );
  // The compact bar folds the frame away without unloading it.
  await page.locator('app-radio-dock:not(.full-view)').waitFor();
  assert.equal(
    await dock.locator('aside .frame').evaluate((frame) => frame.getBoundingClientRect().height),
    0,
  );
  await dock.getByRole('button', { name: 'Show SoundCloud player', exact: true }).click();
  await dock.frameLocator('iframe').getByRole('button', { name: 'Finish recording' }).click();
  await page.waitForFunction(() =>
    document.querySelector('app-radio-dock iframe')?.getAttribute('src')?.includes('track-two'),
  );
  await dock.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await dockFitsColumn();
  await page.screenshot({ path: `${results}/radio-embed-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await dock.getByRole('button', { name: 'Pause', exact: true }).click();
  await dock.getByRole('button', { name: 'Play', exact: true }).waitFor();
  await dock.getByRole('button', { name: 'Stop Radio', exact: true }).click();
  await page.locator('app-radio-dock').waitFor({ state: 'detached' });
  assert.equal(await page.locator('app-radio-dock iframe').count(), 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav('Singles').click();
  await page.getByRole('link', { name: 'Radio settings', exact: true }).click();
  await page.locator('app-radio-settings').waitFor();
  await page.screenshot({ path: `${results}/radio-settings.png`, fullPage: true });
  await page.getByRole('button', { name: 'Remove SoundCloud', exact: true }).click();
  await page.getByText(/No services are allowed yet/).waitFor();
  assert.equal(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('mockingbird_radio_providers'))
        .map((key) => localStorage.getItem(key))
        .join(),
    ),
    '[]',
    'Revoking a provider is remembered',
  );
  externalScenario = false;
  const shared = await browser.newPage({ viewport: { width: 390, height: 844 } });
  shared.on('pageerror', (error) => errors.push(error.message));
  shared.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('[Mockingbird App] uncaught'))
      errors.push(message.text());
  });
  await shared.route('**/api/**', apiFixture);
  await shared.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  // Podcast kits open for a visitor who has never been here, as from a search.
  const kits = await browser.newPage({ viewport: { width: 390, height: 844 } });
  kits.on('pageerror', (error) => errors.push(error.message));
  await kits.route('**/api/**', apiFixture);
  await kits.goto(`${base}/singles/starter-kits`);
  const podcastKits = kits.locator('app-podcast-kits-page');
  const packLanguages = podcastKits.locator('app-pack-language-picker select');
  await packLanguages.waitFor();
  assert.equal(await packLanguages.inputValue(), 'auto');
  await podcastKits.locator('.kits a[href*="kit=technology"]').click();
  await podcastKits.locator('.member').first().waitFor();
  assert.equal(await packLanguages.inputValue(), 'en');
  const profile = podcastKits.locator('.member .details a[href^="/accounts/"]').first();
  assert.match((await profile.getAttribute('href')) ?? '', /^\/accounts\/@[^@/]+@[^@/]+$/);
  const firstPodcast = podcastKits.locator('.member').first();
  assert.equal(await firstPodcast.locator('.post').count(), 2);
  assert.ok(await firstPodcast.locator('.post video').count());
  assert.ok(await firstPodcast.getByRole('button', { name: 'Play video' }).count());
  assert.equal(await firstPodcast.locator('.post a[href^="/statuses/"]').count(), 4);
  assert.equal(await firstPodcast.locator('.post a[target="_blank"]').count(), 0);
  await podcastKits.getByRole('link', { name: 'All kits' }).click();
  await podcastKits.locator('.kits').waitFor();
  await packLanguages.selectOption('de');
  await kits.waitForURL(/lang=de/);
  await kits.reload();
  assert.equal(await packLanguages.inputValue(), 'de');
  await packLanguages.selectOption('auto');
  await kits.waitForURL(`${base}/singles/starter-kits`);
  await kits.close();
  // Links shared before Singles and Playlists existed open their new homes, and never play.
  await shared.goto(`${base}/radio?post=${encodeURIComponent(audio.url)}`);
  await shared.waitForURL(/\/playlists\/shared\?/);
  assert.equal(new URL(shared.url()).searchParams.get('post'), audio.url);
  await shared.locator('app-playlist-page ol[mbItemList] > li').first().waitFor();
  assert.equal(await shared.locator('app-radio-dock').count(), 0, 'Shared links never autoplay');
  await shared.goto(`${base}/radio?acct=music@sea.example`);
  await shared.waitForURL(/\/singles\/find\?/);
  assert.equal(new URL(shared.url()).searchParams.get('acct'), 'music@sea.example');
  await shared.locator('app-track-result').first().waitFor();
  assert.equal(await shared.locator('app-radio-dock').count(), 0);
  // Home and lists need an account.
  assert.equal(await shared.getByRole('tab', { name: 'Home', exact: true }).count(), 0);
  // Play in Radio from a post plays it and drops the post from the address.
  await shared.goto(`${base}/radio?play=${encodeURIComponent(audio.url)}`);
  await shared.locator('app-radio-dock.full-view').waitFor();
  assert.equal(new URL(shared.url()).search, '', 'A reload does not start it again');
  await shared.close();
  assert.deepEqual(errors, []);
  console.log(
    'Radio browser checks passed: anonymous podcast kits, shared post and account links, finding and saving singles, playlists, native audio, aligned forms, Listen, Studio, catalogue caching and sharing, explicit publication, service players in feeds, provider-specific consent, YouTube exclusion, persistent widget playback, automatic advance, pause, mobile layout and cleanup; no page errors.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
