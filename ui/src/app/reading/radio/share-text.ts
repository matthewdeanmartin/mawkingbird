import { isMusicTag } from '../audio-embeds/youtube-music';
import { postExternalMedia } from '../audio-embeds/providers';
import { CATALOGUE_POST } from './catalogue-search';
import { RadioTrack } from './radio-player';
import { trackUrl } from './radio-playlists';

/** One place a shared recording can be heard: the post, a service, a catalogue page. */
export interface ShareLink {
  url: string;
  /** A service or place name ("Bandcamp", "Mastodon post"); empty uses the default label. */
  label: string;
}

/** What the listener chose to include. */
export interface ShareChoices {
  credit: boolean;
  links: readonly string[];
  tags: readonly string[];
}

/** Hashtags offered on every music share, before the post's own music tags. */
export const SHARE_TAGS = ['nowplaying', 'fedimusic', 'music'];

/**
 * Every place this recording can be heard. A post that links the song on
 * several services shares them all, so each follower opens the one they use.
 */
export function shareLinks(track: RadioTrack, postLabel: string): ShareLink[] {
  const links: ShareLink[] = [];
  const add = (url: string | null | undefined, label: string) => {
    if (url && /^https:\/\//i.test(url) && !links.some((link) => link.url === url))
      links.push({ url, label });
  };
  const post = track.post;
  if (post.id.startsWith(CATALOGUE_POST)) add(trackUrl(track), post.account.display_name);
  else if (['public', 'unlisted'].includes(post.visibility)) add(post.url, postLabel);
  if (track.external) add(track.external.url, track.external.label);
  for (const source of postExternalMedia(post)) add(source.url, source.label);
  return links;
}

/** The music hashtags worth offering: the usual ones, then the post's own. */
export function shareTags(tracks: readonly RadioTrack[]): string[] {
  const own = tracks.flatMap((track) =>
    (track.post.tags ?? []).map((tag) => tag.name.toLowerCase()).filter(isMusicTag),
  );
  return [...new Set([...SHARE_TAGS, ...own])].slice(0, 8);
}

function tagLine(tags: readonly string[]): string {
  return tags.map((tag) => `#${tag}`).join(' ');
}

/** A post about one recording: what it is, who made or posted it, where to hear it. */
export function singleText(title: string, credit: string, choices: ShareChoices): string {
  return [title, choices.credit ? credit : '', choices.links.join('\n'), tagLine(choices.tags)]
    .filter(Boolean)
    .join('\n\n');
}

/** A playlist in one post: its name and description, then a numbered line per track. */
export function playlistText(
  name: string,
  description: string,
  entries: readonly { title: string; url: string }[],
  tags: readonly string[],
): string {
  const lines = entries.map(
    (entry, index) =>
      `${index + 1}. ${entry.title.replace(/\s+/g, ' ').trim().slice(0, 120)}\n${entry.url}`,
  );
  return [name.trim(), description.trim(), lines.join('\n'), tagLine(tags)]
    .filter(Boolean)
    .join('\n\n');
}
