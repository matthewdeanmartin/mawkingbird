import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { detectFacets, graphemeLength } from './bluesky-facets';

describe('graphemeLength', () => {
  it('counts graphemes, not UTF-16 code units', () => {
    expect(graphemeLength('abc')).toBe(3);
    expect(graphemeLength('🦋')).toBe(1);
    expect(graphemeLength('👩‍👩‍👧')).toBe(1);
    expect(graphemeLength('')).toBe(0);
  });
});

describe('detectFacets', () => {
  const resolver = (handle: string) =>
    handle === 'known.bsky.social'
      ? of({ did: 'did:plc:known' })
      : throwError(() => new Error('nope'));

  it('detects links with UTF-8 byte offsets', async () => {
    // '🦋 ' = 5 bytes before the URL starts.
    const facets = await firstValueFrom(detectFacets('🦋 https://x.example/a', resolver));
    expect(facets).toEqual([
      {
        index: { byteStart: 5, byteEnd: 24 },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://x.example/a' }],
      },
    ]);
  });

  it('resolves mentions to DIDs and drops unresolvable handles silently', async () => {
    const facets = await firstValueFrom(
      detectFacets('hi @known.bsky.social and @ghost.example.com', resolver),
    );
    expect(facets).toHaveLength(1);
    expect(facets[0].features[0]).toEqual({
      $type: 'app.bsky.richtext.facet#mention',
      did: 'did:plc:known',
    });
    // '@known.bsky.social' starts at byte 3 and is 18 bytes long.
    expect(facets[0].index).toEqual({ byteStart: 3, byteEnd: 21 });
  });

  it('returns no facets for plain text', async () => {
    expect(await firstValueFrom(detectFacets('just words', resolver))).toEqual([]);
  });
});
