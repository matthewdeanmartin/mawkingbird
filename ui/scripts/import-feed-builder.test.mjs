import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPaths, validatePage } from './import-feed-builder.mjs';

const person = (overrides = {}) => ({
  acct: 'ada@example.social',
  id: '109',
  url: 'https://example.social/@ada',
  displayName: 'Ada',
  avatar: 'https://example.social/a.png',
  bio: 'Writes space opera',
  shelf: 'notable',
  rank: 1,
  fame: ['wikipedia'],
  elsewhere: ['bluesky'],
  ...overrides,
});

const page = (overrides = {}) => ({
  version: 1,
  topic: 'science-fiction',
  lang: 'it',
  status: 'reviewed',
  generatedAt: '2026-11-04T00:00:00+00:00',
  tags: [
    { name: 'Fantascienza', lang: 'it', kind: 'tag' },
    { name: 'StarWars', lang: 'en', kind: 'tag', caution: 'spam' },
    { name: 'LibriFantasy', lang: 'it', kind: 'future', source: 'FantasyBooks', status: 'new' },
  ],
  people: [person()],
  servers: [{ domain: 'wandering.shop' }],
  ...overrides,
});

test('accepts a reviewed page, and a draft only when asked to', () => {
  assert.equal(validatePage(page()).lang, 'it');
  assert.throws(() => validatePage(page({ status: 'draft' })), /not publishable/);
  assert.equal(validatePage(page({ status: 'draft' }), { allowDraft: true }).status, 'draft');
});

test('every field is allow-listed, so nothing private can slip through', () => {
  assert.throws(() => validatePage(page({ followers: 10 })), /unexpected field "followers"/);
  assert.throws(
    () => validatePage(page({ people: [person({ followers_count: 3000 })] })),
    /unexpected field "followers_count"/,
  );
  assert.throws(
    () =>
      validatePage(
        page({
          people: [
            person({ youtube: { channelId: 'UC' + 'a'.repeat(22), native: true, subscribers: 9 } }),
          ],
        }),
      ),
    /unexpected field "subscribers"/,
  );
});

test('accepts forty distinct tags and rejects a larger selection', () => {
  const tags = Array.from({ length: 40 }, (_, i) => ({
    name: `Topic${i}`,
    lang: 'en',
    kind: 'tag',
  }));
  assert.equal(validatePage(page({ tags })).tags.length, 40);
  assert.throws(
    () => validatePage(page({ tags: [...tags, { name: 'Overflow', lang: 'en', kind: 'tag' }] })),
    /invalid tags/,
  );
});

test('rejects malformed people and tags', () => {
  assert.throws(() => validatePage(page({ people: [person({ id: '' })] })), /home-instance ID/);
  assert.throws(() => validatePage(page({ people: [person({ url: 'http://x/@a' })] })), /URL/);
  assert.throws(() => validatePage(page({ people: [person({ shelf: 'fans' })] })), /shelf/);
  assert.throws(() => validatePage(page({ people: [person({ fame: ['famous'] })] })), /fame/);
  assert.throws(() => validatePage(page({ people: [] })), /no people/);
  assert.throws(
    () => validatePage(page({ tags: [{ name: '#SciFi', lang: 'en', kind: 'tag' }] })),
    /tag name/,
  );
  assert.throws(
    () => validatePage(page({ tags: [{ name: 'X', lang: 'it', kind: 'future' }] })),
    /needs a source and status/,
  );
});

test('accepts both follower prominence badges without exposing private follower counts', () => {
  for (const fame of [['followers-625'], ['followers-2500']]) {
    assert.deepEqual(validatePage(page({ people: [person({ fame })] })).people[0].fame, fame);
  }
});

test('a bio is measured in characters, not UTF-16 units', () => {
  const emoji = '🚀'.repeat(200);
  assert.equal(validatePage(page({ people: [person({ bio: emoji })] })).people[0].bio, emoji);
  assert.throws(() => validatePage(page({ people: [person({ bio: `${emoji}x` })] })), /bio/);
});

test('every bundled page has a path and every path a bundled page', () => {
  const paths = { 'science-fiction': { en: 'science-fiction-on-mastodon', it: 'it/x' } };
  checkPaths(paths, ['science-fiction.en.json', 'science-fiction.it.json']);
  assert.throws(() => checkPaths(paths, ['science-fiction.en.json']), /not bundled/);
  assert.throws(
    () => checkPaths(paths, ['science-fiction.en.json', 'science-fiction.it.json', 'x.de.json']),
    /has no path/,
  );
});
