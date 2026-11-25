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
const pagesDir = join(ui, 'src/app/public-pages/podcasts');
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
  assert(index?.version === 2 && Array.isArray(index.packs), 'invalid podcast index');
  const seen = new Set();
  for (const row of index.packs) {
    assert(safePath.test(row.path), `unsafe pack path ${row.path}`);
    assert(typeof row.title?.en === 'string', `${row.path}: missing title`);
    assert(!seen.has(row.path), `duplicate pack ${row.path}`);
    seen.add(row.path);
    const pack = getPack(row.path);
    assert(pack.version === 2 && pack.kind === 'podcasts', `${row.path}: invalid kind`);
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
        assert(['audio', 'video', null].includes(media.mediaType), `${row.path}: bad media type`);
        assert(
          media.kind !== 'full-player' ||
            ['soundcloud', 'mixcloud', 'direct-audio'].includes(media.source),
          `${row.path}: player cannot advance`,
        );
      }
      assert(
        Array.isArray(member.recentPosts) &&
          member.recentPosts.length > 0 &&
          member.recentPosts.length <= 2,
        `${row.path}: missing recent posts`,
      );
      for (const post of member.recentPosts) {
        assert(
          typeof post.statusId === 'string' && post.statusId.length > 0,
          `${row.path}: bad status ID`,
        );
        assert(
          post.server !== null &&
            validUrl(post.server) &&
            post.postUrl !== null &&
            validUrl(post.postUrl),
          `${row.path}: bad post reference`,
        );
        assert(
          typeof post.text === 'string' && [...post.text].length <= 400,
          `${row.path}: bad post text`,
        );
        assert(
          typeof post.spoilerText === 'string' &&
            [...post.spoilerText].length <= 200 &&
            typeof post.sensitive === 'boolean',
          `${row.path}: bad content warning`,
        );
        assert(Array.isArray(post.sources) && post.sources.length, `${row.path}: no post source`);
        for (const source of post.sources) {
          assert(source.url !== null && validUrl(source.url), `${row.path}: bad source URL`);
          assert(
            ['audio', 'video', null].includes(source.mediaType),
            `${row.path}: bad source media type`,
          );
          assert(
            ['native', 'full-player', 'outgoing', 'short'].includes(source.kind),
            `${row.path}: bad source kind`,
          );
        }
      }
    }
  }
  return index.packs.length;
}

/** A kit this small would be a thin page. A page already published stays. */
export const MINIMUM_PUBLIC_SHOWS = 3;
const SOURCE_NAMES = {
  mastodon: 'Mastodon',
  youtube: 'YouTube',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  mixcloud: 'Mixcloud',
  'apple-podcasts': 'Apple Podcasts',
  'apple-music': 'Apple Music',
};
const plain = (text) =>
  text
    .replace(/:(?=[^:]*[a-z])[a-z0-9_+-]+:/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

/** A topic's path segment: English keeps the category, others spell the name in ASCII. */
export function publicSlug(category, title, lang) {
  if (lang === 'en') return category;
  const ascii = title
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/[ -]+/g, '-');
  return ascii || category;
}

/**
 * What the public, indexed pages show: kits with enough shows, in each language
 * that has a hub.
 *
 * Profiles and where a show shares, never post text: Mastodon posts are not made
 * searchable here (ops/engineering/seo.md, "Podcasts on Mastodon"). Addresses are
 * permanent, so a published kit keeps its page and its address while it has a
 * show, and one that empties stops the import instead of becoming a dead link.
 */
export function publicPages(index, getPack, hubs, published = {}) {
  const data = Object.fromEntries(
    Object.keys(hubs).map((lang) => [
      lang,
      { version: 1, lang, generatedAt: index.generatedAt, packs: [] },
    ]),
  );
  const kits = {};
  for (const row of index.packs) {
    if (!hubs[row.lang]) continue;
    const address = published[row.category]?.[row.lang];
    if (row.size < MINIMUM_PUBLIC_SHOWS && !address) continue;
    const title = row.title[row.lang] ?? row.title.en;
    const path = address ?? `${hubs[row.lang].path}/${publicSlug(row.category, title, row.lang)}`;
    data[row.lang].packs.push({
      category: row.category,
      title,
      icon: row.icon,
      path,
      members: getPack(row.path).members.map((member) => ({
        acct: member.acct,
        url: member.url,
        displayName: plain(member.displayName) || member.acct,
        avatar: member.avatar,
        bot: member.bot,
        bio: plain(member.bio),
        showUrl: member.showUrl,
        sources: [
          ...new Set(member.media.map((item) => SOURCE_NAMES[item.source]).filter(Boolean)),
        ],
      })),
    });
    (kits[row.category] ??= {})[row.lang] = path;
  }
  for (const [lang, file] of Object.entries(data))
    file.packs.sort((x, y) => x.title.localeCompare(y.title, lang));
  for (const [category, editions] of Object.entries(published))
    for (const [lang, path] of Object.entries(editions))
      assert(
        kits[category]?.[lang],
        `${category} (${lang}): its public page /${path}/ would become a dead link`,
      );
  const sorted = Object.keys(kits).sort();
  return {
    data,
    paths: {
      generatedAt: index.generatedAt,
      kits: Object.fromEntries(sorted.map((category) => [category, kits[category]])),
    },
  };
}

const readHubs = (directory) =>
  Object.fromEntries(
    Object.entries(read(join(directory, 'podcast-hubs.json'))).filter(
      ([key]) => key !== '$comment',
    ),
  );
const pageFiles = (pages) => ({
  'podcast-paths.generated.json': JSON.stringify(pages.paths, null, 1) + '\n',
  ...Object.fromEntries(
    Object.entries(pages.data).map(([lang, file]) => [
      `data/${lang}.json`,
      JSON.stringify(file) + '\n',
    ]),
  ),
});
const publishedKits = (directory) => {
  const file = join(directory, 'podcast-paths.generated.json');
  return existsSync(file) ? read(file).kits : {};
};
const buildPages = (from, to) =>
  publicPages(
    read(join(from, 'index.json')),
    (path) => read(join(from, path)),
    readHubs(to),
    publishedKits(to),
  );
const pageCount = (pages) =>
  Object.values(pages.data).reduce((sum, file) => sum + file.packs.length, 0);

/** Regenerate the public pages' files from the kits already shipped. */
export function updatePages(from = destination, to = pagesDir) {
  const pages = buildPages(from, to);
  mkdirSync(join(to, 'data'), { recursive: true });
  for (const [name, text] of Object.entries(pageFiles(pages))) writeFileSync(join(to, name), text);
  return pageCount(pages);
}

export function checkPages(from = destination, to = pagesDir) {
  const pages = buildPages(from, to);
  for (const [name, text] of Object.entries(pageFiles(pages)))
    assert(
      existsSync(join(to, name)) &&
        readFileSync(join(to, name), 'utf8').replaceAll('\r\n', '\n') === text,
      `${name} is out of date: node scripts/import-podcasts.mjs --pages`,
    );
  return pageCount(pages);
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
  if (process.argv.includes('--pages')) console.log(`Podcast pages: ${updatePages()}`);
  else if (process.argv.includes('--check'))
    console.log(`Podcast kits: ${check()} packs, ${checkPages()} public pages`);
  else
    console.log(
      `Podcast kits: ${update(process.argv[2] ?? source)} packs, ${updatePages()} public pages`,
    );
}
