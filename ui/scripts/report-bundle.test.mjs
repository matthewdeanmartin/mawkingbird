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
        inputs: { 'src/app/starter-kits.ts': { bytesInOutput: 850 } },
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
  assert.deepEqual(summary.violations, ['src/app/starter-kits.ts']);
});

test('refuses an unrecognized build rather than reporting zero bytes', () => {
  assert.throws(() => summarizeBundle({ outputs: {} }), /No application entry/);
});
