import { readFileSync } from 'node:fs';

const tag = process.env.RELEASE_TAG;
const match = /^native-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.exec(tag ?? '');
if (!match) throw new Error(`Expected a native-v SemVer tag, got ${tag ?? '(unset)'}`);
const version = tag.slice('native-v'.length);
const config = JSON.parse(readFileSync('native/src-tauri/tauri.conf.json', 'utf8'));
const manifest = readFileSync('native/src-tauri/Cargo.toml', 'utf8');
const lock = readFileSync('native/src-tauri/Cargo.lock', 'utf8');
const changelog = readFileSync('NATIVE_CHANGELOG.md', 'utf8');
if (config.version !== version) throw new Error(`Tauri version ${config.version} differs from ${tag}`);
const cargoVersion = /^\[package\]\s[\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(manifest)?.[1];
if (cargoVersion !== version) throw new Error(`Cargo version ${cargoVersion ?? '(missing)'} differs from ${tag}`);
const lockedVersion = /^\[\[package\]\]\s*\nname = "mawkingbird-native"\s*\nversion = "([^"]+)"/m.exec(lock)?.[1];
if (lockedVersion !== version) throw new Error(`Cargo.lock version ${lockedVersion ?? '(missing)'} differs from ${tag}`);
const releaseHeading = `## [${version}]`;
const start = changelog.indexOf(releaseHeading);
if (start < 0) throw new Error(`Missing ${releaseHeading} in NATIVE_CHANGELOG.md`);
const bodyStart = changelog.indexOf('\n', start) + 1;
const nextHeading = changelog.indexOf('\n## [', bodyStart);
const body = changelog.slice(bodyStart, nextHeading < 0 ? undefined : nextHeading).trim();
if (!/^### (Added|Changed|Deprecated|Removed|Fixed|Security)/m.test(body) || !/^[-*] .+/m.test(body)) {
  throw new Error(`Release ${version} needs reviewed user-facing changes in NATIVE_CHANGELOG.md`);
}
console.log(`Native release ${version}: tag, versions, and changelog agree.`);
