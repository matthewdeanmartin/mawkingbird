import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const update = process.argv.includes('--update');
const reportArgument = process.argv.find((argument) => argument.endsWith('.json'));
if (!reportArgument) {
  throw new Error('Usage: check-test-manifest.mjs [--update] <vitest-results.json>');
}

const reportPath = path.resolve(root, reportArgument);
const baselinePath = path.join(root, 'test-manifest.json');
const report = JSON.parse(await readFile(reportPath, 'utf8'));

if (!report.success || report.numFailedTests || report.numPendingTests) {
  throw new Error(
    `Refusing to audit a non-green run: ${report.numFailedTests} failed, ` +
      `${report.numPendingTests} pending.`,
  );
}

const testIds = report.testResults
  .flatMap((file) => {
    const normalized = file.name.replaceAll('\\', '/');
    const sourceIndex = normalized.lastIndexOf('/src/');
    const relative = sourceIndex >= 0 ? normalized.slice(sourceIndex + 1) : normalized;
    return file.assertionResults.map((test) => `${relative} :: ${test.fullName}`);
  })
  .sort();

if (new Set(testIds).size !== testIds.length) {
  throw new Error('The runtime test manifest contains duplicate file/name identities.');
}

if (update) {
  const baseline = { testCount: testIds.length, tests: testIds };
  await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Updated test manifest with ${testIds.length} runtime test identities.`);
  process.exit(0);
}

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const current = new Set(testIds);
const protectedIds = new Set(baseline.tests);
const missing = baseline.tests.filter((testId) => !current.has(testId));
const added = testIds.filter((testId) => !protectedIds.has(testId));

console.log(
  `Runtime test manifest: ${testIds.length} present, ${added.length} added, ${missing.length} missing.`,
);
if (added.length) {
  console.log(added.map((testId) => `+ ${testId}`).join('\n'));
}
if (missing.length) {
  console.error(missing.map((testId) => `- ${testId}`).join('\n'));
  process.exitCode = 1;
}
