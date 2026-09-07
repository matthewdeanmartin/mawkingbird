import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { importCatalog, validateCatalog } from './import-starter-catalog.mjs';

test('imports current profiles only, keeps language identities, rejects corrupt snapshots', () => {
  const root = mkdtempSync(join(tmpdir(), 'starter-catalog-'));
  const write = (file, data) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), JSON.stringify(data));
  };
  const member = { acct: 'alice@example.social', id: '123' };
  const profile = {
    acct: member.acct,
    displayName: 'Alice',
    note: '',
    avatar: '',
    url: 'https://example.social/@alice',
    followers: 10,
    bot: false,
  };
  const index = {
    version: 1,
    generatedAt: '2026-09-05T00:00:00Z',
    profileShards: ['a'],
    packs: ['de', 'en'].map((lang) => ({
      slug: 'technology',
      lang,
      size: 2,
      path: `packs/${lang}/technology.json`,
    })),
  };
  try {
    write('index.json', index);
    write('profiles/a.json', { [member.acct]: profile });
    for (const entry of index.packs)
      write(entry.path, {
        ...entry,
        title: { en: 'Technology', de: 'Technologie' },
        blurb: { en: 'Software' },
        members: [member, { acct: 'removed@example.social', id: '456' }],
      });
    const catalog = importCatalog(root);
    assert.equal(catalog.packs.length, 2);
    assert.deepEqual(
      catalog.packs.map((pack) => pack.lang),
      ['de', 'en'],
    );
    assert.deepEqual(
      catalog.packs[0].accounts.map((account) => account.acct),
      [member.acct],
    );
    assert.equal(catalog.packs[0].accounts[0].id, '123');
    assert.throws(() => validateCatalog({ ...catalog, version: 2 }), /version/);
    assert.throws(
      () => validateCatalog({ ...catalog, packs: [catalog.packs[0], catalog.packs[0]] }),
      /Duplicate pack/,
    );
    catalog.packs[0].accounts[0].id = '';
    assert.throws(() => validateCatalog(catalog), /home-instance ID/);
    write('index.json', { ...index, packs: [{ ...index.packs[0], path: '../private.json' }] });
    assert.throws(() => importCatalog(root), /Unexpected pack path/);
  } finally {
    rmSync(root, { recursive: true });
  }
});
