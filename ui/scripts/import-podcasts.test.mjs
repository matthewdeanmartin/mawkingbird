import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { check, publicPages, publicSlug, update, validate } from './import-podcasts.mjs';

const row = {
  category: 'science',
  lang: 'en',
  size: 1,
  path: 'en/science.json',
  title: { en: 'Science' },
  icon: '🔬',
};
const index = { version: 2, generatedAt: '2026-11-19', languages: { en: 1 }, packs: [row] };
const pack = {
  version: 2,
  kind: 'podcasts',
  category: 'science',
  lang: 'en',
  members: [
    {
      acct: 'show@example.social',
      url: 'https://example.social/@show',
      avatar: null,
      showUrl: null,
      media: [
        {
          kind: 'native',
          source: 'mastodon',
          mediaType: 'audio',
          postUrl: 'https://example.social/@show/1',
        },
      ],
      recentPosts: [
        {
          statusId: '1',
          server: 'https://example.social',
          postUrl: 'https://example.social/@show/1',
          createdAt: '2026-11-19',
          text: 'New episode',
          spoilerText: '',
          sensitive: false,
          sources: [
            {
              kind: 'native',
              source: 'mastodon',
              url: 'https://files.example/episode.mp3',
              mediaType: 'audio',
            },
          ],
        },
      ],
    },
  ],
};

test('imports a reviewed kit and checks the shipped copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'mb-podcasts-'));
  try {
    const source = join(root, 'source');
    const out = join(root, 'out');
    mkdirSync(join(source, 'en'), { recursive: true });
    writeFileSync(join(source, 'index.json'), JSON.stringify(index));
    writeFileSync(join(source, row.path), JSON.stringify(pack));
    assert.equal(update(source, out), 1);
    assert.equal(check(out), 1);
    assert.equal(
      JSON.parse(readFileSync(join(out, row.path), 'utf8')).members[0].acct,
      'show@example.social',
    );
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'mb-podcasts-')));
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects traversal and a claimed full player that Radio cannot advance', () => {
  assert.throws(
    () => validate({ ...index, packs: [{ ...row, path: '../other.json' }] }, () => pack),
    /unsafe pack path/,
  );
  const bad = structuredClone(pack);
  bad.members[0].media[0] = {
    kind: 'full-player',
    source: 'youtube',
    mediaType: null,
    postUrl: 'https://example.social/@show/1',
  };
  assert.throws(() => validate(index, () => bad), /player cannot advance/);
  const missing = structuredClone(pack);
  missing.members[0].recentPosts = [];
  assert.throws(() => validate(index, () => missing), /missing recent posts/);
});

const hubs = {
  en: { path: 'podcasts-on-mastodon', label: 'Podcasts on Mastodon' },
  de: { path: 'de/podcasts-auf-mastodon', label: 'Podcasts auf Mastodon' },
};

test('public pages take kits with enough shows in a hub language, and never post text', () => {
  const kit = (size) => ({
    ...pack,
    members: Array.from({ length: size }, (_, i) => ({
      ...pack.members[0],
      acct: `show${i}@example.social`,
      displayName: 'A  Show :podcast:',
      bio: 'About :blobcat: things at 12:30:45',
      bot: false,
    })),
  });
  const rows = [
    { ...row, size: 3 },
    { ...row, category: 'music', path: 'en/music.json', title: { en: 'Music' }, size: 2 },
    {
      ...row,
      lang: 'de',
      category: 'civic-life',
      path: 'de/civic-life.json',
      title: { en: 'Civic Life', de: 'Bürgergesellschaft' },
      size: 3,
    },
    { ...row, lang: 'fr', path: 'fr/science.json', size: 9 },
  ];
  const get = (path) => kit(rows.find((entry) => entry.path === path).size);
  const { data, paths } = publicPages({ ...index, packs: rows }, get, hubs);
  assert.deepEqual(paths.kits, {
    'civic-life': { de: 'de/podcasts-auf-mastodon/buergergesellschaft' },
    science: { en: 'podcasts-on-mastodon/science' },
  });
  const show = data.en.packs[0].members[0];
  assert.deepEqual(Object.keys(show).sort(), [
    'acct',
    'avatar',
    'bio',
    'bot',
    'displayName',
    'showUrl',
    'sources',
    'url',
  ]);
  assert.equal(show.displayName, 'A Show');
  assert.equal(show.bio, 'About things at 12:30:45');
  assert.deepEqual(show.sources, ['Mastodon']);
  assert.equal(data.de.packs[0].title, 'Bürgergesellschaft');
  assert.doesNotMatch(JSON.stringify(data), /New episode/);
});

test('a published page keeps its address while its kit has a show, and cannot vanish quietly', () => {
  const published = { science: { en: 'podcasts-on-mastodon/old-address' } };
  const small = { ...index, packs: [{ ...row, size: 1 }] };
  const member = { ...pack.members[0], displayName: 'Show', bio: '', bot: false };
  const get = () => ({ ...pack, members: [member] });
  assert.equal(
    publicPages(small, get, hubs, published).data.en.packs[0].path,
    'podcasts-on-mastodon/old-address',
  );
  assert.equal(publicPages(small, get, hubs).data.en.packs.length, 0);
  assert.throws(() => publicPages({ ...index, packs: [] }, get, hubs, published), /dead link/);
});

test('addresses spell German in ASCII the German way', () => {
  assert.equal(publicSlug('civic-life', 'Bürgergesellschaft', 'de'), 'buergergesellschaft');
  assert.equal(
    publicSlug('news', 'Nachrichten und Journalismus', 'de'),
    'nachrichten-und-journalismus',
  );
  assert.equal(publicSlug('film-and-tv', 'Film and TV', 'en'), 'film-and-tv');
});
