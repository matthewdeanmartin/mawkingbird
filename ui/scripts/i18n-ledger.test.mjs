import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptBatch,
  reviewBatch,
  sourceHash,
  stateFor,
  validateSnapshot,
} from './i18n-ledger.mjs';

test('acceptance and review track both source/context and exact translation revisions', () => {
  const en = { 'a.key': 'Save {{name}}' };
  const target = { 'a.key': '儲存 {{name}}' };
  const context = { 'a.key': { desc: 'Button' } };
  assert.equal(stateFor('a.key', en, {}, context, {}), 'missing');
  assert.equal(stateFor('a.key', en, target, context, {}), 'stale');
  const accepted = acceptBatch(target, en, context, {});
  assert.equal(stateFor('a.key', en, target, context, accepted), 'unreviewed');
  const rejected = { 'a.key': { ...accepted['a.key'], reviewRejected: 'Review report' } };
  assert.equal(stateFor('a.key', en, target, context, rejected), 'stale');
  assert.throws(() => reviewBatch(target, en, target, context, rejected));
  assert.equal(acceptBatch(target, en, context, rejected)['a.key'].reviewRejected, undefined);
  const reviewed = reviewBatch(target, en, target, context, accepted);
  assert.equal(stateFor('a.key', en, target, context, reviewed), 'reviewed');
  const reviewWithdrawn = { 'a.key': { ...reviewed['a.key'], reviewRejected: 'Later correction' } };
  const resubmitted = acceptBatch(target, en, context, reviewWithdrawn);
  assert.equal(stateFor('a.key', en, target, context, resubmitted), 'unreviewed');
  assert.equal(resubmitted['a.key'].reviewed, undefined);
  assert.equal(stateFor('a.key', en, target, {}, reviewed), 'stale');
  assert.equal(
    stateFor('a.key', { 'a.key': 'Delete {{name}}' }, target, context, reviewed),
    'stale',
  );
  assert.equal(stateFor('a.key', en, { 'a.key': '保存 {{name}}' }, context, reviewed), 'stale');
  assert.throws(() => reviewBatch({ 'a.key': 'Other' }, en, target, context, reviewed));
  assert.throws(() => reviewBatch(target, en, target, {}, reviewed));
  const corrected = acceptBatch({ 'a.key': '保存 {{name}}' }, en, context, reviewed);
  assert.equal(corrected['a.key'].reviewed, undefined);
  assert.deepEqual(acceptBatch(target, en, context, reviewed), reviewed);
});

test('a draft source snapshot rejects changed context, source, missing keys and wrong locales', () => {
  const en = { a: 'Hello' };
  const snapshot = { locale: 'zh-Hant', keys: { a: sourceHash(en.a, undefined) } };
  validateSnapshot(['a'], snapshot, 'zh-Hant', en, {});
  assert.throws(() => validateSnapshot(['a'], snapshot, 'zh-Hant', { a: 'Bye' }, {}));
  assert.throws(() => validateSnapshot(['a'], snapshot, 'zh-Hant', en, { a: { max: 1 } }));
  assert.throws(() => validateSnapshot(['b'], snapshot, 'zh-Hant', en, {}));
  assert.throws(() => validateSnapshot(['a'], snapshot, 'de', en, {}));
  assert.throws(() => validateSnapshot(['a'], null, 'zh-Hant', en, {}));
});
