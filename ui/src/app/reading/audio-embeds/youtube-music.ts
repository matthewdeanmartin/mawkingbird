import { Status } from '../../platform/api/models';
import { youtubeSource } from '../video-player/media-source';
import { ExternalMedia, postExternalMedia } from './providers';

/** Kept here, not imported from widget-api, so post cards don't load the player bridge. */
const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

/**
 * Hashtags people put on music posts. Most music on Mastodon is a YouTube link,
 * so a link alone says nothing; the post around it does.
 */
const MUSIC_TAGS = new Set([
  'music',
  'nowplaying',
  'np',
  'fedimusic',
  'mastomusic',
  'newmusic',
  'musicmonday',
  'songoftheday',
  'albumoftheday',
  'nowlistening',
  'listeningto',
  'song',
  'album',
  'livemusic',
  'cover',
  'jazz',
  'blues',
  'rock',
  'metal',
  'punk',
  'folk',
  'folkmusic',
  'ambient',
  'electronic',
  'electronicmusic',
  'techno',
  'house',
  'hiphop',
  'rap',
  'classical',
  'classicalmusic',
  'indie',
  'indiemusic',
  'synthwave',
  'soul',
  'funk',
  'reggae',
  'country',
  'bluegrass',
  'edm',
  'lofi',
  'dnb',
  'drumandbass',
  'shoegaze',
  'postrock',
  'kpop',
  'jpop',
  'citypop',
]);

/** Whether a hashtag is one people put on music posts. */
export function isMusicTag(name: string): boolean {
  return MUSIC_TAGS.has(name.replace(/^#/, '').toLowerCase());
}

/** What music video titles and channels look like: "Official Audio", "Artist - Topic"… */
const MUSIC_TITLE =
  /official (audio|music video|video|visualizer)|\((audio|lyrics?|live)\)|lyric video|full album|\blive (at|in|from|on)\b|\bremaster(ed)?\b|\bfeat\.|\bft\./i;
const MUSIC_TEXT = /\b(now playing|listening to|on repeat|song of the day)\b/i;

/** Whether a post is about music, from its hashtags, its preview card or its words. */
export function musicPost(status: Status): boolean {
  const post = status.reblog ?? status;
  if ((post.tags ?? []).some((tag) => MUSIC_TAGS.has(tag.name.toLowerCase()))) return true;
  const card = post.card;
  if (card && (/ - Topic$/.test(card.author_name ?? '') || MUSIC_TITLE.test(card.title ?? '')))
    return true;
  const words = (post.content ?? '').replace(/<[^>]*>/g, ' ');
  return MUSIC_TEXT.test(words);
}

/** A privacy-enhanced embed whose player answers our messages, starting where the link did. */
export function youtubeRadioEmbed(videoId: string, start = 0): string {
  const origin = globalThis.location?.origin ?? '';
  return (
    `${YOUTUBE_EMBED_ORIGIN}/embed/${videoId}?enablejsapi=1&playsinline=1` +
    (origin ? `&origin=${encodeURIComponent(origin)}` : '') +
    (start ? `&start=${start}` : '')
  );
}

/**
 * The YouTube links of a music post, as audio Radio can play one after another.
 * Elsewhere they stay videos: Watch and Video mode are unaffected.
 */
export function youtubeMusic(status: Status): ExternalMedia[] {
  if (!musicPost(status)) return [];
  return postExternalMedia(status).flatMap((source) => {
    if (source.provider !== 'youtube') return [];
    const video = youtubeSource(source.url);
    if (!video?.videoId) return [];
    return [
      {
        ...source,
        type: 'audio' as const,
        embed: youtubeRadioEmbed(video.videoId, video.start ?? 0),
        controllable: true,
        height: 200,
      },
    ];
  });
}
