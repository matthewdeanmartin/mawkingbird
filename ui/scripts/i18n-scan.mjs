/**
 * Find the interface text a template still hardcodes.
 *
 * Three shapes have to be found, and only the first is what `check-i18n.mjs`
 * reports:
 *
 *   1. **Text nodes** — the words between tags.
 *   2. **Static attributes** — `title=`, `placeholder=`, `aria-label=`, `alt=`.
 *   3. **English literals inside `{{ }}`** — `cond ? 'Saving…' : 'Save'`. The
 *      gate's line regex cannot see these, so they survive a "migrated"
 *      directory and render English in every locale.
 *
 * What is deliberately not text: `<code>` samples, HTML comments, control-flow
 * (`@if (...) {`), pipe arguments (`| date: 'longDate'`) and values being
 * compared against (`user.auth === 'email'`).
 *
 * Run: `node scripts/i18n-scan.mjs <template.html>`
 */
import { readFileSync } from 'node:fs';

const NEWLINE = String.fromCharCode(10);

/**
 * Byte ranges that are never interface text: <code> samples (syntax, not prose)
 * and HTML comments (notes to the next developer).
 */
function codeRanges(text) {
  const out = [];
  for (const re of [
    /<code[^>]*>[\s\S]*?<\/code>/g,
    /<!--[\s\S]*?-->/g,
    /<script[\s\S]*?<\/script>/g,
    /<style[\s\S]*?<\/style>/g,
  ]) {
    let m;
    while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

export function textNodes(text) {
  const skip = codeRanges(text);
  const inCode = (off) => skip.some(([a, b]) => off >= a && off < b);
  const out = [];
  const tag = /<(?:"[^"]*"|'[^']*'|[^"'>])*>/g;
  let last = 0;
  let m;
  const pushRun = (start, end) => {
    const raw = text.slice(start, end);
    // Control flow (@if (...) {, @for (...) {, @else ..., }) and interpolations
    // are boundaries, never part of a string.
    const splitter =
      /\{\{[\s\S]*?\}\}|@(?:if|for|switch|case|default|empty|defer|placeholder|loading|error|let)\b[\s\S]*?\{|@else\b[\s\S]*?\{|\}/g;
    let cursor = 0;
    let s;
    const emit = (a, b) => {
      const chunk = raw.slice(a, b);
      const lead = chunk.length - chunk.trimStart().length;
      const trail = chunk.length - chunk.trimEnd().length;
      const inner = chunk.slice(lead, chunk.length - trail);
      if (!/[A-Za-z]{2,}/.test(inner)) return;
      const s0 = start + a + lead;
      if (inCode(s0)) return;
      out.push({ start: s0, end: start + b - trail, text: inner });
    };
    while ((s = splitter.exec(raw))) {
      emit(cursor, s.index);
      cursor = s.index + s[0].length;
    }
    emit(cursor, raw.length);
  };
  // A comment is skipped *before* the tag walk reaches it, not merely when a
  // run is emitted. The tag regex tolerates quoted attribute values, so a lone
  // apostrophe inside a comment ("the group's own aria-label") sends its
  // `'[^']*'` alternation hunting for the next apostrophe — swallowing every
  // real tag in between and hiding whole sections of the file from the scanner.
  // That silently under-reports a directory rather than failing, which is the
  // worst way for this tool to be wrong: it looks finished. Found in
  // account-analytics.html, where it hid ~14KB of strings.
  const commentAt = (off) =>
    skip.find(([a, b], i) => i >= 0 && off >= a && off < b && text.startsWith('<!--', a));
  while ((m = tag.exec(text))) {
    const comment = commentAt(m.index);
    if (comment) {
      // Treat the whole comment as consumed; resume scanning after it.
      if (comment[0] > last) pushRun(last, comment[0]);
      last = comment[1];
      tag.lastIndex = comment[1];
      continue;
    }
    if (m.index > last) pushRun(last, m.index);
    last = tag.lastIndex;
  }
  if (last < text.length) pushRun(last, text.length);
  return out;
}

export function staticAttrs(text) {
  const out = [];
  const re = /(?<![\[\w-])(aria-label|title|placeholder|alt)="([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) {
    if (!/[A-Za-z]{3,}/.test(m[2])) continue;
    if (/\{\{/.test(m[2])) continue;
    const valueStart = m.index + m[0].indexOf('="') + 2;
    out.push({ start: valueStart, end: valueStart + m[2].length, text: m[2], attr: m[1] });
  }
  return out;
}

/** English string literals inside `{{ ... }}` interpolations. */
export function interpolationLiterals(text) {
  const out = [];
  const re = /\{\{[\s\S]*?\}\}/g;
  let m;
  while ((m = re.exec(text))) {
    const lit = /'([^']*[A-Za-z]{3,}[^']*)'/g;
    let l;
    while ((l = lit.exec(m[0]))) {
      // Not display text: translation keys already in use, arguments to a pipe
      // (`| date: 'longDate'`), and values being compared against
      // (`user.auth === 'email'`). Only the branches of an expression are prose.
      if (/^[a-z][\w]*(\.[\w]+)+$/.test(l[1])) continue;
      // A bracketed property name (`entry['.tag']`) and a URL scheme are API
      // surface, not prose.
      if (/^\.?[\w-]+$/.test(l[1]) && /\[\s*$/.test(m[0].slice(0, l.index))) continue;
      if (/^[a-z]+:\/\/$/.test(l[1])) continue;
      const before = m[0].slice(0, l.index).replace(/\s+$/, '');
      // A ternary's else-branch also follows ':', so a colon only disqualifies
      // when there is no unmatched '?' before it — that is a pipe argument.
      const isTernaryElse = /\?[^?]*$/.test(before);
      if (/,$/.test(before)) continue;
      if (/:$/.test(before) && !isTernaryElse) continue;
      if (/[=!]==?$/.test(before)) continue;
      const start = m.index + l.index + 1;
      out.push({ start, end: start + l[1].length, text: l[1] });
    }
  }
  return out;
}

// ---- CLI ----
//
// `node scripts/i18n-scan.mjs <template.html>` prints one row per string as
// `line<TAB>KIND<TAB>"text"`, which is the input a key map is written from.
if (process.argv[1]?.endsWith('i18n-scan.mjs') && process.argv[2]) {
  const file = process.argv[2];
  const text = readFileSync(file, 'utf8');
  const lineOf = (offset) => text.slice(0, offset).split(NEWLINE).length;
  const all = [
    ...textNodes(text).map((n) => ({ ...n, kind: 'TEXT' })),
    ...staticAttrs(text).map((a) => ({ ...a, kind: a.attr })),
    ...interpolationLiterals(text).map((i) => ({ ...i, kind: 'INTERP' })),
  ].sort((a, b) => a.start - b.start);
  for (const n of all) {
    console.log(`${lineOf(n.start)}\t${n.kind}\t${JSON.stringify(n.text)}`);
  }
  console.error(`${all.length} strings`);
}
