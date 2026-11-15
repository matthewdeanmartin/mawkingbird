import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const releaseTag = process.env.RELEASE_TAG;
if (!/^native-v\d+\.\d+\.\d+/.test(releaseTag ?? '')) {
  throw new Error('RELEASE_TAG must identify the reviewed Native release.');
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const cli = resolve(root, 'ui/node_modules/@angular/cli/bin/ng.js');
execFileSync(process.execPath, [cli, 'build', '--configuration', 'mockingbird,native',
  '--output-path', resolve(root, 'native/.frontend')], {
  cwd: resolve(root, 'ui'), stdio: 'inherit',
});
mkdirSync(resolve(root, 'native/.frontend'), { recursive: true });
writeFileSync(resolve(root, 'native/.frontend/provenance.json'), JSON.stringify({
  repository: process.env.GITHUB_REPOSITORY,
  revision,
  releaseTag,
  developmentOnly: false,
}, null, 2) + '\n', 'utf8');
