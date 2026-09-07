/**
 * Apply a key mapping to a template by *offset*, not by text search.
 *
 * The mapping is `[line, kind, exactText] -> key`. Every occurrence is located
 * by re-scanning the live file, so the script cannot drift the way a
 * hand-copied snippet does when Prettier rewraps the prose above it.
 *
 * Replacements are applied back-to-front so earlier offsets stay valid.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { textNodes, staticAttrs, interpolationLiterals } from './i18n-scan.mjs';

const [, , file, mapPath] = process.argv;
const text = readFileSync(file, 'utf8');
const map = JSON.parse(readFileSync(mapPath, 'utf8'));

const nodes = [
  ...textNodes(text).map((n) => ({ ...n, kind: 'TEXT' })),
  ...staticAttrs(text).map((a) => ({ ...a, kind: a.attr })),
  ...interpolationLiterals(text).map((i) => ({ ...i, kind: 'INTERP' })),
].sort((a, b) => a.start - b.start);

const line = (o) => text.slice(0, o).split('\n').length;
const edits = [];
const norm0 = (t) => t.replace(/\s+/g, ' ').trim();
const unused = new Set(map.map((m) => norm0(m.text)));
const missed = [];

for (const n of nodes) {
  // Match on collapsed whitespace: the file is CRLF and Prettier rewraps prose,
  // neither of which changes the sentence a translator is given.
  const norm = (t) => t.replace(/\s+/g, ' ').trim();
  const entry = map.find((m) => norm(m.text) === norm(n.text) && (!m.kind || m.kind === n.kind));
  if (!entry) {
    missed.push(`${line(n.start)}\t${n.kind}\t${JSON.stringify(n.text)}`);
    continue;
  }
  unused.delete(norm0(entry.text));
  let start = n.start;
  let end = n.end;
  let replacement;
  if (n.kind === 'TEXT') {
    replacement = `{{ '${entry.key}' | transloco }}`;
  } else if (n.kind === 'INTERP') {
    // The scanner reports the literal *inside* its quotes, so widen the range
    // by one character each side to swallow them — otherwise the result is
    // `'('key' | transloco)'`, which is a template parse error.
    start = n.start - 1;
    end = n.end + 1;
    replacement = `('${entry.key}' | transloco)`;
  } else {
    // A static attribute becomes a binding: title="X" -> [title]="'key' | transloco".
    // Widen the range to swallow the attribute name and quotes.
    const nameStart = text.lastIndexOf(`${n.attr}="`, n.start);
    start = nameStart;
    end = n.end + 1;
    replacement = `[${n.attr}]="'${entry.key}' | transloco"`;
  }
  edits.push({ start, end, replacement, kind: n.kind, key: entry.key });
}

if (process.argv.includes('--report')) {
  console.log(`mapped ${edits.length} / ${nodes.length}`);
  if (missed.length) {
    console.log('\nUNMAPPED:');
    for (const m of missed) console.log('  ' + m);
  }
  if (unused.size) {
    console.log('\nMAP ENTRIES THAT MATCHED NOTHING:');
    for (const u of unused) console.log('  ' + JSON.stringify(u));
  }
  process.exit(0);
}

let out = text;
for (const e of edits.sort((a, b) => b.start - a.start)) {
  out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
}
writeFileSync(file, out);
console.log(`applied ${edits.length} replacements to ${file}`);
if (missed.length) console.log(`${missed.length} nodes left unmapped`);
