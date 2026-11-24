import assert from 'node:assert/strict';
import test from 'node:test';
import { build, entityName, parseCsv } from './import-fedicensus.mjs';

test('parses quoted fields with commas, quotes and line breaks', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,"x, ""y""\nz"\n'), [{ a: '1', b: 'x, "y"\nz' }]);
});

test('keeps plain organisation names and drops vendors and sentence fragments', () => {
  assert.equal(entityName('Pawb Social LLC', 'a.example'), 'Pawb Social LLC');
  assert.equal(entityName('Softwerke Magdeburg e. V', 'a.example'), 'Softwerke Magdeburg e.V.');
  assert.equal(entityName('Hetzner Online GmbH', 'a.example'), null);
  assert.equal(entityName('Amazon Services Korea LLC', 'planet.moe'), null);
  assert.equal(entityName('We are not affiliated with Mastodon gGmbH', 'a.example'), null);
  assert.equal(entityName('To have the Limited', 'a.example'), null);
  assert.equal(entityName('Labs LLC', 'a.example'), null);
});

test("Mastodon's own company counts only on its own servers", () => {
  assert.equal(entityName('Mastodon GmbH', 'mastodon.social'), 'Mastodon GmbH');
  assert.equal(entityName('Mastodon\ngGmbH', 'infosec.exchange'), null);
});

test('keeps policy evidence only, and treats a law as a law', () => {
  const link = (domain, country, basis, reason) => ({ domain, country, basis, reason });
  const out = build(
    [
      link('a.example', 'DE', 'declared', 'names "Germany" in its policies'),
      link('a.example', 'US', 'declared', 'names "dmca" in its policies'),
      link('a.example', 'EU', 'declared', 'names "DSA" in its policies'),
      link('a.example', 'US', 'hosting', 'origin resolves to an IP block there'),
      link('b.example', 'FR', 'tracker', 'a tracker reports hosting there, unverified'),
      link('blog.example', 'DE', 'declared', 'names "Germany" in its policies'),
    ],
    [
      { domain: 'a.example', software: 'mastodon', scored_at: '2026-09-10 21:36:39' },
      { domain: 'b.example', software: 'mastodon' },
      { domain: 'blog.example', software: 'ghost' },
    ],
  );
  assert.equal(out.date, '2026-09-10');
  assert.deepEqual(out.servers, {
    'a.example': { places: ['DE'], laws: ['DMCA', 'Digital Services Act'] },
  });
});
