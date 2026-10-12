import { Innertube } from 'youtubei.js';

let session;
export function getSession() {
  // Search needs neither streaming URLs nor YouTube's player JavaScript.
  return session ??= Innertube.create({
    retrieve_player: false,
    lang: 'en',
    location: 'US',
    fetch: (input, init) => fetch(input, {
      ...init,
      signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(20_000)]),
    }),
  }).catch((error) => {
    session = undefined;
    throw error;
  });
}

const text = (value) => value?.toString() ?? '';
const channelId = (id) => /^UC[\w-]{22}$/.test(id ?? '') ? id : null;

function channel(id, name) {
  id = channelId(id);
  return {
    id,
    name: text(name),
    url: id ? `https://www.youtube.com/channel/${id}` : null,
    rssUrl: id ? `https://www.youtube.com/feeds/videos.xml?channel_id=${id}` : null,
  };
}

export function normalize(page, query, type) {
  // Deliberately use standard result renderers; omit ads, shelves and Shorts.
  const items = page.results.flatMap((node) => {
    if (type === 'channel' && node.type === 'Channel') {
      const owner = channel(node.id, node.author?.name);
      return owner.id ? [{ kind: 'channel', ...owner,
        description: text(node.description_snippet) }] : [];
    }
    if (type !== 'video' || node.type !== 'Video' || !/^[\w-]{11}$/.test(node.video_id ?? '')) return [];
    return [{
      kind: 'video',
      id: node.video_id,
      title: text(node.title),
      channel: channel(node.author?.id, node.author?.name),
      duration: node.duration?.text ?? '',
      published: text(node.published),
      url: `https://www.youtube.com/watch?v=${node.video_id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${node.video_id}`,
    }];
  });
  return { query, type, items, hasMore: page.has_continuation };
}

export async function search(query, type = 'video') {
  query = query?.trim();
  if (!query || query.length > 200) throw new RangeError('Query must be 1–200 characters.');
  if (!['video', 'channel'].includes(type)) throw new RangeError('Type must be video or channel.');
  const yt = await getSession();
  return normalize(await yt.search(query, { type }), query, type);
}
