import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

/** Enforce deployment values independently of Angular's HTML serialization. */
export function checkProductionLayout({ html, fallback, metadata, cname }) {
  const document = new JSDOM(html).window.document;
  const bases = document.head.querySelectorAll('base');
  assert.equal(bases.length, 1, 'Production must contain exactly one base tag in the head');
  assert.equal(bases[0].getAttribute('href'), '/', 'Production base href must be /');
  assert.ok(
    fallback.includes("var SITE_BASE = '/';"),
    'Production 404 fallback must use root SITE_BASE',
  );
  assert.equal(
    metadata.client_id,
    'https://mawkingbird.com/oauth-client-metadata.json',
    'Production OAuth client_id must use the stable root origin',
  );
  assert.deepEqual(
    metadata.redirect_uris,
    ['https://mawkingbird.com/oauth/bluesky/callback'],
    'Production OAuth redirect must remain stable',
  );
  assert.equal(cname.trim(), 'mawkingbird.com', 'Production CNAME must remain mawkingbird.com');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  assert.ok(directory, 'Usage: node ui/scripts/check-production-layout.mjs <site-directory>');
  const [html, fallback, metadata, cname] = await Promise.all([
    readFile(path.join(directory, 'index.html'), 'utf8'),
    readFile(path.join(directory, '404.html'), 'utf8'),
    readFile(path.join(directory, 'oauth-client-metadata.json'), 'utf8'),
    readFile(path.join(directory, 'CNAME'), 'utf8'),
  ]);
  checkProductionLayout({ html, fallback, metadata: JSON.parse(metadata), cname });
  console.log(
    'Production layout verified: root base, 404 fallback, OAuth identity/redirect and CNAME.',
  );
}
