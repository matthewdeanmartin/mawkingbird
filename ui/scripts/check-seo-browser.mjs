import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../dist-mockingbird/browser');
const results = path.resolve(import.meta.dirname, '../.test-results');
const audiencePages = [
  ['readers', 'Make room for the stories you want to read'],
  ['bluesky', 'Read Bluesky and Mastodon in one place'],
  ['twitter-exodus', 'Find your next conversation without starting from an empty feed'],
  ['instagram', 'Give the pictures their own space'],
  ['creators', 'Keep the idea, shape the post, share the work'],
  ['power-users', 'Controls most Mastodon clients leave out'],
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
    assert.equal(await page.locator('footer a[href="/for/readers/"]').count(), 1);
    assert.equal(await page.locator('footer a[href="/for/bluesky/"]').count(), 1);
    assert.equal(await page.locator('footer a[href="/for/twitter-exodus/"]').count(), 1);
    assert.equal(await page.locator('footer a[href="/for/instagram/"]').count(), 1);
    assert.equal(await page.locator('footer a[href="/for/creators/"]').count(), 1);
    assert.equal(await page.locator('footer a[href="/for/power-users/"]').count(), 1);
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
      await page.waitForURL(`${origin}/features/`);
      const enteredFeaturesAt = await page.evaluate(() => performance.timeOrigin);
      await page
        .getByRole('navigation', { name: 'Feature areas' })
        .getByRole('link', { name: 'Reading', exact: true })
        .click();
      await page.waitForURL(`${origin}/features/#reading`);
      assert.equal(
        await page.evaluate(() => performance.timeOrigin),
        enteredFeaturesAt,
        'section links also stay in the document after client navigation to /features',
      );
      await page.locator('footer').getByRole('link', { name: 'For readers', exact: true }).click();
      await page.waitForURL(`${origin}/for/readers/`);
      await page.getByRole('link', { name: 'For creators', exact: true }).click();
      await page.waitForURL(`${origin}/for/creators/`);
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
  // The project's own pages: prerendered copy without JavaScript; with it, a
  // fresh visitor must stay on the article inside the app rather than being
  // dispatched to /home, and the metadata must stay indexable.
  for (const [slug, heading, inApp] of [
    ['about', 'Why Mawkingbird exists', 'Why I asked a bot to create this.'],
    ['funding', 'How Mawkingbird is funded', 'Nothing below is a revenue model'],
    ['legal', 'About & legal', 'Credits & Privacy'],
  ]) {
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({ javaScriptEnabled });
      await context.route('**/vendor/count.js', (route) =>
        route.fulfill({ contentType: 'text/javascript', body: '' }),
      );
      // Keep the anonymous shell off real Mastodon servers.
      await context.route('https://**/*', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
      );
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/${slug}/`);
      if (javaScriptEnabled) {
        await page.getByText(inApp).first().waitFor();
        assert.equal(new URL(page.url()).pathname.replace(/\/$/, ''), `/${slug}`);
      } else {
        await page.getByRole('heading', { name: heading, exact: true }).waitFor();
        assert.ok((await page.locator('main').textContent()).includes(inApp));
      }
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute('content'),
        'index, follow',
      );
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      await page.screenshot({
        path: path.join(results, `seo-${slug}-${javaScriptEnabled ? 'client' : 'static'}.png`),
        fullPage: true,
      });
      assert.deepEqual(errors, [], `${slug} has no browser runtime errors`);
      await context.close();
    }
  }
  // Starter-kit pages: static and client copies agree, and the follow-all link
  // reaches the in-app kit for a fresh visitor instead of the Home dispatcher.
  const kitSlug = (await readdir(path.join(root, 'follow'), { withFileTypes: true })).find(
    (entry) => entry.isDirectory(),
  ).name;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled });
    await context.route('**/vendor/count.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    // Avatars and the anonymous shell stay off real servers.
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [url, canonical] of [
      [`${origin}/follow/`, 'https://mawkingbird.com/follow/'],
      [`${origin}/follow/${kitSlug}/`, `https://mawkingbird.com/follow/${kitSlug}/`],
    ]) {
      await page.goto(url);
      await page.getByRole('heading', { level: 1 }).waitFor();
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), canonical);
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute('content'),
        'index, follow',
      );
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${url} has no overflow at ${width}px`,
        );
      }
      await page.screenshot({
        path: path.join(
          results,
          `seo-${url.includes(kitSlug) ? 'follow-kit' : 'follow'}-${javaScriptEnabled ? 'client' : 'static'}.png`,
        ),
        fullPage: true,
      });
    }
    const heading = await page.getByRole('heading', { level: 1 }).textContent();
    assert.match(heading, /on Mastodon: \d+ accounts to follow/);
    assert.ok((await page.title()).startsWith(heading.trim()));
    if (javaScriptEnabled) {
      await page.getByRole('link', { name: 'Follow this kit in Mawkingbird' }).click();
      await page.waitForURL(`${origin}/collections/starter/${kitSlug}`);
      await page.waitForTimeout(500);
      assert.equal(new URL(page.url()).pathname, `/collections/starter/${kitSlug}`);
    }
    assert.deepEqual(errors, [], `starter-kit pages have no runtime errors`);
    await context.close();
  }
  // Topic starter-kit pages (Feed Builder): the client keeps the page's language,
  // heading and lists, the live tag line appears only with JavaScript (from a
  // stubbed tag history), and a hashtag opens in the app for a fresh visitor.
  const topicPage = 'it/fantascienza-su-mastodon';
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('**/vendor/count.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await context.route('https://**/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: route.request().url().includes('/api/v1/tags/')
          ? JSON.stringify({ history: [{ day: '0', uses: '12', accounts: '5' }] })
          : '[]',
      }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [url, canonical] of [
      [`${origin}/communities/`, 'https://mawkingbird.com/communities/'],
      [`${origin}/${topicPage}/`, `https://mawkingbird.com/${topicPage}/`],
    ]) {
      await page.goto(url);
      await page.getByRole('heading', { level: 1 }).waitFor();
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), canonical);
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute('content'),
        'index, follow',
      );
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${url} has no overflow at ${width}px`,
        );
      }
      await page.screenshot({
        path: path.join(
          results,
          `seo-${url.includes(topicPage) ? 'topic' : 'communities'}-${javaScriptEnabled ? 'client' : 'static'}.png`,
        ),
        fullPage: true,
      });
    }
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'it');
    assert.match(await page.getByRole('heading', { level: 1 }).textContent(), /Fantascienza/);
    assert.ok((await page.locator('.people li').count()) >= 5, 'topic page lists people');
    if (javaScriptEnabled) {
      // The live line loads when its hashtag scrolls into view.
      await page.locator('.tag-list li').first().scrollIntoViewIfNeeded();
      await page.locator('.activity').first().waitFor();
      assert.match(await page.locator('.activity').first().textContent(), /12 post/);
      await page.locator('a[href="/tags/Fantascienza"]').click();
      await page.waitForURL(`${origin}/tags/Fantascienza`);
      await page.waitForTimeout(500);
      assert.equal(new URL(page.url()).pathname, '/tags/Fantascienza');
      // The preview is client-only (never prerendered; this test server has no
      // SPA fallback) and reads public timelines, stubbed here. Reached the way a
      // reader does, from the page's Preview tab; standalone, in its language.
      await page.goto(`${origin}/${topicPage}/`);
      await page.locator(`nav a[href="/${topicPage}/preview"]`).click();
      await page.waitForURL(`${origin}/${topicPage}/preview`);
      await page.getByRole('heading', { level: 1, name: /Anteprima/ }).waitFor();
      assert.match(await page.getByRole('heading', { level: 1 }).textContent(), /Anteprima/);
      assert.equal(
        await page.locator(`nav a[href="/${topicPage}/preview"][aria-current="page"]`).count(),
        1,
      );
      await page.setViewportSize({ width: 390, height: 900 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'preview has no overflow at 390px',
      );
      await page.screenshot({ path: path.join(results, 'seo-topic-preview.png'), fullPage: true });
      // The Flooding tab, the same way: client-only, in the page's language.
      await page.locator(`nav a[href="/${topicPage}/flooding"]`).click();
      await page.waitForURL(`${origin}/${topicPage}/flooding`);
      await page.getByRole('heading', { level: 1, name: /Saturazione/ }).waitFor();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'flooding tab has no overflow at 390px',
      );
      await page.screenshot({ path: path.join(results, 'seo-topic-flooding.png'), fullPage: true });
    } else {
      assert.equal(await page.locator('.activity').count(), 0, 'no live line without JavaScript');
    }
    assert.deepEqual(errors, [], 'topic pages have no runtime errors');
    await context.close();
  }
  // The approved plant-based editions retain their selection and SEO after hydration.
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [lang, slug, heading, tag, count] of [
      ['en', 'plant-based-living-on-mastodon', 'Plant Based Living', 'VeganFood', 13],
      [
        'de',
        'de/pflanzlich-leben-auf-mastodon',
        'Pflanzlich leben auf Mastodon',
        'Vegetarisch',
        11,
      ],
    ]) {
      await page.goto(`${origin}/${slug}/`);
      await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      assert.equal(await page.locator('html').getAttribute('lang'), lang);
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      assert.equal(
        await page.locator('head link[hreflang="en"]').getAttribute('href'),
        'https://mawkingbird.com/plant-based-living-on-mastodon/',
      );
      assert.equal(
        await page.locator('head link[hreflang="de"]').getAttribute('href'),
        'https://mawkingbird.com/de/pflanzlich-leben-auf-mastodon/',
      );
      assert.equal(await page.locator('head link[hreflang="fr"]').count(), 0);
      assert.equal(await page.locator('.people li').count(), count);
      assert.ok(await page.locator(`a[href="/tags/${tag}"]`).count());
      assert.equal(await page.locator('a[href="/tags/Vegan"]').count(), 0);
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug}: no overflow at ${width}px`,
        );
      }
      await page.screenshot({
        path: path.join(
          results,
          `seo-plant-based-${lang}-${javaScriptEnabled ? 'client' : 'static'}.png`,
        ),
        fullPage: true,
      });
    }
    assert.deepEqual(errors, [], 'plant-based pages have no runtime errors');
    await context.close();
  }
  // Math keeps the approved language set and NumberTheory through hydration.
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/fr/mathematiques-sur-mastodon/`);
    await page
      .getByRole('heading', { level: 1, name: 'Les mathématiques sur Mastodon', exact: true })
      .waitFor();
    if (javaScriptEnabled)
      await page.waitForFunction(() =>
        document.querySelector('app-root')?.hasAttribute('ng-version'),
      );
    assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
    assert.equal(await page.locator('.people li').count(), 13);
    assert.ok(await page.locator('a[href="/tags/NumberTheory"]').count());
    assert.ok(await page.locator('a[href="https://mathstodon.xyz/about"]').count());
    for (const [lang, slug] of [
      ['en', 'math-on-mastodon'],
      ['de', 'de/mathematik-auf-mastodon'],
      ['fr', 'fr/mathematiques-sur-mastodon'],
    ]) {
      assert.equal(
        await page.locator(`head link[hreflang="${lang}"]`).getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
    }
    for (const lang of ['es', 'it', 'ja'])
      assert.equal(await page.locator(`head link[hreflang="${lang}"]`).count(), 0);
    assert.equal(
      await page.locator('link[rel="canonical"]').getAttribute('href'),
      'https://mawkingbird.com/fr/mathematiques-sur-mastodon/',
    );
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `math: no overflow at ${width}px`,
      );
    }
    await page.screenshot({
      path: path.join(results, `seo-math-fr-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'math page has no runtime errors');
    await context.close();
  }
  // Gardening retains quiet subject tags and only the three approved editions.
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const slug = 'gardening-and-houseplants-on-mastodon';
    await page.goto(`${origin}/${slug}/`);
    await page
      .getByRole('heading', {
        level: 1,
        name: 'Gardening and houseplants on Mastodon',
        exact: true,
      })
      .waitFor();
    if (javaScriptEnabled)
      await page.waitForFunction(() =>
        document.querySelector('app-root')?.hasAttribute('ng-version'),
      );
    assert.equal(await page.locator('.people li').count(), 14);
    for (const tag of ['Succulents', 'Hydroponics', 'Cacti'])
      assert.ok(await page.locator(`a[href="/tags/${tag}"]`).count());
    for (const [lang, path] of [
      ['en', slug],
      ['de', 'de/garten-und-zimmerpflanzen-auf-mastodon'],
      ['fr', 'fr/jardinage-et-plantes-interieur-sur-mastodon'],
    ])
      assert.equal(
        await page.locator(`head link[hreflang="${lang}"]`).getAttribute('href'),
        `https://mawkingbird.com/${path}/`,
      );
    for (const lang of ['es', 'it', 'ja'])
      assert.equal(await page.locator(`head link[hreflang="${lang}"]`).count(), 0);
    assert.equal(
      await page.locator('link[rel="canonical"]').getAttribute('href'),
      `https://mawkingbird.com/${slug}/`,
    );
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `gardening: no overflow at ${width}px`,
      );
    }
    await page.goto(`${origin}/communities/`);
    await page.locator(`a[href="/${slug}/"], a[href="/${slug}"]`).first().waitFor();
    assert.deepEqual(errors, [], 'gardening page and communities have no runtime errors');
    await context.close();
  }
  // Both board editions retain useful quiet tags, in static and hydrated pages.
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const editions = [
      ['en', 'esp32-and-single-board-computers-on-mastodon', 27, ['ESP32', 'BeagleBoard', 'Radxa']],
      ['de', 'de/esp32-und-einplatinencomputer-auf-mastodon', 5, ['ESP32', 'Einplatinencomputer']],
    ];
    for (const [lang, slug, count, tags] of editions) {
      await page.goto(`${origin}/${slug}/`);
      await page.locator('main h1').waitFor();
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      assert.equal(await page.locator('main').getAttribute('lang'), lang);
      assert.equal(await page.locator('.people li').count(), count);
      for (const tag of tags) assert.ok(await page.locator(`a[href="/tags/${tag}"]`).count());
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      for (const [editionLang, path] of editions)
        assert.equal(
          await page.locator(`head link[hreflang="${editionLang}"]`).getAttribute('href'),
          `https://mawkingbird.com/${path}/`,
        );
      for (const withheld of ['fr', 'es', 'it', 'ja'])
        assert.equal(await page.locator(`head link[hreflang="${withheld}"]`).count(), 0);
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `boards ${lang}: no overflow at ${width}px`,
        );
      }
    }
    await page.goto(`${origin}/communities/`);
    for (const [, slug] of editions)
      await page.locator(`a[href="/${slug}/"], a[href="/${slug}"]`).first().waitFor();
    assert.deepEqual(errors, [], 'board pages and communities have no runtime errors');
    await context.close();
  }
  // Ukrainian routes must keep their language after the client replaces the prerender.
  const ukrainianCopy = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/uk.json', import.meta.url), 'utf8'),
  );
  const ukrainianPaths = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/paths.json', import.meta.url), 'utf8'),
  ).uk;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [id, slug] of Object.entries(ukrainianPaths)) {
      await page.goto(`${origin}/${slug}/`);
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      await page
        .getByRole('heading', { name: ukrainianCopy[id].prerenderCheck.heading, exact: true })
        .waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'uk');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      assert.equal(
        await page.locator('head link[hreflang="uk"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      for (const width of [1100, 375]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug}: no overflow at ${width}px`,
        );
      }
      if (id === 'download-media' && javaScriptEnabled)
        await page.getByRole('button', { name: 'Показати зображення', exact: true }).waitFor();
    }
    await page.goto(`${origin}/uk/`);
    await page
      .getByRole('heading', { name: 'Безкоштовні інструменти для Mastodon і Bluesky', exact: true })
      .waitFor();
    assert.equal(await page.locator('.tool-list a').count(), 21);
    if (javaScriptEnabled) {
      await page.getByRole('button', { name: 'Українська', exact: true }).click();
      assert.equal(await page.locator('a[hreflang="uk"][aria-current="page"]').count(), 1);
    }
    await page.screenshot({
      path: path.join(results, `seo-uk-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'Ukrainian pages have no runtime errors');
    await context.close();
  }
  // Hindi routes must keep their language after the client replaces the prerender.
  const hindiCopy = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/hi.json', import.meta.url), 'utf8'),
  );
  const hindiPaths = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/paths.json', import.meta.url), 'utf8'),
  ).hi;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [id, slug] of Object.entries(hindiPaths)) {
      await page.goto(`${origin}/${slug}/`);
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      await page
        .getByRole('heading', { name: hindiCopy[id].prerenderCheck.heading, exact: true })
        .waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'hi');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      assert.equal(
        await page.locator('head link[hreflang="hi"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      for (const width of [1100, 375]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug}: no overflow at ${width}px`,
        );
      }
      if (id === 'download-media' && javaScriptEnabled)
        await page.getByRole('button', { name: 'तस्वीरें दिखाएँ', exact: true }).waitFor();
    }
    await page.goto(`${origin}/hi/`);
    await page
      .getByRole('heading', { name: 'Mastodon और Bluesky के लिए मुफ़्त टूल', exact: true })
      .waitFor();
    assert.equal(await page.locator('.tool-list a').count(), 21);
    if (javaScriptEnabled) {
      await page.getByRole('button', { name: 'हिन्दी', exact: true }).click();
      assert.equal(await page.locator('a[hreflang="hi"][aria-current="page"]').count(), 1);
    }
    await page.screenshot({
      path: path.join(results, `seo-hi-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'Hindi pages have no runtime errors');
    await context.close();
  }
  // Dutch routes must keep their language after the client replaces the prerender.
  const dutchCopy = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/nl.json', import.meta.url), 'utf8'),
  );
  const dutchPaths = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/paths.json', import.meta.url), 'utf8'),
  ).nl;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [id, slug] of Object.entries(dutchPaths)) {
      await page.goto(`${origin}/${slug}/`);
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      await page
        .getByRole('heading', { name: dutchCopy[id].prerenderCheck.heading, exact: true })
        .waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'nl');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      assert.equal(
        await page.locator('head link[hreflang="nl"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      for (const width of [1100, 375]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug}: no overflow at ${width}px`,
        );
      }
      if (id === 'download-media' && javaScriptEnabled)
        await page.getByRole('button', { name: 'Toon de afbeeldingen', exact: true }).waitFor();
    }
    await page.goto(`${origin}/nl/`);
    await page
      .getByRole('heading', { name: 'Gratis tools voor Mastodon en Bluesky', exact: true })
      .waitFor();
    assert.equal(await page.locator('.tool-list a').count(), 21);
    if (javaScriptEnabled) {
      await page.getByRole('button', { name: 'Nederlands', exact: true }).click();
      assert.equal(await page.locator('a[hreflang="nl"][aria-current="page"]').count(), 1);
    }
    await page.screenshot({
      path: path.join(results, `seo-nl-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'Dutch pages have no runtime errors');
    await context.close();
  }
  // Indonesian routes must keep their language after the client replaces the prerender.
  const indonesianCopy = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/id.json', import.meta.url), 'utf8'),
  );
  const indonesianPaths = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/paths.json', import.meta.url), 'utf8'),
  ).id;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [id, slug] of Object.entries(indonesianPaths)) {
      await page.goto(`${origin}/${slug}/`);
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      await page
        .getByRole('heading', { name: indonesianCopy[id].prerenderCheck.heading, exact: true })
        .waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'id');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      assert.equal(
        await page.locator('head link[hreflang="id"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      for (const width of [1100, 375]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug}: no overflow at ${width}px`,
        );
      }
      if (id === 'download-media' && javaScriptEnabled)
        await page.getByRole('button', { name: 'Tampilkan gambarnya', exact: true }).waitFor();
    }
    await page.goto(`${origin}/id/`);
    await page
      .getByRole('heading', { name: 'Alat gratis untuk Mastodon dan Bluesky', exact: true })
      .waitFor();
    assert.equal(await page.locator('.tool-list a').count(), 21);
    if (javaScriptEnabled) {
      await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
      assert.equal(await page.locator('a[hreflang="id"][aria-current="page"]').count(), 1);
    }
    await page.screenshot({
      path: path.join(results, `seo-id-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'Indonesian pages have no runtime errors');
    await context.close();
  }
  // Russian routes must keep their language after the client replaces the prerender.
  const russianCopy = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/ru.json', import.meta.url), 'utf8'),
  );
  const russianPaths = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/paths.json', import.meta.url), 'utf8'),
  ).ru;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [id, slug] of Object.entries(russianPaths)) {
      await page.goto(`${origin}/${slug}/`);
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      await page
        .getByRole('heading', { name: russianCopy[id].prerenderCheck.heading, exact: true })
        .waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      assert.equal(
        await page.locator('head link[hreflang="ru"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      for (const width of [1100, 375]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug}: no overflow at ${width}px`,
        );
      }
      if (id === 'download-media' && javaScriptEnabled)
        await page.getByRole('button', { name: 'Показать изображения', exact: true }).waitFor();
    }
    await page.goto(`${origin}/ru/`);
    await page
      .getByRole('heading', { name: 'Бесплатные инструменты для Mastodon и Bluesky', exact: true })
      .waitFor();
    assert.equal(await page.locator('.tool-list a').count(), 21);
    if (javaScriptEnabled) {
      await page.getByRole('button', { name: 'Русский', exact: true }).click();
      assert.equal(await page.locator('a[hreflang="ru"][aria-current="page"]').count(), 1);
    }
    await page.screenshot({
      path: path.join(results, `seo-ru-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'Russian pages have no runtime errors');
    await context.close();
  }
  // Swedish routes must keep their language after the client replaces the prerender.
  const swedishCopy = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/sv.json', import.meta.url), 'utf8'),
  );
  const swedishPaths = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/paths.json', import.meta.url), 'utf8'),
  ).sv;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [id, slug] of Object.entries(swedishPaths)) {
      await page.goto(`${origin}/${slug}/`);
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      await page
        .getByRole('heading', { name: swedishCopy[id].prerenderCheck.heading, exact: true })
        .waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'sv');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      assert.equal(
        await page.locator('head link[hreflang="sv"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      for (const width of [1100, 375]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug}: no overflow at ${width}px`,
        );
      }
      if (id === 'download-media' && javaScriptEnabled)
        await page.getByRole('button', { name: 'Visa bilderna', exact: true }).waitFor();
    }
    await page.goto(`${origin}/sv/`);
    await page
      .getByRole('heading', { name: 'Gratis verktyg för Mastodon och Bluesky', exact: true })
      .waitFor();
    assert.equal(await page.locator('.tool-list a').count(), 21);
    if (javaScriptEnabled) {
      await page.getByRole('button', { name: 'Svenska', exact: true }).click();
      assert.equal(await page.locator('a[hreflang="sv"][aria-current="page"]').count(), 1);
    }
    await page.screenshot({
      path: path.join(results, `seo-sv-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'Swedish pages have no runtime errors');
    await context.close();
  }
  // Vietnamese routes must keep their language after the client replaces the prerender.
  const vietnameseCopy = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/vi.json', import.meta.url), 'utf8'),
  );
  const vietnamesePaths = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/paths.json', import.meta.url), 'utf8'),
  ).vi;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [id, slug] of Object.entries(vietnamesePaths)) {
      await page.goto(`${origin}/${slug}/`);
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      await page
        .getByRole('heading', { name: vietnameseCopy[id].prerenderCheck.heading, exact: true })
        .waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      assert.equal(
        await page.locator('head link[hreflang="vi"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      for (const width of [1100, 375]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug}: no overflow at ${width}px`,
        );
      }
      if (id === 'download-media' && javaScriptEnabled)
        await page.getByRole('button', { name: 'Xem ảnh của họ', exact: true }).waitFor();
    }
    await page.goto(`${origin}/vi/`);
    await page
      .getByRole('heading', { name: 'Công cụ miễn phí cho Mastodon và Bluesky', exact: true })
      .waitFor();
    assert.equal(await page.locator('.tool-list a').count(), 21);
    if (javaScriptEnabled) {
      await page.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
      assert.equal(await page.locator('a[hreflang="vi"][aria-current="page"]').count(), 1);
    }
    await page.screenshot({
      path: path.join(results, `seo-vi-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'Vietnamese pages have no runtime errors');
    await context.close();
  }
  // Turkish routes must keep their language after the client replaces the prerender.
  const turkishCopy = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/tr.json', import.meta.url), 'utf8'),
  );
  const turkishPaths = JSON.parse(
    await readFile(new URL('../src/app/tool-translations/paths.json', import.meta.url), 'utf8'),
  ).tr;
  for (const javaScriptEnabled of [false, true]) {
    const context = await browser.newContext({ javaScriptEnabled, locale: 'en-US' });
    await context.route('https://**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [id, slug] of Object.entries(turkishPaths)) {
      await page.goto(`${origin}/${slug}/`);
      if (javaScriptEnabled)
        await page.waitForFunction(() =>
          document.querySelector('app-root')?.hasAttribute('ng-version'),
        );
      await page
        .getByRole('heading', { name: turkishCopy[id].prerenderCheck.heading, exact: true })
        .waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'tr');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      assert.equal(
        await page.locator('head link[hreflang="tr"]').getAttribute('href'),
        `https://mawkingbird.com/${slug}/`,
      );
      for (const width of [1100, 375]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${slug}: no overflow at ${width}px`,
        );
      }
      if (id === 'download-media' && javaScriptEnabled)
        await page.getByRole('button', { name: 'Görselleri göster', exact: true }).waitFor();
    }
    await page.goto(`${origin}/tr/`);
    await page
      .getByRole('heading', { name: 'Mastodon ve Bluesky için ücretsiz araçlar', exact: true })
      .waitFor();
    assert.equal(await page.locator('.tool-list a').count(), 21);
    if (javaScriptEnabled) {
      await page.getByRole('button', { name: 'Türkçe', exact: true }).click();
      assert.equal(await page.locator('a[hreflang="tr"][aria-current="page"]').count(), 1);
    }
    await page.screenshot({
      path: path.join(results, `seo-tr-${javaScriptEnabled ? 'client' : 'static'}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'Turkish pages have no runtime errors');
    await context.close();
  }
  console.log(
    'SEO browser checks passed with JavaScript enabled and disabled, desktop and mobile.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
