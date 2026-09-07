import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceHash } from './i18n-ledger.mjs';
import {
  makeManifest,
  validateManifest,
  candidateMap,
  applyReview,
  fullKeys,
  digest,
} from './i18n-compact.mjs';

const english = { 'a.label': 'Save {{name}}', 'b.label': 'Cancel' };
const context = { 'a.label': { max: 40 } };
const batch = {
  id: '001',
  keys: Object.fromEntries(
    Object.keys(english).map((key) => [key, sourceHash(english[key], context[key])]),
  ),
};
const manifest = makeManifest('ko', batch, english, context, 'policy');
const candidate = {
  manifestHash: manifest.manifestHash,
  entries: [
    ['b001-001', '저장 {{name}}'],
    ['b001-002', '취소'],
  ],
};
const bytes = Buffer.from(JSON.stringify(candidate));
const review = {
  manifestHash: manifest.manifestHash,
  candidateHash: digest(bytes),
  reviewedCount: 2,
  corrections: [],
  blockers: [],
};

test('full-key round trip and unchanged review values', () => {
  validateManifest(manifest, 'ko', english, context, 'policy');
  assert.deepEqual(fullKeys(manifest, applyReview(manifest, candidate, bytes, review)), {
    'a.label': '저장 {{name}}',
    'b.label': '취소',
  });
  assert.equal(
    applyReview(manifest, candidate, bytes, {
      ...review,
      corrections: [['b001-001', '{{name}} 저장']],
    }).get('b001-001'),
    '{{name}} 저장',
  );
});
test('partial checkpoints never count as complete', () => {
  const partial = { ...candidate, entries: candidate.entries.slice(0, 1) };
  assert.equal(candidateMap(manifest, partial, false).size, 1);
  assert.throws(() => candidateMap(manifest, partial), /Incomplete/);
});
test('duplicate and unknown IDs cannot be silently accepted', () => {
  assert.throws(
    () =>
      candidateMap(manifest, {
        ...candidate,
        entries: [...candidate.entries, candidate.entries[0]],
      }),
    /Duplicate/,
  );
  assert.throws(
    () => candidateMap(manifest, { ...candidate, entries: [['unknown', 'x']] }),
    /Unknown/,
  );
  assert.throws(
    () =>
      applyReview(manifest, candidate, bytes, {
        ...review,
        corrections: [
          ['b001-001', 'x'],
          ['b001-001', 'y'],
        ],
      }),
    /Duplicate/,
  );
});
test('source, context, locale, policy and manifest drift fail', () => {
  assert.throws(() => validateManifest(manifest, 'uk', english, context, 'policy'), /locale/);
  assert.throws(
    () => validateManifest(manifest, 'ko', { ...english, 'a.label': 'Changed' }, context, 'policy'),
    /Source drift/,
  );
  assert.throws(() => validateManifest(manifest, 'ko', english, {}, 'policy'), /Source drift/);
  assert.throws(() => validateManifest(manifest, 'ko', english, context, 'new'), /policy/);
  assert.throws(
    () => validateManifest({ ...manifest, batchId: '002' }, 'ko', english, context, 'policy'),
    /hash/,
  );
  assert.throws(() => makeManifest('ko', batch, {}, context, 'policy'), /Source drift/);
});
test('stale or incomplete review cannot stamp a new candidate', () => {
  assert.throws(() => applyReview(manifest, candidate, Buffer.from('changed'), review), /binding/);
  assert.throws(
    () => applyReview(manifest, candidate, bytes, { ...review, reviewedCount: 1 }),
    /Incomplete/,
  );
  assert.throws(
    () => applyReview(manifest, candidate, bytes, { ...review, blockers: ['b001-001'] }),
    /blockers/,
  );
  assert.throws(() => candidateMap(manifest, { ...candidate, manifestHash: 'bad' }), /mismatch/);
});
