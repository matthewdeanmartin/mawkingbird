// Run a chosen set of app specs with a TypeScript program narrowed to them.
//
// `ng test --include=x.spec.ts` still compiles every spec in tsconfig.spec.json:
// about 140,000 lines of tests plus the whole app, roughly 65 seconds before the
// first test runs. Handing the builder a generated tsconfig that lists only the
// chosen specs lets the compiler see those specs and what they import, and
// nothing else. One spec then bundles in about 8 seconds instead of 65.
//
// Type checking is narrowed the same way, so this is inner-loop feedback only.
// `make test` compiles and checks the whole suite and stays the gate.
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { artifactDir } from './artifacts.mjs';
import { runQuietly } from './quiet-test-output.mjs';

export const root = path.resolve(import.meta.dirname, '..');
const ng = path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const posix = (p) => p.split(path.sep).join('/');

/** Every app spec, as root-relative POSIX paths (libraries run in test:libs). */
export function appSpecs() {
  return readdirSync(path.join(root, 'src', 'app'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => posix(path.relative(root, path.join(entry.parentPath, entry.name))))
    .sort();
}

/** Spec files named directly, or found under a named directory. */
export function expandSpecArguments(targets, specs = appSpecs()) {
  const chosen = new Set();
  for (const target of targets) {
    const relative = posix(path.relative(root, path.resolve(root, target)));
    const full = path.join(root, relative);
    if (!existsSync(full)) throw new Error(`No such spec file or directory: ${target}`);
    if (statSync(full).isDirectory()) {
      const prefix = relative === '' ? '' : `${relative}/`;
      for (const spec of specs) if (spec.startsWith(prefix)) chosen.add(spec);
    } else if (relative.endsWith('.spec.ts')) {
      chosen.add(relative);
    } else {
      throw new Error(`Not a spec file or directory: ${target}`);
    }
  }
  return [...chosen].sort();
}

/**
 * Write the narrowed tsconfig under the artifact folder (never the working tree)
 * and return its path relative to ui/: the unit-test builder joins tsConfig onto
 * the workspace root, so an absolute path is not accepted.
 */
function writeNarrowTsconfig(specFiles) {
  const abs = (p) => posix(path.join(root, p));
  const file = path.join(artifactDir('tsconfig'), 'tsconfig.narrow-spec.json');
  const config = {
    extends: abs('tsconfig.spec.json'),
    compilerOptions: {
      outDir: abs('out-tsc/spec'),
      // Type packages resolve from the config's own folder, which is outside ui/.
      types: [abs('node_modules/vitest/globals')],
    },
    include: [abs('src/**/*.d.ts')],
    files: [abs('src/test-setup.ts'), ...specFiles.map(abs)],
  };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return posix(path.relative(root, file));
}

/**
 * Run `ng test` on exactly these specs. `options` are passed through to the
 * builder (for example --watch or --coverage); --no-watch is the default.
 */
export async function runNarrowed(specFiles, options = []) {
  if (!specFiles.length) {
    console.log('No app specs to run.');
    return 0;
  }
  const watch = options.some((o) => o === '--watch' || o.startsWith('--watch='));
  const args = [
    ng,
    'test',
    ...(watch ? [] : ['--no-watch']),
    `--ts-config=${writeNarrowTsconfig(specFiles)}`,
    ...specFiles.map((spec) => `--include=${spec}`),
    ...options,
  ];
  // Windows caps a command line at 32,767 characters. Past that, the narrowed
  // program would be most of the suite anyway, so run the ordinary full program.
  if (args.join(' ').length > 30000) {
    console.log(`${specFiles.length} specs: too many to list; running the whole suite.`);
    return runQuietly(
      process.execPath,
      [ng, 'test', ...(watch ? [] : ['--no-watch']), ...options],
      {
        cwd: root,
      },
    );
  }
  return runQuietly(process.execPath, args, { cwd: root });
}
