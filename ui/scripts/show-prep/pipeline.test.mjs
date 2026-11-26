import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gatherTopic } from './gather.mjs';
import { onTopic, plainText, rankCandidates, segmentFor } from './rank.mjs';
import { appLink, buildRunSheet, runSheetMarkdown } from './run-sheet.mjs';
import { checkTopic, loadTopic } from './topic.mjs';

const NOW = Date.parse('2026-11-26T12:00:00Z');

const pack = checkTopic({
  id: 'test-clients',
  title: 'Test clients',
  servers: ['one.example', 'two.example'],
  hashtags: ['Phanpy', 'Tusky'],
  segments: [
    { id: 'web', title: 'Web', keywords: ['Phanpy'] },
    { id: 'android', title: 'Android', keywords: ['tusky'] },
    { id: 'general', title: 'General', keywords: ['client'] },
  ],
  ambiguous: ['tusky'],
  contextWords: ['mastodon', 'app'],
  maxAgeDays: 14,
  perAuthor: 1,
});

let next = 0;
function post(content, extra = {}, account = {}) {
  const id = String(++next);
  return {
    id,
    uri: `https://home.example/users/a${id}/statuses/${id}`,
    url: `https://home.example/@a${id}/${id}`,
    visibility: 'public',
    created_at: '2026-11-25T12:00:00Z',
    content: `<p>${content}</p>`,
    language: 'en',
    media_attachments: [],
    tags: [],
    favourites_count: 0,
    reblogs_count: 0,
    replies_count: 0,
    account: {
      id: `a${id}`,
      acct: `a${id}@home.example`,
      display_name: `Person ${id}`,
      discoverable: true,
      note: '',
      fields: [],
      ...account,
    },
    ...extra,
  };
}

test('every shipped topic pack is valid', () => {
  assert.equal(loadTopic('mastodon-clients').id, 'mastodon-clients');
});

test('a broken pack lists all its problems at once', () => {
  assert.throws(
    () => checkTopic({ id: 'Bad Id', servers: ['https://x'], hashtags: ['#tag'] }),
    (error) => {
      const message = String(error.message);
      return ['id:', 'title:', 'servers:', 'hashtags:', 'segments:'].every((part) =>
        message.includes(part),
      );
    },
  );
});

test('gathers each tag on each server, records failures, and keeps to the budget', async () => {
  const urls = [];
  const fetchStub = async (url) => {
    urls.push(url);
    if (url.includes('two.example')) return { ok: false, status: 401, json: async () => [] };
    return { ok: true, status: 200, json: async () => [post('Phanpy is lovely')] };
  };
  const result = await gatherTopic({ ...pack, requestBudget: 3 }, { fetch: fetchStub, delayMs: 0 });
  assert.equal(result.requests, 3);
  assert.equal(urls[0], 'https://one.example/api/v1/timelines/tag/Phanpy?limit=40');
  assert.equal(result.candidates.length, 2);
  assert.ok(result.failures.some((f) => f.includes('two.example #Phanpy: HTTP 401')));
  assert.ok(result.failures.some((f) => f.includes('budget')));
});

test('puts a post in the first segment with a keyword, the last one otherwise', () => {
  assert.equal(segmentFor(post('I switched to Tusky'), pack.segments).segment, 'android');
  assert.equal(segmentFor(post('no keywords at all'), pack.segments).segment, 'general');
  // Whole words: "clients" is not "client", and "happy" never matches "app".
  assert.deepEqual(segmentFor(post('a happy client'), pack.segments).matched, ['client']);
  assert.deepEqual(segmentFor(post('so many clientside bugs'), pack.segments).matched, []);
});

test('ranks on topic first, drops skipped posts, merges duplicates and caps authors', () => {
  const viralOffTopic = post('a cat picture', { favourites_count: 5000 });
  const onTopic = post('Phanpy got columns today', { favourites_count: 3 });
  const optedOut = post('Phanpy tips', {}, { note: '#nosearch' });
  const sameAuthor = { ...post('Tusky update'), account: onTopic.account };
  const sheetInput = [
    { status: onTopic, server: 'one.example', tag: 'Phanpy' },
    { status: onTopic, server: 'two.example', tag: 'Tusky' },
    { status: viralOffTopic, server: 'one.example', tag: 'Phanpy' },
    { status: optedOut, server: 'one.example', tag: 'Phanpy' },
    { status: sameAuthor, server: 'one.example', tag: 'Tusky' },
  ];
  const ranked = rankCandidates(sheetInput, pack, NOW);
  assert.equal(ranked[0].post.id, onTopic.id);
  assert.deepEqual(ranked[0].tags, ['Phanpy', 'Tusky']);
  assert.ok(!ranked.some((r) => r.post.id === optedOut.id));
  assert.ok(!ranked.some((r) => r.post.id === sameAuthor.id));
  assert.ok(ranked.some((r) => r.post.id === viralOffTopic.id));
});

test('builds a run sheet with links that open in Mawkingbird', () => {
  const onTopic = post('Phanpy got columns today', { spoiler_text: 'long' });
  const ranked = rankCandidates(
    [{ status: onTopic, server: 'one.example', tag: 'Phanpy' }],
    pack,
    NOW,
  );
  const sheet = buildRunSheet(
    ranked,
    pack,
    { requests: 4, failures: ['two.example #Tusky: HTTP 401'] },
    '2026-11-26T12:00:00Z',
  );
  assert.deepEqual(
    sheet.segments.map((s) => s.id),
    ['web'],
  );
  const item = sheet.segments[0].items[0];
  assert.equal(
    item.app,
    `https://mawkingbird.com/home.example/@a${onTopic.id}@home.example/${onTopic.id}`,
  );
  assert.equal(item.verdict, 'review');
  const markdown = runSheetMarkdown(sheet);
  assert.match(markdown, /## Web/);
  assert.match(markdown, /⚠ review: content warning/);
  assert.match(markdown, /\[Open in Mawkingbird\]\(https:\/\/mawkingbird\.com\/home\.example\//);
  assert.match(markdown, /two\.example #Tusky: HTTP 401/);
});

test('falls back to the original link for software without /@user/id paths', () => {
  assert.equal(appLink({ url: 'https://misskey.example/notes/abc' }), null);
  assert.equal(
    appLink({ url: 'https://fosstodon.org/@ana/123' }),
    'https://mawkingbird.com/fosstodon.org/@ana@fosstodon.org/123',
  );
});

test('an ambiguous name needs a context word to be on topic', () => {
  const elk = post('Bull tusky in the park at dawn');
  assert.equal(onTopic(elk, ['tusky'], pack), false);
  assert.equal(onTopic(post('Tusky is my Mastodon app'), ['tusky'], pack), true);
  assert.equal(onTopic(post('Phanpy and tusky'), ['phanpy', 'tusky'], pack), true);
});

test('keeps the first of a cross-post or article farm: same text, another address', () => {
  const first = post('How to deploy Phanpy on your own server, step by step');
  const copy = {
    ...first,
    id: 'copy',
    uri: 'https://elsewhere.example/x',
    url: 'https://elsewhere.example/@a/9',
  };
  const ranked = rankCandidates(
    [
      { status: first, server: 'one.example', tag: 'Phanpy' },
      { status: copy, server: 'two.example', tag: 'Phanpy' },
    ],
    { ...pack, perAuthor: 5 },
    NOW,
  );
  assert.deepEqual(
    ranked.map((r) => r.post.id),
    [first.id],
  );
});

test('decodes entities in excerpts', () => {
  assert.equal(
    plainText('<p>Official client&#39;s &quot;share&quot; &amp; more</p>'),
    `Official client's "share" & more`,
  );
});

test('renders the sheet as a standalone page, with post text escaped', async () => {
  const { runSheetHtml, safeHref } = await import('./run-sheet-html.mjs');
  // Tags are stripped; encoded markup decodes back into text, which the page escapes.
  const evil = post('&lt;img src=x onerror=alert(1)&gt; Phanpy is great');
  evil.url = 'javascript:alert(1)';
  const ranked = rankCandidates(
    [{ status: evil, server: 'one.example', tag: 'Phanpy' }],
    pack,
    NOW,
  );
  const sheet = buildRunSheet(ranked, pack, { requests: 1, failures: [] }, '2026-11-26T12:00:00Z');
  const page = runSheetHtml(sheet, {
    template:
      '<html><head><link rel="stylesheet" href="$root/style.css"></head><body class="$page_class"><aside>$toc_label$toc</aside><main>$meta$content</main></body></html>',
    css: 'body{}',
  });
  assert.match(page, /<style>body\{\}/);
  assert.match(page, /href="#web">Web<\/a> \(1\)/);
  assert.doesNotMatch(page, /<img src=x/);
  assert.match(page, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(page, /href="javascript:/);
  assert.equal(safeHref('javascript:alert(1)'), '#');
  assert.match(page, /data-sheet="test-clients@2026-11-26T12:00:00Z"/);
});

test('shows public images on the page, with alt text, and drops unsafe image addresses', async () => {
  const { runSheetHtml } = await import('./run-sheet-html.mjs');
  const withImages = post('Phanpy screenshots', {
    media_attachments: [
      {
        type: 'image',
        preview_url: 'https://files.example/p.jpg',
        url: 'https://files.example/f.jpg',
        description: 'The new columns view',
      },
      {
        type: 'video',
        preview_url: 'data:image/png;base64,AAAA',
        url: 'https://files.example/v.mp4',
        description: 'Demo',
      },
    ],
  });
  const ranked = rankCandidates(
    [{ status: withImages, server: 'one.example', tag: 'Phanpy' }],
    pack,
    NOW,
  );
  const sheet = buildRunSheet(ranked, pack, { requests: 1, failures: [] }, '2026-11-26T12:00:00Z');
  assert.equal(sheet.segments[0].items[0].media.length, 2);
  const page = runSheetHtml(sheet, {
    template: '<body class="$page_class">$content</body>',
    css: '',
  });
  assert.match(page, /<img src="https:\/\/files\.example\/p\.jpg" alt="The new columns view"/);
  assert.match(page, /href="https:\/\/files\.example\/f\.jpg"/);
  assert.doesNotMatch(page, /src="data:/);
  assert.match(page, /<span>video<\/span>/);
});

test('links can point at canary instead of production', () => {
  assert.equal(
    appLink({ url: 'https://fosstodon.org/@ana/123' }, 'https://mawkingbird.com/canary/'),
    'https://mawkingbird.com/canary/fosstodon.org/@ana@fosstodon.org/123',
  );
});
