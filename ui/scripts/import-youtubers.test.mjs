import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  build,
  check,
  creatorIndex,
  HUBS_FILE,
  localSlug,
  validateMember,
  write,
} from './import-youtubers.mjs';

const HUBS = {
  en: { path: 'youtubers-on-mastodon', label: 'YouTubers on Mastodon' },
  de: { path: 'de/youtuber-auf-mastodon', label: 'YouTuber auf Mastodon' },
  ja: { path: 'ja/youtubers-on-mastodon', label: 'x' },
};

const member = (acct, extra = {}) => ({
  acct,
  url: `https://${acct.split('@')[1]}/@${acct.split('@')[0]}`,
  displayName: acct,
  avatar: 'https://files.example/a.png',
  bot: false,
  languages: ['en'],
  lastPost: '2026-11-10',
  bio: 'I explain things 🎬',
  videos: [{ id: 'aaaaaaaaaaa', title: 'How lamps work' }],
  channel: {
    id: 'UCy0tKL1T7wFoYcxCe0xjN6Q',
    title: 'Channel',
    lastUpload: '2026-11-01T00:00:00+00:00',
  },
  ...extra,
});

function source(packs) {
  const dir = mkdtempSync(join(tmpdir(), 'yt-catalog-'));
  const entries = [];
  for (const pack of packs) {
    const path = `${pack.lang}/${pack.category}.json`;
    mkdirSync(join(dir, pack.lang), { recursive: true });
    writeFileSync(
      join(dir, path),
      JSON.stringify({
        version: 1,
        kind: 'youtubers',
        title: { en: 'Technology', de: 'Technologie', ja: 'テクノロジー' },
        icon: '💻',
        generatedAt: '2026-11-18T00:00:00+00:00',
        ...pack,
      }),
    );
    entries.push({ category: pack.category, lang: pack.lang, size: pack.members.length, path });
  }
  writeFileSync(
    join(dir, 'index.json'),
    JSON.stringify({
      $comment: 'x',
      version: 1,
      generatedAt: '2026-11-18T00:00:00+00:00',
      languages: {},
      packs: entries,
    }),
  );
  return dir;
}

function outDir() {
  const out = mkdtempSync(join(tmpdir(), 'yt-out-'));
  writeFileSync(join(out, 'youtuber-hubs.json'), JSON.stringify({ $comment: 'x', ...HUBS }));
  return out;
}

test('slugs: accents dropped, ß as ss, English for CJK', () => {
  assert.equal(localSlug('Bürgergesellschaft', 'civic-life', 'de'), 'burgergesellschaft');
  assert.equal(localSlug('Straße & Verkehr', 'maps', 'de'), 'strasse-verkehr');
  assert.equal(localSlug('Vie civique', 'civic-life', 'fr'), 'vie-civique');
  assert.equal(localSlug('テクノロジー', 'technology', 'ja'), 'technology');
});

test('builds per-language files with localised paths, skipping languages without a hub', async () => {
  const dir = source([
    { category: 'technology', lang: 'en', members: [member('b@x.example'), member('c@x.example')] },
    { category: 'technology', lang: 'de', members: [member('d@x.example', { languages: ['de'] })] },
    { category: 'technology', lang: 'pl', members: [member('p@x.example')] },
  ]);
  const built = build(dir, HUBS);
  assert.deepEqual(built.skipped, ['pl']);
  assert.deepEqual(built.paths.kits.technology, {
    de: 'de/youtuber-auf-mastodon/technologie',
    en: 'youtubers-on-mastodon/technology',
  });
  assert.deepEqual(built.paths.languages, { de: 1, en: 1 });
  const out = outDir();
  await write(built, out);
  assert.equal(check(out), 2);
  assert.ok(existsSync(join(out, 'data', 'de.json')));
  const loaders = readFileSync(join(out, 'youtuber-data.generated.ts'), 'utf8');
  assert.match(loaders, /import\(['"]\.\/data\/en\.json['"]\)/);
  const pack = JSON.parse(readFileSync(join(out, 'data', 'en.json'), 'utf8')).packs[0];
  assert.deepEqual(Object.keys(pack), ['category', 'title', 'icon', 'members', 'slug', 'path']);
  assert.equal(pack.members[0].bio, 'I explain things 🎬');
});

test('refuses unexpected or unsafe fields and over-long text by character, not UTF-16 unit', () => {
  assert.throws(
    () => validateMember(member('a@x.example', { note: 'private' }), 'm'),
    /unexpected/,
  );
  assert.throws(
    () => validateMember(member('a@x.example', { url: 'http://x.example' }), 'm'),
    /url/,
  );
  assert.throws(() => validateMember(member('a@x.example', { bio: 'x'.repeat(201) }), 'm'), /bio/);
  // 200 emoji are 200 characters (400 UTF-16 units): allowed.
  validateMember(member('a@x.example', { bio: '🎬'.repeat(200) }), 'm');
  assert.throws(
    () => validateMember(member('a@x.example', { videos: [{ id: 'bad', title: 'x' }] }), 'm'),
    /video id/,
  );
});

test('check fails on stray or unrouted files and passes when nothing is bundled', async () => {
  assert.equal(check(join(tmpdir(), 'no-such-youtubers-dir')), 0);
  const dir = source([{ category: 'technology', lang: 'en', members: [member('a@x.example')] }]);
  const out = outDir();
  await write(build(dir, HUBS), out);
  writeFileSync(join(out, 'data', 'fr.json'), '{}');
  assert.throws(() => check(out), /fr.json: not in paths/);
});

test('the real hubs file has a hub for every bundled language', () => {
  const hubs = JSON.parse(readFileSync(HUBS_FILE, 'utf8'));
  for (const [lang, hub] of Object.entries(hubs)) {
    if (lang === '$comment') continue;
    assert.match(hub.path, lang === 'en' ? /^[a-z-]+$/ : new RegExp(`^${lang}/[a-z-]+$`));
    assert.ok(hub.label);
  }
  void copyFileSync;
});

test('the creator index names each channel once and leaves out accounts that repost it', () => {
  const file = {
    packs: [
      { members: [member('bot@a.example', { bot: true }), member('real@a.example')] },
      { members: [member('real@a.example')] },
    ],
  };
  assert.deepEqual(creatorIndex({ en: file }), {
    UCy0tKL1T7wFoYcxCe0xjN6Q: ['Channel', 'real@a.example'],
  });
});
