import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Exercise real pinned kaclm in an isolated fixture; never promote this checkout.
const root = resolve(import.meta.dirname, '../..');
const fixture = mkdtempSync(join(tmpdir(), 'mawkingbird-release-test-'));
try {
  for (const dir of ['.github/scripts', 'native/scripts', 'native/src-tauri']) mkdirSync(join(fixture, dir), { recursive: true });
  for (const file of ['.github/scripts/prepare-native-release.mjs', '.github/scripts/check-native-release.mjs', 'native/scripts/release-version.mjs', 'native/src-tauri/Cargo.toml', 'native/src-tauri/Cargo.lock', 'native/src-tauri/tauri.conf.json', 'NATIVE_CHANGELOG.md', 'changelogmanager.toml']) cpSync(join(root, file), join(fixture, file));
  const env = { ...process.env, PYTHONUTF8: '1', GITHUB_ACTIONS: 'true', RELEASE_TAG: 'native-v0.3.0', RELEASE_DATE: '2026-11-26T00:00:00Z' };
  const run = (script) => execFileSync(process.execPath, ['.github/scripts/' + script], { cwd: fixture, env, stdio: 'inherit' });
  run('prepare-native-release.mjs');
  run('check-native-release.mjs');
  const first = readFileSync(join(fixture, 'NATIVE_CHANGELOG.md'), 'utf8');
  assert.match(first, /## \[0.3.0\] - 2026-11-26/);
  assert.match(first, /^# Mawkingbird Native changelog/);
  assert(!first.split('## [Unreleased]')[1].split('## [0.3.0]')[0].includes('- '));
  run('prepare-native-release.mjs');
  assert.equal(readFileSync(join(fixture, 'NATIVE_CHANGELOG.md'), 'utf8'), first);
  writeFileSync(join(fixture, 'NATIVE_CHANGELOG.md'), first.replace('## [Unreleased]\n\n', ''), 'utf8');
  run('prepare-native-release.mjs');
  assert.equal(readFileSync(join(fixture, 'NATIVE_CHANGELOG.md'), 'utf8'), first);
  console.log('PASS: isolated release promotion, version agreement, preserved introduction and repeatable preparation.');
} finally { rmSync(fixture, { recursive: true }); }
