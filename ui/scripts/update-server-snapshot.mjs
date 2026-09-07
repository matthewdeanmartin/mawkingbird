import { writeFile } from 'node:fs/promises';

const source = 'https://api.joinmastodon.org/servers';
const destination = new URL('../public/mastodon-servers.json', import.meta.url);

const response = await fetch(source);
if (!response.ok) {
  throw new Error(`Could not download ${source}: HTTP ${response.status}`);
}

const servers = await response.json();
if (!Array.isArray(servers) || servers.some((server) => typeof server?.domain !== 'string')) {
  throw new Error('The joinmastodon server response did not have the expected shape.');
}

await writeFile(destination, `${JSON.stringify(servers, null, 2)}\n`, 'utf8');
console.log(`Wrote ${servers.length} servers to ${destination.pathname}`);
