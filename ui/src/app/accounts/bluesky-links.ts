/** Routes supported public Bluesky links without loading any provider code. */
export function blueskyRouteFor(raw: string): string[] | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'bsky.app' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const match = url.pathname.match(/^\/profile\/([^/]+)(?:\/(feed|lists)\/([^/]+))?\/?$/);
    if (!match) return null;
    const actor = decodeURIComponent(match[1]);
    if (!/^(?:did:[a-z]+:[A-Za-z0-9._:%-]+|[A-Za-z0-9.-]+)$/.test(actor)) return null;
    if (!match[2]) return ['/accounts', 'bsky:' + actor];
    const key = decodeURIComponent(match[3]);
    if (!/^[A-Za-z0-9._~:-]+$/.test(key)) return null;
    const kind = match[2] === 'feed' ? 'feed' : 'list';
    const collection = kind === 'feed' ? 'app.bsky.feed.generator' : 'app.bsky.graph.list';
    return ['/feeds/bluesky', `${kind}:at://${actor}/${collection}/${key}`];
  } catch {
    return null;
  }
}
