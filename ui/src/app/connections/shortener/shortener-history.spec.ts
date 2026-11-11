import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mergeLinks, ShortenerHistory, ShortLinkRecord } from './shortener-history';
import { ShortLink } from './shortener-provider';

function link(overrides: Partial<ShortLink> = {}): ShortLink {
  return {
    provider: 'dub',
    providerId: 'link_1',
    shortUrl: 'https://dub.sh/abc',
    destinationUrl: 'https://example.com/article',
    raw: { big: 'provider payload' },
    ...overrides,
  };
}

function record(overrides: Partial<ShortLinkRecord> = {}): ShortLinkRecord {
  return {
    provider: 'dub',
    providerId: 'link_1',
    shortUrl: 'https://dub.sh/abc',
    destinationUrl: 'https://example.com/article',
    recordedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ShortenerHistory', () => {
  let history: ShortenerHistory;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    history = TestBed.inject(ShortenerHistory);
  });

  it('records a created link without its raw provider payload', () => {
    const saved = history.add(link());

    // `raw` is a whole provider response; storing it would blow the localStorage
    // budget within a few dozen links and nothing reads it back.
    expect('raw' in saved).toBe(false);
    expect(localStorage.getItem('mockingbird_short_links')).not.toContain('provider payload');
  });

  it('replaces rather than duplicates when the same link is created twice', () => {
    history.add(link());
    history.add(link({ destinationUrl: 'https://example.com/updated' }));

    // Short.io deliberately returns the existing link for a repeated
    // destination, so this is a normal path, not an edge case.
    expect(history.records()).toHaveLength(1);
    expect(history.records()[0].destinationUrl).toBe('https://example.com/updated');
  });

  it('keeps providers separate', () => {
    history.add(link({ provider: 'dub', providerId: 'a' }));
    history.add(link({ provider: 'tly', providerId: 'b' }));

    expect(history.forProvider('dub')).toHaveLength(1);
    history.clearProvider('dub');
    expect(history.forProvider('dub')).toHaveLength(0);
    expect(history.forProvider('tly')).toHaveLength(1);
  });

  it('removes a link by provider and id', () => {
    history.add(link({ providerId: 'a' }));
    history.add(link({ providerId: 'b' }));

    history.remove('dub', 'a');

    expect(history.records().map((item) => item.providerId)).toEqual(['b']);
  });
});

describe('mergeLinks', () => {
  it('lets the provider win on field values, since it is the live state', () => {
    const merged = mergeLinks(
      [link({ destinationUrl: 'https://example.com/edited-elsewhere' })],
      [record()],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].destinationUrl).toBe('https://example.com/edited-elsewhere');
  });

  it('keeps the local creation time, which the provider cannot know', () => {
    const merged = mergeLinks([link({ createdAt: '2026-07-20T00:00:00.000Z' })], [record()]);

    // recordedAt is when *this browser* made it — the one axis that is
    // consistent across providers that sort their lists differently.
    expect(merged[0].recordedAt).toBe('2026-07-01T00:00:00.000Z');
  });

  it('keeps a local link the provider did not return', () => {
    // Absence from a filtered or paginated list is not evidence of deletion.
    const merged = mergeLinks([], [record({ providerId: 'only-local' })]);

    expect(merged.map((item) => item.providerId)).toEqual(['only-local']);
  });

  it('includes a provider link this browser never saw', () => {
    const merged = mergeLinks([link({ providerId: 'made-on-their-website' })], []);

    expect(merged.map((item) => item.providerId)).toEqual(['made-on-their-website']);
  });

  it('sorts newest first', () => {
    const merged = mergeLinks(
      [],
      [
        record({ providerId: 'old', recordedAt: '2026-01-01T00:00:00.000Z' }),
        record({ providerId: 'new', recordedAt: '2026-07-01T00:00:00.000Z' }),
      ],
    );

    expect(merged.map((item) => item.providerId)).toEqual(['new', 'old']);
  });
});
