import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

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
const result = spawnSync(process.execPath, arguments_, { cwd: root, stdio: 'inherit' });
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
