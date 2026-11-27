import assert from 'node:assert/strict';
import { test } from 'node:test';
import { youtubeOriginRule } from '../src/lib/youtube-rule.js';

// Verified in Firefox 160 (2026-11-27, headless, real YouTube): with this rule a
// bridge search answered 200; without it, 403. The extension's own request
// arrived with no Origin; a tab's request under the same rule kept its Origin.
test('the YouTube rule only removes Origin, only from the extension, only on the API', () => {
  const rule = youtubeOriginRule();
  assert.deepEqual(rule.action, {
    type: 'modifyHeaders',
    requestHeaders: [{ header: 'origin', operation: 'remove' }],
  });
  // -1: requests from no tab, the extension's own. Never the reader's tabs.
  assert.deepEqual(rule.condition.tabIds, [-1]);
  assert.equal(rule.condition.urlFilter, '|https://www.youtube.com/youtubei/v1/');
  assert.deepEqual(rule.condition.requestMethods, ['post']);
});

test('the manifest asks for host-scoped rules, and no webRequest at all', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../src/manifest.json', import.meta.url), 'utf8'));
  assert.ok(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
  for (const removed of ['webRequest', 'webRequestBlocking', 'declarativeNetRequest']) {
    assert.equal(manifest.permissions.includes(removed), false, removed);
  }
});
