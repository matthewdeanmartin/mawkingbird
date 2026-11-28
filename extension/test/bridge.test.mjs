import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromMawkingbird, handleBridgeRequest, readCapped } from '../src/lib/bridge.js';
import { allowedType, checkTarget, privateHostReason } from '../src/lib/fetch-guard.js';

test('checkTarget allows public http(s) pages and drops the fragment', () => {
  const ok = checkTarget('https://blog.example/feed#x', 'feed');
  assert.deepEqual(ok, { ok: true, url: 'https://blog.example/feed', origin: 'https://blog.example' });
  assert.equal(checkTarget('http://203.0.113.7/rss', 'feed').ok, true);
  assert.equal(checkTarget('https://[2606:4700::1111]/', 'article').ok, true);
});

test('checkTarget refuses anything that is not a public web address', () => {
  for (const url of [
    'file:///etc/passwd',
    'ftp://blog.example/',
    'javascript:alert(1)',
    'https://user:pw@blog.example/',
    'http://localhost:8080/',
    'http://router.local/',
    'http://nas.home.arpa/',
    'http://printer/',
    'http://intranet.corp/',
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://172.20.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:192.168.0.1]/',
    'not a url',
  ]) {
    assert.equal(checkTarget(url, 'article').ok, false, url);
  }
  assert.equal(checkTarget('https://blog.example/', 'images').ok, false);
});

test('privateHostReason explains refusals plainly', () => {
  assert.equal(privateHostReason('blog.example'), '');
  assert.equal(privateHostReason('localhost'), 'Local network name.');
  assert.equal(privateHostReason('10.0.0.1'), 'Private address.');
});

test('allowedType matches purpose, ignoring parameters and case', () => {
  assert.equal(allowedType('feed', 'application/RSS+xml; charset=utf-8'), true);
  assert.equal(allowedType('feed', 'image/png'), false);
  assert.equal(allowedType('article', 'text/html'), true);
  assert.equal(allowedType('json', 'text/html'), false);
  assert.equal(allowedType('article', ''), true);
});

test('fromMawkingbird accepts only the configured deployment', () => {
  assert.equal(fromMawkingbird('https://mawkingbird.com/rss', 'https://mawkingbird.com/'), true);
  assert.equal(fromMawkingbird('https://mawkingbird.com/test/rss', 'https://mawkingbird.com/test/'), true);
  assert.equal(fromMawkingbird('https://mawkingbird.com/rss', 'https://mawkingbird.com/test/'), false);
  assert.equal(fromMawkingbird('https://evil.example/', 'https://mawkingbird.com/'), false);
  assert.equal(fromMawkingbird('', 'https://mawkingbird.com/'), false);
});

function deps({ granted = ['https://blog.example/*'], respond, ask = async () => true } = {}) {
  const calls = { fetch: [], ask: [] };
  return {
    calls,
    fetch: async (url, init) => {
      calls.fetch.push({ url, init });
      return respond ? respond(url) : new Response('<rss/>', {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      });
    },
    hasPermission: async (pattern) => granted.includes(pattern),
    requestAccess: async (origin) => {
      calls.ask.push(origin);
      return ask(origin);
    },
  };
}

test('fetch reads a granted site without credentials or page headers', async () => {
  const d = deps();
  const result = await handleBridgeRequest({ op: 'fetch', url: 'https://blog.example/feed', purpose: 'feed' }, d);
  assert.equal(result.ok, true);
  assert.equal(result.body, '<rss/>');
  assert.equal(result.status, 200);
  const { init } = d.calls.fetch[0];
  assert.equal(init.method, 'GET');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.deepEqual(Object.keys(init.headers), ['Accept']);
});

test('fetch says which site needs access, and fetches nothing', async () => {
  const d = deps({ granted: [] });
  const result = await handleBridgeRequest({ op: 'fetch', url: 'https://blog.example/feed', purpose: 'feed' }, d);
  assert.deepEqual(result, { ok: false, error: 'needs-access', origin: 'https://blog.example' });
  assert.equal(d.calls.fetch.length, 0);
});

test('fetch refuses private targets before checking permission or fetching', async () => {
  const d = deps({ granted: ['http://192.168.1.1/*'] });
  const result = await handleBridgeRequest({ op: 'fetch', url: 'http://192.168.1.1/', purpose: 'article' }, d);
  assert.equal(result.error, 'refused');
  assert.equal(d.calls.fetch.length, 0);
});

test('a redirect to a private address or an ungranted site is not read', async () => {
  const redirected = (url) => {
    const response = new Response('secret', { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  };
  const toLan = deps({ respond: () => redirected('http://192.168.0.1/admin') });
  assert.equal(
    (await handleBridgeRequest({ op: 'fetch', url: 'https://blog.example/a', purpose: 'article' }, toLan)).error,
    'refused',
  );
  const elsewhere = deps({ respond: () => redirected('https://other.example/a') });
  assert.deepEqual(
    await handleBridgeRequest({ op: 'fetch', url: 'https://blog.example/a', purpose: 'article' }, elsewhere),
    { ok: false, error: 'needs-access', origin: 'https://other.example' },
  );
});

test('fetch rejects the wrong type, oversize bodies and network failures', async () => {
  const image = deps({ respond: () => new Response('x', { headers: { 'content-type': 'image/png' } }) });
  assert.equal(
    (await handleBridgeRequest({ op: 'fetch', url: 'https://blog.example/f', purpose: 'feed' }, image)).error,
    'type',
  );
  const huge = deps({
    respond: () =>
      new Response('x', { headers: { 'content-type': 'text/html', 'content-length': String(6 * 1024 * 1024) } }),
  });
  assert.equal(
    (await handleBridgeRequest({ op: 'fetch', url: 'https://blog.example/f', purpose: 'article' }, huge)).error,
    'too-large',
  );
  const down = deps();
  down.fetch = async () => {
    throw new TypeError('NetworkError');
  };
  assert.equal(
    (await handleBridgeRequest({ op: 'fetch', url: 'https://blog.example/f', purpose: 'article' }, down)).error,
    'network',
  );
});

test('readCapped stops a stream that passes the limit', async () => {
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024));
    },
  });
  assert.equal(await readCapped(new Response(stream), 10_000), null);
  assert.equal(await readCapped(new Response('héllo'), 100), 'héllo');
});

test('requestAccess asks the reader only when the site is not already allowed', async () => {
  const d = deps({ granted: ['https://blog.example/*'] });
  assert.deepEqual(await handleBridgeRequest({ op: 'requestAccess', origin: 'https://blog.example' }, d), {
    ok: true,
    granted: true,
  });
  assert.equal(d.calls.ask.length, 0);
  const result = await handleBridgeRequest({ op: 'requestAccess', origin: 'https://new.example/page' }, d);
  assert.deepEqual(result, { ok: true, granted: true });
  assert.deepEqual(d.calls.ask, ['https://new.example']);
  assert.equal((await handleBridgeRequest({ op: 'requestAccess', origin: 'http://localhost' }, d)).error, 'refused');
});

test('hello, hasAccess and unknown requests', async () => {
  const d = deps();
  d.extensionVersion = '0.8.0';
  assert.deepEqual(await handleBridgeRequest({ op: 'hello' }, d), {
    ok: true,
    protocol: 'mawkingbird-extension/1',
    version: 2,
    ops: ['hello', 'fetch', 'hasAccess', 'requestAccess', 'allSites', 'requestAllSites', 'youtube'],
    extension: '0.8.0',
  });
  assert.deepEqual(await handleBridgeRequest({ op: 'hasAccess', origin: 'https://blog.example' }, d), {
    ok: true,
    granted: true,
  });
  assert.equal((await handleBridgeRequest({ op: 'post', url: 'x' }, d)).error, 'refused');
  assert.equal((await handleBridgeRequest(null, d)).error, 'refused');
});

const ytBody = JSON.stringify({ context: { client: { clientName: 'WEB' } }, query: 'mastodon' });

test('youtube reads only the four web-client endpoints, with only identification headers', async () => {
  const d = deps({ granted: ['https://www.youtube.com/*'] });
  assert.equal((await handleBridgeRequest({ op: 'youtube', endpoint: 'upload', body: ytBody }, d)).error, 'refused');
  assert.equal(
    (await handleBridgeRequest({ op: 'youtube', endpoint: 'search', body: '[1]' }, d)).error,
    'refused',
  );
  assert.equal(
    (await handleBridgeRequest({ op: 'youtube', endpoint: 'search', body: `{"q":"${'x'.repeat(70_000)}"}` }, d)).error,
    'refused',
  );
  for (const header of [['Cookie', 'SID=1'], ['Authorization', 'Bearer x'], ['X-YouTube-Client-Name', 'WEB']]) {
    const result = await handleBridgeRequest({ op: 'youtube', endpoint: 'search', body: ytBody, headers: [header] }, d);
    assert.equal(result.error, 'refused', header[0]);
  }
  assert.equal(d.calls.fetch.length, 0);
});

test('youtube asks for YouTube access before reading', async () => {
  const d = deps({ granted: [] });
  assert.deepEqual(await handleBridgeRequest({ op: 'youtube', endpoint: 'search', body: ytBody }, d), {
    ok: false,
    error: 'needs-access',
    origin: 'https://www.youtube.com',
  });
});

test('youtube posts to the fixed API without credentials and strips stream URLs', async () => {
  const d = deps({
    granted: ['https://www.youtube.com/*'],
    respond: () =>
      new Response(JSON.stringify({ videoDetails: { title: 'T' }, streamingData: { url: 'x' }, playerAds: [] }), {
        headers: { 'content-type': 'application/json' },
      }),
  });
  const result = await handleBridgeRequest(
    {
      op: 'youtube',
      endpoint: 'player',
      body: ytBody,
      headers: [['X-YouTube-Client-Name', '1'], ['X-YouTube-Client-Version', '2.20261117.01.00']],
    },
    d,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.body), { videoDetails: { title: 'T' } });
  const { url, init } = d.calls.fetch[0];
  assert.equal(url, 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers['X-YouTube-Client-Name'], '1');
});

test('youtube passes on YouTube refusals as failures', async () => {
  const d = deps({
    granted: ['https://www.youtube.com/*'],
    respond: () => new Response('{}', { status: 403, headers: { 'content-type': 'application/json' } }),
  });
  const result = await handleBridgeRequest({ op: 'youtube', endpoint: 'search', body: ytBody }, d);
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test('allSites reads and requests the any-public-site permission', async () => {
  const off = deps({ granted: [], ask: async () => false });
  off.requestAllSites = async () => true;
  assert.deepEqual(await handleBridgeRequest({ op: 'allSites' }, off), { ok: true, granted: false });
  assert.deepEqual(await handleBridgeRequest({ op: 'requestAllSites' }, off), { ok: true, granted: true });
  const on = deps({ granted: ['*://*/*'] });
  on.requestAllSites = async () => {
    throw new Error('must not ask again');
  };
  assert.deepEqual(await handleBridgeRequest({ op: 'requestAllSites' }, on), { ok: true, granted: true });
});
