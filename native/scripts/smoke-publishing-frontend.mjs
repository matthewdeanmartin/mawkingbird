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
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.publishingCalls = [];
    window.__TAURI__ = { core: { invoke: async (command, args) => {
      if (command === 'shorten_link') {
        window.publishingCalls.push({ command, args });
        if (window.failPublishing) throw { kind: 'network', message: 'Publishing fixture is offline' };
        return { status: 200, headers: {}, body: args.provider === 'tinyurl' ? 'https://tinyurl.com/native-fixture' : JSON.stringify({ shorturl: 'https://is.gd/native_fixture' }) };
      }
      if (command === 'rentry_request') {
        window.publishingCalls.push({ command, args });
        return { status: 200, headers: {}, body: JSON.stringify({ status: '200' }) };
      }
      if (command === 'report_native_event') return;
      if (command === 'public_mastodon_get') return { status: 200, headers: {}, body: JSON.stringify(args.url.includes('/instance') ? { uri: 'mastodon.social', title: 'Mastodon', version: '4.4.0' } : []) };
      throw new Error('Unexpected IPC ' + command);
    } } };
  });
  await page.goto(origin);
  await page.waitForURL(origin + '/home');
  await page.goto(origin + '/settings/connections/link-shortener');
  await page.getByRole('button', { name: 'Continue without logging in', exact: true }).click();
  await page.goto(origin + '/settings/connections/link-shortener');
  await page.locator('.provider').first().waitFor();
  assert.equal(await page.locator('.provider').count(), 6);
  assert.equal(await page.locator('input[type="password"]').count(), 1);
  assert.equal(await page.getByText(/localStorage/).count(), 0);
  for (const [id, label, result] of [['tinyurl', 'TinyURL', 'https://tinyurl.com/native-fixture'], ['isgd', 'is.gd', 'https://is.gd/native_fixture']]) {
    await page.goto(origin + '/settings/connections/link-shortener');
    await page.locator('.provider').filter({ hasText: label }).click();
    await page.getByRole('button', { name: 'Use ' + label, exact: true }).click();
    await page.goto(origin + '/links');
    await page.locator('input[name="destination"]').fill('https://example.com/reader?x=1&y=2#part');
    await page.getByRole('button', { name: 'Shorten', exact: true }).click();
    await page.locator('a').filter({ hasText: result }).first().waitFor();
    assert.equal(await page.evaluate(() => window.publishingCalls.filter(c => c.command === 'shorten_link').length), 1);
    await page.reload();
    await page.locator('a').filter({ hasText: result }).first().waitFor();
    await page.evaluate(() => { window.failPublishing = true; });
    await page.locator('input[name="destination"]').fill('https://example.com/failure');
    await page.getByRole('button', { name: 'Shorten', exact: true }).click();
    await page.locator('[role="alert"]').waitFor();
    assert.equal(await page.evaluate(() => window.publishingCalls.length), 1);
    assert(!/CORS|proxy/.test(await page.locator('[role="alert"]').innerText()));
    console.log(`PASS: built ${id} picker, create/history/reload and single-attempt native failure (mocked IPC).`);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) console.error(page.url(), (await page.locator('body').innerText()).slice(-4000));
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
