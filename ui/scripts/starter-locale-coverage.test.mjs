import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLocales } from './starter-locale-coverage.mjs';

test('reports both directions without conflating scripts, preview locales or starter copy', () => {
  const packs = ['ca', 'zh', 'no'].map((lang) => ({
    lang,
    slug: 'news',
    title: { [lang]: 'Title' },
    blurb: { [lang]: 'Blurb' },
  }));
  const report = reconcileLocales({
    catalog: { generatedAt: '2026-09-08', packs },
    production: ['en', 'zh-Hant', 'nb'],
    inProgress: ['hi', 'ca'],
    dictionaries: ['en', 'zh-Hant', 'nb', 'hi', 'orphan'],
    controls: { en: { follow: 'Follow {{count}}' }, ca: { follow: 'Segueix {{total}}' } },
  });
  assert.deepEqual(report.startersWithoutUi, ['ca', 'zh']);
  assert.deepEqual(report.productionWithoutStarters, ['en', 'zh-Hant']);
  assert.deepEqual(report.inProgressWithoutStarters, ['hi']);
  assert.deepEqual(report.missingDictionaries, ['ca']);
  assert.deepEqual(report.unregisteredDictionaries, ['orphan']);
  assert.deepEqual(report.missingCopy, []);
  assert.deepEqual(
    report.rows.filter((row) => row.language === 'no'),
    [{ language: 'no', packs: 1, ui: 'Production' }],
  );
  assert.equal(
    report.rows.some((row) => row.language === 'nb'),
    false,
  );
  assert.deepEqual(report.missingControls, ['ca: follow', 'no: follow', 'zh: follow']);
  packs[0].blurb = { en: 'English fallback is not Catalan coverage' };
  assert.deepEqual(
    reconcileLocales({
      catalog: { packs },
      production: [],
      inProgress: [],
      dictionaries: [],
      controls: { en: {} },
    }).missingCopy,
    ['ca/news: blurb'],
  );
});
