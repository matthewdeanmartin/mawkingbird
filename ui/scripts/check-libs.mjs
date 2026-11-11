// Keep src/lib/* honest: each library stands alone, and the app reaches it only
// through the entry points its lib.json declares. See ui/docs/libraries.md.
//
// Fails when:
//  1. a library file imports anything outside its own folder (the app, the
//     environments, or another library), by relative path;
//  2. a library imports an npm package its lib.json does not list, or any
//     framework package (Angular, Transloco, RxJS) at all;
//  3. code outside src/lib imports a library file that is not a declared entry;
//  4. a library does not type-check alone on its own tsconfig (which declares
//     no DOM unless lib.json says "web": true, and no Node or test types);
//  5. a folder in src/lib has no lib.json, or lib.json is malformed;
//  6. git ignores any library file (the root .gitignore has a Python `lib/` rule),
//     which would silently leave it out of every commit.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'src');
const libRoot = path.join(src, 'lib');
const posix = (p) => p.split(path.sep).join('/');
const rel = (p) => posix(path.relative(root, p));
const FRAMEWORK = /^(@angular\/|@jsverse\/|rxjs(\/|$)|zone\.js)/;
const TEST_ONLY = new Set(['vitest']);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const installed = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

const problems = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|mts|js|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

// Static imports, re-exports, side-effect imports and dynamic imports.
const SPECIFIER =
  /(?:\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?|\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
function specifiers(file) {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
  return [...text.matchAll(SPECIFIER)].map((m) => m[1]);
}
const packageName = (s) =>
  s
    .split('/')
    .slice(0, s.startsWith('@') ? 2 : 1)
    .join('/');

function resolveRelative(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, path.join(base, 'index.ts')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return base;
}

// 5. Discover libraries.
const libs = new Map();
for (const entry of existsSync(libRoot) ? readdirSync(libRoot, { withFileTypes: true }) : []) {
  if (!entry.isDirectory()) continue;
  const dir = path.join(libRoot, entry.name);
  const manifestPath = path.join(dir, 'lib.json');
  if (!existsSync(manifestPath)) {
    problems.push(`${rel(dir)}: every library needs a lib.json`);
    continue;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    problems.push(`${rel(manifestPath)}: ${error.message}`);
    continue;
  }
  const { web, dependencies, entries } = manifest;
  if (
    typeof web !== 'boolean' ||
    !Array.isArray(dependencies) ||
    !Array.isArray(entries) ||
    !entries.length
  ) {
    problems.push(
      `${rel(manifestPath)}: needs "web" (boolean), "dependencies" and non-empty "entries" arrays`,
    );
    continue;
  }
  for (const e of entries)
    if (!existsSync(path.join(dir, e)))
      problems.push(`${rel(manifestPath)}: entry ${e} does not exist`);
  for (const d of dependencies) {
    if (FRAMEWORK.test(d))
      problems.push(
        `${rel(manifestPath)}: ${d} is a framework package; libraries stay framework-free`,
      );
    else if (!installed.has(d))
      problems.push(`${rel(manifestPath)}: dependency ${d} is not in ui/package.json`);
  }
  libs.set(entry.name, { dir, manifest, entries: new Set(entries.map((e) => path.join(dir, e))) });
}

// 1 and 2. Inside each library.
for (const [name, lib] of libs) {
  const allowed = new Set(lib.manifest.dependencies);
  for (const file of walk(lib.dir)) {
    const isSpec = /\.spec\.ts$/.test(file);
    for (const spec of specifiers(file)) {
      if (spec.startsWith('.')) {
        const target = resolveRelative(file, spec);
        if (!target.startsWith(lib.dir + path.sep))
          problems.push(`${rel(file)}: imports ${spec}, outside the ${name} library`);
      } else if (FRAMEWORK.test(spec)) {
        problems.push(`${rel(file)}: imports ${spec}; libraries stay framework-free`);
      } else if (spec.startsWith('node:')) {
        problems.push(`${rel(file)}: imports ${spec}; libraries do not use Node APIs`);
      } else if (!allowed.has(packageName(spec)) && !(isSpec && TEST_ONLY.has(packageName(spec)))) {
        problems.push(`${rel(file)}: imports ${spec}, not listed in ${name}/lib.json dependencies`);
      }
    }
  }
}

// 3. Outside the libraries: only declared entry points.
for (const file of walk(src)) {
  if (file.startsWith(libRoot + path.sep)) continue;
  for (const spec of specifiers(file)) {
    if (!spec.startsWith('.')) continue;
    const target = resolveRelative(file, spec);
    if (!target.startsWith(libRoot + path.sep)) continue;
    const name = posix(path.relative(libRoot, target)).split('/')[0];
    const lib = libs.get(name);
    if (!lib) problems.push(`${rel(file)}: imports ${spec}, but src/lib/${name} is not a library`);
    else if (!lib.entries.has(target))
      problems.push(
        `${rel(file)}: imports ${spec}; use the ${name} library's entry (${[...lib.manifest.entries].join(', ')})`,
      );
  }
}

// 4. Each library type-checks alone.
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
for (const [name, lib] of libs) {
  const tsconfig = path.join(lib.dir, 'tsconfig.json');
  if (!existsSync(tsconfig)) {
    problems.push(`src/lib/${name}: needs a tsconfig.json`);
    continue;
  }
  const config = JSON.parse(readFileSync(tsconfig, 'utf8'));
  const declared = (config.compilerOptions?.lib ?? []).map((l) => l.toLowerCase());
  if (declared.includes('dom') !== lib.manifest.web)
    problems.push(
      `src/lib/${name}/tsconfig.json: "DOM" in lib must match "web": ${lib.manifest.web} in lib.json`,
    );
  if (JSON.stringify(config.compilerOptions?.types) !== '[]')
    problems.push(
      `src/lib/${name}/tsconfig.json: set "types": [] so no Node or test globals leak in`,
    );
  const result = spawnSync(process.execPath, [tsc, '-p', tsconfig, '--noEmit'], {
    encoding: 'utf8',
  });
  if (result.status !== 0)
    problems.push(
      `src/lib/${name} does not type-check alone:\n${(result.stdout + result.stderr).trim().split('\n').slice(0, 10).join('\n')}`,
    );
}

// 6. Nothing in src/lib is git-ignored.
const libFiles = existsSync(libRoot)
  ? readdirSync(libRoot, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile())
      .map((entry) => posix(path.relative(root, path.join(entry.parentPath, entry.name))))
  : [];
const ignored = spawnSync('git', ['check-ignore', '--stdin'], {
  cwd: root,
  input: libFiles.join('\n'),
  encoding: 'utf8',
});
if (ignored.status === 0)
  for (const file of ignored.stdout.trim().split('\n'))
    problems.push(`${file}: ignored by git, so it would never be committed`);

if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join('\n'));
  console.error(`check:libs: ${problems.length} problem(s) in ${libs.size} libraries.`);
  process.exit(1);
}
console.log(`check:libs: ${libs.size} libraries stand alone (${[...libs.keys()].join(', ')}).`);
