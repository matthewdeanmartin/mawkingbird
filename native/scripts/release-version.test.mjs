import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stampVersion } from './release-version.mjs';

test('release stamping preserves dependencies and is repeatable; malformed input writes nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'native-version-'));
  const dir = join(root, 'src-tauri');
  mkdirSync(dir);
  const files = {
    'tauri.conf.json': '{"version":"0.2.0","bundle":{"active":false}}\n',
    'Cargo.toml': '[package]\nname = "mawkingbird-native"\nversion = "0.2.0"\n[dependencies]\nfoo = "0.2.0"\n',
    'Cargo.lock': '[[package]]\nname = "foo"\nversion = "0.2.0"\n[[package]]\nname = "mawkingbird-native"\nversion = "0.2.0"\n',
  };
  try {
    for (const [name, value] of Object.entries(files)) writeFileSync(join(dir, name), value);
    stampVersion(root, '0.3.0');
    stampVersion(root, '0.3.0');
    assert.equal(JSON.parse(readFileSync(join(dir, 'tauri.conf.json'), 'utf8')).version, '0.3.0');
    assert.match(readFileSync(join(dir, 'Cargo.toml'), 'utf8'), /foo = "0.2.0"/);
    assert.match(readFileSync(join(dir, 'Cargo.lock'), 'utf8'), /name = "foo"\nversion = "0.2.0"/);
    writeFileSync(join(dir, 'Cargo.lock'), 'malformed');
    assert.throws(() => stampVersion(root, '0.4.0'));
    assert.equal(JSON.parse(readFileSync(join(dir, 'tauri.conf.json'), 'utf8')).version, '0.3.0');
    assert.throws(() => stampVersion(root, 'bad-version'));
  } finally { rmSync(root, { recursive: true }); }
});
