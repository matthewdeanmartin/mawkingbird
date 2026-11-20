import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { check, update, validate } from './import-podcasts.mjs';

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
