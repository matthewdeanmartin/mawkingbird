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
  for (const provider of ['mataroa', 'raindrop']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__TAURI__ = { core: { invoke: async (command, args) => {
        if (command === 'connector_connect') {
          if (args.token === 'rejected-fixture') throw { kind: 'credentials', message: 'Rejected fixture credential' };
          return 'native-connector:' + (args.provider === 'mataroa' ? 'a' : 'b').repeat(43);
        }
        if (command === 'connector_forget') {
          if (window.failForget) throw { kind: 'credentials', message: 'OS store locked' };
          return;
        }
        if (command === 'report_native_event') return;
        if (command === 'public_mastodon_get') return { status: 200, headers: {}, body: JSON.stringify(args.url.includes('/instance') ? { uri:'mastodon.social', title:'Mastodon', version:'4.4.0' } : []) };
        throw new Error('Unexpected command ' + command);
      } } };
    });
    await page.goto(origin);
    await page.waitForURL(origin + '/home');
    await page.goto(origin + '/settings/connections/' + provider);
    await page.getByRole('button', { name: 'Continue without logging in', exact: true }).click();
    await page.goto(origin + '/settings/connections/' + provider);
    const token = page.locator('input[type="password"]');
    await token.waitFor();
    if (provider === 'mataroa') {
      assert.equal(await page.locator('a[href*="cors-proxy"]').count(), 0);
      assert.equal(await page.locator('mb-checkbox').count(), 0);
      await page.locator('input[name="blogUrl"]').fill('https://writer.mataroa.blog/');
    }
    assert.equal(await page.getByText(/localStorage/).count(), 0);
    await token.fill('rejected-fixture');
    await page.locator('button[type="submit"]').click();
    await page.getByText('Rejected fixture credential', { exact: true }).waitFor();
    await token.fill('accepted-fixture');
    await page.locator('button[type="submit"]').click();
    await page.getByText('Saved on this device', { exact: true }).waitFor();
    let storage = await page.evaluate(() => JSON.stringify(localStorage));
    assert(storage.includes('native-connector:'));
    assert(!storage.includes('accepted-fixture') && !storage.includes('rejected-fixture'));
    await page.reload();
    await page.getByText('Saved on this device', { exact: true }).waitFor();
    await page.evaluate(() => { window.failForget = true; });
    await page.getByRole('button', { name:'Disconnect', exact:true }).click();
    await page.getByText('OS store locked', { exact: true }).waitFor();
    assert(await page.getByText('Saved on this device', { exact:true }).isVisible());
    await page.evaluate(() => { window.failForget = false; });
    await page.getByRole('button', { name:'Disconnect', exact:true }).click();
    await page.locator('input[type="password"]').waitFor();
    storage = await page.evaluate(() => JSON.stringify(localStorage));
    assert(!storage.includes('native-connector:'));
    assert.deepEqual(errors, []);
    console.log(`PASS: built native ${provider} settings reject/retry, persist/reload only a handle, omit web proxy/browser-storage instructions, retain state on failed OS deletion and disconnect successfully (mocked IPC).`);
    await page.close();
  }
} catch (error) {
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    console.error('Page:', page.url(), (await page.locator('body').innerText()).slice(-5000));
  }
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
