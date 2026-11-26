import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stampVersion, validVersion } from '../../native/scripts/release-version.mjs';

if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Release promotion belongs to GitHub Actions, not local preparation.');
const version = process.env.RELEASE_TAG?.replace(/^native-v/, '');
if (!process.env.RELEASE_TAG?.startsWith('native-v') || !validVersion(version)) throw new Error('Invalid Native release tag');
const path = 'NATIVE_CHANGELOG.md';
const original = readFileSync(path, 'utf8');
const originalHeading = original.search(/^## \[/m);
if (originalHeading < 0) throw new Error('The Native changelog has no version sections');
const intro = original.slice(0, originalHeading);
if (!original.includes(`## [${version}]`)) {
  execFileSync('uvx', ['--no-build', '--from', 'keepachangelog-manager-fork==6.10.1', 'kaclm', '--component', 'native', 'release', '--override-version', version, '--yes'], { stdio: 'inherit' });
}
const updated = readFileSync(path, 'utf8');
const date = process.env.RELEASE_DATE?.slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('Missing published release date');
const firstHeading = updated.search(/^## \[/m);
if (firstHeading < 0) throw new Error('kaclm returned no changelog sections');
let sections = updated.slice(firstHeading);
// kaclm 6.10.1 removes an empty Unreleased heading after promotion.
if (!sections.startsWith('## [Unreleased]')) sections = '## [Unreleased]\n\n' + sections;
writeFileSync(path, intro + sections.replace(new RegExp(`(## \\[${version.replaceAll('.', '\\.')}\\])[^\\n]*`), `$1 - ${date}`), 'utf8');
stampVersion('native', version);
