#!/usr/bin/env node
// Import Feed Builder topic pages from the private data repository's export.
// No crawls and no requests: it copies validated, publishable fields only.
//
//   node scripts/import-feed-builder.mjs [path/to/catalog/feedbuilder]   import
//   node scripts/import-feed-builder.mjs --check                          validate the bundle
//
// Drafts (exports the owner has not approved) are refused unless
// --allow-draft is given, and a bundled draft fails --check, so a draft can
// never reach a production build.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(ui, 'src/app/pages/feed-builder/data');
export const PATHS_FILE = join(ui, 'src/app/pages/feed-builder/feed-builder-paths.json');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const slug = (value) => typeof value === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
const language = (value) =>
  typeof value === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(value);
const https = (value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const onlyKeys = (object, allowed, where) => {
  for (const key of Object.keys(object))
    assert(allowed.includes(key), `${where}: unexpected field "${key}"`);
};

const FAME = ['wikidata', 'wikipedia', 'youtube-10k', 'followers-2500'];
const ELSEWHERE = ['bluesky', 'youtube', 'twitch', 'patreon', 'podcast', 'website'];
const SHELVES = ['youtube', 'notable', 'community'];
const BANDS = ['<1k', '1k+', '10k+', '100k+', '1M+'];

/** Validate one exported page. Every field is allow-listed: nothing private slips through. */
export function validatePage(page, { allowDraft = false } = {}) {
  const where = `${page?.topic}/${page?.lang}`;
  onlyKeys(
    page,
    ['version', 'topic', 'lang', 'status', 'generatedAt', 'tags', 'people', 'servers'],
    where,
  );
  assert(page.version === 1, `${where}: unsupported version`);
  assert(slug(page.topic) && language(page.lang), `${where}: invalid identity`);
  assert(Number.isFinite(Date.parse(page.generatedAt)), `${where}: invalid date`);
  assert(
    page.status === 'reviewed' || (allowDraft && page.status === 'draft'),
    `${where}: status "${page.status}" is not publishable (approve it in mawkingbird_starters)`,
  );
  assert(Array.isArray(page.tags) && page.tags.length <= 40, `${where}: invalid tags`);
  const tagNames = new Set();
  for (const tag of page.tags) {
    onlyKeys(tag, ['name', 'lang', 'kind', 'source', 'status', 'caution'], `${where} tag`);
    assert(typeof tag.name === 'string' && /^[^#\s]+$/u.test(tag.name), `${where}: tag name`);
    assert(!tagNames.has(tag.name.toLowerCase()), `${where}: duplicate tag ${tag.name}`);
    tagNames.add(tag.name.toLowerCase());
    assert(language(tag.lang), `${where}: tag language`);
    assert(tag.kind === 'tag' || tag.kind === 'future', `${where}: tag kind`);
    if (tag.kind === 'future')
      assert(
        typeof tag.source === 'string' && ['starting', 'new'].includes(tag.status),
        `${where}: future tag ${tag.name} needs a source and status`,
      );
    assert(
      tag.caution === undefined || ['spam', 'off-topic'].includes(tag.caution),
      `${where}: caution`,
    );
  }
  assert(Array.isArray(page.people) && page.people.length > 0, `${where}: no people`);
  const handles = new Set();
  for (const person of page.people) {
    onlyKeys(
      person,
      [
        'acct',
        'id',
        'url',
        'displayName',
        'avatar',
        'bio',
        'shelf',
        'rank',
        'fame',
        'elsewhere',
        'youtube',
      ],
      `${where} person`,
    );
    assert(/^[^@\s]+@[^@\s/]+$/.test(person.acct ?? ''), `${where}: invalid handle`);
    assert(!handles.has(person.acct), `${where}: duplicate ${person.acct}`);
    handles.add(person.acct);
    assert(/^\d+$/.test(person.id ?? ''), `${where}: ${person.acct} has no home-instance ID`);
    assert(
      https(person.url) && (!person.avatar || https(person.avatar)),
      `${where}: URL of ${person.acct}`,
    );
    assert(typeof person.displayName === 'string', `${where}: name of ${person.acct}`);
    assert(
      typeof person.bio === 'string' && [...person.bio].length <= 200,
      `${where}: bio of ${person.acct}`,
    );
    assert(SHELVES.includes(person.shelf), `${where}: shelf of ${person.acct}`);
    assert(Number.isInteger(person.rank) && person.rank >= 1, `${where}: rank of ${person.acct}`);
    assert(
      Array.isArray(person.fame) && person.fame.every((code) => FAME.includes(code)),
      `${where}: fame of ${person.acct}`,
    );
    assert(
      Array.isArray(person.elsewhere) && person.elsewhere.every((kind) => ELSEWHERE.includes(kind)),
      `${where}: elsewhere of ${person.acct}`,
    );
    if (person.youtube !== undefined) {
      const yt = person.youtube;
      onlyKeys(yt, ['channelId', 'band', 'lastUpload', 'native'], `${where} youtube`);
      assert(
        /^UC[0-9A-Za-z_-]{22}$/.test(yt.channelId ?? ''),
        `${where}: channel of ${person.acct}`,
      );
      assert(yt.band === undefined || BANDS.includes(yt.band), `${where}: band of ${person.acct}`);
      assert(
        yt.lastUpload === undefined || /^\d{4}-\d{2}$/.test(yt.lastUpload),
        `${where}: upload`,
      );
      assert(typeof yt.native === 'boolean', `${where}: native flag of ${person.acct}`);
    }
  }
  assert(Array.isArray(page.servers), `${where}: servers`);
  for (const server of page.servers) {
    onlyKeys(server, ['domain'], `${where} server`);
    assert(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(server.domain ?? ''), `${where}: server domain`);
  }
  return page;
}

const fileName = (topic, lang) => `${topic}.${lang}.json`;

/** Every bundled page must have a route, and every route a bundled page. */
export function checkPaths(paths, bundled) {
  const routed = new Set(
    Object.entries(paths).flatMap(([topic, langs]) =>
      Object.keys(langs).map((lang) => fileName(topic, lang)),
    ),
  );
  for (const name of bundled)
    assert(routed.has(name), `${name} has no path in feed-builder-paths.json`);
  for (const name of routed)
    assert(bundled.includes(name), `feed-builder-paths.json routes ${name}, which is not bundled`);
}

function bundledFiles() {
  return existsSync(DATA_DIR)
    ? readdirSync(DATA_DIR)
        .filter((name) => name.endsWith('.json'))
        .sort()
    : [];
}

export function check() {
  const files = bundledFiles();
  for (const name of files) {
    const page = validatePage(JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')));
    assert(name === fileName(page.topic, page.lang), `${name} holds ${page.topic}/${page.lang}`);
  }
  checkPaths(JSON.parse(readFileSync(PATHS_FILE, 'utf8')), files);
  return files.length;
}

export function importFrom(source, { allowDraft = false } = {}) {
  const pages = [];
  for (const topic of readdirSync(source, { withFileTypes: true })) {
    if (!topic.isDirectory()) continue;
    for (const name of readdirSync(join(source, topic.name))) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      const page = validatePage(JSON.parse(readFileSync(join(source, topic.name, name), 'utf8')), {
        allowDraft,
      });
      assert(
        page.topic === topic.name && name === `${page.lang}.json`,
        `${topic.name}/${name}: misplaced`,
      );
      pages.push(page);
    }
  }
  assert(pages.length > 0, `No Feed Builder pages in ${source}`);
  // Replace the whole bundle so a withdrawn page disappears.
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
  for (const page of pages)
    writeFileSync(
      join(DATA_DIR, fileName(page.topic, page.lang)),
      `${JSON.stringify(page, null, 1)}\n`,
    );
  return pages;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--check')) {
      console.log(`Feed Builder bundle OK: ${check()} pages`);
    } else {
      const source = resolve(
        args.find((arg) => !arg.startsWith('--')) ??
          join(ui, '../../mawkingbird_starters/catalog/feedbuilder'),
      );
      const pages = importFrom(source, { allowDraft: args.includes('--allow-draft') });
      console.log(`Imported ${pages.length} Feed Builder pages from ${source}`);
      for (const page of pages)
        console.log(
          `  ${page.topic}/${page.lang}: ${page.status}, ${page.people.length} people, ${page.tags.length} tags`,
        );
      check();
    }
  } catch (error) {
    console.error(`import-feed-builder: ${error.message}`);
    process.exit(1);
  }
}
