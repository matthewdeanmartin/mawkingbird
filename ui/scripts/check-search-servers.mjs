// The snapshot is generated before release with search-servers:snapshot. Verify
// the bundled capability data at build time without probing every host again.
import { readFile } from 'node:fs/promises';

const path = new URL('../public/search-servers.json', import.meta.url);
const snapshot = JSON.parse(await readFile(path, 'utf8'));
if (!Array.isArray(snapshot.servers) || snapshot.checked !== snapshot.servers.length) {
  throw new Error('Invalid search-server snapshot: checked count differs from servers.');
}
for (const server of snapshot.servers) {
  if (
    typeof server.domain !== 'string' ||
    typeof server.accounts !== 'boolean' ||
    typeof server.posts !== 'boolean' ||
    typeof server.tagsOnly !== 'boolean'
  ) {
    throw new Error('Invalid search-server capability entry.');
  }
}
const counts = {
  accounts: snapshot.servers.filter((server) => server.accounts).length,
  hashtags: snapshot.servers.filter((server) => server.tagsOnly || server.posts).length,
  posts: snapshot.servers.filter((server) => server.posts).length,
};
if (snapshot.postServers !== undefined && snapshot.postServers !== counts.posts) {
  throw new Error('Invalid search-server snapshot: post count differs from servers.');
}
console.log(
  `Search snapshot: ${counts.accounts} account, ${counts.hashtags} hashtag, ${counts.posts} post servers.`,
);
