import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Explicit opt-in: the pinned committed source does not have a native target yet.
if (!process.env.MAWKINGBIRD_SOURCE) {
  throw new Error('Set MAWKINGBIRD_SOURCE to the shared development checkout. This is not a release build.');
}
const source = resolve(process.env.MAWKINGBIRD_SOURCE);
const ui = join(source, 'ui');
const cli = join(ui, 'node_modules/@angular/cli/bin/ng.js');
if (!existsSync(cli)) throw new Error('Run npm ci in the shared ui directory first.');
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const revision = git('rev-parse', 'HEAD').trim();
const dirty = Boolean(git('status', '--porcelain').trim());
execFileSync(process.execPath, [cli, 'build', '--configuration', 'mockingbird,native',
  '--output-path', join(root, '.frontend')], { cwd: ui, stdio: 'inherit' });
writeFileSync(join(root, '.frontend/provenance.json'), JSON.stringify({
  developmentOnly: true, source, revision, dirty,
  trackedDiffSha256: createHash('sha256').update(git('diff', 'HEAD')).digest('hex'),
  note: 'Includes working-tree and untracked source. Not approved release provenance.',
}, null, 2) + '\n', 'utf8');
