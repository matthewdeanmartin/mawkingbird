import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const redirectPage = readFileSync('public/404-subpath-redirect.html', 'utf8');
const redirectScript = /<script>([\s\S]*?)<\/script>/.exec(redirectPage)?.[1];
assert.ok(redirectScript, 'the Pages 404 redirect has an executable script');
const bootScript = readFileSync('public/boot.js', 'utf8');

function followPagesRedirect(path, base = '/') {
  const original = new URL(path, 'https://mawkingbird.com');
  let redirect;
  runInNewContext(redirectScript, {
    window: {
      location: {
        pathname: original.pathname,
        search: original.search,
        hash: original.hash,
        replace(value) {
          redirect = value;
        },
      },
    },
    encodeURIComponent,
  });
  assert.ok(redirect, 'the 404 page redirects to the owning app');
  const entry = new URL(redirect, original.origin);
  let restored;
  runInNewContext(bootScript, {
    window: { location: { search: entry.search, href: entry.href } },
    history: {
      replaceState(_state, _title, value) {
        restored = value;
      },
    },
    document: {
      querySelector: () => ({ href: new URL(base, original.origin).href }),
      documentElement: { classList: { add() {} } },
    },
    URL,
    URLSearchParams,
  });
  return { redirect, restored };
}

test('a shared Bluesky Watch link keeps its post, attachment and server', () => {
  const path =
    '/watch?post=bsky%3Aat%3A%2F%2Fdid%3Aplc%3Aalice%2Fapp.bsky.feed.post%2F3kxyz&attachment=v1&server=https%3A%2F%2Fmastodon.social';
  const { redirect, restored } = followPagesRedirect(path);
  assert.ok(redirect.startsWith('/?spa='));
  assert.equal(restored, path);
});

test('a copied Mastodon post keeps its route, query and fragment', () => {
  const path = '/far.example/@alice@far.example/42?reader=1#reply';
  assert.equal(followPagesRedirect(path).restored, path);
});

test('a canary shared link returns to canary rather than the production app', () => {
  const path = '/canary/bsky/profile/did:plc:alice/post/3kxyz';
  const { redirect, restored } = followPagesRedirect(path, '/canary/');
  assert.ok(redirect.startsWith('/canary/?spa='));
  assert.equal(restored, path);
});

test('the boot script rejects a protocol-relative restore target', () => {
  let restored = false;
  runInNewContext(bootScript, {
    window: {
      location: {
        search: '?spa=%2F%2Fevil.example',
        href: 'https://mawkingbird.com/?spa=%2F%2Fevil.example',
      },
    },
    history: { replaceState: () => (restored = true) },
    document: {
      querySelector: () => ({ href: 'https://mawkingbird.com/' }),
      documentElement: { classList: { add() {} } },
    },
    URL,
    URLSearchParams,
  });
  assert.equal(restored, false);
});
