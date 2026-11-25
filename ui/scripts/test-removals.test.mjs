import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRemovals, parseRemovals, removalReport } from './test-removals.mjs';

const A = 'src/a.spec.ts :: A opens';
const B = 'src/a.spec.ts :: A opens at once';
const C = 'src/c.spec.ts :: C closes';
const why = 'The panel was deleted with the old Radio page.';
const problemsOf = (removals, current = [B, C], elsewhere = []) =>
  checkRemovals({ baseline: [A, C], current, removals, elsewhere }).problems;

test('reads entries, wrapped reasons and several replacements, and skips fenced examples', () => {
  const entries = parseRemovals(
    [
      'Intro.',
      '```',
      '- test: src/example.spec.ts :: not a removal',
      '  reason: renamed',
      '```',
      '## 2026-11-25',
      `- test: ${A}`,
      '  reason: replaced',
      `  now: ${B}`,
      `  now: ${C}`,
      '  why: It opens without',
      '    a second press.',
      '',
      `- test: ${C}`,
      '  reason: dead-code',
      `  why: ${why}`,
    ].join('\r\n'),
  );
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    test: A,
    reason: 'replaced',
    now: [B, C],
    why: 'It opens without a second press.',
  });
  assert.equal(entries[1].why, why);
});

test('a run that loses nothing needs nothing, and new tests are welcome', () => {
  assert.deepEqual(problemsOf([], [A, B, C]), []);
});

test('a test that vanishes unexplained fails the run', () => {
  assert.match(problemsOf([])[0], /no explanation.*A opens/);
});

test('a rename must name a test that runs', () => {
  const rename = { test: A, reason: 'renamed', now: [B], why };
  assert.deepEqual(problemsOf([rename]), []);
  assert.match(problemsOf([{ ...rename, now: [] }])[0], /needs a now:/);
  assert.match(problemsOf([{ ...rename, now: ['src/a.spec.ts :: imaginary'] }])[0], /does not run/);
});

test('dead code and poor tests go with a sentence, and nothing to replace them', () => {
  for (const reason of ['dead-code', 'poor-test'])
    assert.deepEqual(problemsOf([{ test: A, reason, now: [], why }]), []);
  assert.match(problemsOf([{ test: A, reason: 'dead-code', now: [], why: 'old' }])[0], /why:/);
  assert.match(problemsOf([{ test: A, reason: 'because', now: [], why }])[0], /reason must be/);
});

test('a moved test may live in another manifest', () => {
  const moved = { test: A, reason: 'moved', now: ['src/lib/x.spec.ts :: A opens'], why };
  assert.match(problemsOf([moved])[0], /does not run/);
  assert.deepEqual(problemsOf([moved], [B, C], moved.now), []);
});

test('a live test cannot be declared in advance, nor anything twice', () => {
  const early = { test: C, reason: 'dead-code', now: [], why };
  assert.match(problemsOf([early], [A, C])[0], /still runs/);
  const entry = { test: A, reason: 'dead-code', now: [], why };
  assert.match(problemsOf([entry, entry])[0], /twice/);
});

test('history stays valid after its replacement is renamed again', () => {
  const old = { test: 'src/a.spec.ts :: long gone', reason: 'renamed', now: ['gone too'], why };
  assert.deepEqual(problemsOf([old], [A, C]), []);
});

test('the report names each removal and its reason', () => {
  const { removed } = checkRemovals({
    baseline: [A],
    current: [],
    removals: [{ test: A, reason: 'dead-code', now: [], why }],
  });
  assert.match(removalReport(removed), /Report these to the owner/);
  assert.match(removalReport(removed), /A opens\n {4}dead-code: The panel/);
  assert.equal(removalReport([]), '');
});
