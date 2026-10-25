import { Status } from '../models';
import { youtubeSource } from '../video-player/media-source';

export interface ExternalMedia {
  key: string;
  provider: string;
  label: string;
  url: string;
  type: 'audio' | 'video' | 'unknown';
  embed?: string;
  height: number;
  controllable: boolean;
}

/** Pure, exact-host recognition. No requests, scripts, or arbitrary preview HTML. */
export function externalMedia(raw: string): ExternalMedia | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port)
    return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const source = (
    provider: string,
    label: string,
    id: string,
    embed?: string,
    type: ExternalMedia['type'] = 'audio',
    controllable = false,
    height = 166,
  ): ExternalMedia => ({
    key: `${provider}:${id}`,
    provider,
    label,
    url: `https://${host}${path}${url.search}`,
    type,
    embed,
    controllable,
    height,
  });
  // The music service is an audio source even though its visible player uses
  // YouTube's iframe internally. Ordinary YouTube URLs remain video.
  if (host === 'music.youtube.com' && path === '/watch') {
    const music = youtubeSource(`https://www.youtube.com${path}${url.search}`);
    if (music)
      return source(
        'youtube-music',
        'YouTube Music',
        music.videoId!,
        `https://www.youtube-nocookie.com/embed/${music.videoId}?autoplay=0${music.start ? `&start=${music.start}` : ''}`,
        'audio',
        false,
        225,
      );
  }
  const youtube = youtubeSource(raw);
  if (youtube) return source('youtube', 'YouTube', youtube.videoId!, undefined, 'video');
  if (host === 'music.amazon.com') {
    const match = /^\/(albums|tracks|embed)\/([A-Z0-9]{10})\/?$/.exec(path);
    if (match) {
      const track = url.searchParams.get('trackAsin');
      const id = track && /^[A-Z0-9]{10}$/.test(track) ? track : match[2];
      return source(
        'amazon-music',
        'Amazon Music',
        id,
        `https://music.amazon.com/embed/${id}/`,
        'audio',
        false,
        352,
      );
    }
  }
  if (['deezer.com', 'www.deezer.com'].includes(host)) {
    const match = /^\/(?:[a-z]{2}\/)?(track|album|playlist|artist|podcast|episode)\/(\d+)\/?$/.exec(
      path,
    );
    if (match)
      return source(
        'deezer',
        'Deezer',
        `${match[1]}:${match[2]}`,
        `https://widget.deezer.com/widget/dark/${match[1]}/${match[2]}`,
        'audio',
        false,
        300,
      );
  }
  if (['archive.org', 'www.archive.org'].includes(host)) {
    const match = /^\/(?:details|embed)\/([\w.-]+)(?:\/([^/]+))?\/?$/.exec(path);
    if (match && !['.', '..'].includes(match[1])) {
      const file = match[2] ?? '';
      // Archive also hosts films, books and software. An item URL alone does not prove audio.
      const type = /\.(mp3|ogg|oga|flac|wav|m4a)$/i.test(file)
        ? 'audio'
        : /\.(mp4|webm|ogv|mov)$/i.test(file)
          ? 'video'
          : 'unknown';
      return source(
        'internet-archive',
        'Internet Archive',
        `${match[1]}:${file}`,
        `https://archive.org/embed/${match[1]}${file ? `/${file}` : ''}`,
        type,
        false,
        300,
      );
    }
  }
  if (host === 'open.spotify.com') {
    const match =
      /^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]+)\/?$/.exec(path);
    if (match)
      return source(
        'spotify',
        'Spotify',
        `${match[1]}:${match[2]}`,
        `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
        'audio',
        false,
        152,
      );
  }
  if (
    ['soundcloud.com', 'www.soundcloud.com'].includes(host) &&
    /^\/[\w-]+\/(?!likes\/?$|reposts\/?$|tracks\/?$|albums\/?$|sets\/?$)[\w-]+(?:\/[\w-]+)?\/?$/.test(
      path,
    )
  ) {
    const canonical = `https://soundcloud.com${path.replace(/\/$/, '')}`;
    return {
      ...source(
        'soundcloud',
        'SoundCloud',
        canonical,
        `https://w.soundcloud.com/player/?url=${encodeURIComponent(canonical)}&auto_play=false&visual=false`,
        'audio',
        true,
      ),
      url: canonical,
    };
  }
  if (
    ['mixcloud.com', 'www.mixcloud.com'].includes(host) &&
    /^\/(?!live\/|discover\/|categories\/)[\w-]+\/[\w-]+\/?$/.test(path)
  ) {
    const feed = `${path.replace(/\/$/, '')}/`;
    return source(
      'mixcloud',
      'Mixcloud',
      feed,
      `https://player-widget.mixcloud.com/?hide_cover=1&mini=1&feed=${encodeURIComponent(feed)}`,
      'audio',
      true,
      60,
    );
  }
  if (host === 'music.apple.com') {
    const match = /^\/([a-z]{2})\/(album|playlist|song|music-video)\/([^/]+)\/([\w.-]+)\/?$/.exec(
      path,
    );
    if (match) {
      const item = url.searchParams.get('i');
      const suffix = item && /^\d+$/.test(item) ? `?i=${item}` : '';
      return source(
        'apple-music',
        'Apple Music',
        `${path}${suffix}`,
        `https://embed.music.apple.com${path}${suffix}`,
        match[2] === 'music-video' ? 'video' : 'audio',
        false,
        175,
      );
    }
  }
  if (host === 'podcasts.apple.com' && /^\/[a-z]{2}\/podcast\/[^/]+\/id\d+\/?$/.test(path)) {
    const item = url.searchParams.get('i');
    const suffix = item && /^\d+$/.test(item) ? `?i=${item}` : '';
    // Podcasts may contain video: offer the inline embed without claiming an audio facet
    // or adding it to the automatically advancing audio queue.
    return source(
      'apple-podcasts',
      'Apple Podcasts',
      `${path}${suffix}`,
      `https://embed.podcasts.apple.com${path}${suffix}`,
      'unknown',
      false,
      item ? 175 : 450,
    );
  }
  if (['tidal.com', 'www.tidal.com', 'listen.tidal.com'].includes(host)) {
    const match = /^\/(?:browse\/)?(track|album|playlist|video)\/([\w-]+)\/?$/.exec(path);
    if (match)
      return source(
        'tidal',
        'TIDAL',
        `${match[1]}:${match[2]}`,
        `https://embed.tidal.com/${match[1]}s/${match[2]}`,
        match[1] === 'video' ? 'video' : 'audio',
      );
  }
  if (host === 'bandcamp.com' && path.startsWith('/EmbeddedPlayer/')) {
    const album = /(?:^|\/)album=(\d+)(?:\/|$)/.exec(path)?.[1];
    const track = /(?:^|\/)track=(\d+)(?:\/|$)/.exec(path)?.[1];
    if (album || track) {
      const id = `${album ? `album=${album}/` : ''}${track ? `track=${track}/` : ''}`;
      return source(
        'bandcamp',
        'Bandcamp',
        id,
        `https://bandcamp.com/EmbeddedPlayer/${id}size=small/bgcol=ffffff/linkcol=0687f5/transparent=true/`,
        'audio',
        false,
        42,
      );
    }
  }
  if (/^[a-z0-9-]+\.bandcamp\.com$/.test(host) && /^\/(track|album)\/[^/]+\/?$/.test(path))
    return source('bandcamp', 'Bandcamp', `${host}${path}`, undefined);
  if (host === 'audio.com') {
    if (/^\/embed\/\d+\/?$/.test(path))
      return source(
        'audio-com',
        'Audio.com',
        path,
        `https://audio.com${path}`,
        'audio',
        false,
        180,
      );
    if (/^\/[^/]+\/audio\/[^/]+\/?$/.test(path)) return source('audio-com', 'Audio.com', path);
  }
  return null;
}

/** All alternatives, deduplicated by provider identity. Original posts own boost media. */
export function postExternalMedia(status: Status): ExternalMedia[] {
  const post = status.reblog ?? status;
  const urls: string[] = [];
  if (post.card?.url) urls.push(post.card.url);
  if (post.content?.includes('<a')) {
    const doc = new DOMParser().parseFromString(post.content, 'text/html');
    for (const anchor of Array.from(doc.querySelectorAll('a[href]')))
      urls.push(anchor.getAttribute('href') ?? '');
  }
  const sources = new Map<string, ExternalMedia>();
  for (const raw of urls) {
    const source = externalMedia(raw);
    if (source) sources.set(source.key, source);
  }
  // Bandcamp's numeric IDs may be supplied by Mastodon's existing preview card.
  // Parse that one iframe URL as data, then reconstruct our own allowlisted URL.
  const card = post.card;
  const cardSource = card?.url ? externalMedia(card.url) : null;
  if (cardSource && ['bandcamp', 'audio-com'].includes(cardSource.provider)) {
    const frame = card?.html
      ? new DOMParser()
          .parseFromString(card.html, 'text/html')
          .querySelector('iframe')
          ?.getAttribute('src')
      : null;
    for (const raw of [card?.embed_url, frame]) {
      if (!raw) continue;
      const resolved = externalMedia(raw.startsWith('//') ? `https:${raw}` : raw);
      if (resolved?.embed && resolved.provider === cardSource.provider) {
        sources.delete(cardSource.key);
        sources.set(resolved.key, { ...resolved, url: cardSource.url });
        break;
      }
    }
  }
  return [...sources.values()];
}
