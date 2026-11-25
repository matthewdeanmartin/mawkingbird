// Tests that disappear must be explained, not audited by hand.
//
// test-manifest.json lists every test of the last green run. When a run lacks
// one, test-removals.md has to say why; see that file for the format. A green
// run then rewrites the manifest itself, so nobody edits it.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const REMOVALS_FILE = 'test-removals.md';

/** Reasons, and whether a test that still runs must be named in `now`. */
export const REASONS = {
  renamed: true,
  replaced: true,
  moved: true,
  'dead-code': false,
  'poor-test': false,
};
const MINIMUM_WHY = 15;

/** Read `- test:` entries with their indented `reason:`, `now:` and `why:` lines. */
export function parseRemovals(text) {
  const entries = [];
  let entry = null;
  // Fenced blocks are documentation: the format's own example is not a removal.
  for (const line of text.replace(/^```[^]*?^```/gm, '').split(/\r?\n/)) {
    const start = /^- test:\s*(.+?)\s*$/.exec(line);
    if (start) {
      entry = { test: start[1], now: [] };
      entries.push(entry);
      continue;
    }
    const field = /^\s+(reason|now|why):\s*(.+?)\s*$/.exec(line);
    if (field && entry) {
      if (field[1] === 'now') entry.now.push(field[2]);
      else entry[field[1]] = field[2];
    } else if (entry && /^\s+\S/.test(line) && entry.why) {
      entry.why += ` ${line.trim()}`;
    } else if (!line.trim() || /^\S/.test(line)) entry = null;
  }
  return entries;
}

export function readRemovals(file = path.join(root, REMOVALS_FILE)) {
  try {
    return parseRemovals(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Compare a green run with the manifest.
 *
 * `problems` fail the run. `removed` are the explained ones, for the report.
 * `elsewhere` are other manifests' tests a moved test may have gone to.
 */
export function checkRemovals({ baseline, current, removals, elsewhere = [] }) {
  const now = new Set(current);
  const alive = new Set([...current, ...elsewhere]);
  const declared = new Map();
  const problems = [];
  for (const entry of removals) {
    if (declared.has(entry.test)) problems.push(`declared twice: ${entry.test}`);
    declared.set(entry.test, entry);
    // Declaring a live test would let it vanish unnoticed later.
    if (now.has(entry.test))
      problems.push(`declared as removed, but it still runs (delete the entry): ${entry.test}`);
  }
  const removed = [];
  for (const test of baseline) {
    if (now.has(test)) continue;
    const entry = declared.get(test);
    if (!entry) {
      problems.push(`missing with no explanation in ${REMOVALS_FILE}: ${test}`);
      continue;
    }
    const faults = [];
    if (!(entry.reason in REASONS))
      faults.push(`reason must be one of ${Object.keys(REASONS).join(', ')}`);
    else if (REASONS[entry.reason] && !entry.now.length)
      faults.push(`"${entry.reason}" needs a now: line naming the test that covers it today`);
    for (const name of entry.now)
      if (!alive.has(name)) faults.push(`now: names a test that does not run: ${name}`);
    if ((entry.why ?? '').length < MINIMUM_WHY) faults.push('why: must say why, in a sentence');
    if (faults.length) problems.push(`${test}\n    ${faults.join('\n    ')}`);
    else removed.push(entry);
  }
  return { problems, removed };
}

/** The lines to put in front of the owner. */
export function removalReport(removed) {
  if (!removed.length) return '';
  return [
    `Tests removed: ${removed.length}. Report these to the owner, with the reasons:`,
    ...removed.map((entry) => `- ${entry.test}\n    ${entry.reason}: ${entry.why}`),
  ].join('\n');
}
