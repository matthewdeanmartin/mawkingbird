// Test the in-repo libraries (src/lib/*) outside the Angular suite, and skip the
// ones that have not changed since they last passed on this machine.
//
//   node scripts/test-libs.mjs            run changed libraries, reuse cached passes
//   node scripts/test-libs.mjs --all      run every library (CI always does)
//   node scripts/test-libs.mjs --update   also accept added tests into lib-test-manifest.json
//
// A library's fingerprint covers every file in its folder, the installed
// versions of its declared dependencies and of the test runner, and this
// runner's own configuration. Any change reruns that library.
//
// lib-test-manifest.json guards the inventory the same way test-manifest.json
// guards the app suite: a test that disappears fails the run, cached or not.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { artifactDir } from './artifacts.mjs';

const root = path.resolve(import.meta.dirname, '..');
const libRoot = path.join(root, 'src', 'lib');
const manifestPath = path.join(root, 'lib-test-manifest.json');
const cacheDir = artifactDir('lib-tests');
mkdirSync(cacheDir, { recursive: true });
const all = process.argv.includes('--all') || !!process.env.CI;
const update = process.argv.includes('--update');
const posix = (p) => p.split(path.sep).join('/');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function installedVersion(name) {
  try {
    return JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'))
      .version;
  } catch {
    return 'missing';
  }
}

const shared = createHash('sha256');
for (const file of ['vitest.libs.config.ts', 'scripts/test-libs.mjs'])
  shared.update(file).update(readFileSync(path.join(root, file)));
shared.update(`vitest@${installedVersion('vitest')} jsdom@${installedVersion('jsdom')}`);
const sharedHash = shared.digest('hex');

const libraries = readdirSync(libRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(libRoot, entry.name, 'lib.json')))
  .map((entry) => {
    const dir = path.join(libRoot, entry.name);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'lib.json'), 'utf8'));
    const hash = createHash('sha256').update(sharedHash);
    for (const dep of manifest.dependencies ?? []) hash.update(`${dep}@${installedVersion(dep)}`);
    for (const file of files(dir))
      hash.update(posix(path.relative(dir, file))).update(readFileSync(file));
    const cachePath = path.join(cacheDir, `${entry.name}.json`);
    let cached = null;
    try {
      cached = JSON.parse(readFileSync(cachePath, 'utf8'));
    } catch {
      // Never passed here, or the cache was cleared.
    }
    return { name: entry.name, fingerprint: hash.digest('hex'), cachePath, cached };
  });

const stale = libraries.filter((lib) => all || lib.cached?.fingerprint !== lib.fingerprint);
const fresh = libraries.filter((lib) => !stale.includes(lib));
const testIds = new Map(fresh.map((lib) => [lib.name, lib.cached.tests]));

if (stale.length) {
  const report = path.join(cacheDir, 'report.json');
  const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
  const result = spawnSync(
    process.execPath,
    [
      vitest,
      'run',
      '--config',
      'vitest.libs.config.ts',
      ...stale.flatMap((lib) => ['--project', lib.name]),
      '--reporter=dot',
      '--reporter=json',
      `--outputFile.json=${report}`,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '0' },
    },
  );
  let results;
  try {
    results = JSON.parse(readFileSync(report, 'utf8'));
  } catch {
    console.error('Library tests did not produce a report; see the output above.');
    process.exit(result.status || 1);
  }
  if (
    result.status !== 0 ||
    !results.success ||
    results.numFailedTests ||
    results.numPendingTests
  ) {
    for (const file of results.testResults ?? [])
      for (const test of file.assertionResults ?? [])
        if (test.status === 'failed')
          console.error(
            `✗ ${posix(path.relative(root, file.name))} :: ${test.fullName}\n  ${(test.failureMessages?.[0] ?? '').split('\n')[0]}`,
          );
    console.error('Library tests failed (skipped and pending tests count as failures).');
    process.exit(result.status || 1);
  }
  for (const lib of stale) {
    const dir = path.join(libRoot, lib.name) + path.sep;
    const tests = (results.testResults ?? [])
      .filter((file) => path.resolve(file.name).startsWith(dir))
      .flatMap((file) =>
        file.assertionResults.map(
          (test) => `${posix(path.relative(root, file.name))} :: ${test.fullName}`,
        ),
      )
      .sort();
    testIds.set(lib.name, tests);
    writeFileSync(
      lib.cachePath,
      JSON.stringify(
        { fingerprint: lib.fingerprint, passedAt: new Date().toISOString(), tests },
        null,
        1,
      ),
    );
  }
}

const current = [...testIds.values()].flat().sort();
if (new Set(current).size !== current.length)
  throw new Error('Library test identities must be unique (file :: full name).');
const summary = libraries
  .map(
    (lib) =>
      `${lib.name} ${stale.includes(lib) ? 'ran' : 'unchanged'} (${testIds.get(lib.name).length})`,
  )
  .join(', ');

if (update) {
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ testCount: current.length, tests: current }, null, 2)}\n`,
  );
  console.log(
    `Library tests: ${summary}. Updated lib-test-manifest.json with ${current.length} tests.`,
  );
  process.exit(0);
}

const baseline = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { tests: [] };
const now = new Set(current);
const before = new Set(baseline.tests);
const missing = baseline.tests.filter((id) => !now.has(id));
const added = current.filter((id) => !before.has(id));
console.log(
  `Library tests: ${summary}. ${current.length} present, ${added.length} added, ${missing.length} missing.`,
);
if (added.length)
  console.log(
    `${added
      .slice(0, 10)
      .map((id) => `+ ${id}`)
      .join(
        '\n',
      )}${added.length > 10 ? `\n+ …and ${added.length - 10} more` : ''}\n(npm run test:libs:update protects them)`,
  );
if (missing.length) {
  console.error(missing.map((id) => `- ${id}`).join('\n'));
  console.error(
    'Library tests went missing. Restore them, or explain the change and run npm run test:libs:update.',
  );
  process.exit(1);
}
