import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountUrl, normalizeHandle, subscribeUrl } from '../src/lib/links.js';
import { collectPageFacts, interpretPageFacts } from '../src/lib/page-scan.js';

const BASE = 'https://mawkingbird.com/';

test('subscribeUrl opens Paste a link with a feed or a page', () => {
  const url = new URL(subscribeUrl(BASE, 'https://blog.example/feed.xml'));
  assert.equal(url.pathname, '/rss/add');
  assert.equal(url.searchParams.get('url'), 'https://blog.example/feed.xml');
  assert.equal(subscribeUrl(BASE, 'about:blank'), null);
  assert.equal(subscribeUrl(BASE, 'javascript:alert(1)'), null);
});

test('normalizeHandle and accountUrl', () => {
  assert.equal(normalizeHandle('@ana@Hachyderm.IO'), 'ana@hachyderm.io');
  assert.equal(normalizeHandle(' ana@mastodon.social '), 'ana@mastodon.social');
  for (const bad of ['ana', '@ana', 'ana@localhost', '@a b@x.y', 'https://x.y/@ana', '', null]) {
    assert.equal(normalizeHandle(bad), null, String(bad));
  }
  assert.equal(accountUrl(BASE, '@ana@hachyderm.io'), 'https://mawkingbird.com/@ana@hachyderm.io');
  assert.equal(accountUrl(BASE, 'nope'), null);
});

test('feeds: declared feed types only, deduplicated, comments last, capped', () => {
  const page = interpretPageFacts({
    url: 'https://blog.example/post',
    alternates: [
      { type: 'application/rss+xml', href: 'https://blog.example/comments/feed', title: 'Comments Feed' },
      { type: 'application/rss+xml', href: 'https://blog.example/feed', title: 'Blog' },
      { type: 'APPLICATION/ATOM+XML', href: 'https://blog.example/atom.xml', title: '' },
      { type: 'application/rss+xml', href: 'https://blog.example/feed', title: 'Duplicate' },
      { type: 'text/html', href: 'https://blog.example/fr/', title: 'Français' },
      { type: 'application/rss+xml', href: 'javascript:alert(1)', title: 'Bad' },
      { type: 'application/feed+json', href: 'https://blog.example/feed.json', title: 'JSON' },
    ],
  });
  assert.deepEqual(
    page.feeds.map((f) => f.url),
    [
      'https://blog.example/feed',
      'https://blog.example/atom.xml',
      'https://blog.example/feed.json',
      'https://blog.example/comments/feed',
    ],
  );

  const many = interpretPageFacts({
    url: 'https://a.example/',
    alternates: Array.from({ length: 20 }, (_, i) => ({
      type: 'application/rss+xml',
      href: `https://a.example/${i}.xml`,
    })),
  });
  assert.equal(many.feeds.length, 5);
});

test('authors from fediverse:creator first, then rel=me profiles, deduplicated', () => {
  const page = interpretPageFacts({
    url: 'https://news.example/story',
    creators: ['@ana@hachyderm.io', 'not a handle', '@Ana@HACHYDERM.io'],
    relMe: [
      'https://mastodon.social/@ben',
      'https://mastodon.social/@ben/1234',
      'https://github.com/ben',
      'https://bsky.app/profile/ben.example',
    ],
  });
  assert.deepEqual(page.authors, [
    { handle: 'ana@hachyderm.io', source: 'creator' },
    { handle: 'ben@mastodon.social', source: 'rel-me' },
  ]);
});

test('tolerates junk from the page', () => {
  const page = interpretPageFacts({
    url: 42,
    title: { toString: () => 'x' },
    selection: 'x'.repeat(9000),
    alternates: 'nope',
    creators: [null, 7],
    relMe: [{}],
  });
  assert.equal(page.url, '');
  assert.equal(page.title, '');
  assert.equal(page.selection.length, 5000);
  assert.deepEqual(page.feeds, []);
  assert.deepEqual(page.authors, []);
  assert.equal(page.deepLinkable, false);
  assert.deepEqual(interpretPageFacts(null).feeds, []);
});

test('marks Mastodon pages as openable in Mawkingbird', () => {
  assert.equal(interpretPageFacts({ url: 'https://hachyderm.io/@ana/42' }).deepLinkable, true);
  assert.equal(interpretPageFacts({ url: 'https://blog.example/' }).deepLinkable, false);
});

test('collectPageFacts is self-contained (it is serialised into the page)', () => {
  // A minimal stand-in for the page's globals; anything else it touched would throw.
  const element = (attrs, href) => ({ getAttribute: (name) => attrs[name] ?? null, href });
  const selectors = {
    'link[rel~="alternate" i][href]': [
      element({ type: 'application/RSS+xml', title: ' Blog ' }, 'https://blog.example/feed'),
    ],
    'meta[name="fediverse:creator" i][content]': [element({ content: '@ana@hachyderm.io' })],
    'a[rel~="me" i][href], link[rel~="me" i][href]': [element({}, 'https://mastodon.social/@ben')],
  };
  const fn = new Function(
    'document',
    'location',
    'globalThis',
    `return (${collectPageFacts.toString()})();`,
  );
  const facts = fn(
    { title: ' A post ', querySelectorAll: (s) => selectors[s] ?? [] },
    { href: 'https://blog.example/post' },
    { getSelection: () => ' picked ' },
  );
  assert.deepEqual(facts, {
    url: 'https://blog.example/post',
    title: 'A post',
    selection: 'picked',
    alternates: [{ type: 'application/rss+xml', href: 'https://blog.example/feed', title: 'Blog' }],
    creators: ['@ana@hachyderm.io'],
    relMe: ['https://mastodon.social/@ben'],
  });
});
