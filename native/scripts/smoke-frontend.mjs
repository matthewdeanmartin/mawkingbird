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
  console.log('Scope: Chromium with mocked IPC; does not certify actual Tauri/WebView permissions or OS browser launch.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
