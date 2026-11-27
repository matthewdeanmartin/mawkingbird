import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * The page client and the content script against one fake window: the client
 * posts, the content script relays to a fake background, the answer comes back.
 */
async function setUp(answer) {
  const win = new EventTarget();
  win.location = { origin: 'https://mawkingbird.com' };
  win.postMessage = (data, targetOrigin) => {
    assert.equal(targetOrigin, 'https://mawkingbird.com');
    queueMicrotask(() =>
      win.dispatchEvent(Object.assign(new Event('message'), { data, source: win, origin: win.location.origin })),
    );
  };
  const documentElement = { dataset: {} };
  const sent = [];
  globalThis.window = win;
  globalThis.document = { documentElement };
  globalThis.browser = {
    runtime: {
      sendMessage: async (message) => {
        sent.push(message);
        return answer(message.request);
      },
    },
  };
  // The content script is a classic script; run its source in this realm.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/bridge/content.js', import.meta.url), 'utf8');
  new Function(source)();
  const client = await import(`../client/bridge-client.js?${Math.random()}`);
  return { client, sent, win };
}

test('the client reaches the background through the content script and gets its answer', async () => {
  const { client, sent } = await setUp(async (request) => ({ ok: true, echoed: request.op }));
  assert.equal(client.extensionPresent(), true);
  const result = await client.extensionFetch('https://blog.example/feed', 'feed');
  assert.deepEqual(result, { ok: true, echoed: 'fetch' });
  assert.deepEqual(sent.at(-1), {
    type: 'bridge',
    request: {
      op: 'fetch',
      url: 'https://blog.example/feed',
      purpose: 'feed',
      origin: undefined,
      endpoint: undefined,
      body: undefined,
      headers: undefined,
    },
  });
});

test('hasAccess and requestAccess read the granted flag', async () => {
  const { client } = await setUp(async (request) => ({ ok: true, granted: request.op === 'hasAccess' }));
  assert.equal(await client.hasAccess('https://blog.example'), true);
  assert.equal(await client.requestAccess('https://blog.example'), false);
});

test('the content script ignores messages from other windows or origins', async () => {
  const { sent, win } = await setUp(async () => ({ ok: true }));
  const before = sent.length;
  const data = { channel: 'mawkingbird-extension/1', direction: 'to-extension', id: 'x', op: 'hello' };
  win.dispatchEvent(Object.assign(new Event('message'), { data, source: {}, origin: win.location.origin }));
  win.dispatchEvent(Object.assign(new Event('message'), { data, source: win, origin: 'https://evil.example' }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(sent.length, before);
});

test('without the extension the client answers unavailable at once', async () => {
  globalThis.document = { documentElement: { dataset: {} } };
  const client = await import(`../client/bridge-client.js?${Math.random()}`);
  assert.equal(client.extensionPresent(), false);
  assert.equal((await client.extensionFetch('https://blog.example/', 'feed')).error, 'unavailable');
});

test('the client relays YouTube reads with their endpoint, body and headers', async () => {
  const { client, sent } = await setUp(async () => ({ ok: true, body: '{}' }));
  await client.youtube('search', '{"query":"x"}', [['X-YouTube-Client-Name', '1']]);
  assert.deepEqual(sent.at(-1).request, {
    op: 'youtube',
    url: undefined,
    purpose: undefined,
    origin: undefined,
    endpoint: 'search',
    body: '{"query":"x"}',
    headers: [['X-YouTube-Client-Name', '1']],
  });
});
