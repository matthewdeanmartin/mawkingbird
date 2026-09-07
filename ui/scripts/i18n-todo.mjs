/**
 * Write a self-contained work order for translating one locale.
 *
 * `make i18n-todo L=de` emits `i18n-context/todo-de.md`: every key that is
 * missing or stale in `de.json`, with its English text, its context entry, and
 * a pointer to the glossary. A Claude Code agent then does the translation with
 * the `translate-ui` skill loaded, and `make i18n` verifies the result.
 *
 * ## Why a work file rather than a script that calls an API
 *
 * The translating agent runs in the harness, with the skill's glossary and
 * per-language notes in context, and can ask questions and look at the app. A
 * script shelling out to a model would have none of that. So the tooling's job
 * is to **prepare the work and verify the result**, never to perform it.
 *
 * ## Why it is incremental
 *
 * This is the property that keeps the marginal cost of a feature independent of
 * the number of locales. Adding 40 keys produces a 40-key work file, not a
 * 3000-key one. Without that, every feature would eventually cost a full
 * re-translation of 60 languages, which is the outcome the whole epic exists to
 * avoid.
 *
 * ## Staleness
 *
 * A translation goes stale when its English changes — the German still reads
 * fine, it just no longer says what the English says. Nothing in the JSON
 * records which English a translation was made from, so this script keeps
 * `i18n-context/stamps.json`: locale -> key -> hash of the English at
 * translation time. `--stale` lists keys whose hash no longer matches.
 *
 * The alternative (diffing git history per key) was rejected: it breaks when a
 * key is renamed or a file is moved, and it cannot see a translation that was
 * hand-edited. A hash of the source string is exact and survives both.
 *
 * Run: `make i18n-todo L=de` / `node scripts/i18n-todo.mjs de [--stale]`
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trackedLocale } from './i18n-ledger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const I18N_DIR = join(ROOT, 'public', 'i18n');
const CONTEXT_DIR = join(ROOT, 'i18n-context');
const STAMPS = join(CONTEXT_DIR, 'stamps.json');

const args = process.argv.slice(2);
const lang = args.find((a) => !a.startsWith('--'));
const STALE_ONLY = args.includes('--stale');

if (!lang) {
  console.error('Usage: node scripts/i18n-todo.mjs <lang> [--stale]');
  process.exit(2);
}
if (lang === 'en') {
  console.error('English is the source language — there is nothing to translate.');
  process.exit(2);
}
if (trackedLocale(lang)) {
  console.error(
    'Use make i18n-batch L=zh-Hant N=300 ARGS=--snapshot=tmp_source.json; use ARGS=--review for unreviewed work. Legacy todo stamps are not acceptance.',
  );
  process.exit(2);
}
// Reject anything that is not a plain locale code. Without this, a stray
// `LANG=en_US.UTF-8` from the environment silently produces a work order for a
// locale that does not exist — which is exactly what happened once.
if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang)) {
  console.error(`"${lang}" is not a locale code. Expected e.g. de, ja, pt-BR.`);
  process.exit(2);
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

/** `{a: {b: 'x'}}` -> `{'a.b': 'x'}`. */
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

/** Short, stable fingerprint of an English string. */
const stamp = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

const en = flatten(readJson(join(I18N_DIR, 'en.json'), {}));
const target = flatten(readJson(join(I18N_DIR, `${lang}.json`), {}));
const context = readJson(join(CONTEXT_DIR, 'en.context.json'), {});
const stamps = readJson(STAMPS, {});
const langStamps = stamps[lang] ?? {};

/**
 * Keys the context file marks `"translate": false`.
 *
 * Real, shipping, user-visible English that should nonetheless never reach a
 * translator — the case this exists for is a feature on its way out. Sending it
 * spends work across every locale on strings that are about to be deleted, and
 * leaves an orphan in each of those files when they are.
 *
 * They stay in `en.json` (they still render), and `check-i18n` still counts
 * them; they are simply never offered as work.
 */
const skipped = new Set(
  Object.entries(context)
    .filter(([, note]) => note && note.translate === false)
    .map(([key]) => key),
);

const missing = [];
const stale = [];
for (const [key, english] of Object.entries(en)) {
  if (skipped.has(key)) {
    continue;
  }
  if (!(key in target)) {
    missing.push(key);
  } else if (langStamps[key] && langStamps[key] !== stamp(english)) {
    stale.push(key);
  }
}

const wanted = STALE_ONLY ? stale : [...missing, ...stale];

if (wanted.length === 0) {
  const note = skipped.size ? ` (${skipped.size} marked do-not-translate)` : '';
  console.log(
    `${lang}.json is complete and current — ${Object.keys(en).length} keys${note}, nothing to do.`,
  );
  process.exit(0);
}

const lines = [];
lines.push(`# Translate ${wanted.length} key${wanted.length === 1 ? '' : 's'} into \`${lang}\``);
lines.push('');
lines.push('> Generated by `scripts/i18n-todo.mjs`. Not committed — regenerate it any time.');
lines.push('');
lines.push('**Load the `translate-ui` skill before starting.** It carries the glossary (what');
lines.push('`boost`, `post`, `toot`, `handle`, `instance` and `fail whale` actually mean here),');
lines.push('the formality and placeholder rules, and the per-language notes.');
lines.push('');
lines.push('Write the result into `public/i18n/' + lang + '.json`, **merging** with what is');
lines.push('already there — never reformat, reorder, or touch keys not listed below. Then run');
lines.push('`make i18n` to verify placeholders and markup survived.');
lines.push('');
lines.push('If you are genuinely unsure of a term, **leave the key out**. A missing key falls');
lines.push('back to English cleanly; a confidently wrong translation is invisible and permanent.');
lines.push('');

if (missing.length > 0 && !STALE_ONLY) {
  lines.push(`## New (${missing.length})`);
  lines.push('');
  for (const key of missing) {
    lines.push(...entry(key));
  }
}

if (stale.length > 0) {
  lines.push(`## Stale — the English changed since these were translated (${stale.length})`);
  lines.push('');
  for (const key of stale) {
    lines.push(...entry(key, target[key]));
  }
}

function entry(key, existing) {
  const out = [`### \`${key}\``, ''];
  out.push('```');
  out.push(`English: ${en[key]}`);
  if (existing !== undefined) {
    out.push(`Current ${lang}: ${existing}   <- was translated from older English`);
  }
  out.push('```');
  const note = context[key];
  if (note) {
    out.push('');
    for (const [field, value] of Object.entries(note)) {
      const rendered = typeof value === 'object' ? JSON.stringify(value) : value;
      out.push(`- **${field}**: ${rendered}`);
    }
  } else {
    out.push('');
    out.push('- _No context entry. If this string is ambiguous, add one to');
    out.push('  `i18n-context/en.context.json` rather than guessing._');
  }
  out.push('');
  return out;
}

const outPath = join(CONTEXT_DIR, `todo-${lang}.md`);
writeFileSync(outPath, `${lines.join('\n')}\n`);
console.log(
  `Wrote ${outPath} — ${missing.length} new, ${stale.length} stale.\n` +
    `Load the translate-ui skill, translate them, then run: make i18n`,
);

// Record the English each key was offered against, so the next run can tell
// stale from missing. Written now rather than after translation because a key
// left deliberately untranslated should not be reported as stale forever.
stamps[lang] = { ...langStamps };
for (const key of wanted) {
  stamps[lang][key] = stamp(en[key]);
}
writeFileSync(STAMPS, `${JSON.stringify(stamps, null, 2)}\n`);
