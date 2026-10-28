// Browser checks for Forum mode (spec/forum.md) against the production
// mockingbird build, with the Mastodon API answered by a fixture. Run after
// `npm run build:mockingbird`: `npm run test:forum:browser`.
//
// Covers the scan and its call counter, the discussion rule (no storms, no lone
// posts), facets as links, the People facet, opening a discussion without a
// refetch, staying in Forum when a post is opened, layout insets, the narrow
// layouts, and page errors. Screenshots land in .test-results/forum-*.png.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { routeApi } from './forum-browser-fixture.mjs';

const root = path.resolve('dist-mockingbird/browser');
const results = path.resolve('.test-results');
await fs.mkdir(results, { recursive: true });
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

async function open(width) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const calls = [];
  await routeApi(
    page,
    () => {},
    (request) => calls.push(new URL(request.url()).pathname),
  );
  await page.addInitScript(() => {
    localStorage.setItem('mastodon_mock_token', 'forum-browser-fixture');
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
  });
  return { page, errors, calls };
}

try {
  // --- Wide: the scan, the list, the rails.
  const { page, errors, calls } = await open(1465);
  await page.goto(`${base}/forum`);
  const progress = page.locator('section.progress p').first();
  await progress.filter({ hasText: '4 discussions' }).waitFor();
  assert.match(await progress.textContent(), /10 posts read · 4 discussions · \d+ of 10 calls/);
  const texts = await page.locator('ol.discussions').innerText();
  assert.doesNotMatch(texts, /recommender/, 'a tweet storm is not a discussion');
  assert.doesNotMatch(texts, /Anyone around/, 'a lone question is not a discussion');
  assert.equal(await page.locator('ol.discussions > li').count(), 4);
  assert.ok(
    calls.filter((call) => call.endsWith('/context')).length <= 10,
    'the first scan stays within its allowance',
  );
  await page.screenshot({ path: path.join(results, 'forum-list.png') });

  // Layout: content sits 16px in from the column, rail rows 14px in from their cards.
  const main = await page.locator('#main').boundingBox();
  for (const selector of ['.controls', 'ol.discussions .meta']) {
    const box = await page.locator(selector).first().boundingBox();
    assert.ok(box.x - main.x >= 15, `${selector} is inset from the column edge`);
  }
  const facetRow = await page.locator('app-forum-facets a.facet .facet-name').first().boundingBox();
  const facetCard = await page.locator('app-forum-facets section').first().boundingBox();
  assert.ok(facetRow.x - facetCard.x >= 12, 'facet rows are inset from their card');
  // Data is rows, not pills: no buttons in the facets rail at all.
  assert.equal(await page.locator('app-forum-facets button').count(), 0);
  // A member row is at most two lines tall.
  const memberRow = await page.locator('app-forum-members li').first().boundingBox();
  assert.ok(memberRow.height < 64, `member rows are compact (${memberRow.height}px)`);

  // Facets are links that put the choice in the URL; counts hold, the list narrows.
  await page.locator('app-forum-facets a.facet', { hasText: '#docs' }).click();
  await page.waitForURL(/tag=docs/);
  await page.locator('ol.discussions > li').nth(1).waitFor({ state: 'detached' });
  assert.equal(await page.locator('ol.discussions > li').count(), 1);
  assert.equal(
    await page.locator('app-forum-facets a.facet[aria-current="true"]').textContent(),
    await page.locator('app-forum-facets a.facet', { hasText: '#docs' }).textContent(),
  );
  await page.locator('app-forum-facets a', { hasText: 'Clear filters' }).click();
  await page.waitForURL((url) => !url.search.includes('tag='));
  await page.locator('ol.discussions > li').nth(3).waitFor();

  // Choosing a person narrows the list to the discussions they are in.
  await page.locator('app-forum-members button.who', { hasText: 'Chris Adams' }).click();
  await page.waitForURL(/person=/);
  await page.locator('ol.discussions > li').nth(2).waitFor({ state: 'detached' });
  assert.equal(await page.locator('ol.discussions > li').count(), 2);
  await page.locator('app-forum-members button.who', { hasText: 'Chris Adams' }).click();
  await page.waitForURL((url) => !url.search.includes('person='));

  // Opening a discussion: Forum's rails stay, and the scanned tree is not refetched.
  const contextCalls = calls.length;
  await page.locator('ol.discussions a.open').first().click();
  await page.waitForURL(/\/forum\/d\//);
  await page.locator('app-forum-members h2', { hasText: 'In this discussion' }).waitFor();
  await page.locator('app-thread app-status-card').nth(3).waitFor();
  assert.deepEqual(
    calls.slice(contextCalls).filter((call) => /\/statuses\//.test(call)),
    [],
    'a fully scanned discussion opens without a request',
  );
  assert.ok(await page.locator('app-forum-members button', { hasText: 'Follow everyone' }).count());
  await page.screenshot({ path: path.join(results, 'forum-discussion.png') });

  // A post opened from Forum stays in Forum.
  await page.goto(`${base}/forum`);
  await page.locator('ol.discussions > li').nth(3).waitFor();
  await page.evaluate(() => {
    history.pushState({}, '', '/statuses/101');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForURL(/\/forum\/d\/101$/);
  await page.locator('app-forum-members h2', { hasText: 'In this discussion' }).waitFor();
  assert.deepEqual(errors, []);

  // --- Narrower: the right rail goes, People comes inline.
  const medium = await open(1100);
  await medium.page.goto(`${base}/forum`);
  await medium.page.locator('ol.discussions > li').nth(3).waitFor();
  assert.equal(await medium.page.locator('.rail-right').isVisible(), false);
  await medium.page.locator('mb-disclosure', { hasText: 'People' }).click();
  await medium.page.locator('app-forum-page app-forum-members li').first().waitFor();
  await medium.page.screenshot({ path: path.join(results, 'forum-1100.png') });
  assert.deepEqual(medium.errors, []);

  // --- Narrow: both rails go, Filters comes inline too.
  const narrow = await open(800);
  await narrow.page.goto(`${base}/forum`);
  await narrow.page.locator('ol.discussions > li').nth(3).waitFor();
  assert.equal(await narrow.page.locator('.rail-left').isVisible(), false);
  await narrow.page.locator('mb-disclosure', { hasText: 'Filters' }).click();
  await narrow.page.locator('app-forum-page app-forum-facets a.facet').first().waitFor();
  const width = await narrow.page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 800, `no sideways scroll at 800px (${width}px)`);
  await narrow.page.screenshot({ path: path.join(results, 'forum-800.png') });
  assert.deepEqual(narrow.errors, []);

  console.log(
    'Forum browser checks passed: scan within allowance, storms and lone posts excluded, insets, facet links and counts, People facet, discussion without refetch, posts stay in Forum, 1100 and 800 layouts; no page errors.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
