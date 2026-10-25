import { Status } from './models';
import { postExternalMedia } from './audio-embeds/providers';

export type SearchMediaType = 'audio' | 'video' | 'image' | 'embed';

/** Attachments belong to the original post when the timeline row is a boost. */
export function mediaTypes(status: Status): string[] {
  const external = postExternalMedia(status);
  return [
    ...new Set([
      ...((status.reblog ?? status).media_attachments?.map((m) => m.type) ?? []),
      ...external.filter((s) => s.type !== 'unknown').map((s) => s.type),
      ...(external.some((s) => s.embed || s.provider === 'youtube') ? ['embed'] : []),
    ]),
  ];
}

export function matchesMedia(status: Status, types: readonly SearchMediaType[]): boolean {
  const present = mediaTypes(status);
  return types.every((type) => present.includes(type));
}

/** Quoted text and unknown operators remain server query text. Types combine with AND. */
export function parseMediaQuery(query: string): { query: string; types: SearchMediaType[] } {
  const types = new Set<SearchMediaType>();
  const words = query.match(/(?:[^\s"\\]|\\.|"(?:\\.|[^"\\])*")+/g) ?? [];
  const rest = words.filter((word) => {
    const match = /^\+?has:(audio|video|image|embed)$/i.exec(word);
    if (!match) return true;
    types.add(match[1].toLowerCase() as SearchMediaType);
    return false;
  });
  // Attachment-only image searches can use Mastodon's native filter. Other bare
  // media filters scan the home timeline; has:media would discard external links.
  return {
    query: types.size
      ? rest.join(' ') || (types.size === 1 && types.has('image') ? 'has:media' : '')
      : query,
    types: [...types],
  };
}
