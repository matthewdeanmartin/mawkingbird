import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../dist-mockingbird/browser');
const results = path.resolve(import.meta.dirname, '../.test-results');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    const file = path.resolve(root, '.' + relative);
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(file);
    response
      .writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' })
      .end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await mkdir(results, { recursive: true });
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/features/`);
    await page
      .getByRole('heading', { name: 'A familiar home for Mastodon, Bluesky and RSS' })
      .waitFor();
    if (javaScriptEnabled)
      await page.waitForFunction(() =>
        document.querySelector('app-root')?.hasAttribute('ng-version'),
      );
    assert.equal(await page.locator('a[rel="me"]').count(), 0);
    assert.equal(await page.locator('head link[rel="me"]').count(), 2);
    assert.equal(
      await page.locator('meta[property="og:image"]').getAttribute('content'),
      'https://mawkingbird.com/mockingbird_hand.png',
    );
    assert.equal(
      await page.locator('link[rel="canonical"]').getAttribute('href'),
      'https://mawkingbird.com/features/',
    );
    await page.screenshot({
      path: path.join(results, `seo-features-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'no mobile horizontal overflow',
    );
    await page.screenshot({
      path: path.join(
        results,
        `seo-features-mobile-${javaScriptEnabled ? 'client' : 'static'}.png`,
      ),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'no browser runtime errors');
    if (!javaScriptEnabled) {
      await page.goto(origin + '/');
      assert.equal(await page.locator('a[rel="me"]').count(), 0);
      assert.equal(await page.locator('head link[rel="me"]').count(), 2);
      await page
        .getByRole('heading', { name: 'Mastodon, Bluesky and RSS in one familiar home' })
        .waitFor();
    } else {
      // Router navigation proves the browser bootstrapped the real app rather
      // than merely leaving the prerendered markup on screen.
      await page.getByRole('link', { name: 'Sign in', exact: true }).click();
      await page.waitForURL(origin + '/login');
      await page.waitForFunction(() => document.title.includes('Sign in'));
      assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute('content'),
        'noindex, follow',
      );
      assert.deepEqual(errors, [], 'client navigation has no runtime errors');
    }
    await context.close();
  }
  console.log(
    'SEO browser checks passed with JavaScript enabled and disabled, desktop and mobile.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
