// Run named spec files or directories with a program narrowed to them; see
// narrow-spec-run.mjs. Fast feedback only: `make test` remains the gate.
import process from 'node:process';
import { expandSpecArguments, runNarrowed } from './narrow-spec-run.mjs';

const includes = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const options = process.argv.slice(2).filter((argument) => argument.startsWith('--'));

if (!includes.length) {
  console.error('Usage: npm run test:subset -- <spec-file-or-directory> [...] [--watch]');
  process.exit(2);
}

let specs;
try {
  specs = expandSpecArguments(includes);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
process.exit(await runNarrowed(specs, options));
