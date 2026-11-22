import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
export const STARTUP_EXCLUSIONS = [
  'src/app/discovery/starter-kits.ts',
  'src/app/discovery/bundled-starter-kits.generated.ts',
  // Feed Builder topic pages: data, copy and shared words load with their page.
  'src/app/feeds/feed-builder/data/',
  'src/app/feeds/feed-builder/copy/',
  'src/app/feeds/feed-builder/feed-builder-chrome.ts',
  'src/app/feeds/feed-builder/feed-builder-data.ts',
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
    /** Names of the startup outputs, for other boundary checks. */
    outputs: initial,
    inputs: [...inputs].sort((a, b) => b[1] - a[1]),
    violations: STARTUP_EXCLUSIONS.filter((name) => inputs.has(name)),
  };
}

/**
 * Lite (/m/) must stay light: everything its routes can load, beyond the
 * startup bundle, is held to {@link LITE_BUDGET_BYTES}, and it must never pull
 * in the full pages it replaces. A Lite page that imports one of those by
 * accident would quietly turn the low-bandwidth app back into the full one.
 */
export const LITE_SOURCE = 'src/app/lite/';
/** Startup code, so not part of what Lite adds. */
const LITE_STARTUP = new Set(['src/app/lite/lite-mode.ts']);
const LITE_ROUTES = 'src/app/lite/lite.routes.ts';
/**
 * Everything /m/ can load beyond startup, including the full-app screens its
 * routes open lazily (the blog-style writer, the Outbox page, the players).
 * Measured at 1,090 kB on 2026-11-21 after the check started counting those
 * lazy screens (it previously reported ~900 kB by missing them), with Lite's
 * load-control bar and saved-first reading included. Raise only with a reason
 * in the commit.
 */
export const LITE_BUDGET_BYTES = 1_150_000;
export const LITE_EXCLUSIONS = [
  'src/app/feeds/home/home.ts',
  'src/app/feeds/notifications/notifications.ts',
  'src/app/reading/thread/thread.ts',
  'src/app/accounts/profile/profile.ts',
  'src/app/discovery/search/search.ts',
  'src/app/publishing/conversations/conversations.ts',
  'src/app/reading/radio/radio-page.ts',
  'src/app/reading/radio/radio-studio.ts',
  'src/app/reading/videos/videos-page.ts',
  'src/app/forum/',
  'src/app/unbird/',
  'src/app/accounts/mastodon-analytics/',
];

export function summarizeLite(stats) {
  const outputs = stats.outputs;
  const startup = summarizeBundle(stats);
  const initial = startup.outputs;
  const lite = new Set();
  function visit(name) {
    if (lite.has(name) || initial.has(name) || !outputs[name]) return;
    lite.add(name);
    for (const imported of outputs[name].imports ?? []) {
      if (!imported.external && imported.kind !== 'dynamic-import') visit(imported.path);
    }
    if (outputs[name].cssBundle) visit(outputs[name].cssBundle);
  }
  for (const [name, output] of Object.entries(outputs)) {
    const sources = Object.keys(output.inputs ?? {}).map((input) => input.replaceAll('\\', '/'));
    if (sources.some((source) => source.startsWith(LITE_SOURCE) && !LITE_STARTUP.has(source)))
      visit(name);
    // The route table's lazy screens are Lite too, even when they live outside
    // src/app/lite (the full app's writer and Outbox page): follow its dynamic
    // imports one level, then their static imports as usual.
    if (sources.includes(LITE_ROUTES)) {
      for (const imported of output.imports ?? []) {
        if (imported.kind === 'dynamic-import') visit(imported.path);
      }
    }
  }
  let bytes = 0;
  const inputs = new Set();
  for (const name of lite) {
    bytes += outputs[name].bytes;
    for (const input of Object.keys(outputs[name].inputs ?? {}))
      inputs.add(input.replaceAll('\\', '/'));
  }
  return {
    found: lite.size > 0,
    bytes,
    startupBytes: startup.bytes,
    violations: LITE_EXCLUSIONS.filter((excluded) =>
      [...inputs].some((input) => input === excluded || input.startsWith(excluded)),
    ),
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
  const lite = summarizeLite(JSON.parse(await readFile(filename, 'utf8')));
  if (lite.found) {
    console.log(
      `Lite (/m/) beyond startup: ${(lite.bytes / 1000).toFixed(2)} kB (budget ${(LITE_BUDGET_BYTES / 1000).toFixed(0)} kB).`,
    );
    if (lite.bytes > LITE_BUDGET_BYTES || lite.violations.length) {
      if (lite.violations.length)
        console.error(`Lite pulled in full-app pages: ${lite.violations.join(', ')}`);
      if (lite.bytes > LITE_BUDGET_BYTES) console.error('Lite is over its budget.');
      if (args.includes('--check')) process.exitCode = 1;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
