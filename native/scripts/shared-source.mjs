import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'shared-source.json'), 'utf8'));
const source = resolve(process.env.MAWKINGBIRD_SOURCE || join(root, '../mawkingbird'));
const mode = process.argv[2] || 'check';
if (!['check', 'prepare'].includes(mode)) throw new Error('Usage: node scripts/shared-source.mjs [check|prepare]');
if (lock.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(lock.revision) ||
    !/^[a-f0-9]{40}$/.test(lock.lockfileBlob) || lock.frontendDirectory !== 'ui') {
  throw new Error('Invalid shared-source manifest; expected full commit/blob IDs and ui directory');
}
function git(...args) {
  return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}
const revision = git('rev-parse', '--verify', `${lock.revision}^{commit}`);
if (revision !== lock.revision) throw new Error('Pinned revision is not a commit');
if (git('rev-parse', `${revision}:ui/package-lock.json`) !== lock.lockfileBlob) {
  throw new Error('Dependency lock does not match manifest');
}
const pkg = JSON.parse(git('show', `${revision}:ui/package.json`));
const angular = JSON.parse(git('show', `${revision}:ui/angular.json`));
if (!angular.projects.ui.architect.build.configurations.mockingbird) {
  throw new Error('Shared static build contract changed; review before updating source pin');
}
const report = {
  repository: lock.repository,
  revision,
  bridgeVersion: lock.bridgeVersion,
  angular: pkg.dependencies['@angular/core'],
  nativeBuildConfigurationPresent: Boolean(angular.projects.ui.architect.build.configurations.native),
  sourceCheckout: source,
  checkoutHead: git('rev-parse', 'HEAD'),
  checkoutHasLocalChanges: Boolean(git('status', '--porcelain')),
  note: 'Only committed pinned source is used. Working-tree changes are never exported.',
};
for (const [name, command, args] of [
  ['node', process.execPath, ['--version']], ['cargo', 'cargo', ['--version']],
  ['rustc', 'rustc', ['--version']], ['tar', 'tar', ['--version']],
]) {
  try {
    report[name] = execFileSync(command, args, { encoding: 'utf8', timeout: 15000 }).split(/\r?\n/)[0];
  } catch {
    throw new Error(`Missing or unusable prerequisite: ${name}`);
  }
}
if (mode === 'prepare') {
  // A fresh OS-temp directory avoids overwriting checkouts or reusing modified exports.
  const artifactRoot = mkdtempSync(join(tmpdir(), 'mawkingbird-native-source-'));
  const archive = join(artifactRoot, 'shared.tar');
  const destination = join(artifactRoot, 'source');
  mkdirSync(destination);
  git('archive', '--format=tar', `--output=${archive}`, revision);
  // stdin avoids MSYS tar interpreting a Windows drive letter as a remote host.
  execFileSync('tar', ['-xf', '-', '-C', destination], {
    input: readFileSync(archive), maxBuffer: 1024 * 1024,
  });
  report.archiveSha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
  report.preparedSource = destination;
  writeFileSync(join(artifactRoot, 'provenance.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(report, null, 2));
