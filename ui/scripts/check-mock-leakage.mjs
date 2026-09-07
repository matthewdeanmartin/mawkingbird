/**
 * Fail when mock-server-only code reaches the standalone Mocking Bird build.
 *
 * Mocking Bird is a general-purpose Mastodon client: it talks to whatever
 * instance the user signs into. The same source tree also builds the UI for the
 * bundled `mastodon_mock` Python server, which serves a private control plane
 * under `/api/v1/_mock/*` — dev logins, fault injection, invites, server
 * settings, CSV import/export. No real Mastodon instance answers any of it.
 *
 * The separation is done with `fileReplacements` in angular.json rather than a
 * runtime flag, so the mock-only URLs and lazy `import()` literals are absent
 * from the Mocking Bird *source* and their chunks are never emitted:
 *
 *   mock-api.ts     -> mock-api.mockingbird.ts     (stubs that throw)
 *   mock-routes.ts  -> mock-routes.mockingbird.ts  (empty route lists)
 *   environment.ts  -> environment.mockingbird.ts  (mockTooling: false)
 *
 * That works only while every mock-only call and route actually lives behind one
 * of those three files. Both have drifted before: nine `_mock` endpoints were
 * added directly to `Api` (which is *not* replaced), and five mock-only settings
 * routes sat in `app.routes.ts`, so a shipped client carried dead URLs and lazy
 * chunks for pages whose every request 404s. Nav entries were hidden, which made
 * it invisible rather than fixed — a typed URL still loaded the broken page.
 *
 * Hence this check: an assertion about build output, where drift shows up no
 * matter which file caused it.
 *
 * Run: `npm run check:mock-leakage` (after `npm run build:mockingbird`)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist-mockingbird';

/** The mock server's control-plane prefix. Nothing on a real instance serves it. */
const MOCK_API_PREFIX = '/api/v1/_mock/';

/**
 * Component selectors for pages that only work against the mock server.
 *
 * Matched as rendered selectors (`app-settings-deletion`) rather than as source
 * filenames, because the emitted chunk contains the selector while the filename
 * survives only in sourcemaps. Anchoring on the selector also avoids matching a
 * legitimately-shipped neighbour: `app-settings-accounts` (the plural
 * "Signed-in accounts" page) contains the singular `settings-account` as a
 * substring, and is a real client feature.
 */
const MOCK_ONLY_SELECTORS = [
  'app-settings-deletion',
  'app-settings-account"',
  'app-settings-notifications',
  'app-settings-invites',
  'app-settings-development',
  'app-fault-injection',
];

/** Every emitted JS/CSS file in the build. */
function bundleFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...bundleFiles(path));
    } else if (/\.(js|css)$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

if (!existsSync(DIST)) {
  console.error(`${DIST}/ not found. Run \`npm run build:mockingbird\` first.`);
  process.exit(2);
}

const failures = [];

for (const file of bundleFiles(DIST)) {
  const text = readFileSync(file, 'utf8');
  if (text.includes(MOCK_API_PREFIX)) {
    failures.push(`${file}: contains ${MOCK_API_PREFIX}`);
  }
  for (const selector of MOCK_ONLY_SELECTORS) {
    if (text.includes(selector)) {
      failures.push(`${file}: contains mock-only component ${selector}`);
    }
  }
}

if (failures.length) {
  console.error('Mock-server code leaked into the Mocking Bird build:\n');
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  console.error(
    '\nMock-only endpoints belong on MockApi (mock-api.ts) and mock-only routes in' +
      '\nmock-routes.ts. Both are file-replaced for this build; Api and app.routes.ts' +
      '\nare not.',
  );
  process.exit(1);
}

console.log(`No mock-server leakage in ${DIST}/.`);
