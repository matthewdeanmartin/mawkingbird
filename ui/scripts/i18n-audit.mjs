/**
 * Audit a migrated directory for the mistakes the gate cannot catch.
 *
 * `check-i18n.mjs` proves that no *line* of a migrated template holds bare
 * English. Three things slip past that and render English — or wrong German —
 * in every locale:
 *
 *   1. **English literals inside `{{ }}`** (`busy() ? 'Saving…' : 'Save'`).
 *      The gate matches per line and reads these as comparison operators.
 *   2. **Sentences built by `+`** (`'Exporting ' + n + '…'`). Correct in
 *      English word order and nowhere else.
 *   3. **Plurals built by gluing a suffix** (`post{{ n === 1 ? '' : 's' }}`).
 *      Wrong in German, Finnish, Russian, Polish and Arabic.
 *
 * None of them fail a build, so they are found by reading or not at all. This
 * is the reading, automated.
 *
 * Run: `node scripts/i18n-audit.mjs [dir ...]`   (default: every MIGRATED dir)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { textNodes, staticAttrs, interpolationLiterals } from './i18n-scan.mjs';

const APP = 'src/app';
const NEWLINE = String.fromCharCode(10);

const MIGRATED = readFileSync('scripts/check-i18n.mjs', 'utf8')
  .match(/const MIGRATED = \[([\s\S]*?)\];/)[1]
  .match(/'([^']+)'/g)
  .map((s) => s.slice(1, -1));

const targets = process.argv.slice(2).length ? process.argv.slice(2) : MIGRATED;

// Entries justified in check-i18n's ALLOWED are not findings — they have been
// argued for in writing. Matched the same way the gate matches them.
const ALLOWED = [
  ...readFileSync('scripts/check-i18n.mjs', 'utf8').matchAll(
    /file:\s*'([^']+)',\s*contains:\s*'([^']*)'/g,
  ),
].map((m) => ({ file: m[1], contains: m[2] }));

const allowed = (rel, line) =>
  ALLOWED.some((entry) => entry.file === rel && line.includes(entry.contains));

/** Angular pipe format names — an API surface, not prose. */
const DATE_FORMATS = new Set([
  'short',
  'medium',
  'long',
  'full',
  'shortDate',
  'mediumDate',
  'longDate',
  'fullDate',
  'shortTime',
  'mediumTime',
  'longTime',
  'fullTime',
]);

/**
 * Line indices inside an `@if (terminologyAvailable())` block.
 *
 * Brace-counted rather than matched, for the same reason `check-i18n.mjs` does
 * it this way: the block contains nested control flow, so stopping at the first
 * `}` would leave most of it unguarded.
 */
function guardedLines(text) {
  const lines = text.split(NEWLINE);
  const inside = new Set();
  let depth = 0;
  let open = false;
  lines.forEach((line, index) => {
    if (!open && line.includes('@if (terminologyAvailable())')) {
      open = true;
      depth = 0;
    }
    if (!open) return;
    inside.add(index);
    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
    if (depth <= 0 && line.includes('}')) open = false;
  });
  return inside;
}

function files(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.(html|ts)$/.test(entry) && !entry.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const findings = [];

for (const dir of targets) {
  for (const file of files(join(APP, dir))) {
    const rel = relative(APP, file).split('\\').join('/');
    // Only files in this directory, not a nested one that is its own entry.
    const text = readFileSync(file, 'utf8');
    const lineOf = (offset) => text.slice(0, offset).split(NEWLINE).length;

    // Blocks guarded by `@if (terminologyAvailable())` render only under
    // English by decree — the post/tweet/florp vocabulary has no translatable
    // plural. `check-i18n.mjs` skips them for the same reason.
    const guarded = guardedLines(text);

    if (file.endsWith('.html')) {
      for (const node of textNodes(text)) {
        if (guarded.has(lineOf(node.start) - 1)) continue;
        const line = text.split(NEWLINE)[lineOf(node.start) - 1] ?? '';
        if (allowed(rel, line)) continue;
        findings.push([rel, lineOf(node.start), 'HARDCODED-TEXT', node.text]);
      }
      for (const attr of staticAttrs(text)) {
        if (guarded.has(lineOf(attr.start) - 1)) continue;
        const line = text.split(NEWLINE)[lineOf(attr.start) - 1] ?? '';
        if (allowed(rel, line)) continue;
        findings.push([rel, lineOf(attr.start), `HARDCODED-${attr.attr.toUpperCase()}`, attr.text]);
      }
      for (const lit of interpolationLiterals(text)) {
        if (guarded.has(lineOf(lit.start) - 1)) continue;
        // Angular date/number pipe formats look like words but are an API.
        if (DATE_FORMATS.has(lit.text)) continue;
        findings.push([rel, lineOf(lit.start), 'ENGLISH-IN-INTERPOLATION', lit.text]);
      }
    }

    text.split(NEWLINE).forEach((line, index) => {
      // A translated string being concatenated with anything.
      if (/\|\s*transloco\s*\)?\s*\+|\+\s*\(?\s*'[^']*'\s*\|\s*transloco/.test(line)) {
        findings.push([rel, index + 1, 'CONCATENATED-SENTENCE', line.trim()]);
      }
      // A plural produced by gluing a suffix onto a word.
      if (/===?\s*1\s*\?\s*''\s*:\s*'e?s'/.test(line)) {
        findings.push([rel, index + 1, 'SUFFIX-PLURAL', line.trim()]);
      }
      // `.replace()` applied to translated text: once the string is German the
      // substring is absent, the replace silently no-ops, and the wrong word
      // ships in every non-English locale.
      //
      // Replacing inside a *parameter* is fine — that operates on data on its
      // way in, not on the finished sentence — so only flag a replace that is
      // not contained in a `{ ... }` params object.
      if (/\|\s*transloco/.test(line) && /\.replace\(/.test(line)) {
        const params = line.slice(line.indexOf('transloco'));
        const insideParams = /\{[^}]*\.replace\(/.test(params);
        if (!insideParams) {
          findings.push([rel, index + 1, 'REPLACE-ON-TRANSLATED', line.trim()]);
        }
      }
    });
  }
}

if (findings.length === 0) {
  console.log(
    `i18n audit clean — ${targets.length} director${targets.length === 1 ? 'y' : 'ies'}.`,
  );
  process.exit(0);
}

const byKind = new Map();
for (const [, , kind] of findings) byKind.set(kind, (byKind.get(kind) ?? 0) + 1);

console.log(`i18n audit — ${findings.length} finding${findings.length === 1 ? '' : 's'}:\n`);
for (const [file, line, kind, text] of findings) {
  const shown = text.length > 90 ? `${text.slice(0, 87)}...` : text;
  console.log(`  ${file}:${line}  ${kind}  ${JSON.stringify(shown)}`);
}
console.log('');
for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${kind}`);
}
process.exit(1);
