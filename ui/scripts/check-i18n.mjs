/**
 * Keep the interface translatable as the app keeps changing.
 *
 * The epic this serves (sprint/ui-i18n-0-overview.md) exists under an unusual
 * constraint: one maintainer, no translation budget, and a target of 50-60
 * languages. That only works if **a new feature cannot quietly become
 * untranslatable**, and if adding a language stays a JSON file rather than a
 * project. This script is what enforces the first half.
 *
 * Three rules, and the difference between them is the whole design:
 *
 *   1. **Hardcoded user-visible text** in a migrated directory. FATAL.
 *   2. **A key used but missing from `en.json`, or an orphan in it.** FATAL —
 *      this is what stops a typo shipping as `footer.privcy` in production.
 *   3. **Non-English coverage.** REPORTED, NEVER FATAL.
 *
 * Rule 3 is deliberate and load-bearing. If a feature could not merge until all
 * 60 locales had its strings, every feature would block on translation and the
 * gate would be bypassed within a month. Instead a new key ships in English the
 * day it lands and falls back per-key (Transloco `useFallbackTranslation`), so a
 * Finnish reader sees one English button rather than a broken page. Coverage is
 * a number to watch, not a wall.
 *
 * ## The MIGRATED allowlist
 *
 * Rule 1 applies only inside directories listed in {@link MIGRATED}. The app is
 * being retrofitted a sprint at a time, so an unmigrated template is not a
 * failure — it is simply not in scope yet. The array is a ratchet: it only ever
 * grows, and in ui-i18n-5 it inverts into an EXEMPT list so that everything is
 * checked by default and a *new* directory is covered automatically.
 *
 * It lives here rather than in a vitest spec because the Angular test build has
 * no Node types and no filesystem access — the same reason
 * `check-storage-registry.mjs` and `check-terminology.mjs` are scripts.
 *
 * Run: `npm run check:i18n`
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeholdersMatch } from './i18n-optional-terminology.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = join(ROOT, 'src', 'app');
const I18N_DIR = join(ROOT, 'public', 'i18n');
const CONTEXT_PATH = join(ROOT, 'i18n-context', 'en.context.json');

/**
 * Directories (relative to `src/app`) whose templates must not hardcode text.
 *
 * Grows one sprint at a time. See the header for why this is an allowlist today
 * and becomes a denylist in ui-i18n-5.
 */
const MIGRATED = [
  'shell/app-footer',
  'locale-picker',
  'pages/settings/anonymous',
  'pages/settings/development',
  'pages/settings/follows',
  'pages/settings/appearance',
  'pages/settings/invites',
  'pages/settings/accounts',
  'pages/settings/notifications',
  'pages/settings/deletion',
  'pages/settings/spotlight',
  'pages/settings/account',
  'pages/settings/storage',
  'pages/settings/profile',
  'pages/settings/server',
  'pages/settings/privacy',
  'pages/settings/content',
  'pages/settings/filters',
  'pages/settings/account-list',
  'pages/settings/feature-flags',
  'pages/settings/bulk-actions',
  'bulk-actions-dialog',
  'bulk-progress',
  'pages/settings/rss',
  'pages/settings/config',
  'pages/settings/i18n',
  'pages/settings/writing',
  'pages/settings/blue',
  'pages/settings/import-export',
  'pages/settings/mawkingbird-plus',
  'pages/settings/connections/gist',
  'pages/settings/connections',
  'pages/settings/connections/cors-proxy',
  'pages/settings/connections/link-shortener',
  'pages/settings/connections/mastodon',
  'pages/settings/connections/mataroa',
  'pages/settings/connections/github',
  'pages/settings/connections/raindrop',
  'pages/settings/connections/bluesky',
  'pages/settings/connections/dropbox',
  'pages/lists',
  'pages/conversations',
  'pages/write',
  'pages/write/board',
  'compose',
  'compose/tag-helper-dialog',
  'compose/translate-dialog',
  'pages/profile/media',
  'pages/settings/connections/doctor',
  'pages/settings/connections/hugo',
  'pages/plans',
  'pages/login',
  'pages/invites',
  'pages/home',
  'pages/settings/connections/twitter',
  'pages/settings/connections/blogger',
  'pages/settings/connections/openrouter',
  'pages/settings',
  'status-card',
  'pages/rss',
  'pages/algo',
  'pages/notifications',
  'feed-analytics',
  'shell',
  'pages/drafts',
  'pages/pastes',
  'pages/links',
  'share-dialog',
  'pages/search',
  'pages/observability',
  'pages/profile',
  'providers/shortener/proxy-consent-dialog',
  'pages/storage-diagnostics',
  'pages/collection',
  'pages/fault-injection',
  'providers/twitter/twitter-consent-dialog',
  'pages/bookmarks',
  'fail-whale',
  'list-dialog',
  'pages/login-bluesky',
  'pages/offsite-directories',
  'pages/tag',
  'account-analytics',
  'pages/find-friends',
  'pages/explore',
  'pages/directory',
  'pages/posse',
  'leave-dialog',
  'pages/docs',
  'pages/list-timeline',
  'pages/tag-bundle',
  'search-server-discovery',
  'pages/client-list',
  'pages/server-feed',
  'pages/welcome-back',
  'server-discovery',
  'admin/reports',
  'bug-report-dialog',
  'feed-members',
  'admin/accounts',
  'pages/starter-collection',
  'first-run',
  'pages/bluesky-feed',
  'people-browser',
  'pages/login-chooser',
  'server-picker',
  'admin/admin-shell',
  'admin/announcements',
  'admin/canonical-blocks',
  'admin/trends',
  'bookmark-provider-dialog',
  'pages/server-announcements',
  'report-dialog',
  'admin/domains',
  'pages/endorsed-list',
  'pages/feed-doctor',
  'starter-kit-post',
  'admin/ip-blocks',
  'history-dialog',
  'pages/server-rules',
  'pages/terms',
  'admin/domain-allows',
  'admin/email-blocks',
  'feed-language-picker',
  'lightbox',
  'pages/bluesky-oauth-callback',
  'pages/bundled-starter-kits',
  'pages/favourites',
  'pages/message',
  'pages/public-timeline',
  'account-list-dialog',
  'admin/metrics',
  'announcements',
  'unreachable-server-dialog',
  'pages/analytics',
  'pages/bundled-collections',
  'bulk-add-dialog',
  'confirm-dialog',
  'pages/about',
  'pages/credits',
  'pages/funding',
];

/**
 * Lines exempted from the hardcoded-text rule.
 *
 * Kept deliberately short, in the same spirit as `check-terminology.mjs`'s
 * ALLOWED: an entry belongs here only when the text is genuinely not interface
 * language — a brand name, a symbol, or a string the user never reads.
 */
const ALLOWED = [
  {
    file: 'shell/shell.html',
    contains: 'mawkingbird.com',
    why: 'The product domain is a brand and navigation target, not interface prose.',
  },
  {
    file: 'pages/rss/add-feed-dialog/add-feed-dialog.html',
    contains: 'placeholder="https://example.com"',
    why: 'An example URL showing the accepted input format, not interface prose.',
  },
  {
    file: 'locale-picker/locale-picker.ts',
    contains: 'option.name',
    why: 'Language endonyms are deliberately never translated — see locale.ts.',
  },
  {
    file: 'pages/settings/account-list/settings-account-list.html',
    contains: 'placeholder="example.social"',
    why: 'An example domain, not a word. Translating it would suggest a different server exists.',
  },
  {
    file: 'pages/settings/account-list/settings-account-list.html',
    contains: '<code>&#64;someone&#64;example.social</code>',
    why: 'A literal handle shown as a code sample; it is syntax, not prose.',
  },
  {
    file: 'pages/settings/import-export/settings-import-export.html',
    contains: 'placeholder="@Gargron@mastodon.social',
    why: 'Example handles and URLs showing the accepted input format, not prose.',
  },
  {
    file: 'pages/settings/import-export/settings-import-export.html',
    contains: 'placeholder="#photography',
    why: 'Example hashtags showing the accepted input format, not prose.',
  },
  {
    file: 'pages/home/home.html',
    contains: '<strong>Mawkingbird</strong>',
    why: "The app's own brand name, shown as the author of the pinned anonymous sample post.",
  },
  {
    file: 'pages/home/home.html',
    contains: '&#64;mawkingbird',
    why: 'A literal handle on the pinned sample post, not prose.',
  },
  {
    file: 'pages/profile/profile.html',
    contains: '<strong>Mawkingbird</strong>',
    why: "The app's brand name is the author of the pinned anonymous login prompt.",
  },
  {
    file: 'pages/profile/profile.html',
    contains: '&#64;mawkingbird',
    why: 'A literal product handle on the pinned anonymous login prompt, not prose.',
  },
  {
    file: 'pages/settings/connections/blogger/connection-blogger.html',
    contains: 'placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"',
    why: 'The shape of a Google client id, shown so one can be recognised. Not prose.',
  },
  {
    file: 'pages/settings/connections/twitter/connection-twitter.html',
    contains: 'placeholder="@NASA"',
    why: 'An example handle showing the accepted input format, not a word.',
  },
  {
    file: 'pages/settings/connections/twitter/connection-twitter.html',
    contains: 'placeholder="@mistersql"',
    why: 'An example handle showing the accepted input format, not a word.',
  },
  {
    file: 'pages/settings/connections/twitter/connection-twitter.html',
    contains: 'placeholder="&#64;AnthropicAI',
    why: 'Example handles and a profile URL showing the accepted paste format.',
  },
  {
    file: 'pages/fault-injection/fault-injection.html',
    contains: 'placeholder="/api/v1/statuses"',
    why: 'An example API path showing the accepted match format, not prose.',
  },
  {
    file: 'pages/fault-injection/fault-injection.html',
    contains: 'placeholder="^/api/v1/statuses/\\d+$"',
    why: 'An example regex showing the accepted match format, not prose.',
  },
  {
    file: 'account-analytics/account-analytics.html',
    contains: '[class.down]="trend',
    why: 'A trend-arrow ternary (▲/▼/+/%) rendering symbols and digits, not words. The line regex mistakes the "trend" variable name for a text node.',
  },
  {
    file: 'account-analytics/account-analytics.html',
    contains: "0 ? '▲' : trend",
    why: 'Same trend-arrow ternary (▲/▼/+/%) wrapped onto the next line — symbols and digits, not words.',
  },
  {
    file: 'bulk-add-dialog/bulk-add-dialog.html',
    contains: 'placeholder="&#64;alice, &#64;bob@example.social',
    why: 'Example handles showing accepted paste syntax, not interface prose.',
  },
];

/** Read a locale dictionary, flattened to dotted keys. */
function loadLocale(code) {
  const path = join(I18N_DIR, `${code}.json`);
  try {
    return flatten(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw new Error(`${code}.json is not valid JSON: ${error.message}`);
  }
}

/** `{a: {b: 'x'}}` -> `{'a.b': 'x'}`. Keys may already contain dots. */
function flatten(object, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

/** Every source file under `src/app`, as absolute paths. */
function sources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, out);
    } else if (/\.(html|ts)$/.test(entry) && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file) => relative(APP_DIR, file).replace(/\\/g, '/');
const isMigrated = (file) => MIGRATED.some((dir) => rel(file).startsWith(`${dir}/`));

/**
 * Translation keys referenced by a file.
 *
 * Matches the pipe (`'a.b' | transloco`), the service (`translate('a.b')`), the
 * signal helper (`translateSignal('a.b')`), and a bare `key: 'a.b'` property.
 *
 * The last one exists for **indirect keys**: a component holding a list of
 * options (`{days: 365, key: 'settings.anonymous.age.years1'}`) renders them as
 * `{{ option.key | transloco }}`, so the key never appears next to the word
 * `transloco` anywhere. Without this pattern every such key looks like an
 * orphan, and the fix would be to weaken the orphan rule — which is the rule
 * that catches renamed and mistyped keys. Better to recognise the idiom.
 *
 * Declaring a key (`// i18n a.b: English`) also counts as using it, since the
 * declaration is deliberate authorship rather than a leftover.
 */
function keysUsed(text) {
  const found = new Set();
  const patterns = [
    /'([a-zA-Z][\w.]*)'\s*\|\s*transloco/g,
    /translate(?:Signal|Object)?\(\s*'([a-zA-Z][\w.]*)'/g,
    /key:\s*'([a-zA-Z][\w.]*\.[\w.]+)'/g,
    /(?:<!--|\/\/)\s*i18n\s+([\w.]+)\s*:/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return found;
}

/**
 * User-visible text hardcoded in a template.
 *
 * Deliberately *not* matched, for the same reasons `check-terminology.mjs`
 * skips them: bound expressions, CSS classes, route paths, and anything inside
 * an interpolation. What is matched is the text a reader actually sees.
 */
function hardcoded(line, isTemplate) {
  // A static aria-label / title / placeholder with real words in it.
  const staticAttr = /(?<!\[)(?:aria-label|title|placeholder)="([^"{}]*[A-Za-z]{2,}[^"{}]*)"/;
  const attrMatch = staticAttr.exec(line);
  if (attrMatch && /[A-Za-z]{3,}/.test(attrMatch[1])) {
    return attrMatch[1].trim();
  }
  // Text inside <code> is a sample, not prose: hashtag literals (`#TODO`),
  // storage keys, handles, URLs. Translating any of them would break the thing
  // being demonstrated.
  if (/<code>/.test(line)) {
    return null;
  }
  // A text node between tags: `>Some words<`, with no binding or control flow.
  //
  // Only meaningful in markup. In TypeScript the same shape is just comparison
  // operators — `page() > 0 && page() < lastPage()` reads as a text node to this
  // regex — so inline-template components rely on the attribute rule above and
  // on `i18n` declarations instead.
  if (!isTemplate) {
    return null;
  }
  const textNode = />([^<>{}@]*[A-Za-z]{3,}[^<>{}@]*)</;
  const textMatch = textNode.exec(line);
  if (textMatch) {
    const text = textMatch[1].trim();
    // Single symbols, entities and lone short tokens are not sentences.
    if (text && /[A-Za-z]{3,}/.test(text) && !/^&[a-z]+;$/.test(text)) {
      return text;
    }
  }
  return null;
}

/** The translator's brief; absent entries are fine (see i18n-context/README.md). */
let context = {};
try {
  context = JSON.parse(readFileSync(CONTEXT_PATH, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw new Error(`en.context.json is not valid JSON: ${error.message}`);
  }
}

/**
 * Line indices inside an `@if (terminologyAvailable())` block.
 *
 * Brace-counted rather than matched: the block contains nested control flow, so
 * stopping at the first `}` would leave most of it unguarded.
 */
function guardedLines(text) {
  const lines = text.split('\n');
  const inside = new Set();
  let depth = 0;
  let open = false;
  lines.forEach((line, index) => {
    if (!open && line.includes('@if (terminologyAvailable())')) {
      open = true;
      depth = 0;
    }
    if (!open) {
      return;
    }
    inside.add(index);
    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
    if (depth <= 0 && line.includes('}')) {
      open = false;
    }
  });
  return inside;
}

const problems = [];
const usedKeys = new Set();

for (const file of sources(APP_DIR)) {
  const text = readFileSync(file, 'utf8');
  for (const key of keysUsed(text)) {
    usedKeys.add(key);
  }
  if (!isMigrated(file)) {
    continue;
  }
  // Blocks guarded by `@if (terminologyAvailable())` render only under English
  // by decree (sprint/ui-i18n-0-overview.md): the post/tweet/florp vocabulary is
  // an English-only feature, so its picker is hidden rather than translated.
  // Requiring keys there would mean translating options that exist to be English
  // jokes, for readers who are never shown them.
  const guarded = guardedLines(text);
  text.split('\n').forEach((line, index) => {
    if (guarded.has(index)) {
      return;
    }
    const offender = hardcoded(line, file.endsWith('.html'));
    if (!offender) {
      return;
    }
    const exempt = ALLOWED.some(
      (entry) => entry.file === rel(file) && line.includes(entry.contains),
    );
    if (!exempt) {
      problems.push(`${rel(file)}:${index + 1}  hardcoded text: "${offender}"`);
    }
  });
}

// ---- Rule 2: keys and en.json must agree ----

const en = loadLocale('en');
if (!en) {
  console.error(`\nMissing ${join('public', 'i18n', 'en.json')} — the source dictionary.\n`);
  process.exit(1);
}

for (const key of [...usedKeys].sort()) {
  if (!(key in en)) {
    problems.push(`en.json is missing key "${key}" (used in a template or source)`);
  }
}
for (const key of Object.keys(en).sort()) {
  if (!usedKeys.has(key)) {
    problems.push(`en.json has orphan key "${key}" (nothing uses it)`);
  }
}

// ---- Rule 4: a translation must not corrupt what it translates ----
//
// This is the only review available for a language nobody on the project reads.
// A wrong *word* is invisible and survivable; a dropped `{{name}}` renders a
// blank where a username should be, in every locale that has it, forever. So
// structural damage is fatal and linguistic judgement is advisory.

/** `{{name}}` placeholders in a string, sorted. */
function placeholders(text) {
  return [...String(text).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();
}

/** Inline markup tag names in a string, sorted. */
function markup(text) {
  return [...String(text).matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase()).sort();
}

const localeCodes = readdirSync(I18N_DIR)
  .filter((name) => name.endsWith('.json') && name !== 'en.json')
  .map((name) => name.replace(/\.json$/, ''))
  .sort();

const advisories = [];

for (const code of localeCodes) {
  const dict = loadLocale(code);
  if (!dict) {
    continue;
  }
  for (const [key, value] of Object.entries(dict)) {
    if (!(key in en)) {
      problems.push(`${code}.json has orphan key "${key}" (not in en.json)`);
      continue;
    }
    const wanted = placeholders(en[key]).join(', ');
    const got = placeholders(value).join(', ');
    if (!placeholdersMatch(key, en[key], value)) {
      problems.push(
        `${code}.json "${key}" placeholder mismatch: en has [${wanted}], ${code} has [${got}]`,
      );
    }
    const wantedTags = markup(en[key]).join(', ');
    const gotTags = markup(value).join(', ');
    if (wantedTags !== gotTags) {
      problems.push(
        `${code}.json "${key}" markup mismatch: en has [${wantedTags}], ${code} has [${gotTags}]`,
      );
    }
    if (String(value).trim() === String(en[key]).trim()) {
      advisories.push(`${code} "${key}" is identical to English`);
    }
    const max = context[key]?.max;
    if (typeof max === 'number' && String(value).length > max) {
      advisories.push(`${code} "${key}" is ${String(value).length} chars, over its ${max} budget`);
    }
  }
}

if (problems.length > 0) {
  console.error('\ni18n problems:\n');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error(
    '\nMove user-visible text into a `// i18n <key>: <English>` declaration and\n' +
      "reference it by key: {{ 'area.thing' | transloco }}. Run `npm run i18n:extract`\n" +
      'to regenerate en.json. A placeholder or tag lost in translation renders a blank\n' +
      'where real content belongs — see .claude/skills/translate-ui/SKILL.md.\n' +
      'If a string genuinely is not interface language, add a justified entry to\n' +
      'ALLOWED in scripts/check-i18n.mjs.\n',
  );
  process.exit(1);
}

// ---- Rule 3: coverage and advisories, reported and never fatal ----

// Keys marked `"translate": false` in the context file are never offered for
// translation (see scripts/i18n-todo.mjs), so counting them against coverage
// would permanently cap every locale below 100% for work nobody should do.
const doNotTranslate = new Set(
  Object.entries(context)
    .filter(([, note]) => note && note.translate === false)
    .map(([key]) => key),
);
const translatable = Object.keys(en).filter((key) => !doNotTranslate.has(key));
const total = translatable.length;

console.log(
  `i18n OK — ${Object.keys(en).length} keys, ${MIGRATED.length} migrated ` +
    `director${MIGRATED.length === 1 ? 'y' : 'ies'}.`,
);

if (localeCodes.length > 0) {
  const coverage = localeCodes.map((code) => {
    const dict = loadLocale(code) ?? {};
    const done = translatable.filter((key) => key in dict).length;
    return `${code} ${Math.round((done / total) * 100)}%`;
  });
  // Never fatal: an incomplete locale falls back to English key by key, which is
  // what lets a feature ship before its translations do. See the header.
  console.log(`Coverage: ${coverage.join('  ')}`);
}

if (advisories.length > 0) {
  console.log(`\nAdvisory (not failures):`);
  for (const advisory of advisories.slice(0, 20)) {
    console.log(`  - ${advisory}`);
  }
  if (advisories.length > 20) {
    console.log(`  ...and ${advisories.length - 20} more.`);
  }
}
