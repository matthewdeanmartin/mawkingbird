import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const validVersion = (value) => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(value ?? '');

// Touch only the application's version, never dependency versions/configuration.
export function stampVersion(root, version) {
  if (!validVersion(version)) throw new Error(`Invalid Native version: ${version}`);
  const updates = [];
  for (const [file, pattern] of [
    ['tauri.conf.json', /("version"\s*:\s*")[^"]+("\s*[,}])/],
    ['Cargo.toml', /(^\[package\][\s\S]*?^version\s*=\s*")[^"]+(".*$)/m],
    ['Cargo.lock', /(^\[\[package\]\]\s*\r?\nname = "mawkingbird-native"\s*\r?\nversion = ")[^"]+(".*$)/m],
  ]) {
    const path = resolve(root, 'src-tauri', file);
    const source = readFileSync(path, 'utf8');
    if (!pattern.test(source)) throw new Error(`Cannot locate application version in ${path}`);
    updates.push([path, source.replace(pattern, (_, before, after) => before + version + after)]);
  }
  for (const [path, content] of updates) writeFileSync(path, content, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  stampVersion(resolve(process.argv[2]), process.argv[3]);
}
