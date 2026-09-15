import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
export const STARTUP_EXCLUSIONS = [
  'src/app/starter-kits.ts',
  'src/app/bundled-starter-kits.generated.ts',
];

/** Follow static output imports only; importing a lazy chunk must not count it. */
export function summarizeBundle(stats) {
  const outputs = stats.outputs;
  if (!outputs || typeof outputs !== 'object')
    throw new Error('Expected Angular/esbuild stats outputs.');
  const initial = new Set();
  function visit(name) {
    if (initial.has(name) || !outputs[name]) return;
    initial.add(name);
    const output = outputs[name];
    for (const imported of output.imports ?? []) {
      if (!imported.external && imported.kind !== 'dynamic-import') visit(imported.path);
    }
    if (output.cssBundle) visit(output.cssBundle);
  }
  for (const [name, output] of Object.entries(outputs)) {
    const entry = (output.entryPoint ?? '').replaceAll('\\', '/');
    if (
      entry === 'src/main.ts' ||
      /^angular:(?:styles|script|scripts)\/global:/.test(entry) ||
      entry === 'angular:polyfills'
    )
      visit(name);
  }
  if (!initial.size)
    throw new Error('No application entry points found; inspect the stats format.');
  const inputs = new Map();
  let bytes = 0;
  for (const name of initial) {
    bytes += outputs[name].bytes;
    for (const [input, contribution] of Object.entries(outputs[name].inputs ?? {})) {
      const normalized = input.replaceAll('\\', '/');
      inputs.set(normalized, (inputs.get(normalized) ?? 0) + contribution.bytesInOutput);
    }
  }
  return {
    bytes,
    inputs: [...inputs].sort((a, b) => b[1] - a[1]),
    violations: STARTUP_EXCLUSIONS.filter((name) => inputs.has(name)),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const filename =
    args.find((arg) => !arg.startsWith('--')) ?? path.join(root, 'dist-mockingbird/stats.json');
  const summary = summarizeBundle(JSON.parse(await readFile(filename, 'utf8')));
  const config = JSON.parse(await readFile(path.join(root, 'angular.json'), 'utf8'));
  const budget = config.projects.ui.architect.build.configurations.mockingbird.budgets.find(
    (item) => item.type === 'initial',
  );
  console.log(
    `Initial JavaScript + CSS: ${(summary.bytes / 1000).toFixed(2)} kB (${summary.bytes} bytes). Angular limit: ${budget.maximumError}.`,
  );
  console.log('Largest initial source contributions (minified, before transfer compression):');
  for (const [name, bytes] of summary.inputs.slice(0, 15))
    console.log(`  ${(bytes / 1000).toFixed(2).padStart(8)} kB  ${name}`);
  if (summary.violations.length) {
    console.error(`Optional collection data entered startup: ${summary.violations.join(', ')}`);
    if (args.includes('--check')) process.exitCode = 1;
  } else {
    console.log('Startup boundary OK: collection snapshots remain lazy.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
