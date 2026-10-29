import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '../dist-mockingbird/browser');
const pages = [
  '',
  'features',
  'for/readers',
  'for/bluesky',
  'for/twitter-exodus',
  'for/instagram',
  'for/creators',
  'for/power-users',
  'about',
  'funding',
  'blog',
  'twitter-to-mastodon',
  'crosspost',
  'mastodon-analytics',
  'github-to-mastodon',
];
// Focused mini-app entry pages: the heading and a phrase from the signed-out
// copy. Their tools are deferred and signed-in only, so none may prerender.
const tools = new Map([
  ['twitter-to-mastodon', [/Import your Twitter follows/, /Download your Twitter archive/]],
  ['crosspost', [/Post to Mastodon and Bluesky/, /Sign in with Bluesky/]],
  ['mastodon-analytics', [/Mastodon analytics for your account/, /Your best posts/]],
  ['github-to-mastodon', [/Find your GitHub friends on Mastodon/, /Connect GitHub/]],
]);
// One prerendered page per published starter kit; follow-kits.ts decides which.
const kitSlugs = (await readdir(path.join(root, 'follow'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.ok(kitSlugs.length > 0, 'at least one starter kit is published');
pages.push('follow', ...kitSlugs.map((slug) => `follow/${slug}`));
const articles = new Map([
  ['about', /Why I asked a bot to create this/],
  ['funding', /Nothing below is a revenue model/],
  ['blog', /Credits & Privacy/],
]);
const titles = new Set();
const descriptions = new Set();
for (const page of pages) {
  const html = await readFile(path.join(root, page, 'index.html'), 'utf8');
  const doc = new JSDOM(html).window.document;
  assert.equal(
    doc.querySelector('base')?.getAttribute('href'),
    '/',
    'SEO publishing uses root base href',
  );
  if (page === 'follow') {
    assert.equal(doc.querySelectorAll('h1').length, 1);
    for (const slug of kitSlugs)
      assert.ok(doc.querySelector(`a[href="/follow/${slug}"]`), `hub links to ${slug}`);
  } else if (page.startsWith('follow/')) {
    assert.match(doc.querySelector('h1')?.textContent ?? '', /on Mastodon: \d+ accounts to follow/);
    assert.ok(doc.querySelectorAll('.people li').length >= 3, `${page} lists its people`);
    assert.ok(
      doc.querySelector(`a[href="/collections/starter/${page.slice('follow/'.length)}"]`),
      `${page} links to the in-app kit`,
    );
    assert.ok(doc.querySelector('a[href="/follow"]'), `${page} links back to the hub`);
  } else if (tools.has(page)) {
    const [heading, copy] = tools.get(page);
    assert.equal(doc.querySelectorAll('h1').length, 1, `${page} has rendered content`);
    assert.match(doc.querySelector('h1')?.textContent ?? '', heading);
    assert.match(doc.body.textContent, copy);
    for (const tool of [
      'app-twitter-archive-import',
      'app-crosspost-workbench',
      'app-mastodon-analytics-panel',
      'app-github-friends-workbench',
    ])
      assert.equal(doc.querySelector(tool), null, `${page} prerenders no ${tool}`);
  } else if (articles.has(page)) {
    assert.equal(doc.querySelectorAll('h1').length, 1, `${page} has rendered content`);
    assert.match(doc.querySelector('article')?.textContent ?? '', articles.get(page));
    assert.ok(doc.querySelector('a[href="/help/"]'), `${page} links to the help site`);
  } else if (page) {
    assert.equal(doc.querySelectorAll('h1').length, 1, `${page} has rendered content`);
    assert.ok(doc.querySelectorAll('section').length >= 3);
    if (page === 'features') {
      assert.match(doc.body.textContent, /Core Mastodon features/);
      assert.match(doc.body.textContent, /Readability features/);
      assert.match(doc.body.textContent, /Creators:/);
      assert.match(doc.body.textContent, /Advanced user features/);
    }
    if (page === 'for/instagram')
      assert.match(doc.body.textContent, /does not connect to Instagram/);
    if (page === 'for/twitter-exodus')
      assert.match(doc.body.textContent, /does not automatically transfer/);
    for (const audience of pages.filter((item) => item.startsWith('for/'))) {
      assert.ok(doc.querySelector(`a[href="/${audience}"]`), `${page} links to ${audience}`);
    }
  } else {
    assert.equal(
      doc.querySelector('app-root')?.innerHTML.trim(),
      '',
      'root must bootstrap the existing app without a prerendered landing page',
    );
    assert.equal(doc.querySelector('app-public-home'), null);
    assert.match(doc.querySelector('noscript')?.textContent ?? '', /Discover Mawkingbird features/);
  }
  for (const account of ['mawkingbird', 'mistersql']) {
    assert.equal(
      doc.querySelector(`a[href="https://mastodon.social/@${account}"]`),
      null,
      'identity metadata must not become visible navigation',
    );
    assert.ok(doc.head.querySelector(`link[rel="me"][href="https://mastodon.social/@${account}"]`));
  }
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((node) =>
    JSON.parse(node.textContent),
  );
  if (page === '' || page === 'features') {
    assert.equal(blocks.length, 1, `${page || 'root'} has one structured-data block`);
    assert.equal(blocks[0]['@type'], 'WebApplication');
    assert.equal(blocks[0].url, 'https://mawkingbird.com/');
  } else if (page.startsWith('follow/')) {
    assert.equal(blocks.length, 1, `${page} has one structured-data block`);
    assert.equal(blocks[0]['@type'], 'ItemList');
    assert.equal(blocks[0].itemListElement.length, doc.querySelectorAll('.people li').length);
  } else {
    assert.equal(blocks.length, 0, `${page} has no structured data`);
  }
  const canonical = `https://mawkingbird.com/${page ? page + '/' : ''}`;
  assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), canonical);
  assert.equal(doc.querySelector('meta[property="og:url"]')?.getAttribute('content'), canonical);
  assert.equal(doc.querySelector('meta[name="robots"]')?.getAttribute('content'), 'index, follow');
  titles.add(doc.title);
  descriptions.add(doc.querySelector('meta[name="description"]')?.getAttribute('content'));
  if (page)
    assert.equal(
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content'),
      doc.title,
    );
  for (const selector of [
    'meta[name="description"]',
    'meta[property="og:title"]',
    'meta[property="og:image"]',
    'meta[name="twitter:card"]',
  ]) {
    assert.equal(doc.querySelectorAll(selector).length, 1, `one ${selector}`);
  }
  assert.equal(
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    'https://mawkingbird.com/mockingbird_hand.png',
  );
  assert.equal(
    doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content'),
    'summary_large_image',
  );
  assert.ok(html.length < 1_000_000, 'Mastodon verification response is below 1 MB');
}
assert.equal(titles.size, pages.length, 'each public page has its own title');
assert.equal(descriptions.size, pages.length, 'each public page has its own description');
const image = await readFile(path.join(root, 'mockingbird_hand.png'));
assert.equal(image.readUInt32BE(16), 3580);
assert.equal(image.readUInt32BE(20), 2508);
const sitemap = new JSDOM(await readFile(path.join(root, 'sitemap.xml'), 'utf8'), {
  contentType: 'text/xml',
}).window.document;
assert.deepEqual(
  [...sitemap.querySelectorAll('loc')].map((node) => node.textContent),
  pages.map((page) => `https://mawkingbird.com/${page ? page + '/' : ''}`),
);
// Dates come from git and are absent from shallow clones; when present, every
// URL has one and it is a plain W3C date.
const lastmods = [...sitemap.querySelectorAll('lastmod')].map((node) => node.textContent);
if (lastmods.length) {
  assert.equal(lastmods.length, pages.length, 'every sitemap URL has a lastmod');
  for (const date of lastmods) assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
}
const robots = await readFile(path.join(root, 'robots.txt'), 'utf8');
assert.match(robots, /Sitemap: https:\/\/mawkingbird.com\/sitemap.xml/);
// The static help site (scripts/build_help.py) publishes its own sitemap.
assert.match(robots, /Sitemap: https:\/\/mawkingbird.com\/help\/sitemap.xml/);
console.log('SEO HTML checks passed: content, canonicals, cards, verification links and sitemap.');
