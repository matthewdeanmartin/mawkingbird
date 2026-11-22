import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBundle } from './report-bundle.mjs';

function fixture() {
  return {
    outputs: {
      'main.js': {
        entryPoint: 'src/main.ts',
        bytes: 100,
        inputs: { 'src/main.ts': { bytesInOutput: 80 } },
        imports: [
          { path: 'shared.js', kind: 'import-statement' },
          { path: 'kits.js', kind: 'dynamic-import' },
        ],
      },
      'shared.js': { bytes: 50, inputs: { 'src/shared.ts': { bytesInOutput: 40 } }, imports: [] },
      'styles.css': {
        entryPoint: 'angular:styles/global:styles',
        bytes: 20,
        inputs: {},
        imports: [],
      },
      'kits.js': {
        bytes: 900,
        inputs: { 'src/app/discovery/starter-kits.ts': { bytesInOutput: 850 } },
        imports: [{ path: 'shared.js', kind: 'import-statement' }],
      },
    },
  };
}

test('includes initial CSS and shared code once while excluding lazy imports', () => {
  const summary = summarizeBundle(fixture());
  assert.equal(summary.bytes, 170);
  assert.deepEqual(summary.violations, []);
  assert.equal(
    summary.inputs.some(([name]) => name.includes('starter-kits')),
    false,
  );
});

test('detects a transitive static import of optional collection data', () => {
  const stats = fixture();
  stats.outputs['shared.js'].imports.push({ path: 'kits.js', kind: 'import-statement' });
  const summary = summarizeBundle(stats);
  assert.equal(summary.bytes, 1070);
  assert.deepEqual(summary.violations, ['src/app/discovery/starter-kits.ts']);
});

test('refuses an unrecognized build rather than reporting zero bytes', () => {
  assert.throws(() => summarizeBundle({ outputs: {} }), /No application entry/);
});

test('measures what Lite loads beyond startup and flags full pages it pulls in', async () => {
  const { summarizeLite, LITE_BUDGET_BYTES } = await import('./report-bundle.mjs');
  const stats = {
    outputs: {
      'main.js': {
        entryPoint: 'src/main.ts',
        bytes: 100,
        inputs: { 'src/main.ts': {}, 'src/app/lite/lite-mode.ts': {} },
        imports: [
          { path: 'shared.js', kind: 'import-statement' },
          { path: 'lite-pages.js', kind: 'dynamic-import' },
        ],
      },
      'shared.js': { bytes: 50, inputs: { 'src/shared.ts': {} }, imports: [] },
      'lite-pages.js': {
        bytes: 300,
        inputs: { 'src/app/lite/lite-pages.ts': {} },
        imports: [
          { path: 'card.js', kind: 'import-statement' },
          { path: 'shared.js', kind: 'import-statement' },
          { path: 'compose.js', kind: 'dynamic-import' },
        ],
      },
      'card.js': {
        bytes: 200,
        inputs: { 'src/app/posts/status-card/status-card.ts': {} },
        imports: [],
      },
      'compose.js': {
        bytes: 40,
        inputs: { 'src/app/lite/lite-compose.ts': {} },
        imports: [{ path: 'home.js', kind: 'import-statement' }],
      },
      'home.js': { bytes: 5, inputs: { 'src/app/feeds/home/home.ts': {} }, imports: [] },
    },
  };
  const lite = summarizeLite(stats);
  assert.equal(lite.found, true);
  // Startup (main, shared) is not counted; every Lite chunk and its static imports are.
  assert.equal(lite.bytes, 300 + 200 + 40 + 5);
  assert.deepEqual(lite.violations, ['src/app/feeds/home/home.ts']);
  assert.ok(LITE_BUDGET_BYTES > 0);
});
