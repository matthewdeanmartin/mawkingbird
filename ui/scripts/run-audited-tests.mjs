import { mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { runQuietly } from './quiet-test-output.mjs';

const root = path.resolve(import.meta.dirname, '..');
const resultsDirectory = path.join(root, '.test-results');
const resultsPath = path.join(resultsDirectory, 'full.json');
const ng = path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const node = process.execPath;
const update = process.argv.includes('--update');
const coverage = process.argv.includes('--coverage');

mkdirSync(resultsDirectory, { recursive: true });

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
  process.exit(testStatus);
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
