import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createShowPrepServer } from './mcp-server.mjs';

// A fake fediverse: every hashtag timeline returns the same few posts, and each
// post can be read with its thread. No network.
const NOW = Date.parse('2026-11-26T12:00:00Z');
const account = (id, extra = {}) => ({
  id,
  acct: `${id}@social.example`,
  display_name: id.toUpperCase(),
  discoverable: true,
  note: '',
  fields: [],
  created_at: '2024-01-01T00:00:00Z',
  ...extra,
});
const post = (id, content, author, extra = {}) => ({
  id,
  uri: `https://social.example/users/${author.id}/statuses/${id}`,
  url: `https://social.example/@${author.id}/${id}`,
  visibility: 'public',
  created_at: '2026-11-25T10:00:00Z',
  language: 'en',
  content: `<p>${content}</p>`,
  media_attachments: [],
  tags: [],
  favourites_count: 4,
  reblogs_count: 1,
  replies_count: 2,
  account: author,
  ...extra,
});
const ana = account('ana');
const bo = account('bo');
const root = post('1', 'Phanpy 2 is out with columns on the web', ana);
const reply = post('2', 'Phanpy columns are great on a big screen', bo, {
  in_reply_to_id: '1',
  in_reply_to_account_id: 'ana',
});
const tusky = post('3', 'Tusky on Android got a new timeline filter', bo);
const optedOut = post('4', 'Phanpy tips', account('cy', { note: '#nosearch' }));
const byId = { 1: root, 2: reply, 3: tusky, 4: optedOut };

// Trending: one on-topic article and one off-topic one.
const article = 'https://blog.example/phanpy-2';
const trendingLinks = [
  {
    url: article,
    title: 'Phanpy 2 review: columns on the web',
    description: 'A close look at the new release',
    provider_name: 'Example Blog',
    image: 'https://blog.example/cover.png',
    history: [
      { day: '1', uses: '40', accounts: '30' },
      { day: '2', uses: '20', accounts: '12' },
    ],
  },
  {
    url: 'https://news.example/election',
    title: 'Election results app crashes',
    description: 'Voters could not load the results',
    provider_name: 'News',
    history: [{ day: '1', uses: '900', accounts: '800' }],
  },
];
const aboutArticle = post('5', `Great review of Phanpy 2: ${article}`, ana);
// A seed account: one on-topic post without hashtags, one off-topic.
const dev = account('dev');
const devRelease = post('6', 'Release day: Pachli 3 is out on Android', dev);
const devCat = post('7', 'My cat sat on the keyboard', dev);

async function fakeFetch(url) {
  const path = new URL(url).pathname;
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  if (path.startsWith('/api/v1/timelines/tag/')) return ok([root, tusky, optedOut]);
  if (path === '/api/v1/trends/links') return ok(trendingLinks);
  if (path === '/api/v1/timelines/link') return ok([aboutArticle]);
  if (path === '/api/v1/accounts/lookup') return ok(dev);
  if (path === '/api/v1/accounts/dev/statuses') return ok([devRelease, devCat]);
  const context = path.match(/^\/api\/v1\/statuses\/(\w+)\/context$/);
  if (context)
    return ok(
      context[1] === '2'
        ? { ancestors: [root], descendants: [] }
        : { ancestors: [], descendants: [reply] },
    );
  const one = path.match(/^\/api\/v1\/statuses\/(\w+)$/);
  if (one && byId[one[1]]) return ok(byId[one[1]]);
  return { ok: false, status: 404, json: async () => ({}) };
}

const outDir = mkdtempSync(join(tmpdir(), 'show-prep-mcp-'));
after(() => rmSync(outDir, { recursive: true, force: true }));

async function connect() {
  const server = createShowPrepServer({ fetch: fakeFetch, now: () => NOW, delayMs: 0, outDir });
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const body = result.content[0].text;
    if (result.isError) return { error: body };
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  };
  return { client, call };
}

test('offers the producer tools and the episode prompt', async () => {
  const { client } = await connect();
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, [
    'add_note',
    'add_post',
    'add_seeds',
    'build_run_sheet',
    'drop',
    'explain_policy',
    'fetch_thread',
    'gather_topic',
    'get_topic',
    'list_topics',
    'pin',
    'restore',
    'shortlist',
    'status',
    'suggest_seeds',
    'trending_links',
  ]);
  const prompt = await client.getPrompt({
    name: 'produce_episode',
    arguments: { topic: 'mastodon-clients' },
  });
  assert.match(
    prompt.messages[0].content.text,
    /producer for a "What's cool on Mastodon" episode about "Mastodon clients"/,
  );
  assert.match(prompt.messages[0].content.text, /ask the owner/i);
});

test('produces an episode end to end: gather, thread, pin, note, drop, build', async () => {
  const { call } = await connect();
  assert.ok((await call('list_topics')).some((t) => t.id === 'mastodon-clients'));
  assert.match(await call('explain_policy'), /#nosearch/);

  const gathered = await call('gather_topic', { topic: 'mastodon-clients' });
  assert.equal(gathered.source, 'live');
  assert.ok(gathered.requests > 0);

  const all = await call('shortlist', { topic: 'mastodon-clients' });
  const urls = all.map((p) => p.url);
  assert.ok(urls.includes(root.url) && urls.includes(tusky.url));
  assert.ok(!urls.includes(optedOut.url), 'opted-out authors never reach the shortlist');

  const thread = await call('fetch_thread', { topic: 'mastodon-clients', url: root.url });
  assert.equal(thread.replies[0].url, reply.url);
  assert.equal(thread.replies[0].verdict, 'skip', 'a reply to someone else is out of context');

  // A skipped post is refused, with the reasons.
  const refused = await call('add_post', { topic: 'mastodon-clients', url: reply.url });
  assert.equal(refused.added, false);

  await call('pin', { topic: 'mastodon-clients', url: root.url });
  await call('add_note', {
    topic: 'mastodon-clients',
    url: root.url,
    note: 'Columns finally reach the web.',
  });
  await call('drop', { topic: 'mastodon-clients', url: tusky.url, reason: 'covered last week' });
  assert.equal((await call('status', { topic: 'mastodon-clients' })).edits.pinned, 1);

  const built = await call('build_run_sheet', {
    topic: 'mastodon-clients',
    app: 'https://mawkingbird.com/canary',
  });
  const page = readFileSync(built.page, 'utf8');
  assert.match(page, /Note: Columns finally reach the web\./);
  assert.match(
    page,
    /https:\/\/mawkingbird\.com\/canary\/social\.example\/@ana@social\.example\/1/,
  );
  assert.doesNotMatch(page, /new timeline filter/);
});

test('reports a bad request as a tool error, not a crash', async () => {
  const { call } = await connect();
  const result = await call('pin', {
    topic: 'mastodon-clients',
    url: 'https://social.example/@nobody/999',
  });
  assert.match(result.error, /Not among the gathered posts/);
});

test('finds trending links on the topic, with the posts about them, and leaves the rest', async () => {
  const { call } = await connect();
  await call('gather_topic', { topic: 'mastodon-clients' });
  const links = await call('trending_links', { topic: 'mastodon-clients' });
  assert.deepEqual(
    links.map((l) => l.url),
    [article],
    'the election story is off topic',
  );
  // Each of the topic's servers lists it: their shares add up.
  assert.equal(links[0].shares, 42 * 4);
  assert.equal(links[0].posts, 1);

  await call('add_note', { topic: 'mastodon-clients', url: article, note: 'Open with this one.' });
  const built = await call('build_run_sheet', { topic: 'mastodon-clients' });
  assert.equal(built.trendingLinks, 1);
  const page = readFileSync(built.page, 'utf8');
  assert.match(page, /<h2>Trending on Mastodon<\/h2>/);
  assert.match(page, /Phanpy 2 review: columns on the web/);
  assert.match(
    page,
    /href="https:\/\/mawkingbird\.com\/link\?url=https%3A%2F%2Fblog\.example%2Fphanpy-2"/,
  );
  assert.match(page, /Note: Open with this one\./);
  assert.match(page, /Great review of Phanpy 2/);
  assert.doesNotMatch(page, /Election results/);

  await call('drop', { topic: 'mastodon-clients', url: article, reason: 'not this week' });
  assert.deepEqual(await call('trending_links', { topic: 'mastodon-clients' }), []);
});

test('suggests seed accounts from the gather, and reads approved ones on topic only', async () => {
  const { call } = await connect();
  await call('gather_topic', { topic: 'mastodon-clients' });
  const suggestions = await call('suggest_seeds', { topic: 'mastodon-clients' });
  assert.ok(suggestions.some((s) => s.handle === 'ana@social.example'));
  assert.ok(
    !suggestions.some((s) => s.handle.startsWith('cy@')),
    'opted-out authors are never suggested',
  );

  const added = await call('add_seeds', {
    topic: 'mastodon-clients',
    handles: ['dev@social.example'],
  });
  assert.equal(added.posts, 2);
  const urls = (await call('shortlist', { topic: 'mastodon-clients', limit: 50 })).map(
    (p) => p.url,
  );
  assert.ok(urls.includes(devRelease.url), 'a seed post on topic is in, hashtag or not');
  assert.ok(!urls.includes(devCat.url), "a seed's off-topic post is not");
});
