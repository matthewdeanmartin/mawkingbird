import { describe, expect, it } from 'vitest';
import { parseFeed } from './rss-parser';

const RSS2 = `<?xml version="1.0"?>
<rss version="2.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:wfw="http://wellformedweb.org/CommentAPI/"
     xmlns:slash="http://purl.org/rss/1.0/modules/slash/">
  <channel>
    <title>My Blog</title>
    <link>https://blog.example.com</link>
    <item>
      <title>First post</title>
      <link>https://blog.example.com/first</link>
      <guid>tag:blog,2026:first</guid>
      <pubDate>Mon, 13 Jul 2026 10:00:00 GMT</pubDate>
      <description>Short summary</description>
      <content:encoded><![CDATA[<p>Full <b>HTML</b> body</p>]]></content:encoded>
      <enclosure url="https://blog.example.com/pic.jpg" type="image/jpeg" length="1"/>
      <category>Tech</category>
      <category>Rambling</category>
      <comments>https://blog.example.com/first#comments</comments>
      <wfw:commentRss>https://blog.example.com/first/feed</wfw:commentRss>
      <slash:comments>7</slash:comments>
    </item>
    <item>
      <title>No guid, no date</title>
      <link>https://blog.example.com/second</link>
      <description>plain text</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:thr="http://purl.org/syndication/thread/1.0">
  <title>Atom Feed</title>
  <link rel="self" href="https://atom.example.com/feed.xml"/>
  <link rel="alternate" href="https://atom.example.com"/>
  <entry>
    <title>Entry one</title>
    <id>urn:uuid:1</id>
    <link rel="alternate" href="https://atom.example.com/one"/>
    <link rel="replies" href="https://atom.example.com/one/replies"/>
    <thr:total>3</thr:total>
    <category term="Notes"/>
    <published>2026-07-12T08:30:00Z</published>
    <content type="html">&lt;p&gt;Atom body&lt;/p&gt;</content>
  </entry>
</feed>`;

describe('parseFeed', () => {
  it('parses RSS 2.0 with content:encoded, guid, pubDate and enclosures', () => {
    const feed = parseFeed(RSS2);
    expect(feed.title).toBe('My Blog');
    expect(feed.link).toBe('https://blog.example.com');
    expect(feed.items).toHaveLength(2);

    const first = feed.items[0];
    expect(first.guid).toBe('tag:blog,2026:first');
    expect(first.link).toBe('https://blog.example.com/first');
    expect(first.publishedAt).toBe('2026-07-13T10:00:00.000Z');
    // content:encoded (full body) wins over description.
    expect(first.html).toBe('<p>Full <b>HTML</b> body</p>');
    expect(first.isFullContent).toBe(true);
    expect(first.enclosures).toEqual([
      { url: 'https://blog.example.com/pic.jpg', type: 'image/jpeg' },
    ]);
  });

  it('reads categories, wfw:commentRss and slash:comments from RSS items', () => {
    const first = parseFeed(RSS2).items[0];
    expect(first.categories).toEqual(['Tech', 'Rambling']);
    expect(first.commentsFeedUrl).toBe('https://blog.example.com/first/feed');
    expect(first.commentCount).toBe(7);
  });

  it('leaves comment fields null when the item declares none', () => {
    const second = parseFeed(RSS2).items[1];
    expect(second.categories).toEqual([]);
    expect(second.commentsFeedUrl).toBeNull();
    expect(second.commentCount).toBeNull();
  });

  it('falls back to link for missing guid and null for missing dates', () => {
    const second = parseFeed(RSS2).items[1];
    expect(second.guid).toBe('https://blog.example.com/second');
    expect(second.publishedAt).toBeNull();
    expect(second.html).toBe('plain text');
  });

  it('marks a description-only item as not full content', () => {
    // No content:encoded on this one — description is a teaser, not the piece.
    expect(parseFeed(RSS2).items[1].isFullContent).toBe(false);
  });

  it('parses Atom, preferring the rel="alternate" link', () => {
    const feed = parseFeed(ATOM);
    expect(feed.title).toBe('Atom Feed');
    expect(feed.link).toBe('https://atom.example.com');
    const entry = feed.items[0];
    expect(entry.guid).toBe('urn:uuid:1');
    expect(entry.link).toBe('https://atom.example.com/one');
    expect(entry.publishedAt).toBe('2026-07-12T08:30:00Z'.replace('Z', '.000Z'));
    expect(entry.html).toBe('<p>Atom body</p>');
    expect(entry.isFullContent).toBe(true);
  });

  it('marks a summary-only Atom entry as not full content', () => {
    const summaryOnly = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Entry two</title>
    <id>urn:uuid:2</id>
    <link rel="alternate" href="https://atom.example.com/two"/>
    <summary>Just a teaser</summary>
  </entry>
</feed>`;
    const entry = parseFeed(summaryOnly).items[0];
    expect(entry.html).toBe('Just a teaser');
    expect(entry.isFullContent).toBe(false);
  });

  it('reads Atom threading: rel="replies", thr:total and category term', () => {
    const entry = parseFeed(ATOM).items[0];
    expect(entry.categories).toEqual(['Notes']);
    expect(entry.commentsFeedUrl).toBe('https://atom.example.com/one/replies');
    expect(entry.commentCount).toBe(3);
  });

  it('rejects non-XML with a human-readable message', () => {
    expect(() => parseFeed('<!doctype html><html><body>a web page</body></html>')).toThrow(
      /valid XML|Unrecognized/,
    );
  });

  it('rejects XML that is not a feed', () => {
    expect(() => parseFeed('<?xml version="1.0"?><opml></opml>')).toThrow(/Unrecognized feed/);
  });
});
