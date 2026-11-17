import { describe, expect, it } from 'vitest';
import { Status } from '../platform/api/models';
import {
  blogReason,
  blogTitle,
  clampThresholds,
  collectBlogPosts,
  DEFAULT_BLOG_THRESHOLDS,
  firstLine,
  hasBlogMarker,
  readingMinutes,
} from './blog-classifier';

const AUTHOR = 'a';
let clock = 0;

/** A post by `account`, written one minute after the previous one built here. */
function post(
  id: string,
  content: string,
  options: {
    account?: string;
    replyTo?: string | null;
    replyToAccount?: string | null;
    visibility?: string;
    reblog?: Status | null;
    spoiler?: string;
  } = {},
): Status {
  clock++;
  return {
    id,
    created_at: new Date(Date.UTC(2026, 10, 1, 0, clock)).toISOString(),
    content,
    spoiler_text: options.spoiler ?? '',
    visibility: options.visibility ?? 'public',
    account: { id: options.account ?? AUTHOR, acct: 'writer@example.social' },
    in_reply_to_id: options.replyTo ?? null,
    in_reply_to_account_id:
      options.replyToAccount !== undefined
        ? options.replyToAccount
        : options.replyTo
          ? (options.account ?? AUTHOR)
          : null,
    reblog: options.reblog ?? null,
  } as Status;
}

const short = (text: string) => `<p>${text}</p>`;
const long = (words: number) => `<p>${'word '.repeat(words).trim()}</p>`;

function scan(statuses: Status[], exhausted = false) {
  return collectBlogPosts(statuses, AUTHOR, DEFAULT_BLOG_THRESHOLDS, exhausted);
}

describe('firstLine and blogTitle', () => {
  it('takes the first line, splitting on <br> and paragraphs', () => {
    expect(firstLine('<p>Why I garden<br>It started in May.</p><p>More.</p>')).toBe('Why I garden');
  });

  it('decodes entities and drops markup inside the line', () => {
    const root = post('1', '<p>Tom &amp; Jerry&#39;s <a href="x"><span>guide</span></a></p>');
    expect(blogTitle(root)).toBe("Tom & Jerry's guide");
  });

  it('strips a BLOG: marker, in any case', () => {
    expect(blogTitle(post('1', short('blog: Notes on rust')))).toBe('Notes on rust');
  });

  it('takes the next line when the marker stands alone', () => {
    expect(blogTitle(post('1', '<p>BLOG:<br>The real title</p>'))).toBe('The real title');
  });

  it('never uses the content warning', () => {
    const root = post('1', short('First line'), { spoiler: 'politics' });
    expect(blogTitle(root)).toBe('First line');
  });

  it('is empty for a post with no text', () => {
    expect(blogTitle(post('1', ''))).toBe('');
  });

  it('shortens a very long first line at a word', () => {
    const title = blogTitle(post('1', long(60)));
    expect(title.length).toBeLessThanOrEqual(140);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('hasBlogMarker', () => {
  it('needs the marker at the start of the first line', () => {
    expect(hasBlogMarker(post('1', short('BLOG: Title')))).toBe(true);
    expect(hasBlogMarker(post('2', short('My blog: Title')))).toBe(false);
    expect(hasBlogMarker(post('3', '<p>Hello<br>BLOG: later</p>'))).toBe(false);
  });
});

describe('blogReason', () => {
  it('prefers the marker, then storm, then length', () => {
    const marked = post('1', short('BLOG: x'));
    expect(blogReason([marked], DEFAULT_BLOG_THRESHOLDS)).toBe('marked');
    const storm = [post('2', short('a')), post('3', short('b')), post('4', short('c'))];
    expect(blogReason(storm, DEFAULT_BLOG_THRESHOLDS)).toBe('storm');
    expect(blogReason([post('5', long(300))], DEFAULT_BLOG_THRESHOLDS)).toBe('long');
    expect(blogReason([post('6', short('hi'))], DEFAULT_BLOG_THRESHOLDS)).toBeNull();
    expect(blogReason([], DEFAULT_BLOG_THRESHOLDS)).toBeNull();
  });
});

describe('collectBlogPosts', () => {
  it('finds a three-post storm, in writing order, titled by its first line', () => {
    const p1 = post('1', '<p>A storm about bees<br>Bees are great.</p>');
    const p2 = post('2', short('They dance.'), { replyTo: '1' });
    const p3 = post('3', short('They make honey.'), { replyTo: '2' });
    const { posts } = scan([p3, p2, p1]);
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('1');
    expect(posts[0].chain.map((s) => s.id)).toEqual(['1', '2', '3']);
    expect(posts[0].title).toBe('A storm about bees');
    expect(posts[0].excerpt).toBe('Bees are great. They dance. They make honey.');
    expect(posts[0].reason).toBe('storm');
  });

  it('accepts the fan shape: every reply to the first post', () => {
    const p1 = post('1', short('Fan'));
    const p2 = post('2', short('b'), { replyTo: '1' });
    const p3 = post('3', short('c'), { replyTo: '1' });
    expect(scan([p1, p2, p3]).posts[0].chain).toHaveLength(3);
  });

  it('skips two short self-replies but keeps them if long enough together', () => {
    const p1 = post('1', short('Short'));
    const p2 = post('2', short('Also short'), { replyTo: '1' });
    expect(scan([p1, p2]).posts).toHaveLength(0);

    const q1 = post('11', long(130));
    const q2 = post('12', long(130), { replyTo: '11' });
    expect(scan([q1, q2]).posts[0].reason).toBe('long');
  });

  it('keeps a single long post', () => {
    expect(scan([post('1', long(300))]).posts[0].reason).toBe('long');
  });

  it('keeps a short post marked BLOG:', () => {
    const { posts } = scan([post('1', short('BLOG: A tiny essay'))]);
    expect(posts[0].reason).toBe('marked');
    expect(posts[0].title).toBe('A tiny essay');
  });

  it("leaves the author's side-replies to other people out of the storm", () => {
    const p1 = post('1', short('Storm'));
    const p2 = post('2', short('two'), { replyTo: '1' });
    const stranger = post('x', short('question?'), { account: 'b', replyTo: '2' });
    const answer = post('3', short('answer'), { replyTo: 'x', replyToAccount: 'b' });
    const p4 = post('4', short('three'), { replyTo: '2' });
    const { posts } = scan([p1, p2, stranger, answer, p4]);
    expect(posts).toHaveLength(1);
    expect(posts[0].chain.map((s) => s.id)).toEqual(['1', '2', '4']);
  });

  it('treats a chain that answers someone else as a conversation', () => {
    const p1 = post('1', short('Reply to you'), { replyTo: 'x', replyToAccount: 'b' });
    const p2 = post('2', short('more'), { replyTo: '1' });
    const p3 = post('3', short('more'), { replyTo: '2' });
    expect(scan([p1, p2, p3]).posts).toHaveLength(0);
  });

  it('lets a marker turn a reply to someone else into a blog post', () => {
    const p1 = post('1', short('BLOG: A response to Bob'), { replyTo: 'x', replyToAccount: 'b' });
    expect(scan([p1]).posts).toHaveLength(1);
  });

  it('ignores private and direct posts, reblogs and other authors', () => {
    const priv = post('1', long(300), { visibility: 'private' });
    const direct = post('2', long(300), { visibility: 'direct' });
    const other = post('3', long(300), { account: 'b' });
    const boost = post('4', '', { reblog: post('5', long(300), { account: 'b' }) });
    expect(scan([priv, direct, other, boost]).posts).toHaveLength(0);
  });

  it('counts unlisted posts', () => {
    expect(scan([post('1', long(300), { visibility: 'unlisted' })]).posts).toHaveLength(1);
  });

  it('holds back a chain whose root is older than the loaded page', () => {
    const p2 = post('2', short('b'), { replyTo: '1' });
    const p3 = post('3', short('c'), { replyTo: '2' });
    const p4 = post('4', short('d'), { replyTo: '3' });
    const pending = scan([p2, p3, p4]);
    expect(pending.posts).toHaveLength(0);
    expect(pending.pendingOlder).toBe(1);

    const done = scan([p2, p3, p4], true);
    expect(done.posts).toHaveLength(1);
    expect(done.posts[0].partial).toBe(true);
    expect(done.posts[0].id).toBe('2');
  });

  it('completes the chain once the older page brings the root', () => {
    const p1 = post('1', short('Root'));
    const p2 = post('2', short('b'), { replyTo: '1' });
    const p3 = post('3', short('c'), { replyTo: '2' });
    const { posts, pendingOlder } = scan([p3, p2, p1, p2]);
    expect(pendingOlder).toBe(0);
    expect(posts[0].partial).toBe(false);
    expect(posts[0].chain).toHaveLength(3);
  });

  it('trusts a missing reply-to-account only when the parent is the author’s', () => {
    const p1 = post('1', short('Root'));
    const p2 = post('2', short('b'), { replyTo: '1', replyToAccount: null });
    const p3 = post('3', short('c'), { replyTo: '2', replyToAccount: null });
    expect(scan([p1, p2, p3]).posts[0].chain).toHaveLength(3);
  });

  it('lists newest first and respects custom thresholds', () => {
    const a1 = post('1', short('Old'));
    const a2 = post('2', short('b'), { replyTo: '1' });
    const b1 = post('3', short('New'));
    const b2 = post('4', short('b'), { replyTo: '3' });
    const two = { minPosts: 2, minChars: 99_999 };
    const ids = collectBlogPosts([a1, a2, b1, b2], AUTHOR, two).posts.map((p) => p.id);
    expect(ids).toEqual(['3', '1']);
  });
});

describe('clampThresholds', () => {
  it('clamps, rounds and falls back to defaults', () => {
    expect(clampThresholds({ minPosts: 1, minChars: 999_999 })).toEqual({
      minPosts: 2,
      minChars: 50_000,
    });
    expect(clampThresholds({ minPosts: 4.6, minChars: Number.NaN })).toEqual({
      minPosts: 5,
      minChars: 1250,
    });
    expect(clampThresholds(null)).toEqual(DEFAULT_BLOG_THRESHOLDS);
  });
});

describe('readingMinutes', () => {
  it('never says zero', () => {
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(13_000)).toBe(10);
  });
});
