#!/usr/bin/env node
// Copy reviewed podcast kits into lazy static assets for Radio.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(ui, 'public/podcast-kits');
const source = resolve(ui, '../../mawkingbird_starters/catalog/podcasts');
const safePath = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?\/[a-z0-9-]+\.json$/;
const validUrl = (value) => {
  if (value === null) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

export function validate(index, getPack) {
  assert(index?.version === 1 && Array.isArray(index.packs), 'invalid podcast index');
  const seen = new Set();
  for (const row of index.packs) {
    assert(safePath.test(row.path), `unsafe pack path ${row.path}`);
    assert(typeof row.title?.en === 'string', `${row.path}: missing title`);
    assert(!seen.has(row.path), `duplicate pack ${row.path}`);
    seen.add(row.path);
    const pack = getPack(row.path);
    assert(pack.version === 1 && pack.kind === 'podcasts', `${row.path}: invalid kind`);
    assert(pack.lang === row.lang && pack.category === row.category, `${row.path}: mismatch`);
    assert(pack.members?.length === row.size, `${row.path}: count mismatch`);
    for (const member of pack.members) {
      assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(member.acct), `${row.path}: bad account`);
      assert(
        validUrl(member.url) && validUrl(member.avatar) && validUrl(member.showUrl),
        `${row.path}: bad URL`,
      );
      assert(Array.isArray(member.media) && member.media.length, `${row.path}: no media`);
      for (const media of member.media) {
        assert(
          ['native', 'full-player', 'outgoing', 'short'].includes(media.kind),
          `${row.path}: bad media kind`,
        );
        assert(validUrl(media.postUrl) && media.postUrl !== null, `${row.path}: bad post URL`);
        assert(
          media.kind !== 'full-player' ||
            ['soundcloud', 'mixcloud', 'direct-audio'].includes(media.source),
          `${row.path}: player cannot advance`,
        );
      }
    }
  }
  return index.packs.length;
}

export function check(directory = destination) {
  if (!existsSync(join(directory, 'index.json'))) return 0;
  const index = read(join(directory, 'index.json'));
  return validate(index, (path) => read(join(directory, path)));
}

export function update(from = source, to = destination) {
  const index = read(join(from, 'index.json'));
  const count = validate(index, (path) => read(join(from, path)));
  mkdirSync(to, { recursive: true });
  const desired = new Set(['index.json', ...index.packs.map((row) => row.path)]);
  for (const language of readdirSync(to, { withFileTypes: true })) {
    if (!language.isDirectory()) continue;
    for (const name of readdirSync(join(to, language.name))) {
      const relative = `${language.name}/${name}`;
      if (!desired.has(relative) && safePath.test(relative)) unlinkSync(join(to, relative));
    }
  }
  for (const row of index.packs) {
    const target = join(to, row.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(from, row.path)));
  }
  writeFileSync(join(to, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  return count;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = process.argv.includes('--check') ? check() : update(process.argv[2] ?? source);
  console.log(`Podcast kits: ${count} packs`);
}
