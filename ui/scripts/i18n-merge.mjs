/**
 * Merge a batch of translations into `public/i18n/<lang>.json` — or reject it whole.
 *
 * ## Why translations go through a gate instead of an editor
 *
 * German was written straight into its file and reviewed afterwards. Two
 * systematic defects survived that review and had to be found by reading all
 * 5,700 keys twice: a split formality register (466 keys `du`, 321 `Sie`) and a
 * long tail of wrong-sense words — the unblock-everyone button that said
 * *block the amnesty*, "Anrufe" (telephone calls) for API calls. Every one of
 * them produced valid JSON with correct placeholders, so `make i18n` was green
 * throughout.
 *
 * French was written through a checker like this one and had none of that
 * class of defect at the end. The difference is not care; it is *when* the
 * check runs. A batch rejected at merge costs one retry while the translator
 * still has the context loaded. The same defect found later costs a re-read of
 * the whole file by someone who has to reconstruct why the word was chosen.
 *
 * So: **nothing hand-written reaches a locale file except through this script.**
 *
 * ## What it refuses
 *
 * - a key that is not in `en.json` (a typo'd key renders nothing, forever)
 * - placeholder drift — `{{name}}` dropped, added, or renamed. This is the
 *   single most damaging error available: it renders a blank where a username
 *   goes.
 * - inline markup drift — the tag set must match English
 * - a value longer than its `max` budget in `en.context.json`
 * - anything the locale's own rules in `i18n-locale-rules.mjs` reject
 *
 * All-or-nothing is deliberate. A partial merge leaves the file in a state
 * nobody has reviewed and the translator has to diff to find out what landed.
 *
 * ## What it does not check
 *
 * Whether the translation is *right*. No tool can. That is what
 * `make i18n-traps L=xx` and a read-through are for — see the skill.
 *
 * Run: `make i18n-merge L=id F=batch.json`
 *      `node scripts/i18n-merge.mjs id batch.json [--dry-run]`
 *
 * The batch file is `{"dotted.key": "translated text", ...}` — flat, not nested.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rulesFor } from './i18n-locale-rules.mjs';
import { placeholdersMatch } from './i18n-optional-terminology.mjs';
import {
  acceptBatch,
  readLedger,
  reviewBatch,
  trackedLocale,
  validateSnapshot,
  writeLedger,
} from './i18n-ledger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const I18N_DIR = join(ROOT, 'public', 'i18n');
const CONTEXT = join(ROOT, 'i18n-context', 'en.context.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const [lang, batchPath] = args.filter((a) => !a.startsWith('--'));

if (!lang || !batchPath) {
  console.error('Usage: node scripts/i18n-merge.mjs <lang> <batch.json> [--dry-run]');
  process.exit(2);
}
if (lang === 'en') {
  console.error('en.json is generated from source comments — use `make i18n-extract`.');
  process.exit(2);
}

const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) {
      return fallback;
    }
    console.error(`${path}: ${error.message}`);
    process.exit(2);
  }
};

/** `{a: {b: 'x'}}` -> `{'a.b': 'x'}`. */
function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out[path] = String(value);
    }
  }
  return out;
}

const english = flatten(readJson(join(I18N_DIR, 'en.json')));
const context = readJson(CONTEXT, {});
const target = join(I18N_DIR, `${lang}.json`);
const existing = readJson(target, {});
const batch = readJson(batchPath);
const locale = rulesFor(lang);
const ledgerPath = join(ROOT, 'i18n-context', `ledger-${lang}.json`);
const REVIEW = args.includes('--reviewed');
let nextLedger;
if (trackedLocale(lang)) {
  const ledger = readLedger(ledgerPath);
  try {
    const snapshotPath = args.find((arg) => arg.startsWith('--source='))?.slice('--source='.length);
    validateSnapshot(
      Object.keys(batch),
      snapshotPath ? readJson(snapshotPath) : null,
      lang,
      english,
      context,
    );
    nextLedger = REVIEW
      ? reviewBatch(batch, english, flatten(existing), context, ledger)
      : acceptBatch(batch, english, context, ledger);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (REVIEW) {
  console.error('Review ledger is not enabled for this locale.');
  process.exit(2);
}

/** Placeholder *names*, sorted — order may legitimately change, the set may not. */
const placeholders = (text) =>
  [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

/** Inline tag names in document order. Markup must survive translation intact. */
const markup = (text) =>
  [...text.matchAll(/<\/?([a-zA-Z][\w-]*)[^>]*>/g)].map((m) => m[1].toLowerCase()).join(',');

const problems = [];
const note = (key, what, detail) => problems.push({ key, what, detail });

for (const [key, value] of Object.entries(batch)) {
  if (typeof value !== 'string') {
    note(key, 'NOT A STRING', typeof value);
    continue;
  }
  const source = english[key];
  if (source === undefined) {
    note(key, 'NOT IN en.json', 'a key that does not exist renders nothing, forever');
    continue;
  }
  if (!value.trim()) {
    note(key, 'EMPTY', 'omit the key instead — a missing key falls back to English');
    continue;
  }
  if (!placeholdersMatch(key, source, value)) {
    note(key, 'PLACEHOLDER', `en {${placeholders(source)}} vs ${lang} {${placeholders(value)}}`);
  }
  if (markup(source) !== markup(value)) {
    note(key, 'MARKUP', `en <${markup(source)}> vs ${lang} <${markup(value)}>`);
  }
  const max = context[key]?.max;
  if (max && value.length > max) {
    note(key, `OVER max(${max})`, `${value.length} chars: ${JSON.stringify(value)}`);
  }
  if (context[key]?.translate === false) {
    note(key, 'DO NOT TRANSLATE', 'marked translate:false in en.context.json');
  }
  for (const rule of locale.rules) {
    const failure = rule.check(value, { source, key });
    if (failure) {
      note(key, rule.id.toUpperCase(), `${failure} — ${rule.why}\n      ${JSON.stringify(value)}`);
    }
  }
}

if (problems.length) {
  for (const { key, what, detail } of problems) {
    console.log(`${what}  ${key}\n      ${detail}`);
  }
  console.log(
    `\n${problems.length} problem(s) in ${Object.keys(batch).length} keys — nothing merged.`,
  );
  console.log('Fix the batch file and re-run. Partial merges leave the file unreviewed.');
  process.exit(1);
}

const changed = Object.entries(batch).filter(([k, v]) => flatten(existing)[k] !== v).length;
if (DRY) {
  console.log(
    `OK — ${Object.keys(batch).length} keys pass (${changed} would change). Not written.`,
  );
  process.exit(0);
}
if (REVIEW) {
  writeLedger(ledgerPath, nextLedger);
  console.log(`reviewed ${Object.keys(batch).length} keys in ${lang}`);
  process.exit(0);
}

// Write nested, matching en.json's shape, with each group's keys sorted so
// diffs stay reviewable and two agents merging different batches do not
// reorder each other's work.
for (const [key, value] of Object.entries(batch)) {
  const cut = key.indexOf('.');
  const group = key.slice(0, cut);
  const rest = key.slice(cut + 1);
  existing[group] ??= {};
  existing[group][rest] = value;
}
for (const group of Object.keys(existing)) {
  if (existing[group] && typeof existing[group] === 'object') {
    existing[group] = Object.fromEntries(
      Object.entries(existing[group]).sort((a, b) => a[0].localeCompare(b[0])),
    );
  }
}
writeFileSync(target, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
if (nextLedger) writeLedger(ledgerPath, nextLedger);

const total = Object.keys(flatten(existing)).length;
const denominator = Object.keys(english).filter((k) => context[k]?.translate !== false).length;
console.log(
  `merged ${Object.keys(batch).length} keys into ${lang}.json — ` +
    `${total}/${denominator} (${Math.round((total / denominator) * 100)}%)`,
);
