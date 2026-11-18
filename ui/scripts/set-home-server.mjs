/**
 * Stamp the build's home server into index.html (src/app/platform/http/home-server.ts).
 *
 * Usage: node ui/scripts/set-home-server.mjs <build-dir> [https://your.instance]
 *
 * An empty server leaves the tag empty: an ordinary build with no home server.
 * Run by `make mockingbird`; MOCKINGBIRD_HOME_SERVER supplies the address.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [buildDir, rawServer = ''] = process.argv.slice(2);
if (!buildDir) {
  throw new Error('Expected <build-dir> [server-url].');
}

let server = '';
if (rawServer.trim()) {
  const url = new URL(
    /^https?:\/\//i.test(rawServer.trim()) ? rawServer.trim() : `https://${rawServer.trim()}`,
  );
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('The home server must use HTTPS (plain HTTP only for localhost).');
  }
  server = url.origin;
}

const file = join(buildDir, 'index.html');
const html = readFileSync(file, 'utf8');
const tag = /<meta name="mawkingbird:home-server" content="[^"]*"\s*\/?>/;
if (!tag.test(html)) {
  throw new Error(`${file} has no mawkingbird:home-server meta tag.`);
}
writeFileSync(
  file,
  html.replace(tag, `<meta name="mawkingbird:home-server" content="${server}" />`),
);
console.log(server ? `Home server: ${server}` : 'No home server.');
