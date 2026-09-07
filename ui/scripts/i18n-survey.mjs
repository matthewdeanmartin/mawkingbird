/**
 * How much interface text is still hardcoded, per directory.
 *
 * Counts the same three shapes the migration has to handle — text nodes,
 * static translatable attributes, and English literals inside `{{ }}` — and
 * skips whatever is already in check-i18n's MIGRATED list. Directories are the
 * unit of work because that is what MIGRATED tracks.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { textNodes, staticAttrs, interpolationLiterals } from './i18n-scan.mjs';

const APP = 'src/app';

const migrated = readFileSync('scripts/check-i18n.mjs', 'utf8')
  .match(/const MIGRATED = \[([\s\S]*?)\];/)[1]
  .match(/'([^']+)'/g)
  .map((s) => s.slice(1, -1));

function files(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.html$/.test(entry)) out.push(full);
  }
  return out;
}

const byDir = new Map();
for (const file of files(APP)) {
  const rel = relative(APP, file).split('\\').join('/');
  if (migrated.some((m) => rel.startsWith(`${m}/`))) continue;
  const text = readFileSync(file, 'utf8');
  const n = textNodes(text).length + staticAttrs(text).length + interpolationLiterals(text).length;
  if (!n) continue;
  const dir = dirname(rel);
  byDir.set(dir, (byDir.get(dir) ?? 0) + n);
}

const rows = [...byDir].sort((a, b) => b[1] - a[1]);
let total = 0;
for (const [dir, n] of rows) {
  total += n;
  console.log(`${String(n).padStart(5)}  ${dir}`);
}
console.error(`\nTOTAL ${total} strings across ${rows.length} directories`);
