// Shared-link failure journeys in a real browser. OCCASIONAL CHECK, NOT AN EDIT
// LOOP: it needs a fresh production build and about two minutes. Run it after
// changing routes, the deep-link resolver, or a landing page's error states
// (thread, reader, profile, tag, watch, starter packs, feeds) — not after every
// edit, and never in a retry loop. `make test-deep-links-browser` builds first.
//
// The source audit (scripts/audit_deep_links.py) proves a shared URL reaches a
// route. This proves what a stranger then *sees* when the post, profile or
// server behind that URL is gone or unreachable: a 200 page stuck on a spinner,
// a raw i18n key, or a message with nowhere to go is as broken as a 404.
//
// Every outside request is answered by the script (404, or a refused
// connection), so the check is deterministic and sends nothing anywhere.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { artifactDir } from './artifacts.mjs';

const root = path.resolve(import.meta.dirname, '../dist-mockingbird/browser');
const results = artifactDir('deep-link-browser');
const SETTLE_MS = 6000;

// [name, URL, extra assertions on the visible text]. One per shareable shape
// in scripts/audit_deep_links.py, plus the server-local address-bar forms.
const LINKS = [
  ['Mastodon post (copied)', '/far.example/@alice@far.example/111111111111111111'],
  ['Mastodon account (copied)', '/@alice@far.example'],
  ['Bluesky post (copied)', '/bsky/profile/did:plc:aliceaaaaaaaaaaaaaaaaaaa/post/3kxyzabc22222'],
  ['Bluesky account (copied)', '/bsky/profile/alice.bsky.social'],
  ['Twitter post', '/twitter/alice/status/99'],
  [
    'Twitter account',
    '/twitter/alice',
    (text) => {
      assert.doesNotMatch(text, /No posts match these filters/, 'claims a filter hid posts');
      assert.doesNotMatch(text, /\b0 posts\b/, 'claims the account has no posts');
    },
  ],
  [
    'Watch video',
    '/watch?post=bsky%3Aat%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F3kxyz&attachment=v1',
  ],
  ['Mastodon thread (address bar)', '/statuses/111111111111111111'],
  ['Mastodon reader (address bar)', '/read/111111111111111111'],
  ['Profile, bare id', '/accounts/123'],
  ['Profile, id + handle', '/accounts/123/@alice@far.example'],
  [
    'Hashtag',
    '/tags/birds',
    (text) => assert.doesNotMatch(text, /No statuses tagged/, 'calls a failed load an unused tag'),
  ],
  ['Shared message (unreadable)', '/message/message-status.abc'],
  ['Bundled starter collection (unknown)', '/collections/starter/no-such-kit'],
  ['Bluesky starter pack', '/bluesky/starter-packs/did:plc:alice/3pack'],
  ['Bluesky feed', '/feeds/bluesky/feed:at:%2F%2Fdid:plc:alice%2Fapp.bsky.feed.generator%2Fbirds'],
];

const SCENARIOS = {
  gone: (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' }),
  unreachable: (route) => route.abort('connectionrefused'),
};

// A visible key looks like `pages.thread.error.loadPost`: an en.json namespace,
// a dot, a camelCase word. Hostnames (far.example) never start with one.
const english = JSON.parse(await readFile(path.join(root, 'i18n/en.json'), 'utf8'));
const namespaces = Object.keys(english).filter((key) => /^[a-z][A-Za-z]+$/.test(key));
const RAW_KEY = new RegExp(`\\b(?:${namespaces.join('|')})\\.[a-z][A-Za-z]+(?:\\.[A-Za-z]+)*\\b`);
const STILL_LOADING = /Loading…|Opening…|Looking them up|Gathering/;

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  // The anonymous app may ask its own origin for an API: answer like a server
  // that has never heard of the thing.
  if (/^\/(api|xrpc|oauth|nodeinfo|\.well-known)\//.test(pathname)) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"error":"Not found"}');
    return;
  }
  try {
    const file = path.join(root, pathname);
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': types[path.extname(file)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(await readFile(path.join(root, 'index.html')));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const failures = [];
const report = [];
try {
  for (const [scenario, answer] of Object.entries(SCENARIOS)) {
    for (const [name, url, extra] of LINKS) {
      const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
      await context.route((target) => !target.href.startsWith(origin), answer);
      const page = await context.newPage();
      const label = `${scenario} · ${name}`;
      try {
        const response = await page.goto(origin + url, { waitUntil: 'domcontentloaded' });
        assert.equal(response?.status(), 200, 'the page itself loads');
        await page.waitForTimeout(SETTLE_MS);
        const seen = await page.evaluate(() => {
          const main = document.querySelector('main') ?? document.body;
          const content = [...main.querySelectorAll('a[href], button')].filter(
            (el) =>
              !el.closest('footer, app-footer, nav, header') &&
              el.offsetParent !== null &&
              !/^\s*←?\s*Back\s*$/i.test(el.textContent ?? ''),
          );
          return {
            text: (main.innerText ?? '').replace(/\s+/g, ' ').trim(),
            ways: content.map((el) => (el.textContent ?? '').trim()).filter(Boolean),
          };
        });
        report.push({ scenario, name, url, final: page.url().replace(origin, ''), ...seen });
        assert.doesNotMatch(seen.text, RAW_KEY, 'shows a raw i18n key');
        assert.doesNotMatch(seen.text, STILL_LOADING, `still loading after ${SETTLE_MS}ms`);
        assert.ok(seen.ways.length > 0, 'offers no way forward besides Back');
        extra?.(seen.text);
      } catch (error) {
        failures.push(`${label}: ${error.message.split('\n')[0]}`);
        await page.screenshot({
          path: path.join(results, `${scenario}-${name.replace(/[^a-z0-9]+/gi, '-')}.png`),
        });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}

await writeFile(path.join(results, 'report.json'), JSON.stringify(report, null, 2));
const total = Object.keys(SCENARIOS).length * LINKS.length;
if (failures.length) {
  console.error(`Deep-link journeys: ${failures.length} of ${total} failed`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`Screenshots and report.json: ${results}`);
  process.exit(1);
}
console.log(`Deep-link journeys: all ${total} end somewhere useful. Report: ${results}`);
