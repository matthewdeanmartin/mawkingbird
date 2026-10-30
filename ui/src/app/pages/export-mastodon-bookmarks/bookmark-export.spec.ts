import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { bookmarkFileHtml, exportEntries, sharedLink } from './bookmark-export';

const INSTANCE = 'https://social.example';

function post(id: string, content: string, extra: Partial<Status> = {}): Status {
  return {
    id,
    created_at: '2026-01-02T03:04:05Z',
    content,
    spoiler_text: '',
    url: `${INSTANCE}/@alice/${id}`,
    account: { acct: 'alice' },
    reblog: null,
    tags: [{ name: 'Rust', url: `${INSTANCE}/tags/rust` }],
    ...extra,
  } as Status;
}

const article = post(
  '1',
  `<p>Great read <a href="${INSTANCE}/tags/rust" class="hashtag">#rust</a></p><p><a href="https://blog.example/post">blog.example/post</a></p>`,
  { card: { url: 'https://blog.example/post', title: 'Why Rust', description: '' } as never },
);
const chatter = post('2', '<p>Just a thought,<br>no link.</p>');

describe('bookmark export', () => {
  it('finds the link a post shares, skipping hashtags and the instance itself', () => {
    expect(sharedLink(article, INSTANCE)).toBe('https://blog.example/post');
    expect(sharedLink(chatter, INSTANCE)).toBeNull();
    const cardOnly = post('3', '<p>see card</p>', {
      card: { url: 'https://news.example/a', title: 'A' } as never,
    });
    expect(sharedLink(cardOnly, INSTANCE)).toBe('https://news.example/a');
  });

  it('posts: every bookmark is the post itself', () => {
    const entries = exportEntries([article, chatter], 'posts', INSTANCE);
    expect(entries.map((entry) => entry.url)).toEqual([
      `${INSTANCE}/@alice/1`,
      `${INSTANCE}/@alice/2`,
    ]);
    expect(entries[1].title).toBe('@alice: Just a thought, no link.');
  });

  it('unwrapped: shared links become the bookmark, the rest stay posts', () => {
    const [link, plain] = exportEntries([article, chatter], 'unwrapped', INSTANCE);
    expect(link.url).toBe('https://blog.example/post');
    expect(link.title).toBe('Why Rust');
    expect(link.description).toContain('Shared by @alice');
    expect(link.description).toContain(`${INSTANCE}/@alice/1`);
    expect(link.tags).toEqual(['mastodon', 'rust']);
    expect(link.addDate).toBe(Date.parse('2026-01-02T03:04:05Z') / 1000);
    expect(plain.url).toBe(`${INSTANCE}/@alice/2`);
  });

  it('links: only bookmarks that share a link', () => {
    expect(exportEntries([article, chatter], 'links', INSTANCE).map((e) => e.url)).toEqual([
      'https://blog.example/post',
    ]);
  });

  it('unwraps the boosted post, not the boost', () => {
    const boost = post('9', '', { reblog: article, url: null });
    expect(exportEntries([boost], 'links', INSTANCE)[0].url).toBe('https://blog.example/post');
  });

  it('writes a Netscape bookmark file with every value escaped', () => {
    const html = bookmarkFileHtml(
      [
        {
          url: 'https://x.example/?a=1&b="2"',
          title: 'Tom & <Jerry>',
          description: 'a < b',
          addDate: 100,
          tags: ['mastodon', 'cats'],
        },
      ],
      'Mastodon bookmarks',
    );
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('<DT><H3>Mastodon bookmarks</H3>');
    expect(html).toContain(
      '<DT><A HREF="https://x.example/?a=1&amp;b=&quot;2&quot;" ADD_DATE="100" TAGS="mastodon,cats">Tom &amp; &lt;Jerry&gt;</A>',
    );
    expect(html).toContain('<DD>a &lt; b');
    // Parses back to exactly one bookmark with the original values.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchors = doc.querySelectorAll('a');
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute('href')).toBe('https://x.example/?a=1&b="2"');
    expect(anchors[0].textContent).toBe('Tom & <Jerry>');
  });
});
