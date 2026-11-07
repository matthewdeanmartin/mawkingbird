import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { artifactDir } from './artifacts.mjs';
import { runQuietly } from './quiet-test-output.mjs';

const root = path.resolve(import.meta.dirname, '..');
// Outside the working tree; see artifacts.mjs.
const resultsDirectory = artifactDir('test-results');
const resultsPath = path.join(resultsDirectory, 'full.json');
const ng = path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const node = process.execPath;
const update = process.argv.includes('--update');
const coverage = process.argv.includes('--coverage');

const testArguments = [
  ng,
  'test',
  '--no-watch',
  '--reporters=json',
  `--output-file=${resultsPath}`,
];
if (coverage) {
  testArguments.push('--coverage');
}

const testStatus = await runQuietly(node, testArguments, { cwd: root });
if (testStatus !== 0) {
  printFailures();
  process.exit(testStatus);
}

/**
 * The JSON reporter is the only one, so a red run would otherwise end with no
 * word of what failed. Name each failure with its first message line; the full
 * stack stays in the report.
 */
function printFailures() {
  let report;
  try {
    report = JSON.parse(readFileSync(resultsPath, 'utf8'));
  } catch {
    console.error(`No test report at ${resultsPath}; the run failed before Vitest finished.`);
    return;
  }
  const failures = [];
  for (const file of report.testResults ?? []) {
    const relative = path.relative(root, file.name).replaceAll('\\', '/');
    const failed = (file.assertionResults ?? []).filter((test) => test.status === 'failed');
    if (file.status === 'failed' && !failed.length) {
      failures.push(`✗ ${relative}: ${firstLine(file.message)}`);
    }
    for (const test of failed) {
      failures.push(
        `✗ ${relative} > ${test.fullName}\n    ${firstLine(test.failureMessages?.[0])}`,
      );
    }
  }
  console.error(
    `\n${report.numFailedTests ?? '?'} of ${report.numTotalTests ?? '?'} tests failed ` +
      `(full messages in ${resultsPath}):\n${failures.join('\n')}`,
  );
}

function firstLine(message = '') {
  return (
    String(message)
      .split('\n')
      .find((line) => line.trim()) ?? '(no message)'
  );
}

const manifestArguments = [path.join(root, 'scripts', 'check-test-manifest.mjs')];
if (update) {
  manifestArguments.push('--update');
}
manifestArguments.push(resultsPath);

const manifestCheck = spawnSync(node, manifestArguments, { cwd: root, stdio: 'inherit' });
if (manifestCheck.error) {
  throw manifestCheck.error;
}
process.exit(manifestCheck.status ?? 1);
