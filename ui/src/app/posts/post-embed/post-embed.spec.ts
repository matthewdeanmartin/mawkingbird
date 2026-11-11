import { describe, expect, it } from 'vitest';
import { Account, Status } from '../../platform/api/models';
import { buildPostEmbedHtml, canEmbedPost, cleanContent } from './post-embed';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: '1',
    username: 'alice',
    acct: 'alice@example.social',
    display_name: 'Alice :wave:',
    url: 'https://example.social/@alice',
    emojis: [
      {
        shortcode: 'wave',
        url: 'https://cdn.example/wave.png',
        static_url: 'https://cdn.example/wave.png',
        visible_in_picker: true,
      },
    ],
    ...overrides,
  } as Account;
}

function status(overrides: Partial<Status> = {}): Status {
  return {
    id: '10',
    created_at: '2026-01-02T03:04:05.000Z',
    edited_at: null,
    content: '<p>Hello <a href="https://example.com/x" class="mention">world</a></p>',
    spoiler_text: '',
    visibility: 'public',
    url: 'https://example.social/@alice/10',
    account: account(),
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    language: 'en',
    ...overrides,
  } as Status;
}

describe('post embed HTML', () => {
  it('keeps attribution, a link back, the language and the content', () => {
    const html = buildPostEmbedHtml(status(), 'en-US');
    expect(html).toContain(
      '<blockquote lang="en" cite="https://example.social/@alice/10" data-source="fediverse">',
    );
    expect(html).toContain(
      '<p>Hello <a href="https://example.com/x" rel="nofollow noopener noreferrer">world</a></p>',
    );
    expect(html).toContain(
      '<a href="https://example.social/@alice" rel="nofollow noopener noreferrer">Alice <img src="https://cdn.example/wave.png" alt=":wave:"',
    );
    expect(html).toContain('(@alice@example.social)');
    expect(html).toContain(
      '<a href="https://example.social/@alice/10"><time datetime="2026-01-02T03:04:05.000Z">',
    );
    expect(html).not.toContain('class=');
  });

  it('strips scripts, event handlers and unsafe links from server content', () => {
    const cleaned = cleanContent(
      '<p onclick="x()">Hi<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><span class="invisible">https://</span>ok</p>',
    );
    expect(cleaned).toBe('<p>Hibadok</p>');
  });

  it('escapes text so author-supplied names cannot inject markup', () => {
    const html = buildPostEmbedHtml(
      status({ account: account({ display_name: '<img src=x onerror=alert(1)>', emojis: [] }) }),
    );
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('wraps a content warning in details and keeps media descriptions', () => {
    const html = buildPostEmbedHtml(
      status({
        spoiler_text: 'Spoilers',
        media_attachments: [
          {
            id: 'm1',
            type: 'image',
            url: 'https://cdn.example/full.jpg',
            preview_url: 'https://cdn.example/small.jpg',
            description: 'A "cat" & a dog',
            meta: { small: { width: 400, height: 300 } },
          },
          {
            id: 'm2',
            type: 'video',
            url: 'https://cdn.example/v.mp4',
            preview_url: 'https://cdn.example/v.jpg',
            description: 'Waves',
          },
        ],
      }),
    );
    expect(html).toMatch(/<details>\s*<summary>Spoilers<\/summary>/);
    expect(html).toContain(
      '<img src="https://cdn.example/small.jpg" width="400" height="300" alt="A &quot;cat&quot; &amp; a dog" loading="lazy" />',
    );
    expect(html).toContain('poster="https://cdn.example/v.jpg"');
    expect(html).toContain('<figcaption>Waves</figcaption>');
  });

  it('includes poll results and a nested quote', () => {
    const quoted = status({
      id: '9',
      content: '<p>Quoted</p>',
      url: 'https://example.social/@alice/9',
    });
    const html = buildPostEmbedHtml(
      status({
        quote: { state: 'accepted', quoted_status: quoted },
        poll: {
          id: 'p',
          expires_at: null,
          expired: true,
          multiple: false,
          votes_count: 3,
          voters_count: 3,
          options: [
            { title: 'Yes', votes_count: 2 },
            { title: 'No', votes_count: 1 },
          ],
          voted: false,
          own_votes: [],
        },
      }),
    );
    expect(html).toContain('<li>Yes (2)</li>');
    expect(html).toContain('cite="https://example.social/@alice/9"');
    expect(html.match(/<blockquote/g)?.length).toBe(2);
  });

  it('is offered only for public or unlisted Mastodon posts with a URL', () => {
    expect(canEmbedPost(status())).toBe(true);
    expect(canEmbedPost(status({ visibility: 'unlisted' }))).toBe(true);
    expect(canEmbedPost(status({ provider: 'anonymous-mastodon' }))).toBe(true);
    expect(canEmbedPost(status({ visibility: 'private' }))).toBe(false);
    expect(canEmbedPost(status({ visibility: 'direct' }))).toBe(false);
    expect(canEmbedPost(status({ provider: 'bluesky' }))).toBe(false);
    expect(canEmbedPost(status({ url: null, uri: undefined }))).toBe(false);
  });
});
