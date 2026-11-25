import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { checkRemovals, readRemovals, removalReport, REMOVALS_FILE } from './test-removals.mjs';

const root = path.resolve(import.meta.dirname, '..');
const reportArgument = process.argv.find((argument) => argument.endsWith('.json'));
if (!reportArgument) {
  throw new Error('Usage: check-test-manifest.mjs <vitest-results.json>');
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

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const protectedIds = new Set(baseline.tests);
const added = testIds.filter((testId) => !protectedIds.has(testId));

const { tests: libTests } = JSON.parse(
  await readFile(path.join(root, 'lib-test-manifest.json'), 'utf8'),
);
const { problems, removed } = checkRemovals({
  baseline: baseline.tests,
  current: testIds,
  removals: readRemovals(),
  elsewhere: libTests,
});

console.log(
  `Runtime test manifest: ${testIds.length} present, ${added.length} added, ` +
    `${removed.length} removed with a reason.`,
);
const removedReport = removalReport(removed);
if (removedReport) console.log(removedReport);

if (problems.length) {
  console.error(
    `${problems.length} problem(s) with removed tests:\n` +
      problems.map((problem) => `- ${problem}`).join('\n') +
      `\nRemoving a test is fine when it is renamed, replaced, for dead code, or a poor test. ` +
      `Say which in ${REMOVALS_FILE}, and tell the owner. If it went by accident, restore it.`,
  );
  process.exitCode = 1;
} else if ((added.length || removed.length) && !process.env.CI) {
  // Nobody edits the manifest: a green, explained run is what it records.
  await writeFile(
    baselinePath,
    `${JSON.stringify({ testCount: testIds.length, tests: testIds }, null, 2)}\n`,
  );
  console.log('Updated test-manifest.json; commit it with the change.');
}
