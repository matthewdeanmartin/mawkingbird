import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../dist-mockingbird/browser');
const results = path.resolve(import.meta.dirname, '../.test-results');
const audiencePages = [
  ['readers', 'Make room for the stories you want to read'],
  ['bluesky', 'Bring your Bluesky conversations into a familiar home'],
  ['twitter-exodus', 'Find your next conversation without starting from an empty feed'],
  ['instagram', 'Give the pictures their own space'],
  ['creators', 'Keep the idea, shape the post, share the work'],
];
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
    // Exercise the real tracker without sending local test visits to production.
    await context.route('**/vendor/count.js', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'window.__seoPageViews = []; window.goatcounter.count = ({path}) => window.__seoPageViews.push(path);',
      }),
    );
    const page = await context.newPage();
    const errors = [];
    const diagnostics = [];
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(message.text());
    });
    page.on('requestfailed', (request) =>
      diagnostics.push(`${request.url()}: ${request.failure()?.errorText}`),
    );
    const announcementRequests = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/v1/announcements')
        announcementRequests.push(request.url());
    });
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
    if (javaScriptEnabled) {
      await page.waitForFunction(() =>
        window.__seoPageViews?.some((path) => path.replace(/\/$/, '') === '/features'),
      );
      assert.equal(await page.locator('script[data-goatcounter]').count(), 1);
    }
    const documentStartedAt = await page.evaluate(() => performance.timeOrigin);
    for (const [label, fragment] of [
      ['Mastodon feeds', 'mastodon'],
      ['Reading', 'reading'],
      ['Creators', 'creators'],
      ['Advanced tools', 'advanced'],
    ]) {
      await page
        .getByRole('navigation', { name: 'Feature areas' })
        .getByRole('link', { name: label, exact: true })
        .click();
      await page.waitForURL(
        (url) => url.pathname.replace(/\/$/, '') === '/features' && url.hash === `#${fragment}`,
      );
      assert.equal(
        await page.evaluate(() => performance.timeOrigin),
        documentStartedAt,
        `${label} stays in the same document with JavaScript ${javaScriptEnabled}`,
      );
      assert.equal(await page.locator('app-features').count(), 1);
      await page.waitForFunction((id) => {
        const box = document.getElementById(id)?.getBoundingClientRect();
        return box && box.top < innerHeight && box.bottom > 0;
      }, fragment);
    }
    assert.equal(await page.locator('footer a[href="/for/readers"]').count(), 1);
    assert.equal(await page.locator('footer a[href="/for/bluesky"]').count(), 1);
    assert.equal(await page.locator('footer a[href="/for/twitter-exodus"]').count(), 1);
    assert.equal(await page.locator('footer a[href="/for/instagram"]').count(), 1);
    assert.equal(await page.locator('footer a[href="/for/creators"]').count(), 1);
    if (javaScriptEnabled)
      assert.deepEqual(
        await page.evaluate(() => window.__seoPageViews.map((path) => path.replace(/\/$/, ''))),
        ['/features'],
        'section jumps do not count as additional page views',
      );
    for (const [slug, heading] of audiencePages) {
      await page.goto(`${origin}/for/${slug}/`);
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      if (javaScriptEnabled)
        await page.waitForFunction(
          (slug) =>
            window.__seoPageViews?.some((path) => path.replace(/\/$/, '') === `/for/${slug}`),
          slug,
        );
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/for/${slug}/`,
      );
      assert.equal(
        await page.locator('meta[property="og:url"]').getAttribute('content'),
        `https://mawkingbird.com/for/${slug}/`,
      );
      assert.equal(
        await page.locator('meta[property="og:image"]').getAttribute('content'),
        'https://mawkingbird.com/mockingbird_hand.png',
      );
      assert.equal(await page.locator('head link[rel="me"]').count(), 2);
      assert.equal(await page.locator('a[rel="me"]').count(), 0);
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug} has no overflow at ${width}px`,
        );
        await page.screenshot({
          path: path.join(
            results,
            `seo-${slug}-${width}-${javaScriptEnabled ? 'client' : 'static'}.png`,
          ),
          fullPage: true,
        });
      }
      assert.deepEqual(errors, [], `${slug} has no browser runtime errors`);
    }
    if (javaScriptEnabled) {
      await page.goto(`${origin}/for/readers/`);
      await page.waitForFunction(() =>
        window.__seoPageViews?.some((path) => path.replace(/\/$/, '') === '/for/readers'),
      );
      await page
        .getByRole('link', { name: 'Discover all Mawkingbird features', exact: true })
        .click();
      await page.waitForURL(`${origin}/features`);
      const enteredFeaturesAt = await page.evaluate(() => performance.timeOrigin);
      await page
        .getByRole('navigation', { name: 'Feature areas' })
        .getByRole('link', { name: 'Reading', exact: true })
        .click();
      await page.waitForURL(`${origin}/features#reading`);
      assert.equal(
        await page.evaluate(() => performance.timeOrigin),
        enteredFeaturesAt,
        'section links also stay in the document after client navigation to /features',
      );
      await page.locator('footer').getByRole('link', { name: 'For readers', exact: true }).click();
      await page.waitForURL(`${origin}/for/readers`);
      await page.getByRole('link', { name: 'For creators', exact: true }).click();
      await page.waitForURL(`${origin}/for/creators`);
      await page.getByRole('heading', { name: audiencePages[4][1], exact: true }).waitFor();
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        'https://mawkingbird.com/for/creators/',
      );
      assert.ok((await page.title()).includes('Writing and photography'));
    }
    if (!javaScriptEnabled) {
      await page.goto(origin + '/');
      assert.equal(await page.locator('a[rel="me"]').count(), 0);
      assert.equal(await page.locator('head link[rel="me"]').count(), 2);
      assert.equal(await page.locator('app-root').innerHTML(), '');
      assert.equal(await page.locator('app-public-home').count(), 0);
      await page
        .getByRole('heading', { name: 'Mawkingbird — Mastodon, Bluesky and RSS' })
        .waitFor();
      assert.equal(
        await page
          .getByRole('link', { name: 'Discover Mawkingbird features' })
          .getAttribute('href'),
        '/features/',
      );
      assert.equal(
        await page.locator('meta[property="og:image"]').getAttribute('content'),
        'https://mawkingbird.com/mockingbird_hand.png',
      );
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

      // Hold the first-run probe so the startup interval is observable without
      // depending on external Mastodon servers or arbitrary sleep durations.
      let releaseProbe;
      const probeReady = new Promise((resolve) => {
        releaseProbe = resolve;
      });
      await context.route('https://**/*', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const instance = pathname === '/api/v1/instance' || pathname === '/api/v2/instance';
        if (pathname === '/api/v1/instance') await probeReady;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            instance
              ? {
                  title: 'Preview test server',
                  domain: 'mastodon.social',
                  version: '4.5.0',
                  usage: { users: { active_month: 0 } },
                }
              : [],
          ),
        });
      });
      await context.addInitScript(() => {
        window.__seoLandingSeen = false;
        new MutationObserver(() => {
          if (
            document.querySelector('app-public-home') ||
            document.body?.textContent.includes('Mastodon, Bluesky and RSS in one familiar home')
          ) {
            window.__seoLandingSeen = true;
          }
        }).observe(document, { childList: true, subtree: true });
      });
      // Both sidebar landmarks are visible in the desktop layout; mobile
      // deliberately hides them and removes them from the accessibility tree.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(origin + '/');
      await page.locator('app-entry').waitFor({ state: 'attached' });
      assert.equal(await page.locator('app-public-home').count(), 0);
      assert.equal(await page.evaluate(() => window.__seoLandingSeen), false);
      releaseProbe();
      await page.waitForURL(origin + '/home');
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute('content'),
        'index, follow',
      );
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        'https://mawkingbird.com/',
      );
      try {
        await page.getByRole('heading', { name: 'Welcome to Mawkingbird' }).waitFor();
      } catch (error) {
        await writeFile(
          path.join(results, 'seo-root-failure.json'),
          JSON.stringify(diagnostics, null, 2),
        );
        await writeFile(path.join(results, 'seo-root-failure.html'), await page.content());
        await page.screenshot({ path: path.join(results, 'seo-root-failure.png'), fullPage: true });
        throw error;
      }
      assert.equal(await page.evaluate(() => window.__seoLandingSeen), false);
      assert.equal(
        await page
          .getByRole('complementary', { name: 'Accounts and discovery', exact: true })
          .count(),
        1,
        'the account and discovery sidebar has its own accessible name',
      );
      assert.equal(
        await page
          .getByRole('complementary', {
            name: 'Server information and recommendations',
            exact: true,
          })
          .count(),
        1,
        'the server sidebar has a distinct accessible name',
      );
      // Re-entry must also retain the welcome flow if the dictionary arrives
      // after the home route, rather than leaving empty translated controls.
      let releaseTranslations;
      const translationsReady = new Promise((resolve) => {
        releaseTranslations = resolve;
      });
      await context.route(`${origin}/i18n/**`, async (route) => {
        await translationsReady;
        await route.continue();
      });
      await page.goto(origin + '/');
      await page.waitForURL(origin + '/home');
      releaseTranslations();
      await page.getByRole('heading', { name: 'Welcome to Mawkingbird' }).waitFor();
      assert.equal(await page.evaluate(() => window.__seoLandingSeen), false);
      assert.deepEqual(errors, [], 'preview startup has no runtime errors');
      assert.deepEqual(
        announcementRequests,
        [],
        'public pages and anonymous preview never fetch authenticated announcements',
      );
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
