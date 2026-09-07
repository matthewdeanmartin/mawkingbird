/**
 * Fail the build when a published subpath deployment is missing from the 404
 * redirect shim.
 *
 * GitHub Pages serves exactly **one** custom 404 per site: the root
 * `/404.html`. Every deep link under every subpath deployment lands there, and
 * `public/404-subpath-redirect.html` is what routes each one back to the SPA
 * that owns it.
 *
 * A subpath missing from that shim's `SUBPATHS` list does not produce a 404.
 * It does something quieter and worse: the request falls through to the site
 * root, so `/test/settings/mawkingbird-plus?code=…` boots the **production**
 * app instead. A tester expecting sandbox billing lands on live billing, with
 * no error anywhere to say so.
 *
 * The two lists that must agree:
 *   - `SUBPATHS` in public/404-subpath-redirect.html
 *   - the subpaths passed to .github/scripts/publish-gh-pages.sh by the
 *     workflows in .github/workflows/
 *
 * It lives here rather than in a vitest spec because the Angular test build has
 * no Node types and no filesystem access.
 *
 * Run: `npm run check:subpaths`
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SHIM = 'public/404-subpath-redirect.html';
const WORKFLOWS = '../.github/workflows';

/** Subpaths the shim knows how to route. */
function declaredSubpaths() {
  const shim = readFileSync(SHIM, 'utf8');
  const list = /var SUBPATHS = \[([^\]]*)\]/.exec(shim);
  if (!list) {
    throw new Error(`Could not find a SUBPATHS array in ${SHIM}.`);
  }
  return [...list[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/**
 * Subpaths the workflows actually publish.
 *
 * `root` and `standalone` are the two reserved values the publish script
 * understands for whole-site deployments; everything else names a subdirectory.
 */
function publishedSubpaths() {
  const found = new Set();
  for (const file of readdirSync(WORKFLOWS)) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) {
      continue;
    }
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');
    for (const match of text.matchAll(/publish-gh-pages\.sh\s+(\S+)/g)) {
      const subpath = match[1];
      if (subpath !== 'root' && subpath !== 'standalone' && !subpath.startsWith('$')) {
        found.add(subpath);
      }
    }
  }
  return [...found];
}

const declared = declaredSubpaths().sort();
const published = publishedSubpaths().sort();

const missing = published.filter((name) => !declared.includes(name));
const extra = declared.filter((name) => !published.includes(name));

if (missing.length > 0 || extra.length > 0) {
  console.error('The 404 redirect shim does not match what the workflows publish.\n');
  if (missing.length > 0) {
    console.error(`  Published but not routed: ${missing.join(', ')}`);
    console.error('    Deep links under these boot the production app instead.\n');
  }
  if (extra.length > 0) {
    console.error(`  Routed but never published: ${extra.join(', ')}`);
    console.error('    Harmless, but it means the list is out of date.\n');
  }
  console.error(`  Fix: update SUBPATHS in ${SHIM}`);
  process.exit(1);
}

console.log(`Subpath deployments agree: ${declared.join(', ')}`);
