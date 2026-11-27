// Exercise real IndexedDB, CryptoKey structured cloning and Web Locks across tabs.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { chromium, firefox } from '@playwright/test';
import process from 'node:process';
const require = createRequire(import.meta.url);
// Use the Angular builder's bundler; no separate compiler version to maintain.
const { build } = createRequire(require.resolve('@angular/build/package.json'))('esbuild');
const bundle = await build({
  stdin: {
    contents: `export * from './src/app/connections/bluesky/bluesky-oauth-client'; export { WebcryptoKey, BrowserOAuthClient } from '@atproto/oauth-client-browser';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'oauthTest',
  platform: 'browser',
});
let refreshes = 0;
const server = createServer((req, res) => {
  if (req.url === '/refresh-fixture') {
    refreshes++;
    res.setHeader('Content-Type', 'application/json');
    setTimeout(
      () =>
        res.end(
          JSON.stringify({
            sub: 'did:plc:same',
            iss: 'https://issuer.example',
            access_token: 'fresh',
            refresh_token: 'rotated',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          }),
        ),
      100,
    );
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><title>OAuth isolation regression</title>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await (process.env.OAUTH_TEST_BROWSER === 'firefox' ? firefox : chromium).launch();
  const context = await browser.newContext();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const tabs = await Promise.all(
    ['/', '/canary/', '/test/'].map(async (path) => {
      const page = await context.newPage();
      await page.goto(origin + path);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.evaluate(async () => {
        const clientId = `https://mawkingbird.example${location.pathname}oauth-client-metadata.json`;
        window.scopedClient = oauthTest.createBlueskyOAuthClient({
          clientMetadata: {
            client_id: clientId,
            redirect_uris: [
              `https://mawkingbird.example${location.pathname}oauth/bluesky/callback`,
            ],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            application_type: 'web',
            dpop_bound_access_tokens: true,
            scope: 'atproto',
          },
          handleResolver: 'https://bsky.social',
        });
        window.store = {
          get: (did) => scopedClient.sessionGetter.getStored(did),
          set: (did, value) => scopedClient.sessionGetter.setStored(did, value),
          del: (did) => scopedClient.sessionGetter.delStored(did),
        };
        window.key = await oauthTest.WebcryptoKey.generate(['ES256']);
        await store.set('did:plc:same', {
          dpopKey: key,
          tokenSet: { sub: 'did:plc:same', marker: location.pathname },
        });
      });
      return page;
    }),
  );
  for (const [i, page] of tabs.entries()) {
    assert.equal(
      await page.evaluate(async () => (await store.get('did:plc:same')).tokenSet.marker),
      ['/', '/canary/', '/test/'][i],
    );
    assert.equal(
      await page.evaluate(async () => (await store.get('did:plc:same')).dpopKey.kid === key.kid),
      true,
    );
  }
  // Reproduce the original failure mode against the installed browser wrapper.
  for (const page of tabs) {
    await page.evaluate(async () => {
      window.legacy = new oauthTest.BrowserOAuthClient({
        handleResolver: 'https://bsky.social',
        clientMetadata: {
          client_id: `https://mawkingbird.example${location.pathname}oauth-client-metadata.json`,
          redirect_uris: [`https://mawkingbird.example${location.pathname}oauth/bluesky/callback`],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          application_type: 'web',
          dpop_bound_access_tokens: true,
          scope: 'atproto',
        },
      });
      await legacy.sessionGetter.setStored('did:plc:same', {
        dpopKey: key,
        authMethod: { method: 'none' },
        tokenSet: { sub: 'did:plc:same', marker: location.pathname },
      });
    });
  }
  assert.equal(
    await tabs[0].evaluate(
      async () => (await legacy.sessionGetter.getStored('did:plc:same')).tokenSet.marker,
    ),
    '/test/',
    'original SDK overwrites production with the last preview login',
  );
  await tabs[1].evaluate(() => legacy.sessionGetter.delStored('did:plc:same'));
  assert.equal(
    await tabs[0].evaluate(() => legacy.sessionGetter.getStored('did:plc:same')),
    undefined,
    'original SDK preview deletion erases production too',
  );
  for (const page of tabs) await page.evaluate(() => legacy.dispose());
  // A second production tab shares the production grant; preview deletion cannot erase it.
  const other = await context.newPage();
  await other.goto(origin);
  await other.addScriptTag({ content: bundle.outputFiles[0].text });
  assert.equal(
    await other.evaluate(
      async () =>
        (
          await new oauthTest.BlueskyOAuthDatabase(
            'https://mawkingbird.example/oauth-client-metadata.json',
          )
            .store('session')
            .get('did:plc:same')
        ).tokenSet.marker,
    ),
    '/',
  );
  await tabs[1].evaluate(() => store.del('did:plc:same'));
  assert.equal(
    await tabs[0].evaluate(async () => (await store.get('did:plc:same')).tokenSet.marker),
    '/',
  );
  assert.equal(
    await tabs[2].evaluate(async () => (await store.get('did:plc:same')).tokenSet.marker),
    '/test/',
  );
  // Exercise the real SDK SessionGetter in two tabs, with only its issuer transport stubbed.
  for (const page of [tabs[0], other]) {
    await page.evaluate(() => {
      window.client = oauthTest.createBlueskyOAuthClient({
        clientMetadata: {
          client_id: 'https://mawkingbird.example/oauth-client-metadata.json',
          redirect_uris: ['https://mawkingbird.example/oauth/bluesky/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          application_type: 'web',
          dpop_bound_access_tokens: true,
          scope: 'atproto',
        },
        handleResolver: 'https://bsky.social',
      });
      client.serverFactory.fromIssuer = async () => ({
        authMethod: { method: 'none' },
        refresh: async () => (await fetch('/refresh-fixture')).json(),
      });
    });
  }
  await tabs[0].evaluate(async () =>
    client.sessionGetter.setStored('did:plc:same', {
      dpopKey: key,
      authMethod: { method: 'none' },
      tokenSet: {
        sub: 'did:plc:same',
        iss: 'https://issuer.example',
        access_token: 'expired',
        refresh_token: 'once',
        expires_at: new Date(0).toISOString(),
      },
    }),
  );
  const refreshed = await Promise.all(
    [tabs[0], other].map((page) =>
      page.evaluate(
        async () => (await client.sessionGetter.getSession('did:plc:same')).tokenSet.access_token,
      ),
    ),
  );
  assert.deepEqual(refreshed, ['fresh', 'fresh']);
  assert.equal(refreshes, 1, 'two tabs must not spend the same rotating refresh token twice');
  console.log(
    'PASS OAuth IndexedDB: three clients, shared DID, same-client tabs, key round-trip, isolated deletion, concurrent SDK refresh',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
