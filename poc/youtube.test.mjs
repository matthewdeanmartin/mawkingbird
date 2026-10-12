import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, search } from './youtube.mjs';
import { createApp } from './server.mjs';

const id = 'UCy0tKL1T7wFoYcxCe0xjN6Q';
test('channel IDs supply RSS; mixed renderers and invalid IDs are excluded', () => {
  const page = { has_continuation: true, results: [
    { type: 'Channel', id, author: { name: 'Example' } },
    { type: 'Channel', id: '@example', author: { name: 'Handle only' } },
    { type: 'Video', video_id: '0KoeY54M5VA', title: 'Video', author: { id, name: 'Example' } },
    { type: 'AdSlot' },
    { type: 'Video', video_id: '<invalid>' },
  ] };
  const channels = normalize(page, 'example', 'channel');
  assert.equal(channels.items.length, 1);
  assert.equal(channels.items[0].rssUrl, `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  const videos = normalize(page, 'example', 'video');
  assert.equal(videos.items.length, 1);
  assert.equal(videos.items[0].channel.id, id);
  assert.equal(videos.items[0].embedUrl, 'https://www.youtube-nocookie.com/embed/0KoeY54M5VA');
  assert.equal(videos.hasMore, true);
  const missingAuthor = normalize({ results: [{ type: 'Video', video_id: '0KoeY54M5VA' }] }, '', 'video');
  assert.equal(missingAuthor.items[0].channel.rssUrl, null);
});

test('invalid queries fail before making a network request', async () => {
  for (const query of [null, '', '   ', 'x'.repeat(201)]) {
    await assert.rejects(search(query), RangeError);
  }
  await assert.rejects(search('cats', 'invalid'), RangeError);
});

test('HTTP endpoint passes search arguments and reports validation/upstream errors', async (t) => {
  const server = createApp(async (query, type) => {
    if (query === 'bad') throw new RangeError('Invalid query');
    if (query === 'offline') throw new Error('Upstream unavailable');
    return { query, type, items: [] };
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const success = await fetch(`${base}/api/search?q=hello%20world&type=channel`);
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { query: 'hello world', type: 'channel', items: [] });
  assert.equal((await fetch(`${base}/api/search?q=bad`)).status, 400);
  assert.equal((await fetch(`${base}/api/search?q=offline`)).status, 502);
  assert.equal((await fetch(`${base}/api/search`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/unknown`)).status, 404);
  assert.match(await (await fetch(base)).text(), /YouTube search/);
  assert.match(await (await fetch(`${base}/cors`)).text(), /Direct browser YouTube CORS test/);
});
