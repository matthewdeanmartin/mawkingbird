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
  for (const provider of ['bluesky', 'misskey']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__TAURI__ = { core: { invoke: async (command, args) => {
        const calls = JSON.parse(sessionStorage.getItem('native-test-calls') || '[]');
        calls.push({ command, args }); sessionStorage.setItem('native-test-calls', JSON.stringify(calls));
        const response = (body) => ({ status: 200, headers: {}, body: JSON.stringify(body) });
        if (command === 'bluesky_login') return { nativeHandle: 'native-bluesky:smoke', profile: { did: 'did:plc:smoke', handle: 'reader.bsky.social', service: 'https://pds.example' } };
        if (command === 'misskey_login') return { token: 'native-misskey:smoke', permissions: ['read:account', 'write:notes', 'write:reactions'], user: { id: 'smokeuser', username: 'reader', name: 'Reader', avatarUrl: null } };
        if (command === 'misskey_nodeinfo') return response(args.url.includes('.well-known') ? { links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: 'https://misskey.io/nodeinfo/2.1' }] } : { software: { name: 'misskey' } });
        if (command === 'misskey_request') {
          if (args.endpoint === 'meta') return response({ name: 'Misskey', maxNoteTextLength: 3000 });
          if (args.endpoint === 'emojis') return response({ emojis: [] });
          if (args.endpoint === 'i' || args.endpoint === 'users/show') return response({ id: 'smokeuser', username: 'reader', name: 'Reader', avatarUrl: null, followersCount: 0, followingCount: 0, notesCount: 0 });
          return response([]);
        }
        if (command === 'bluesky_request') {
          if (args.url.includes('getProfile')) return response({ did: 'did:plc:smoke', handle: 'reader.bsky.social', displayName: 'Reader' });
          if (args.url.includes('getTimeline') || args.url.includes('getAuthorFeed')) return response({ feed: [] });
          if (args.url.includes('getPreferences')) return response({ preferences: [] });
          if (args.url.includes('listNotifications')) return response({ notifications: [] });
          if (args.url.includes('getUnreadCount')) return response({ count: 0 });
          return response({ feeds: [], lists: [], profiles: [], services: [] });
        }
        if (command === 'public_mastodon_get') {
          if (args.url.includes('/instance')) return response({ uri: 'mastodon.social', title: 'Mastodon', version: '4.4.0', configuration: { statuses: { max_characters: 500 } } });
          return response([]);
        }
        if (command === 'report_native_event' || command === 'forget_social_account' || command === 'open_external') return;
        throw new Error('Unexpected native command: ' + command);
      } } };
    });
    await page.addInitScript({ path: resolve(root, 'src-tauri/src/links.js') });
    await page.goto(origin + '/login/' + provider + '?add=1');
    if (provider === 'bluesky') {
      await page.getByRole('button', { name: 'Continue with Bluesky', exact: true }).click();
      assert.equal(await page.locator('.bsky-compat').count(), 0);
    } else {
      await page.locator('input[name="misskeyServer"]').fill('misskey.io');
      await page.getByRole('button', { name: 'Continue on Misskey', exact: true }).click();
    }
    await page.waitForURL(origin + '/home', { timeout: 20000 });
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('native-test-calls') || '[]').some((c) => c.command === 'bluesky_request' && c.args.handle === 'native-bluesky:smoke' || c.command === 'misskey_request' && c.args.handle === 'native-misskey:smoke'), null, { timeout: 15000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('app-root')?.textContent.includes('Home'));
    const state = await page.evaluate(() => ({ local: JSON.stringify(localStorage), calls: JSON.parse(sessionStorage.getItem('native-test-calls') || '[]') }));
    assert(state.local.includes('native-' + provider + ':smoke'));
    assert(!state.local.includes('accessJwt') && !state.local.includes('refreshJwt'));
    assert(state.calls.some((c) => c.command === provider + '_login'));
    assert.deepEqual(errors, []);
    console.log('PASS: native ' + provider + ' login reaches Home, makes scoped account reads and survives reload with an opaque credential reference (mocked provider/IPC).');
    if (provider === 'bluesky') {
      await page.goto(origin + '/watch?youtube=0KoeY54M5VA');
      await page.locator('app-video-player-controls').waitFor();
      const loadPlayer = page.getByRole('button', { name: 'Load YouTube player', exact: true });
      if (await loadPlayer.isVisible()) await loadPlayer.click();
      await page.locator('app-video-player-controls iframe').waitFor();
      const external = page.locator('.video-links a[target="_blank"]');
      await external.waitFor({ state: 'visible' });
      assert.equal(await page.locator('app-video-player-controls iframe').count(), 1);
      assert.equal(await page.locator('app-video-player-controls iframe').getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
      assert.equal(await page.getByText('YouTube opens in your browser in the desktop app.').count(), 0);
      await external.click();
      const opens = await page.evaluate(() => JSON.parse(sessionStorage.getItem('native-test-calls') || '[]').filter((call) => call.command === 'open_external'));
      assert(opens.some((call) => new URL(call.args.url).hostname.includes('youtube.com')));
      console.log('PASS: native YouTube embeds the player and a trusted fallback click invokes the system-browser bridge.');
    }
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
