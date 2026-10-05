import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { stampPreviewSeo } from './stamp-preview-seo.mjs';

for (const base of ['/test/', '/canary/']) {
  for (const ending of ['>', '/>']) {
    test(`${base} stamps robots with ${ending} serialization`, () => {
      const html = `<html><head><base href="${base}"${ending}<meta name="robots" content="index, follow"${ending}<link rel="canonical" href="https://mawkingbird.com/"${ending}</head><body>app</body></html>`;
      const stamped = stampPreviewSeo(html);
      const doc = new JSDOM(stamped).window.document;
      assert.equal(doc.querySelector('meta[name="robots"]').content, 'noindex, follow');
      assert.equal(doc.querySelector('link[rel="canonical"]'), null);
      assert.ok(stamped.includes(`<base href="${base}"${ending}`));
      assert.equal(stampPreviewSeo(stamped), stamped);
    });
  }
}

test('adds a missing preview robots tag', () => {
  const doc = new JSDOM(stampPreviewSeo('<head><base href="/test/"></head>')).window.document;
  assert.equal(doc.querySelector('meta[name="robots"]').content, 'noindex, follow');
});

test('preserves production HTML byte for byte', () => {
  const html = '<head><base href="/"/><meta name="robots" content="index, follow"/></head>';
  assert.equal(stampPreviewSeo(html), html);
});
