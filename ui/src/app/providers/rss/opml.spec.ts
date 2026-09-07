import { describe, expect, it } from 'vitest';
import { buildOpml, opmlFilename, parseOpml } from './opml';
import { RssFeedSub } from './rss-subscriptions';

const FLAT = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>My subscriptions</title></head>
  <body>
    <outline type="rss" text="Example" xmlUrl="https://example.test/feed.xml" />
    <outline type="rss" text="Another" xmlUrl="https://other.test/atom" />
  </body>
</opml>`;

const NESTED = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline type="rss" text="Deep" xmlUrl="https://deep.test/feed" />
      <outline text="Rust">
        <outline type="rss" text="Inner" xmlUrl="https://inner.test/feed" />
      </outline>
    </outline>
    <outline type="rss" text="Top level" xmlUrl="https://top.test/feed" />
  </body>
</opml>`;

describe('parseOpml', () => {
  it('reads a flat subscription list and its title', () => {
    const parsed = parseOpml(FLAT);

    expect(parsed.title).toBe('My subscriptions');
    expect(parsed.feeds.map((f) => f.url)).toEqual([
      'https://example.test/feed.xml',
      'https://other.test/atom',
    ]);
    expect(parsed.feeds[0].title).toBe('Example');
  });

  it('descends into folders and records the path it came from', () => {
    // Nothing consumes folders yet, but the file will not have them again —
    // see spec/ui/folders_for_all.md.
    const feeds = parseOpml(NESTED).feeds;

    expect(feeds.map((f) => f.url)).toEqual([
      'https://deep.test/feed',
      'https://inner.test/feed',
      'https://top.test/feed',
    ]);
    expect(feeds[0].folders).toEqual(['Tech']);
    expect(feeds[1].folders).toEqual(['Tech', 'Rust']);
    expect(feeds[2].folders).toEqual([]);
  });

  it('accepts an outline that omits type, which real exports often do', () => {
    const xml = `<opml><body><outline text="X" xmlUrl="https://x.test/f" /></body></opml>`;

    expect(parseOpml(xml).feeds).toHaveLength(1);
  });

  it('keeps one copy of a feed filed under two folders', () => {
    const xml = `<opml><body>
      <outline text="A"><outline xmlUrl="https://dup.test/f" text="Dup" /></outline>
      <outline text="B"><outline xmlUrl="https://dup.test/f" text="Dup" /></outline>
    </body></opml>`;

    expect(parseOpml(xml).feeds).toHaveLength(1);
  });

  it('falls back to the URL when an outline has no label', () => {
    const xml = `<opml><body><outline xmlUrl="https://bare.test/f" /></body></opml>`;

    expect(parseOpml(xml).feeds[0].title).toBe('https://bare.test/f');
  });

  it('refuses schemes that must never reach the fetcher', () => {
    // An OPML file is untrusted input we are about to turn into requests.
    const xml = `<opml><body>
      <outline xmlUrl="javascript:alert(1)" text="bad" />
      <outline xmlUrl="file:///etc/passwd" text="worse" />
      <outline xmlUrl="https://fine.test/f" text="fine" />
    </body></opml>`;

    expect(parseOpml(xml).feeds.map((f) => f.url)).toEqual(['https://fine.test/f']);
  });

  it('rejects documents that are not OPML, with a message worth showing', () => {
    expect(() => parseOpml('<rss><channel/></rss>')).toThrow(/Expected an <opml> document/);
    expect(() => parseOpml('not xml at all <')).toThrow(/valid XML/);
    expect(() => parseOpml('<opml></opml>')).toThrow(/no <body>/);
  });

  it('reports an empty list rather than failing on a valid but empty file', () => {
    expect(parseOpml('<opml><body></body></opml>').feeds).toEqual([]);
  });
});

describe('buildOpml', () => {
  const feeds: RssFeedSub[] = [
    { url: 'https://example.test/feed.xml', title: 'Example', enabled: true },
    { url: 'https://off.test/feed', title: 'Switched off', enabled: false },
  ];

  it('round-trips through the parser', () => {
    const parsed = parseOpml(buildOpml(feeds));

    expect(parsed.feeds.map((f) => f.url)).toEqual([
      'https://example.test/feed.xml',
      'https://off.test/feed',
    ]);
    expect(parsed.feeds[0].title).toBe('Example');
  });

  it('includes disabled feeds, which are still subscriptions', () => {
    // "Disabled" is a display state here, not an unsubscribe. Dropping them
    // would make the export quietly lossy.
    expect(parseOpml(buildOpml(feeds)).feeds).toHaveLength(2);
  });

  it('escapes titles and URLs so one ampersand cannot break the file', () => {
    const xml = buildOpml([
      { url: 'https://x.test/f?a=1&b=2', title: 'Tom & "Jerry" <news>', enabled: true },
    ]);

    const parsed = parseOpml(xml);
    expect(parsed.feeds[0].url).toBe('https://x.test/f?a=1&b=2');
    expect(parsed.feeds[0].title).toBe('Tom & "Jerry" <news>');
  });

  it('writes a valid document for an empty list', () => {
    expect(parseOpml(buildOpml([])).feeds).toEqual([]);
  });

  it('round-trips folders, so an export does not undo the import that built it', () => {
    const xml = buildOpml([
      { url: 'https://a.test/f.xml', title: 'Filed', enabled: true, folder: 'Tech' },
      { url: 'https://b.test/f.xml', title: 'Also filed', enabled: true, folder: 'Tech' },
      { url: 'https://c.test/f.xml', title: 'Loose', enabled: true },
    ]);

    const parsed = parseOpml(xml);
    const byUrl = new Map(parsed.feeds.map((f) => [f.url, f.folders]));
    expect(byUrl.get('https://a.test/f.xml')).toEqual(['Tech']);
    expect(byUrl.get('https://b.test/f.xml')).toEqual(['Tech']);
    expect(byUrl.get('https://c.test/f.xml')).toEqual([]);
  });

  it('escapes folder names', () => {
    const xml = buildOpml([
      { url: 'https://a.test/f.xml', title: 'Filed', enabled: true, folder: 'R&D <x>' },
    ]);
    expect(parseOpml(xml).feeds[0].folders).toEqual(['R&D <x>']);
  });
});

describe('opmlFilename', () => {
  it('is dated, so successive exports do not overwrite each other', () => {
    expect(opmlFilename(new Date('2026-08-01T12:00:00Z'))).toBe(
      'mawkingbird-feeds-2026-08-01.opml',
    );
  });
});
