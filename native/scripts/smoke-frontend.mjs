import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shared = resolve(process.env.MAWKINGBIRD_SOURCE || resolve(root, '../mawkingbird'));
const { chromium } = createRequire(resolve(shared, 'ui/package.json'))('@playwright/test');
const assets = resolve(root, '.frontend/browser');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  let path;
  try { path = resolve(assets, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (path !== assets && !path.startsWith(assets + sep)) { res.writeHead(403).end(); return; }
  if (!extname(path)) path = resolve(assets, 'index.html');
  if (!existsSync(path)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
  res.end(readFileSync(path));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requests = [];
  const errors = [];
  page.on('request', (req) => requests.push(req.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.nativeCalls = [];
    window.__TAURI__ = { core: { invoke: async (command, payload) => {
      if (command === 'public_mastodon_get') throw { kind: 'network', message: 'Offline fixture' };
      window.nativeCalls.push({ command, payload });
    } } };
  });
  await page.addInitScript({ path: resolve(root, 'src-tauri/src/links.js') });
  await page.addInitScript({ path: resolve(root, 'src-tauri/src/images.js') });
  await page.addInitScript({ path: resolve(root, 'src-tauri/src/media.js') });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('app-root')?.textContent.trim().length > 20);
  assert.deepEqual(errors, [], 'Angular startup must not throw');
  assert.deepEqual(requests.filter((url) => !url.startsWith(origin + '/')), [], 'startup must make no remote requests');
  assert.equal(await page.locator('script[data-goatcounter]').count(), 0);

  const imageRequests = [];
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  await page.route('http://native-image.localhost/**', async (route) => {
    imageRequests.push(new URL(route.request().url()).searchParams.get('url'));
    await route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
  });
  await page.evaluate(() => {
    const box = document.createElement('section');
    box.innerHTML = '<img id="image-test" src="https://images.example/avatar.png"><div id="header-test" style="background-image:url(https://images.example/header.png)"></div><video id="poster-test" poster="https://images.example/poster.png"></video><picture><source id="srcset-test" srcset="https://images.example/small.png 1x, https://images.example/large.png 2x"><img src="https://images.example/fallback.png"></picture>';
    document.body.append(box);
  });
  await page.waitForFunction(() => document.querySelector('#image-test').naturalWidth === 1);
  assert(await page.locator('#header-test').evaluate((el) => el.style.backgroundImage.includes('native-image.localhost')));
  assert(await page.locator('#poster-test').evaluate((el) => el.poster.includes('native-image.localhost')));
  assert(await page.locator('#srcset-test').evaluate((el) => !el.srcset.includes('https://images.example')));
  await page.locator('#image-test').evaluate((el) => { el.src = 'https://images.example/changed.png'; });
  await page.waitForFunction(() => document.querySelector('#image-test').src.includes('changed.png') && document.querySelector('#image-test').naturalWidth === 1);
  assert(imageRequests.includes('https://images.example/avatar.png'));
  assert(imageRequests.includes('https://images.example/changed.png'));
  console.log('PASS: image adapter covers inserted/rebound images, headers, posters and srcset.');

  // Real input events exercise the host's trusted-gesture bridge in a browser.
  await page.evaluate(() => {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white';
    panel.innerHTML = '<a id="native-external" href="https://example.com/read?q=1" target="_blank">External</a><a id="native-blocked" href="file:///tmp/example">Blocked</a>';
    document.body.append(panel);
  });
  await page.locator('#native-external').click();
  await page.locator('#native-external').click({ button: 'middle' });
  await page.locator('#native-external').focus();
  await page.keyboard.press('Enter');
  await page.locator('#native-blocked').click();
  const calls = await page.evaluate(() => window.nativeCalls);
  assert.equal(calls.length, 3);
  assert(calls.every(({ command, payload }) => command === 'open_external' && payload.url === 'https://example.com/read?q=1'));
  assert.equal(browser.contexts()[0].pages().length, 1, 'no browser pop-up created');

  // Meta CSP must reject remote transport even if application code asks for it.
  const blocked = await page.evaluate(async () => {
    try { await fetch('https://cors.mawkingbird.com/health'); return false; }
    catch { return true; }
  });
  assert.equal(blocked, true);
  console.log('PASS: native frontend boots without remote requests; click/middle-click/keyboard use bridge; file links and remote fetch blocked.');

  const signed = await browser.newPage();
  const signedErrors = [];
  signed.on('pageerror', (error) => signedErrors.push(error.message));
  await signed.addInitScript(() => {
    try {
      localStorage.setItem('mastodon_mock_token', 'native-mastodon:fixture');
      localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
      localStorage.setItem('mastodon_mock_server', 'https://example.com');
      localStorage.setItem('mastodon_mock_sessions', JSON.stringify([{ id: 'fixture', kind: 'mastodon', server: 'https://example.com', account: { id: '1', username: 'me', acct: 'me', fields: [] } }]));
      localStorage.setItem('mastodon_mock_session_tokens', JSON.stringify({ fixture: 'native-mastodon:fixture' }));
    } catch { /* about:blank has no storage origin */ }
    window.nativeCalls = [];
    window.__TAURI__ = { core: { invoke: async (command, payload) => {
      window.nativeCalls.push({ command, payload });
      const person = { id: '55', username: 'friend', acct: 'friend', display_name: 'Friend', fields: [], statuses_count: 0, followers_count: 0, following_count: 0, avatar: '', header: '' };
      if (command === 'archive_profiles') return { following: 1, scanComplete: true, profiles: [{ id: 7, remoteId: '55', acct: 'friend', displayName: 'Friend', lastStatusAt: null, avatar: null, cachedPosts: 0, cachedUnread: 0 }] };
      if (command === 'archive_profile_posts_after') return { posts: [], next: null };
      if (command === 'archive_profile_posts' || command === 'archive_account_posts') return [];
      if (command === 'archive_following_status') return null;
      if (command === 'archive_collection_status') return { currentJob: 'idle', following: null, cachedPosts: 0, profilesWithPosts: 0, seedEligible: 0, notificationHistoryComplete: false, jobs: [] };
      if (command === 'archive_fetch_account_page') return 0;
      if (command === 'mastodon_account_get') {
        const path = new URL(payload.url).pathname;
        const data = path.endsWith('verify_credentials') ? { ...person, id: '1', username: 'me', acct: 'me' }
          : path === '/api/v1/accounts/55' ? person : [];
        return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
      }
      if (command === 'public_mastodon_get') throw { kind: 'network', message: 'Offline fixture' };
    } } };
  });
  await signed.addInitScript({ path: resolve(root, 'src-tauri/src/links.js') });
  await signed.addInitScript({ path: resolve(root, 'src-tauri/src/images.js') });
  await signed.addInitScript({ path: resolve(root, 'src-tauri/src/media.js') });
  await signed.goto(`${origin}/home/profiles`, { waitUntil: 'domcontentloaded' });
  await signed.locator('app-home-profiles h1').waitFor();
  assert.equal(await signed.locator('.rail-left app-home-profiles-rail button').count(), 1);
  await signed.getByRole('button', { name: 'Data activity' }).click();
  await signed.getByRole('dialog', { name: 'Data activity' }).getByText('0 posts saved from 0 profiles').waitFor();
  await signed.getByRole('dialog', { name: 'Data activity' }).getByRole('button', { name: 'Close' }).click();
  await signed.getByRole('link', { name: 'Open full profile' }).click();
  await signed.locator('app-profile .profile-archive-actions').waitFor();
  assert.equal(await signed.getByRole('button', { name: 'Fetch latest posts' }).count(), 1);
  const beforeFetch = await signed.evaluate(() => window.nativeCalls);
  assert(beforeFetch.some(({ command }) => command === 'archive_account_posts'));
  assert(!beforeFetch.some(({ command }) => command === 'archive_fetch_account_page'));
  await signed.getByRole('button', { name: 'Fetch latest posts' }).click();
  await signed.waitForFunction(() => window.nativeCalls.some(({ command }) => command === 'archive_fetch_account_page'));
  assert.deepEqual(signedErrors, [], 'signed-in archive routes must not throw');
  console.log('PASS: signed-in Native Profiles left rail and Data activity dialog work; person-page history fetch waits for its button.');
  await signed.close();
  console.log('Scope: Chromium with mocked IPC; does not certify actual Tauri/WebView permissions or OS browser launch.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
