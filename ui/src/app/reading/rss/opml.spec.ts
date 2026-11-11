import { describe, expect, it } from 'vitest';
import { buildOpml, opmlFilename, parseOpml } from './opml';

describe('opmlFilename', () => {
  it('is dated, so successive exports do not overwrite each other', () => {
    expect(opmlFilename(new Date('2026-08-01T12:00:00Z'))).toBe(
      'mawkingbird-feeds-2026-08-01.opml',
    );
  });
});

describe('buildOpml', () => {
  it('titles the export as Mawkingbird subscriptions and keeps disabled feeds', () => {
    const parsed = parseOpml(
      buildOpml([{ url: 'https://off.test/feed', title: 'Off', enabled: false }]),
    );
    expect(parsed.title).toBe('Mawkingbird subscriptions');
    expect(parsed.feeds).toHaveLength(1);
  });
});
