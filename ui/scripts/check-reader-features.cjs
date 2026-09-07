/** Run against ng serve, with Playwright on NODE_PATH. See check-reader-layout.cjs. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:4217/_ui/';
const tick = async (page) => {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.waitForTimeout(150);
};
const messageId = (content) =>
  'message-status.' +
  Buffer.from(JSON.stringify({ content, spoiler: '', language: 'plaintext' })).toString(
    'base64url',
  );

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.READER_BROWSER_EXECUTABLE || undefined,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 640 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('button', { name: 'Continue without logging in' }).click();
    const id = messageId('A long paragraph for phone page turns. '.repeat(140));
    await page.goto(base + 'read/' + id);
    await page.waitForSelector('app-reader-core');
    await tick(page);
    const number = () =>
      page.evaluate(() =>
        window.ng.getComponent(document.querySelector('app-reader-core')).pageNumber(),
      );
    const nav = page.locator('.reader-touch-nav');
    assert(await nav.isVisible(), 'Phone navigation is hidden');
    const next = nav.getByRole('button', { name: /Next page/ });
    const size = await next.boundingBox();
    assert(size.height >= 48 && size.width >= 100, 'Phone button is too small');
    await next.tap();
    await tick(page);
    assert.equal(await number(), 2);
    await nav.getByRole('button', { name: /Previous page/ }).tap();
    await tick(page);
    assert.equal(await number(), 1);
    const rect = await page.locator('.reader-viewport').boundingBox();
    const cdp = await context.newCDPSession(page);
    const y = rect.y + rect.height * 0.65;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: rect.x + rect.width - 50, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: rect.x + 50, y: y + 4 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await tick(page);
    assert.equal(await number(), 2, 'Swipe did not turn the page');
    assert(
      await page.evaluate(
        () =>
          document.querySelector('.reader-touch-nav').getBoundingClientRect().bottom <=
          window.innerHeight + 1,
      ),
      'Phone navigation extends below screen',
    );
    console.log('PASS large phone controls and real touch swipe');

    // Use a network-free message route, then set a local article fixture through
    // the development component. IndexedDB must survive an actual reload.
    const articleId = messageId('A link to the article.');
    await page.goto(base + 'read/' + articleId);
    await page.waitForSelector('app-reader-core');
    await tick(page);
    await page.evaluate(async () => {
      const core = window.ng.getComponent(document.querySelector('app-reader-core'));
      const result = {
        requestedUrl: 'https://example.test/cached',
        finalUrl: 'https://example.test/cached',
        card: null,
        diagnosis: 'ok',
        fetchedAt: new Date().toISOString(),
        article: {
          title: 'Cached article fixture',
          byline: null,
          siteName: 'Example',
          markdown: 'Unique cached passage. '.repeat(80),
          images: [],
          quality: 'good',
          metrics: { wordCount: 240, paragraphCount: 1, linkDensity: 0, textToMarkupRatio: 1 },
        },
      };
      await core.expansion.articles.cache.put(result.requestedUrl, result);
    });
    await page.reload();
    await page.waitForSelector('app-reader-core');
    await tick(page);
    await page.evaluate(() => {
      const parent = window.ng.getComponent(document.querySelector('app-read-page'));
      const core = window.ng.getComponent(document.querySelector('app-reader-core'));
      const root = {
        ...core.chain()[0],
        id: 'cached-fixture',
        provider: 'rss',
        rssFullContent: false,
        url: 'https://example.test/cached',
        content: '<p>Original teaser must not repeat.</p>',
      };
      // Any network expansion here is a regression, including after quota exhaustion.
      core.expansion.articles.expand = () => {
        throw new Error('Cached reading triggered a fetch');
      };
      core.expansion.quota.authorize = () => {
        throw new Error('Cached reading triggered authorization');
      };
      parent.displayedThread.set([root]);
      parent.displayedId.set(root.id);
    });
    await page.waitForSelector('.reader-article-body');
    await tick(page);
    assert.equal(await page.locator('.reader-posts').count(), 0, 'Original teaser is duplicated');
    assert.equal(await page.getByRole('button', { name: 'Put it away', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Fetch again', exact: true }).count(), 0);
    assert.equal(await page.locator('.reader-article-body').count(), 1);
    assert(
      (await page.locator('.reader-article-body').innerText()).includes('Unique cached passage.'),
    );
    console.log(
      'PASS IndexedDB restore after reload, no fetch/authorization, one article, removed controls',
    );

    await page.goto(base + 'statuses/' + id + '?reader=thread');
    await page.waitForSelector('.classic-thread-reader');
    assert.equal(await page.locator('app-reader-core').count(), 0);
    assert(
      (await page.locator('.classic-thread-reader').boundingBox()).height > 640,
      'Classic reader should scroll',
    );
    await page.getByRole('link', { name: 'Long text reader', exact: false }).first().click();
    await page.waitForSelector('app-reader-core');
    assert(page.url().includes('/read/'));
    console.log('PASS classic Thread reader and separate Long text reader link');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
