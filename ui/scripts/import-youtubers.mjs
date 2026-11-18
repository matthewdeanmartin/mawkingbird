#!/usr/bin/env node
// Import "YouTubers on Mastodon" creator kits from mawkingbird_starters.
// No crawls and no requests: it copies validated, publishable fields only.
//
//   node scripts/import-youtubers.mjs [path/to/catalog/youtubers]   import
//   node scripts/import-youtubers.mjs --check                        validate the bundle
//
// Output, under src/app/public-pages/youtubers/:
//   data/<lang>.json                 every kit in one language (lazy-imported)
//   youtuber-paths.generated.json    paths and counts (small; loads with routes)
//   youtuber-data.generated.ts       the lazy import per language
// The same data feeds the public, prerendered kit pages and the in-app kits
// page. Only languages with a hub in youtuber-hubs.json are bundled.
// See spec/youtube-client.md (S5-S6) and ops/engineering/seo.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = join(ui, 'src/app/public-pages/youtubers');
export const DATA_DIR = join(OUT_DIR, 'data');
export const PATHS_FILE = join(OUT_DIR, 'youtuber-paths.generated.json');
export const LOADERS_FILE = join(OUT_DIR, 'youtuber-data.generated.ts');
export const HUBS_FILE = join(OUT_DIR, 'youtuber-hubs.json');
const DEFAULT_SOURCE = resolve(ui, '../../mawkingbird_starters/catalog/youtubers');
/** Scripts whose category names are not slugs a reader would search: keep English. */
const ENGLISH_SLUG_LANGS = new Set(['ja', 'ko', 'zh', 'zh-Hant', 'ru', 'uk', 'ar', 'he', 'el']);

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
const date = (value) => value === null || Number.isFinite(Date.parse(value));
/** Characters as Python counts them (code points), not UTF-16 units: an emoji is one. */
const chars = (text) => [...text].length;
const onlyKeys = (object, allowed, where) => {
  assert(object && typeof object === 'object' && !Array.isArray(object), `${where}: not an object`);
  for (const key of Object.keys(object))
    assert(allowed.includes(key), `${where}: unexpected field "${key}"`);
};

/** An ASCII path segment from a category name: accents dropped, ß as ss. */
export function localSlug(name, fallback, lang) {
  if (ENGLISH_SLUG_LANGS.has(lang)) return fallback;
  const ascii = name
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug(ascii) ? ascii : fallback;
}

/** One creator, allow-listed. Returns the copy that ships. */
export function validateMember(member, where) {
  onlyKeys(
    member,
    [
      'acct',
      'url',
      'displayName',
      'avatar',
      'bot',
      'languages',
      'lastPost',
      'bio',
      'videos',
      'channel',
    ],
    where,
  );
  assert(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(member.acct), `${where}: invalid acct`);
  assert(member.url === null || https(member.url), `${where}: invalid url`);
  assert(typeof member.displayName === 'string', `${where}: invalid displayName`);
  assert(member.avatar === null || https(member.avatar), `${where}: invalid avatar`);
  assert(typeof member.bot === 'boolean', `${where}: invalid bot`);
  assert(
    Array.isArray(member.languages) && member.languages.every(language),
    `${where}: languages`,
  );
  assert(date(member.lastPost), `${where}: invalid lastPost`);
  assert(typeof member.bio === 'string' && chars(member.bio) <= 200, `${where}: invalid bio`);
  assert(Array.isArray(member.videos) && member.videos.length <= 3, `${where}: invalid videos`);
  for (const video of member.videos) {
    onlyKeys(video, ['id', 'title'], `${where} video`);
    assert(/^[\w-]{11}$/.test(video.id), `${where}: invalid video id`);
    assert(typeof video.title === 'string' && chars(video.title) <= 120, `${where}: video title`);
  }
  onlyKeys(member.channel, ['id', 'title', 'lastUpload'], `${where} channel`);
  assert(/^UC[0-9A-Za-z_-]{22}$/.test(member.channel.id), `${where}: invalid channel id`);
  assert(typeof member.channel.title === 'string', `${where}: invalid channel title`);
  assert(date(member.channel.lastUpload), `${where}: invalid lastUpload`);
  return {
    acct: member.acct,
    url: member.url,
    displayName: member.displayName.slice(0, 200),
    avatar: member.avatar,
    bot: member.bot,
    languages: member.languages,
    lastPost: member.lastPost,
    bio: member.bio,
    videos: member.videos.map((v) => ({ id: v.id, title: v.title })),
    channel: {
      id: member.channel.id,
      title: member.channel.title.slice(0, 200),
      lastUpload: member.channel.lastUpload,
    },
  };
}

/** One exported pack (starters' shape) → the pack the app ships. */
export function validatePack(pack, where) {
  onlyKeys(
    pack,
    ['version', 'kind', 'category', 'lang', 'title', 'icon', 'generatedAt', 'members'],
    where,
  );
  assert(pack.version === 1 && pack.kind === 'youtubers', `${where}: unsupported pack`);
  assert(slug(pack.category) && language(pack.lang), `${where}: invalid identity`);
  assert(typeof pack.title?.en === 'string', `${where}: title needs English`);
  for (const [lang, text] of Object.entries(pack.title))
    assert(language(lang) && typeof text === 'string', `${where}: invalid title`);
  assert(pack.icon === null || typeof pack.icon === 'string', `${where}: invalid icon`);
  assert(Array.isArray(pack.members) && pack.members.length > 0, `${where}: no members`);
  return {
    category: pack.category,
    title: pack.title,
    icon: pack.icon,
    members: pack.members.map((m, i) => validateMember(m, `${where} member ${i}`)),
  };
}

const readHubs = (file = HUBS_FILE) => {
  const { $comment, ...hubs } = JSON.parse(readFileSync(file, 'utf8'));
  void $comment;
  return hubs;
};

/** Read starters' catalog/youtubers and build the shipped files. Pure apart from reading. */
export function build(source, hubs = readHubs()) {
  const index = JSON.parse(readFileSync(join(source, 'index.json'), 'utf8'));
  assert(index.version === 1 && Array.isArray(index.packs), 'index.json: unsupported');
  const byLang = new Map();
  const skipped = new Set();
  for (const entry of index.packs) {
    assert(language(entry.lang) && slug(entry.category), `index entry ${entry.path}: invalid`);
    if (!hubs[entry.lang]) {
      skipped.add(entry.lang);
      continue;
    }
    const pack = JSON.parse(readFileSync(join(source, entry.path), 'utf8'));
    assert(pack.lang === entry.lang && pack.category === entry.category, `${entry.path}: mismatch`);
    const shipped = validatePack(pack, entry.path);
    if (!byLang.has(entry.lang)) byLang.set(entry.lang, []);
    byLang.get(entry.lang).push(shipped);
  }
  const files = {};
  const kits = {};
  const languages = {};
  for (const [lang, packs] of [...byLang].sort(([a], [b]) => a.localeCompare(b))) {
    packs.sort(
      (a, b) => b.members.length - a.members.length || a.category.localeCompare(b.category),
    );
    const used = new Set();
    for (const pack of packs) {
      let local = localSlug(pack.title[lang] ?? pack.title.en, pack.category, lang);
      if (used.has(local)) local = pack.category;
      used.add(local);
      pack.slug = local;
      pack.path = `${hubs[lang].path}/${local}`;
      (kits[pack.category] ??= {})[lang] = pack.path;
    }
    files[lang] = { version: 1, lang, generatedAt: index.generatedAt, packs };
    languages[lang] = packs.length;
  }
  return {
    paths: { generatedAt: index.generatedAt, languages, kits },
    files,
    skipped: [...skipped].sort(),
  };
}

function loaders(langs) {
  return `// Generated by scripts/import-youtubers.mjs. Do not edit.
// One lazy import per language: kit data never loads with the app.
import type { YoutuberLanguageFile } from './youtuber-types';

export const YOUTUBER_DATA: Record<string, () => Promise<YoutuberLanguageFile>> = {
${langs
  .map(
    (lang) =>
      `  ${/^[a-z]+$/.test(lang) ? lang : `'${lang}'`}: () =>
    import('./data/${lang}.json').then((m) => m.default as YoutuberLanguageFile),`,
  )
  .join('\n')}
};
`;
}

/** The generated TypeScript, formatted as the repository's Prettier config says. */
async function formatted(text, file) {
  const prettier = await import('prettier');
  const options = (await prettier.resolveConfig(file)) ?? {};
  return prettier.format(text, { ...options, filepath: file });
}

export async function write({ paths, files }, out = OUT_DIR) {
  const dataDir = join(out, 'data');
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  for (const [lang, file] of Object.entries(files))
    writeFileSync(join(dataDir, `${lang}.json`), JSON.stringify(file) + '\n');
  writeFileSync(join(out, 'youtuber-paths.generated.json'), JSON.stringify(paths, null, 1) + '\n');
  const loadersFile = join(out, 'youtuber-data.generated.ts');
  writeFileSync(loadersFile, await formatted(loaders(Object.keys(files)), loadersFile));
}

/** Validate what is bundled: data, paths and loaders agree; nothing extra. */
export function check(out = OUT_DIR) {
  const pathsFile = join(out, 'youtuber-paths.generated.json');
  if (!existsSync(pathsFile)) return 0;
  const paths = JSON.parse(readFileSync(pathsFile, 'utf8'));
  onlyKeys(paths, ['generatedAt', 'languages', 'kits'], 'paths');
  const hubs = readHubs(join(out, 'youtuber-hubs.json'));
  const dataDir = join(out, 'data');
  const names = existsSync(dataDir) ? readdirSync(dataDir) : [];
  for (const name of names)
    assert(name.endsWith('.json') && paths.languages[name.slice(0, -5)], `${name}: not in paths`);
  const loaderText = readFileSync(join(out, 'youtuber-data.generated.ts'), 'utf8');
  let packs = 0;
  const seenPaths = new Set();
  for (const lang of Object.keys(paths.languages)) {
    assert(hubs[lang], `${lang}: bundled without a hub`);
    assert(
      new RegExp(`import\\(['"]\\./data/${lang}\\.json['"]\\)`).test(loaderText),
      `${lang}: no loader`,
    );
    const file = JSON.parse(readFileSync(join(dataDir, `${lang}.json`), 'utf8'));
    onlyKeys(file, ['version', 'lang', 'generatedAt', 'packs'], `${lang}.json`);
    assert(file.packs.length === paths.languages[lang], `${lang}.json: count mismatch`);
    for (const [i, pack] of file.packs.entries()) {
      const where = `${lang}.json pack ${i}`;
      onlyKeys(pack, ['category', 'title', 'icon', 'members', 'slug', 'path'], where);
      assert(slug(pack.slug) && pack.path === `${hubs[lang].path}/${pack.slug}`, `${where}: path`);
      assert(paths.kits[pack.category]?.[lang] === pack.path, `${where}: not in paths`);
      assert(!seenPaths.has(pack.path), `${where}: duplicate path ${pack.path}`);
      seenPaths.add(pack.path);
      pack.members.forEach((m, j) => validateMember(m, `${where} member ${j}`));
    }
    packs += file.packs.length;
  }
  return packs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const packs = check();
    console.log(`YouTuber kits OK: ${packs} packs bundled.`);
  } else {
    const source = resolve(args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_SOURCE);
    assert(existsSync(join(source, 'index.json')), `No export at ${source}; run make yt-export`);
    const built = build(source);
    await write(built);
    const count = Object.values(built.files).reduce((n, f) => n + f.packs.length, 0);
    console.log(
      `Imported ${count} YouTuber kits in ${Object.keys(built.files).length} languages.` +
        (built.skipped.length ? ` Skipped (no hub yet): ${built.skipped.join(', ')}.` : ''),
    );
  }
}
