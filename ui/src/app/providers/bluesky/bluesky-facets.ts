// Rich-text helpers for OUTGOING Bluesky posts: grapheme counting and facet
// detection. Bluesky limits posts to 300 graphemes and expects facets with
// UTF-8 *byte* offsets.

import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { BskyFacet } from './bluesky-types';

const encoder = new TextEncoder();

/** Bluesky counts graphemes (👩‍👩‍👧 = 1), not UTF-16 code units. */
export function graphemeLength(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    let count = 0;
    for (const _ of new Intl.Segmenter().segment(text)) {
      count++;
    }
    return count;
  }
  return [...text].length;
}

const LINK_RE = /https?:\/\/[^\s<>"')\]]+/g;
const MENTION_RE = /(^|\s)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

function byteOffset(text: string, charIndex: number): number {
  return encoder.encode(text.slice(0, charIndex)).length;
}

/**
 * Detect link + @mention facets in reply text. Mentions need a DID, so the
 * caller provides a resolver (handle → did observable); handles that fail to
 * resolve are silently left as plain text — the post still goes out.
 */
export function detectFacets(
  text: string,
  resolveHandle: (handle: string) => Observable<{ did: string }>,
): Observable<BskyFacet[]> {
  const facets: BskyFacet[] = [];
  for (const match of text.matchAll(LINK_RE)) {
    facets.push({
      index: {
        byteStart: byteOffset(text, match.index),
        byteEnd: byteOffset(text, match.index + match[0].length),
      },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: match[0] }],
    });
  }

  const mentionLookups: Observable<BskyFacet | null>[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const handle = match[2];
    const start = match.index + match[1].length;
    mentionLookups.push(
      resolveHandle(handle).pipe(
        map(
          ({ did }): BskyFacet => ({
            index: {
              byteStart: byteOffset(text, start),
              byteEnd: byteOffset(text, start + 1 + handle.length),
            },
            features: [{ $type: 'app.bsky.richtext.facet#mention', did }],
          }),
        ),
        // Unresolvable handle: not a real mention, keep it as text.
        catchError(() => of(null)),
      ),
    );
  }

  if (!mentionLookups.length) {
    return of(facets);
  }
  return forkJoin(mentionLookups).pipe(
    map((mentions) => [...facets, ...mentions.filter((f): f is BskyFacet => f !== null)]),
  );
}
