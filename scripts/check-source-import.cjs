// Read-only audit against the frozen source commit. Run from the repository root.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../mastodon_mock');
const commit = '4d981c458abc1d1ed7f2929f33e53a4f8fee1ca8';
const entries = execFileSync('git', ['-C', source, 'ls-tree', '-r', commit, 'ui'], { encoding: 'utf8' }).trim().split('\n');
const changed = [];
const files = entries.map(entry => entry.split('\t')[1]);
const hashes = execFileSync('git', ['-c', 'core.safecrlf=false', 'hash-object', '--stdin-paths'], {
  cwd: root, input: files.join('\n') + '\n', encoding: 'utf8',
}).trim().split('\n');
for (const [index, entry] of entries.entries()) {
  const [, expected, file] = entry.match(/^\d+ blob ([a-f0-9]+)\t(.+)$/);
  const actual = hashes[index];
  if (actual !== expected) changed.push(file);
}
const intended = new Set([
  'ui/.gitignore', 'ui/Makefile', 'ui/README.md', 'ui/angular.json',
  'ui/scripts/gen-api-docs.mjs', 'ui/scripts/gen-build-info.mjs',
  'ui/src/app/bug-report.ts', 'ui/src/app/bug-report.spec.ts',
]);
const unexpected = changed.filter(file => !intended.has(file));
if (unexpected.length) throw new Error(`Unexpected import changes: ${unexpected.join(', ')}`);
console.log(`${entries.length} source files present; ${changed.length} intentional migration edits; ${entries.length - changed.length} identical Git blobs after line-ending normalization.`);
console.log(changed.join('\n'));
