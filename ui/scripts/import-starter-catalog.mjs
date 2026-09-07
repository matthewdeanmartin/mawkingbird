#!/usr/bin/env node
// Import a published catalogue snapshot. No crawls or browser-side cross-origin requests.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(ui, 'src/app/starter-catalog.generated.json');
const args = process.argv.slice(2);
const check = args.includes('--check');
const source = resolve(
  args.find((arg) => !arg.startsWith('--')) ?? join(ui, '../../mawkingbird_starters/catalog'),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const safeName = (value) => typeof value === 'string' && /^[a-z0-9_-]+$/.test(value);
const https = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const textMap = (map) =>
  map &&
  typeof map.en === 'string' &&
  Object.values(map).every((value) => typeof value === 'string');

export function validateCatalog(catalog) {
  assert(
    catalog.version === 1 && Number.isFinite(Date.parse(catalog.generatedAt)),
    'Unsupported catalogue version or date',
  );
  assert(Array.isArray(catalog.packs) && catalog.packs.length > 0, 'Empty catalogue');
  const ids = new Set();
  for (const pack of catalog.packs) {
    assert(safeName(pack.slug) && /^[a-z]{2,3}$/.test(pack.lang), 'Invalid pack identity');
    const id = `${pack.lang}/${pack.slug}`;
    assert(!ids.has(id), `Duplicate pack: ${id}`);
    ids.add(id);
    assert(textMap(pack.title) && textMap(pack.blurb), `Invalid text: ${id}`);
    assert(Array.isArray(pack.accounts) && pack.accounts.length > 0, `Empty pack: ${id}`);
    const handles = new Set();
    for (const account of pack.accounts) {
      assert(
        typeof account.acct === 'string' && /^[^@\s]+@[^@\s/]+$/.test(account.acct),
        `Invalid handle: ${id}`,
      );
      assert(
        typeof account.id === 'string' && /^\d+$/.test(account.id),
        `Missing home-instance ID: ${account.acct}`,
      );
      assert(
        https(account.url) && (!account.avatar || https(account.avatar)),
        `Invalid URL: ${account.acct}`,
      );
      assert(!handles.has(account.acct.toLowerCase()), `Duplicate member: ${account.acct}`);
      assert(
        typeof account.displayName === 'string' &&
          typeof account.note === 'string' &&
          typeof account.avatar === 'string' &&
          typeof account.bot === 'boolean' &&
          Number.isFinite(account.followers) &&
          account.followers >= 0,
        `Invalid profile: ${account.acct}`,
      );
      handles.add(account.acct.toLowerCase());
    }
  }
}

export function importCatalog(directory) {
  const read = (path) => JSON.parse(readFileSync(join(directory, path), 'utf8'));
  const index = read('index.json');
  assert(index.version === 1 && Array.isArray(index.profileShards), 'Unsupported catalogue index');
  const profiles = {};
  for (const shard of index.profileShards) {
    assert(safeName(shard), 'Invalid profile shard');
    Object.assign(profiles, read(`profiles/${shard}.json`));
  }
  const packs = index.packs
    .map((entry) => {
      assert(safeName(entry.slug) && /^[a-z]{2,3}$/.test(entry.lang), 'Invalid index entry');
      assert(entry.path === `packs/${entry.lang}/${entry.slug}.json`, 'Unexpected pack path');
      const pack = read(entry.path);
      assert(pack.slug === entry.slug && pack.lang === entry.lang, 'Pack/index identity mismatch');
      assert(pack.members.length === entry.size, 'Pack/index membership mismatch');
      // Missing profiles are removals, never resurrected from a previous snapshot.
      const accounts = pack.members.flatMap((member) => {
        const profile = profiles[member.acct.toLowerCase()];
        return profile ? [{ ...profile, acct: member.acct, id: member.id }] : [];
      });
      return {
        slug: pack.slug,
        lang: pack.lang,
        title: pack.title,
        blurb: pack.blurb,
        icon: pack.icon,
        accounts,
      };
    })
    .filter((pack) => pack.accounts.length);
  const catalog = { version: index.version, generatedAt: index.generatedAt, packs };
  validateCatalog(catalog);
  return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (check) {
    validateCatalog(JSON.parse(readFileSync(target, 'utf8')));
    console.log('Bundled starter catalogue is valid (offline check).');
  } else {
    const catalog = importCatalog(source);
    writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(
      `Bundled ${catalog.packs.length} packs in ${new Set(catalog.packs.map((pack) => pack.lang)).size} languages.`,
    );
  }
}
