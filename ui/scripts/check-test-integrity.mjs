import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'src');
const baselinePath = path.join(root, 'test-integrity-baseline.json');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    }),
  );
  return files.flat();
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

const forbidden = [
  {
    label: 'focused, skipped, or pending test',
    pattern:
      /\b(?:describe|it|test)\s*\.\s*(?:only|skip|todo)\s*\(|\b(?:fdescribe|fit|xdescribe|xit)\s*\(/g,
  },
  {
    label: 'vacuous always-true expectation',
    pattern:
      /\bexpect\s*\(\s*true\s*\)\s*\.\s*(?:toBe\s*\(\s*true\s*\)|toBeTruthy\s*\(\s*\))|\bassert\s*\(\s*true\s*\)/g,
  },
];

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const specFiles = (await walk(sourceRoot)).filter((file) => file.endsWith('.spec.ts'));
let declarations = 0;
const violations = [];

for (const file of specFiles) {
  const source = await readFile(file, 'utf8');
  declarations += source.match(/\b(?:it|test)\s*\(/g)?.length ?? 0;
  declarations += source.match(/\b(?:it|test)\s*\.\s*each\s*\(/g)?.length ?? 0;

  for (const rule of forbidden) {
    for (const match of source.matchAll(rule.pattern)) {
      violations.push(
        `${path.relative(root, file)}:${lineNumber(source, match.index)}: ${rule.label}`,
      );
    }
  }
}

if (specFiles.length < baseline.minimumSpecFiles) {
  violations.push(
    `spec file count fell from the protected floor of ${baseline.minimumSpecFiles} to ${specFiles.length}`,
  );
}
if (declarations < baseline.minimumTestDeclarations) {
  violations.push(
    `test declaration count fell from the protected floor of ${baseline.minimumTestDeclarations} to ${declarations}`,
  );
}

console.log(
  `Test integrity: ${specFiles.length} spec files, ${declarations} declarations ` +
    `(${baseline.runtimeTestsAtBaseline} runtime tests at baseline).`,
);

if (violations.length) {
  console.error(violations.map((violation) => `- ${violation}`).join('\n'));
  process.exitCode = 1;
}
