/**
 * Grep a finished locale for the *wrong sense* of this app's vocabulary.
 *
 * ## The failure this exists to catch
 *
 * `make i18n` passes at 100% coverage on a German file whose unblock-everyone
 * button says **"Blockieren Sie die Amnestie"** — *block the amnesty*, the
 * exact opposite of what it does. Coverage counts keys. It cannot read.
 *
 * Nearly every core noun in a fediverse client is a word whose commonest sense
 * is not the one meant: boost, post, feed, thread, handle, mute, block, like,
 * light, paste, call. A translator handed such a word without context produces
 * a correct translation of the wrong sense, which is *invisible* to a
 * maintainer who does not read the language, and therefore permanent.
 *
 * The counter is cheap and mechanical: for each glossary term, write down the
 * sense you do **not** mean, then search for it. On German this found real bugs
 * on two separate passes, including nine keys where "followed" had become
 * *stalked*. It takes minutes.
 *
 * ## Why this is advisory and never fatal
 *
 * A hit is evidence, not proof. German `Analyseskript` legitimately contains
 * "script"; a French sentence may legitimately contain `préféré` in its
 * ordinary sense. A gate with false positives gets bypassed or worked around —
 * which is precisely how the French merge tool's `<code>` bug caused five real
 * prose keys to be skipped rather than fixed. So this prints and exits 0. The
 * judgement stays with whoever reads the output.
 *
 * Trap words live per-locale in `i18n-locale-rules.mjs`. Build the table for a
 * new language from the glossary in the `translate-ui` skill before starting,
 * not after.
 *
 * Run: `make i18n-traps L=id`
 *      `node scripts/i18n-traps.mjs id [prefix]`
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rulesFor } from './i18n-locale-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const I18N_DIR = join(ROOT, 'public', 'i18n');

const [lang, prefix = ''] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!lang) {
  console.error('Usage: node scripts/i18n-traps.mjs <lang> [prefix]');
  process.exit(2);
}

function flatten(node, path = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const full = path ? `${path}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out);
    else out[full] = String(value);
  }
  return out;
}

let file;
try {
  file = JSON.parse(readFileSync(join(I18N_DIR, `${lang}.json`), 'utf8'));
} catch (error) {
  console.error(`${lang}.json: ${error.message}`);
  process.exit(2);
}

const entries = Object.entries(flatten(file)).filter(
  ([key]) => !prefix || key === prefix || key.startsWith(`${prefix}.`),
);
const locale = rulesFor(lang);
const traps = Object.entries(locale.traps ?? {});

if (!traps.length) {
  console.log(`No trap words defined for ${lang}.`);
  console.log('Add them to scripts/i18n-locale-rules.mjs — one per glossary term,');
  console.log('naming the sense you do NOT mean. See the translate-ui skill.');
  process.exit(0);
}

let hitCount = 0;
for (const [pattern, why] of traps) {
  const re = new RegExp(pattern, 'i');
  const hits = entries.filter(([, value]) => re.test(value));
  if (!hits.length) continue;
  hitCount += hits.length;
  console.log(`\n▸ /${pattern}/  — ${why}`);
  for (const [key, value] of hits.slice(0, 12)) {
    console.log(`    ${key}\n      ${value}`);
  }
  if (hits.length > 12) console.log(`    … and ${hits.length - 12} more`);
}

// Also flag values left identical to English. Legitimate for proper nouns and
// short loanwords (RSS, OPML, "Bluesky"), so it is reported, never fatal — but
// a long identical sentence is an untranslated string that coverage counts as done.
const english = flatten(JSON.parse(readFileSync(join(I18N_DIR, 'en.json'), 'utf8')));
const identical = entries.filter(([key, value]) => english[key] === value && value.length > 24);
if (identical.length) {
  console.log(`\n▸ identical to English (>24 chars) — ${identical.length} key(s)`);
  for (const [key, value] of identical.slice(0, 12)) console.log(`    ${key}\n      ${value}`);
  if (identical.length > 12) console.log(`    … and ${identical.length - 12} more`);
}

console.log(
  `\n${hitCount} trap hit(s) across ${entries.length} keys in ${lang}. ` +
    'A hit is evidence, not a verdict — read each one.',
);
