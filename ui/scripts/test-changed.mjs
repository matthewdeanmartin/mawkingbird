// Run only the app specs a change can affect, with a narrowed program.
//
//   node scripts/test-changed.mjs                  uncommitted + untracked changes
//   node scripts/test-changed.mjs --base=origin/main   also everything since that ref
//   node scripts/test-changed.mjs src/app/x.ts ...     treat these files as changed
//   node scripts/test-changed.mjs --dry-run            list the specs, run nothing
//   node scripts/test-changed.mjs --watch              keep the narrowed run watching
//
// "Affected" means the changed spec itself, or any spec that reaches a changed
// file through static relative imports or a component's templateUrl / styleUrl.
// Lazy `import()` edges are not followed: the route tables reach every page that
// way, so following them would put app.routes.spec.ts (and with it the whole
// app) into nearly every run. Editing a route table still runs its specs. Changes to the test toolchain (package.json, angular.json, tsconfig,
// vitest config, test-setup) run every spec. Library sources also run the
// cached library suite. Inner-loop feedback only: `make test` remains the gate.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { appSpecs, root, runNarrowed } from './narrow-spec-run.mjs';

const posix = (p) => p.split(path.sep).join('/');
const argv = process.argv.slice(2);
const flag = (name) => argv.find((a) => a === name || a.startsWith(`${name}=`));
const base = flag('--base')?.split('=')[1];
const dryRun = !!flag('--dry-run');
const passthrough = argv.filter((a) => a.startsWith('--') && !/^--(base|dry-run)\b/.test(a));
const explicit = argv.filter((a) => !a.startsWith('--'));

const GLOBAL = new Set([
  'package.json',
  'package-lock.json',
  'angular.json',
  'tsconfig.json',
  'tsconfig.spec.json',
  'vitest.config.ts',
  'src/test-setup.ts',
]);

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Changed paths relative to ui/, POSIX. Paths outside ui/ come back as ../… */
function changedFiles() {
  if (explicit.length) return explicit.map((f) => posix(path.relative(root, path.resolve(f))));
  const top = git(['rev-parse', '--show-toplevel'])[0];
  const fromTop = new Set([
    ...git(['diff', '--name-only', 'HEAD']),
    ...git(['ls-files', '--others', '--exclude-standard', '--full-name']),
    ...(base ? git(['diff', '--name-only', `${base}...HEAD`]) : []),
  ]);
  return [...fromTop].map((f) => posix(path.relative(root, path.join(top, f)))).sort();
}

// Relative module references: static imports, re-exports, side-effect imports,
// and component resources ('./x.html', './x.css'). Not lazy import() calls.
const REFERENCE =
  /(?:from\s*|import\s+|(?:templateUrl|styleUrls?)\s*:\s*\[?\s*|,\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

function sourceFiles() {
  return readdirSync(path.join(root, 'src'), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => posix(path.relative(root, path.join(e.parentPath, e.name))));
}

function resolveReference(fromFile, specifier) {
  const target = posix(path.join(path.dirname(fromFile), specifier));
  const resource = /\.(?:html|css|scss|json|ts|mjs|js)$/.test(target);
  const candidates = resource ? [target] : [`${target}.ts`, `${target}/index.ts`];
  // A deleted file resolves to its first candidate, so its importers still count.
  return candidates.find((c) => existsSync(path.join(root, c))) ?? candidates[0];
}

/** Map each file to the files that reference it. */
function reverseGraph(files) {
  const importers = new Map();
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(REFERENCE)) {
      const dependency = resolveReference(file, match[1]);
      if (!importers.has(dependency)) importers.set(dependency, new Set());
      importers.get(dependency).add(file);
    }
  }
  return importers;
}

const changed = changedFiles();
const specs = appSpecs();
const inUi = changed.filter((f) => !f.startsWith('../'));
const outside = changed.filter((f) => f.startsWith('../'));
const global = inUi.filter((f) => GLOBAL.has(f));
const sources = inUi.filter((f) => f.startsWith('src/'));
const libraries = sources.filter((f) => f.startsWith('src/lib/'));
const elsewhere = inUi.filter((f) => !f.startsWith('src/') && !GLOBAL.has(f));

let affected;
if (global.length) {
  affected = specs;
} else {
  const importers = reverseGraph(sourceFiles());
  const seen = new Set();
  const queue = [...sources];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const importer of importers.get(file) ?? []) queue.push(importer);
  }
  const specSet = new Set(specs);
  affected = [...seen].filter((f) => specSet.has(f)).sort();
}

console.log(
  `${changed.length} changed file(s) → ${affected.length} of ${specs.length} app specs` +
    (global.length ? ` (test toolchain changed: ${global.join(', ')})` : ''),
);
if (elsewhere.length || outside.length)
  console.log(
    `Not covered by app specs (check them separately): ${[...elsewhere, ...outside].join(', ')}`,
  );
if (dryRun) {
  for (const spec of affected) console.log(`  ${spec}`);
  if (libraries.length) console.log('  + npm run test:libs (library sources changed)');
  process.exit(0);
}

if (libraries.length) {
  const libs = spawnSync(process.execPath, [path.join(root, 'scripts', 'test-libs.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  if (libs.status !== 0) process.exit(libs.status ?? 1);
}
process.exit(await runNarrowed(affected, passthrough));
