import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '../dist-mockingbird/browser');
const pages = ['', 'features'];
for (const page of pages) {
  const html = await readFile(path.join(root, page, 'index.html'), 'utf8');
  const doc = new JSDOM(html).window.document;
  assert.equal(
    doc.querySelector('base')?.getAttribute('href'),
    '/',
    'SEO publishing uses root base href',
  );
  assert.equal(doc.querySelectorAll('h1').length, 1, `${page || '/'} has rendered content`);
  assert.match(doc.body.textContent, /Core Mastodon features/);
  assert.match(doc.body.textContent, /Readability features/);
  assert.match(doc.body.textContent, /Creators:/);
  assert.match(doc.body.textContent, /Advanced user features/);
  for (const account of ['mawkingbird', 'mistersql']) {
    assert.equal(
      doc.querySelector(`a[href="https://mastodon.social/@${account}"]`),
      null,
      'identity metadata must not become visible navigation',
    );
    assert.ok(doc.head.querySelector(`link[rel="me"][href="https://mastodon.social/@${account}"]`));
  }
  const canonical = `https://mawkingbird.com/${page ? page + '/' : ''}`;
  assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), canonical);
  assert.equal(doc.querySelector('meta[property="og:url"]')?.getAttribute('content'), canonical);
  assert.equal(doc.querySelector('meta[name="robots"]')?.getAttribute('content'), 'index, follow');
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
const image = await readFile(path.join(root, 'mockingbird_hand.png'));
assert.equal(image.readUInt32BE(16), 3580);
assert.equal(image.readUInt32BE(20), 2508);
const sitemap = new JSDOM(await readFile(path.join(root, 'sitemap.xml'), 'utf8'), {
  contentType: 'text/xml',
}).window.document;
assert.deepEqual(
  [...sitemap.querySelectorAll('loc')].map((node) => node.textContent),
  ['https://mawkingbird.com/', 'https://mawkingbird.com/features/'],
);
assert.match(
  await readFile(path.join(root, 'robots.txt'), 'utf8'),
  /Sitemap: https:\/\/mawkingbird.com\/sitemap.xml/,
);
console.log('SEO HTML checks passed: content, canonicals, cards, verification links and sitemap.');
