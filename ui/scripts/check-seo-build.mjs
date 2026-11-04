import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import {
  languageFolder,
  loadFocusedTools,
  translatedLanguages,
} from './focused-tools-registry.mjs';

const root = path.resolve(import.meta.dirname, '../dist-mockingbird/browser');
const focusedTools = await loadFocusedTools();
// Each translated language's index, at /<lang>/.
const LANGUAGE_INDEXES = await translatedLanguages();
// The language whose index lives at this folder, if any.
const indexLanguage = (page) => LANGUAGE_INDEXES.find((lang) => languageFolder(lang) === page);
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
  'tools',
  ...LANGUAGE_INDEXES.map(languageFolder),
  ...focusedTools.map((tool) => tool.path),
];
// Focused mini-app entry pages (src/app/focused-tools.json): the heading and a
// phrase from the signed-out copy. Their tools are deferred and signed-in only,
// so none may prerender.
const tools = new Map(focusedTools.map((tool) => [tool.path, tool.prerenderCheck]));
const toolEntries = new Map(focusedTools.map((tool) => [tool.path, tool]));
const languageOf = (tool) => tool.lang ?? 'en';
// Every language version of a tool as "hreflang href" pairs, plus English as
// x-default; empty for a tool in one language only.
// /tools/ and every language's index are one page in several languages.
const INDEX_ALTERNATES = [
  'en https://mawkingbird.com/tools/',
  ...LANGUAGE_INDEXES.map((lang) => `${lang} https://mawkingbird.com/${languageFolder(lang)}/`),
  'x-default https://mawkingbird.com/tools/',
].sort();
const expectedAlternates = (tool) => {
  const originalId = tool.translationOf ?? tool.id;
  const versions = focusedTools.filter(
    (entry) => entry.id === originalId || entry.translationOf === originalId,
  );
  if (versions.length < 2) return [];
  const english = versions.find((entry) => languageOf(entry) === 'en');
  return [
    ...versions.map((entry) => `${languageOf(entry)} https://mawkingbird.com/${entry.path}/`),
    `x-default https://mawkingbird.com/${english.path}/`,
  ].sort();
};
const toolSelectors = focusedTools.map((tool) => tool.prerenderCheck.tool);
// One prerendered page per published starter kit; follow-kits.ts decides which.
const kitSlugs = (await readdir(path.join(root, 'follow'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.ok(kitSlugs.length > 0, 'at least one starter kit is published');
pages.push('follow', ...kitSlugs.map((slug) => `follow/${slug}`));
// Feed Builder topic pages and their hub (src/app/pages/feed-builder/).
const feedPaths = JSON.parse(
  await readFile(
    path.resolve(import.meta.dirname, '../src/app/pages/feed-builder/feed-builder-paths.json'),
    'utf8',
  ),
);
const feedPages = Object.entries(feedPaths).flatMap(([topic, langs]) =>
  Object.entries(langs).map(([lang, pagePath]) => ({ topic, lang, path: pagePath })),
);
const feedPageAt = (page) => feedPages.find((entry) => entry.path === page);
const feedAlternates = (entry) => {
  const versions = feedPages.filter((other) => other.topic === entry.topic);
  if (versions.length < 2) return [];
  const english = versions.find((other) => other.lang === 'en');
  return [
    ...versions.map((other) => `${other.lang} https://mawkingbird.com/${other.path}/`),
    ...(english ? [`x-default https://mawkingbird.com/${english.path}/`] : []),
  ].sort();
};
pages.push('communities', ...feedPages.map((entry) => entry.path));
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
  } else if (page === 'communities') {
    assert.equal(doc.querySelectorAll('h1').length, 1, 'communities has rendered content');
    for (const entry of feedPages)
      assert.ok(
        doc.querySelector(`a[href="/${entry.path}"]`),
        `communities links to ${entry.path}`,
      );
  } else if (feedPageAt(page)) {
    // A topic page: its language, its lists, its versions, and nothing live.
    const entry = feedPageAt(page);
    assert.equal(doc.documentElement.lang, entry.lang, `${page} <html lang>`);
    assert.equal(doc.querySelectorAll('h1').length, 1, `${page} has one heading`);
    assert.ok(doc.querySelectorAll('.people li').length >= 5, `${page} lists its people`);
    assert.ok(doc.querySelectorAll('a[href^="/tags/"]').length >= 3, `${page} links its hashtags`);
    assert.equal(doc.querySelector('.activity'), null, `${page} prerenders no live tag activity`);
    assert.ok(doc.querySelector('a[href="/communities"]'), `${page} links to the hub`);
    assert.ok(
      doc.querySelector('a[href="/accounts/@mawkingbird@mastodon.social"]'),
      `${page} says where to ask for help or removal`,
    );
    assert.deepEqual(
      [...doc.querySelectorAll('link[rel="alternate"][hreflang]')]
        .map((link) => `${link.getAttribute('hreflang')} ${link.getAttribute('href')}`)
        .sort(),
      feedAlternates(entry),
      `${page} hreflang alternates`,
    );
    for (const version of feedPages.filter(
      (other) => other.topic === entry.topic && other.path !== entry.path,
    ))
      assert.ok(
        doc.querySelector(`a[hreflang="${version.lang}"][href="/${version.path}"]`),
        `${page} links its ${version.lang} version`,
      );
  } else if (page === 'tools') {
    // The index links every English tool page, from the same registry; the
    // translations get their own language's index.
    assert.equal(doc.querySelectorAll('h1').length, 1, 'tools has rendered content');
    for (const tool of focusedTools.filter((entry) => languageOf(entry) === 'en'))
      assert.ok(doc.querySelector(`a[href="/${tool.path}"]`), `tools links to ${tool.path}`);
  } else if (indexLanguage(page)) {
    // A language's index links every page in that language, and no other.
    const lang = indexLanguage(page);
    assert.equal(doc.querySelectorAll('h1').length, 1, `${page} has rendered content`);
    assert.equal(doc.documentElement.lang, lang, `${page} <html lang>`);
    for (const tool of focusedTools.filter((entry) => languageOf(entry) === lang))
      assert.ok(doc.querySelector(`a[href="/${tool.path}"]`), `${page} links to ${tool.path}`);
    for (const tool of focusedTools.filter((entry) => languageOf(entry) !== lang))
      assert.equal(
        doc.querySelector(`.tool-list a[href="/${tool.path}"]`),
        null,
        `${page} lists no ${tool.path}`,
      );
  } else if (tools.has(page)) {
    const { heading, copy } = tools.get(page);
    assert.equal(doc.querySelectorAll('h1').length, 1, `${page} has rendered content`);
    assert.ok(doc.querySelector('h1')?.textContent?.includes(heading), `${page} h1: ${heading}`);
    assert.ok(doc.body.textContent.includes(copy), `${page} copy: ${copy}`);
    for (const tool of toolSelectors)
      assert.equal(doc.querySelector(tool), null, `${page} prerenders no ${tool}`);
    // A page written in one language says so, and links its other versions.
    const entry = toolEntries.get(page);
    assert.equal(doc.documentElement.lang, languageOf(entry), `${page} <html lang>`);
    assert.deepEqual(
      [...doc.querySelectorAll('link[rel="alternate"][hreflang]')]
        .map((link) => `${link.getAttribute('hreflang')} ${link.getAttribute('href')}`)
        .sort(),
      expectedAlternates(entry),
      `${page} hreflang alternates`,
    );
    // ...and links them visibly, for readers and crawlers alike.
    for (const version of focusedTools.filter(
      (other) =>
        other.id !== entry.id &&
        (other.id === (entry.translationOf ?? entry.id) ||
          other.translationOf === (entry.translationOf ?? entry.id)),
    ))
      assert.ok(
        doc.querySelector(`a[hreflang="${languageOf(version)}"][href="/${version.path}"]`),
        `${page} links its ${languageOf(version)} version`,
      );
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
  } else if (feedPageAt(page)) {
    assert.equal(blocks.length, 1, `${page} has one structured-data block`);
    assert.equal(blocks[0]['@type'], 'CollectionPage');
    assert.equal(blocks[0].inLanguage, feedPageAt(page).lang);
    assert.equal(
      blocks[0].mainEntity.itemListElement.length,
      doc.querySelectorAll('.people li').length,
    );
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
// The sitemap's alternates match the pages' own.
for (const url of sitemap.querySelectorAll('url')) {
  const page = url
    .querySelector('loc')
    .textContent.replace('https://mawkingbird.com/', '')
    .replace(/\/$/, '');
  const entry = toolEntries.get(page);
  const listed = [...url.getElementsByTagName('xhtml:link')]
    .map((link) => `${link.getAttribute('hreflang')} ${link.getAttribute('href')}`)
    .sort();
  assert.deepEqual(
    listed,
    page === 'tools' || indexLanguage(page)
      ? INDEX_ALTERNATES
      : entry
        ? expectedAlternates(entry)
        : feedPageAt(page)
          ? feedAlternates(feedPageAt(page))
          : [],
    `sitemap alternates for ${page}`,
  );
}
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
