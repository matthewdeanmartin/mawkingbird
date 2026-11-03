import path from 'node:path';
import process from 'node:process';
import { runQuietly } from './quiet-test-output.mjs';

const root = path.resolve(import.meta.dirname, '..');
const ng = path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const includes = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const options = process.argv.slice(2).filter((argument) => argument.startsWith('--'));

if (!includes.length) {
  console.error('Usage: npm run test:subset -- <spec-file-or-directory> [...]');
  process.exit(2);
}

const arguments_ = [
  ng,
  'test',
  '--no-watch',
  ...includes.map((include) => `--include=${include}`),
  ...options,
];
process.exit(await runQuietly(process.execPath, arguments_, { cwd: root }));
