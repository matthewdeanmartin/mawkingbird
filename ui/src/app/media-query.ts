import { Status } from './models';

export type SearchMediaType = 'audio' | 'video' | 'image';

/** Attachments belong to the original post when the timeline row is a boost. */
export function mediaTypes(status: Status): string[] {
  return [...new Set((status.reblog ?? status).media_attachments?.map((m) => m.type) ?? [])];
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
    const match = /^\+?has:(audio|video|image)$/i.exec(word);
    if (!match) return true;
    types.add(match[1].toLowerCase() as SearchMediaType);
    return false;
  });
  // A media-only search still needs a nonempty native query.
  return { query: types.size ? rest.join(' ') || 'has:media' : query, types: [...types] };
}
