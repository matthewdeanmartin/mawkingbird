/**
 * Emit the next slice of untranslated keys, sized to fit one agent's context.
 *
 * `make i18n-todo L=id` writes the *whole* work order — 5,700 keys, 51,000
 * lines of Markdown. That file is the specification; it is not something an
 * agent can hold in context and translate in one pass. The French pass worked
 * around this by hand-writing a scratch script that sliced `en.json` by
 * top-level area, and re-deriving that script is exactly the per-language setup
 * cost this epic is supposed to drive to zero.
 *
 * So this is that slicer, committed. It prints only keys **missing from the
 * target locale**, in a compact TSV (`key<TAB>English<TAB>hints`), so a batch
 * can be handed to a subagent, translated, and merged through
 * `i18n-merge.mjs`. Re-running it after a merge yields the *next* slice with no
 * bookkeeping — the locale file is the progress ledger.
 *
 * Keys marked `translate: false` in `en.context.json` are omitted: they are
 * excluded from the coverage denominator too, so translating them is work that
 * never counts and that gets orphaned when the feature is deleted.
 *
 * Run: `make i18n-batch L=id`            — everything missing, largest areas first
 *      `make i18n-batch L=id N=250`      — at most 250 keys
 *      `make i18n-batch L=id P=settings` — only keys under a prefix
 *      `make i18n-batch L=id --areas`    — just the per-area remaining counts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLedger, sourceHash, stateFor, trackedLocale, writeLedger } from './i18n-ledger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const I18N_DIR = join(ROOT, 'public', 'i18n');
const CONTEXT = join(ROOT, 'i18n-context', 'en.context.json');

const args = process.argv.slice(2);
const AREAS_ONLY = args.includes('--areas');
const positional = args.filter((a) => !a.startsWith('--'));
const lang = positional[0];
const prefix = process.env.P || positional[1] || '';
const limit = Number(process.env.N || 0);

if (!lang) {
  console.error('Usage: node scripts/i18n-batch.mjs <lang> [prefix] [--areas]');
  process.exit(2);
}

const readJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    console.error(`${path}: ${error.message}`);
    process.exit(2);
  }
};

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out);
    else out[path] = String(value);
  }
  return out;
}

const english = flatten(readJson(join(I18N_DIR, 'en.json')));
const done = flatten(readJson(join(I18N_DIR, `${lang}.json`), {}));
const context = readJson(CONTEXT, {});
const ledger = trackedLocale(lang)
  ? readLedger(join(ROOT, 'i18n-context', `ledger-${lang}.json`))
  : {};
const review = args.includes('--review');

const missing = Object.keys(english).filter(
  (key) =>
    context[key]?.translate !== false &&
    (trackedLocale(lang)
      ? review
        ? stateFor(key, english, done, context, ledger) === 'unreviewed'
        : ['missing', 'stale'].includes(stateFor(key, english, done, context, ledger))
      : !(key in done)),
);

if (AREAS_ONLY) {
  const byArea = {};
  for (const key of missing) {
    const area = key.split('.').slice(0, 2).join('.');
    byArea[area] = (byArea[area] || 0) + 1;
  }
  for (const [area, n] of Object.entries(byArea).sort((a, b) => b[1] - a[1])) {
    console.log(String(n).padStart(6), area);
  }
  console.log('------ ' + missing.length + ' keys remaining in ' + lang);
  process.exit(0);
}

// Largest area first, keys grouped together: a translator holding one screen's
// vocabulary in mind produces more consistent wording than one hopping areas.
const areaOf = (key) => key.split('.').slice(0, 2).join('.');
const sizes = {};
for (const key of missing) sizes[areaOf(key)] = (sizes[areaOf(key)] || 0) + 1;

const selected = missing
  .filter((key) => !prefix || key === prefix || key.startsWith(`${prefix}.`))
  .sort((a, b) => sizes[areaOf(b)] - sizes[areaOf(a)] || a.localeCompare(b));

const batch = limit ? selected.slice(0, limit) : selected;
const snapshotPath = args.find((arg) => arg.startsWith('--snapshot='))?.slice('--snapshot='.length);
if (snapshotPath) {
  writeLedger(snapshotPath, {
    locale: lang,
    keys: Object.fromEntries(batch.map((key) => [key, sourceHash(english[key], context[key])])),
  });
}

for (const key of batch) {
  const c = context[key];
  // Only the fields a translator acts on; the full brief is in the work order.
  const hints = c
    ? [
        c.desc && `desc: ${c.desc}`,
        c.surface && `surface: ${c.surface}`,
        c.max && `max: ${c.max}`,
        c.tone && `tone: ${c.tone}`,
        c.glossary && `glossary: ${c.glossary}`,
        c.dnt && `dnt: ${c.dnt}`,
      ]
        .filter(Boolean)
        .join(' | ')
    : '';
  console.log(`${key}\t${english[key]}\t${hints}${review ? `\t${done[key]}` : ''}`);
}

console.error(
  `-- ${batch.length} of ${selected.length} matching (${missing.length} ${review ? 'unreviewed' : 'missing/stale'} overall in ${lang})`,
);
if (trackedLocale(lang)) {
  const totals = { missing: 0, stale: 0, unreviewed: 0, reviewed: 0 };
  for (const key of Object.keys(english)) {
    if (context[key]?.translate !== false) totals[stateFor(key, english, done, context, ledger)]++;
  }
  console.error(`-- ${lang} ledger: ${JSON.stringify(totals)}`);
}
