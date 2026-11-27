import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appUrl,
  deepLinkFor,
  deepLinkPath,
  isShareablePageUrl,
  liteUrl,
  normalizeBase,
  postsAboutUrl,
  quotedText,
  shareUrl,
} from '../src/lib/links.js';

const BASE = 'https://mawkingbird.com/';

test('normalizeBase accepts https and loopback http only', () => {
  assert.equal(normalizeBase('https://mawkingbird.com'), BASE);
  assert.equal(normalizeBase('https://mawkingbird.com/test'), 'https://mawkingbird.com/test/');
  assert.equal(normalizeBase('https://mawkingbird.com/test/?x=1#y'), 'https://mawkingbird.com/test/');
  assert.equal(normalizeBase('http://localhost:4200'), 'http://localhost:4200/');
  assert.equal(normalizeBase('http://127.0.0.1:4200/'), 'http://127.0.0.1:4200/');
  assert.equal(normalizeBase('http://example.com/'), null);
  assert.equal(normalizeBase('https://user:pw@example.com/'), null);
  assert.equal(normalizeBase('javascript:alert(1)'), null);
  assert.equal(normalizeBase(''), null);
  assert.equal(normalizeBase(undefined), null);
});

test('app URLs stay under the base, including a subpath deployment', () => {
  assert.equal(liteUrl(BASE), 'https://mawkingbird.com/m/');
  assert.equal(liteUrl('https://mawkingbird.com/test/'), 'https://mawkingbird.com/test/m/');
  assert.equal(appUrl('not a url', 'm/'), 'https://mawkingbird.com/m/');
});

test('shareUrl carries title and url, drops empties and non-web URLs', () => {
  const url = new URL(shareUrl(BASE, { title: ' A page ', url: 'https://example.com/a?b=1' }));
  assert.equal(url.pathname, '/share');
  assert.equal(url.searchParams.get('title'), 'A page');
  assert.equal(url.searchParams.get('url'), 'https://example.com/a?b=1');
  assert.equal(url.searchParams.has('text'), false);

  const local = new URL(shareUrl(BASE, { title: 'Settings', url: 'about:preferences' }));
  assert.equal(local.searchParams.has('url'), false);
});

test('quotes the selection and caps very long ones', () => {
  assert.equal(quotedText('  hello  '), '\u201Chello\u201D');
  assert.equal(quotedText('   '), '');
  const long = quotedText('x'.repeat(6000));
  assert.ok(long.length <= 5002);
  assert.ok(long.endsWith('\u2026\u201D'));
});

test('postsAboutUrl', () => {
  const url = new URL(postsAboutUrl(BASE, 'https://example.com/story'));
  assert.equal(url.pathname, '/link');
  assert.equal(url.searchParams.get('url'), 'https://example.com/story');
});

test('isShareablePageUrl', () => {
  assert.equal(isShareablePageUrl('https://example.com/'), true);
  assert.equal(isShareablePageUrl('http://example.com/'), true);
  for (const url of ['about:blank', 'moz-extension://x/y', 'file:///c:/a', 'view-source:https://a.b', '']) {
    assert.equal(isShareablePageUrl(url), false, url);
  }
});

test('Mastodon posts and profiles, matching the app route matchers', () => {
  const cases = [
    ['https://hachyderm.io/@ana/113000000000000001', 'hachyderm.io/@ana/113000000000000001'],
    ['https://hachyderm.io/@ana@mastodon.social/1130', 'hachyderm.io/@ana@mastodon.social/1130'],
    ['https://hachyderm.io/users/ana/statuses/1130', 'hachyderm.io/@ana/1130'],
    ['https://hachyderm.io/@ana', '@ana@hachyderm.io'],
    ['https://hachyderm.io/@ana@mastodon.social', '@ana@mastodon.social'],
    ['https://hachyderm.io/users/ana', '@ana@hachyderm.io'],
    ['https://hachyderm.io/@ana/media', '@ana@hachyderm.io'],
    ['https://hachyderm.io/@ana/following', '@ana@hachyderm.io'],
    ['https://akkoma.example/@ana/AbC123xyz', 'akkoma.example/@ana/AbC123xyz'],
    ['https://social.example:8443/@ana/42', 'social.example:8443/@ana/42'],
    ['https://Hachyderm.IO/@ana/42?x=1#reply', 'hachyderm.io/@ana/42'],
  ];
  for (const [input, expected] of cases) assert.equal(deepLinkPath(input), expected, input);
});

test('pages that are not posts or profiles get no deep link', () => {
  for (const url of [
    'https://hachyderm.io/',
    'https://hachyderm.io/about',
    'https://hachyderm.io/@ana/42/reblogs',
    'https://hachyderm.io/@ana/12-34',
    'https://hachyderm.io/@',
    'https://hachyderm.io/@a/b/c',
    'https://hachyderm.io/users/ana/followers',
    'https://localhost/@ana/1',
    'ftp://hachyderm.io/@ana/1',
    'not a url',
  ]) {
    assert.equal(deepLinkPath(url), null, url);
  }
});

test('Bluesky posts and profiles', () => {
  assert.equal(
    deepLinkPath('https://bsky.app/profile/ana.bsky.social/post/3kabc123'),
    'bsky/profile/ana.bsky.social/post/3kabc123',
  );
  assert.equal(
    deepLinkPath('https://bsky.app/profile/did:plc:abc123/post/3kabc123'),
    'bsky/profile/did:plc:abc123/post/3kabc123',
  );
  assert.equal(deepLinkPath('https://bsky.app/profile/ana.bsky.social'), 'bsky/profile/ana.bsky.social');
  assert.equal(deepLinkPath('https://bsky.app/profile/ana.bsky.social/lists/x'), null);
  assert.equal(deepLinkPath('https://bsky.app/'), null);
});

test('Twitter posts and profiles, on either hostname', () => {
  assert.equal(deepLinkPath('https://twitter.com/ana/status/12345'), 'twitter/ana/status/12345');
  assert.equal(deepLinkPath('https://x.com/ana/status/12345/photo/1'), 'twitter/ana/status/12345');
  assert.equal(deepLinkPath('https://mobile.twitter.com/ana'), 'twitter/ana');
  assert.equal(deepLinkPath('https://x.com/home'), null);
  assert.equal(deepLinkPath('https://x.com/i/flow/login'), null);
  assert.equal(deepLinkPath('https://x.com/ana/likes'), null);
  assert.equal(deepLinkPath('https://x.com/this_handle_is_too_long'), null);
});

test('deepLinkFor builds on the configured base', () => {
  assert.equal(
    deepLinkFor('https://mawkingbird.com/test/', 'https://hachyderm.io/@ana/42'),
    'https://mawkingbird.com/test/hachyderm.io/@ana/42',
  );
  assert.equal(deepLinkFor(BASE, 'https://example.com/'), null);
});

test('panelUrl follows the page without its #fragment', async () => {
  const { panelUrl, withoutHash } = await import('../src/lib/links.js');
  const url = new URL(panelUrl(BASE, { url: 'https://news.example/a?b=1#c', title: ' Story ' }));
  assert.equal(url.pathname, '/panel');
  assert.equal(url.searchParams.get('url'), 'https://news.example/a?b=1');
  assert.equal(url.searchParams.get('title'), 'Story');
  assert.equal(panelUrl(BASE, { url: 'about:newtab' }), 'https://mawkingbird.com/panel');
  assert.equal(withoutHash('https://a.example/#x'), 'https://a.example/');
});
