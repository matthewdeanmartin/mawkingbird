import { describe, expect, it } from 'vitest';
import { TIMELINE_FIXTURE, USER_FIXTURE } from '../fixtures/twitterapi-io.fixtures';
import {
  accountId,
  normalizeTimestamp,
  renderContent,
  statusId,
  toAccount,
  toStatus,
} from './normalizers';
import { WireTweet } from './wire-types';

/**
 * These run against responses captured from the live API on 2026-07-31, not
 * against shapes invented from documentation. That distinction is the whole
 * point: the written spec guessed several field names wrong, and tests built on
 * the same guesses would have passed while the app rendered blanks.
 */

const tweets = TIMELINE_FIXTURE;
const find = (predicate: (t: WireTweet) => boolean): WireTweet => {
  const found = tweets.find(predicate);
  if (!found) {
    throw new Error('fixture no longer contains this variant');
  }
  return found;
};

describe('the captured fixture still covers what these tests need', () => {
  it('has the variants the suite depends on', () => {
    expect(tweets.length).toBeGreaterThanOrEqual(5);
    expect(tweets.some((t) => t.retweeted_tweet)).toBe(true);
    expect(tweets.some((t) => t.extendedEntities?.media?.some((m) => m.type === 'photo'))).toBe(
      true,
    );
    expect(tweets.some((t) => t.extendedEntities?.media?.some((m) => m.type === 'video'))).toBe(
      true,
    );
  });
});

describe('toAccount', () => {
  const account = toAccount(USER_FIXTURE);

  it('reads the field names the API actually uses', () => {
    // The spec predicted followersCount / avatarUrl / bannerUrl / isProtected.
    // The API sends followers / profilePicture / coverPicture / protected.
    expect(account.followers_count).toBe(10705468);
    expect(account.following_count).toBe(3);
    expect(account.statuses_count).toBe(30825);
    expect(account.avatar).toContain('pbs.twimg.com');
    expect(account.header).toContain('profile_banners');
    expect(account.locked).toBe(false);
  });

  it('namespaces the id and marks the domain in acct', () => {
    expect(account.id).toBe('twitter:@jack');
    // So nothing mistakes a Twitter account for a local one.
    expect(account.acct).toBe('jack@x.com');
    expect(account.url).toBe('https://x.com/jack');
  });

  it('expands the t.co website link rather than showing the shortener', () => {
    const website = account.fields.find((f) => f.name === 'Website');
    expect(website?.value).toContain('primal.net/jack');
    expect(website?.value).not.toContain('t.co');
  });

  it('preserves the verification type, not just a blue tick', () => {
    // §8.2: a blue check is not legacy verification, and the fixture is exactly
    // that case — isBlueVerified true, isVerified false.
    const account2 = toAccount({ userName: 'x', isBlueVerified: true, verifiedType: 'Government' });
    expect(account2.fields.find((f) => f.name === 'Verified')?.value).toBe('Government');
  });

  it('survives a profile with nothing but a handle', () => {
    const sparse = toAccount({ userName: 'ghost' });
    expect(sparse.display_name).toBe('ghost');
    expect(sparse.followers_count).toBe(0);
    expect(sparse.fields).toEqual([]);
  });
});

describe('normalizeTimestamp', () => {
  it('parses the legacy format posts use', () => {
    // Posts send `Fri Jul 31 22:22:43 +0000 2026`, NOT ISO-8601.
    expect(normalizeTimestamp('Fri Jul 31 22:22:43 +0000 2026')).toBe('2026-07-31T22:22:43.000Z');
  });

  it('parses the ISO format profiles use, microseconds and all', () => {
    // Two formats in one API — profiles differ from posts.
    expect(normalizeTimestamp('2006-03-21T20:50:14.000000Z')).toBe('2006-03-21T20:50:14.000Z');
  });

  it('returns null rather than substituting now', () => {
    // A post stamped "now" because its date was unparseable would leap to the
    // top of a reverse-chronological feed — the most visible corruption there is.
    expect(normalizeTimestamp('not a date')).toBeNull();
    expect(normalizeTimestamp(undefined)).toBeNull();
  });
});

describe('toStatus', () => {
  it('keeps ids as strings, never numbers', () => {
    const status = toStatus(tweets[0]);
    // 2083317461269598348 > Number.MAX_SAFE_INTEGER: a round-trip through a JS
    // number silently corrupts the last digits (spec §8.1).
    expect(status.id).toBe(statusId(tweets[0].id!));
    expect(typeof status.id).toBe('string');
    expect(status.id).toContain(tweets[0].id!);
  });

  it('tags the provider so cards can gate interactions', () => {
    expect(toStatus(tweets[0]).provider).toBe('twitter');
  });

  it('builds a permalink when the provider sends neither url field', () => {
    // A null url silently costs the post its "↗ Nitter" button, which is the
    // only way out of the app for a tweet — and the id and handle needed to
    // construct the link are required fields we already have.
    const status = toStatus({
      id: '123',
      text: 'hi',
      author: { userName: 'NASA', id: '11348282' },
    });
    expect(status.url).toBe('https://x.com/NASA/status/123');
  });

  it('prefers the provider url when it sends one', () => {
    const status = toStatus({
      id: '123',
      text: 'hi',
      url: 'https://x.com/NASA/status/123?s=20',
      author: { userName: 'NASA', id: '11348282' },
    });
    expect(status.url).toBe('https://x.com/NASA/status/123?s=20');
  });

  it('reports no interaction state, because there is no signed-in X user', () => {
    const status = toStatus(tweets[0]);
    expect(status.favourited).toBe(false);
    expect(status.reblogged).toBe(false);
    expect(status.bookmarked).toBe(false);
  });

  it('leaves an unreadable date unreadable rather than forging epoch', () => {
    // Previously stamped `new Date(0)`. Epoch is older than every real post, so
    // the status pinned itself to the end of Home and every later page merged
    // above it. `byNewestFirst` now treats an unparseable date as unknown and
    // holds the post in place, so the raw value is passed through instead.
    const status = toStatus({ id: '1', author: { userName: 'a' }, createdAt: 'nonsense' });
    expect(Number.isNaN(Date.parse(status.created_at))).toBe(true);
  });
});

describe('retweets become reblogs', () => {
  const rt = find((t) => !!t.retweeted_tweet);
  const status = toStatus(rt);

  it('nests the original post as reblog', () => {
    expect(status.reblog).not.toBeNull();
    expect(status.reblog!.account.username).toBe(rt.retweeted_tweet!.author!.userName);
  });

  it('does not duplicate the text as "RT @user: ..."', () => {
    // X sends the retweet's text as `RT @handle: original text`. Rendering that
    // AND the nested post would show the same words twice.
    expect(status.content).toBe('');
    expect(status.reblog!.content).not.toMatch(/^RT @/);
  });

  it('stops recursing at depth 2', () => {
    const deep: WireTweet = {
      id: '1',
      author: { userName: 'a' },
      retweeted_tweet: {
        id: '2',
        author: { userName: 'b' },
        retweeted_tweet: {
          id: '3',
          author: { userName: 'c' },
          retweeted_tweet: { id: '4', author: { userName: 'd' } },
        },
      },
    };
    const status2 = toStatus(deep);
    expect(status2.reblog!.reblog).not.toBeNull();
    // Depth 2 reached: the fourth level is dropped rather than expanded.
    expect(status2.reblog!.reblog!.reblog).toBeNull();
  });
});

describe('media', () => {
  it('maps a photo to an image attachment with its alt text', () => {
    const withPhoto = find((t) => !!t.extendedEntities?.media?.some((m) => m.type === 'photo'));
    const status = toStatus(withPhoto);
    expect(status.media_attachments[0].type).toBe('image');
    expect(status.media_attachments[0].url).toContain('pbs.twimg.com');
    // ext_alt_text, not alt_text — a real accessibility regression if missed.
    expect(status.media_attachments[0].description).toBeTruthy();
  });

  it('picks the highest-bitrate mp4, not the HLS playlist', () => {
    // The playlist has no bitrate and <video> cannot play it everywhere.
    const withVideo = find((t) => !!t.extendedEntities?.media?.some((m) => m.type === 'video'));
    const status = toStatus(withVideo);
    expect(status.media_attachments[0].url).toContain('.mp4');
    expect(status.media_attachments[0].url).not.toContain('.m3u8');
  });

  it('maps an animated gif to gifv', () => {
    const status = toStatus({
      id: '1',
      author: { userName: 'a' },
      extendedEntities: { media: [{ type: 'animated_gif', media_url_https: 'https://x/y.png' }] },
    });
    expect(status.media_attachments[0].type).toBe('gifv');
  });
});

describe('renderContent', () => {
  it('links @mentions to x.com', () => {
    const html = renderContent({ text: 'hello @NASA and @jack' });
    expect(html).toContain('href="https://x.com/NASA"');
    expect(html).toContain('>@NASA</a>');
  });

  it('links #hashtags', () => {
    expect(renderContent({ text: 'a #Rocket launch' })).toContain(
      'href="https://x.com/hashtag/Rocket"',
    );
  });

  it('expands a t.co link to its real destination', () => {
    const html = renderContent({
      text: 'read https://t.co/abc',
      entities: {
        urls: [
          {
            url: 'https://t.co/abc',
            expanded_url: 'https://nasa.gov/article',
            display_url: 'nasa.gov/article',
          },
        ],
      },
    });
    // Readers should see where a link goes.
    expect(html).toContain('href="https://nasa.gov/article"');
    expect(html).toContain('>nasa.gov/article</a>');
  });

  it('drops the trailing media link, which duplicates the attachment', () => {
    const html = renderContent({
      text: 'look at this https://t.co/pic',
      extendedEntities: { media: [{ type: 'photo', url: 'https://t.co/pic' }] },
    });
    expect(html).not.toContain('t.co/pic');
    expect(html).toContain('look at this');
    // And no dangling whitespace where it used to be.
    expect(html).not.toMatch(/\s+<\/p>/);
  });

  it('escapes HTML in post text', () => {
    // Post text is arbitrary input and lands in a field rendered as HTML.
    const html = renderContent({ text: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not mangle text containing emoji', () => {
    // The reason entities are matched textually rather than spliced by the
    // provider's `indices`: those offsets misalign on astral characters, and X
    // posts are full of emoji.
    const html = renderContent({ text: 'New @NASA alert 🚨✈️🚀 for #Artemis' });
    expect(html).toContain('>@NASA</a>');
    expect(html).toContain('>#Artemis</a>');
    expect(html).toContain('🚨✈️🚀');
  });

  it('renders blank lines as paragraphs and single ones as breaks', () => {
    const html = renderContent({ text: 'one\ntwo\n\nthree' });
    expect(html).toBe('<p>one<br />two</p><p>three</p>');
  });

  it('leaves an email address alone rather than reading @domain as a mention', () => {
    const html = renderContent({ text: 'mail me@example.com' });
    expect(html).not.toContain('x.com/example');
  });
});

describe('id namespacing', () => {
  it('cannot collide with a Mastodon id', () => {
    expect(statusId('123')).toBe('twitter:123');
    expect(accountId('jack')).toBe('twitter:@jack');
  });
});
