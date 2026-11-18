import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { archiveNumbers } from './archive-numbers';
import { fold, searchLikes, searchTweets, terms, tweetYears } from './archive-search';
import { contactsVcard, parseContacts, readContacts } from './contacts-export';
import type { UnbirdArchive, UnbirdTweet } from './unbird-archive';
import { escapeHtml, renderText, websiteFiles, websiteZip } from './website-export';

function tweet(
  id: string,
  at: string,
  text: string,
  extra: Partial<UnbirdTweet> = {},
): UnbirdTweet {
  return { id, at, text, likes: 0, retweets: 0, media: 0, ...extra };
}

function archive(): UnbirdArchive {
  return {
    version: 1,
    readAt: 0,
    owner: { accountId: '1', userName: 'owner', displayName: 'Owner' },
    generatedAt: null,
    profile: { bio: 'Writes <things>', website: '', location: '' },
    counts: {},
    files: { total: 7, opened: [] },
    hasContacts: true,
    followingCount: 2,
    followerCount: 1,
    people: [],
    tweets: [
      tweet('5', '2022-06-01T10:00:00.000Z', 'Café au lait #Coffee', { likes: 40, media: 1 }),
      tweet('4', '2022-05-01T10:00:00.000Z', 'second part', { replyTo: '3', selfReply: true }),
      tweet('3', '2021-05-01T10:00:00.000Z', 'A thread about Mastodon https://a.example/x.', {
        likes: 7,
      }),
      tweet('2', '2021-04-01T10:00:00.000Z', '@friend yes exactly', {
        replyTo: '99',
        replyToOther: true,
        likes: 99,
      }),
      tweet('1', '2020-01-01T10:00:00.000Z', 'RT @someone: their words', { retweet: true }),
    ],
    likes: [
      { id: '9', text: 'A great talk about coffee', url: 'https://x.com/i/web/status/9' },
      { id: '8', text: 'Something else', url: '' },
    ],
    savedSearches: [],
  };
}

describe('archive search', () => {
  it('folds accents and case, and keeps quoted phrases whole', () => {
    expect(fold('Café')).toBe('cafe');
    expect(terms('cafe "au lait"  x')).toEqual(['cafe', 'au lait', 'x']);
  });

  it('matches every word, leaves retweets out unless asked, and filters by kind and year', () => {
    const data = archive();
    const search = (text: string, extra = {}) =>
      searchTweets(data, { text, kind: 'all', year: null, retweets: false, ...extra }).results.map(
        (item) => item.id,
      );
    expect(search('cafe LAIT')).toEqual(['5']);
    expect(search('words')).toEqual([]);
    expect(search('words', { retweets: true })).toEqual(['1']);
    expect(search('', { kind: 'threads' })).toEqual(['4']);
    expect(search('', { kind: 'replies' })).toEqual(['2']);
    expect(search('', { kind: 'media' })).toEqual(['5']);
    expect(search('', { kind: 'originals' })).toEqual(['5', '3']);
    expect(search('', { year: '2021' })).toEqual(['3', '2']);
  });

  it('counts every match while returning at most the limit', () => {
    const result = searchTweets(
      archive(),
      { text: '', kind: 'all', year: null, retweets: true },
      2,
    );
    expect(result.total).toBe(5);
    expect(result.results).toHaveLength(2);
  });

  it('searches likes and lists years newest first', () => {
    expect(searchLikes(archive(), 'COFFEE').results.map((like) => like.id)).toEqual(['9']);
    expect(tweetYears(archive())).toEqual(['2022', '2021', '2020']);
  });
});

describe('archive numbers', () => {
  it('counts kinds, years and the best posts, leaving retweets and replies out of the best', () => {
    const numbers = archiveNumbers(archive());
    expect(numbers).toMatchObject({
      originals: 2,
      threads: 1,
      replies: 1,
      retweets: 1,
      withMedia: 1,
      likes: 2,
      years: 2,
      first: '2021-04-01T10:00:00.000Z',
      last: '2022-06-01T10:00:00.000Z',
    });
    expect(numbers.perYear).toEqual([
      { year: '2021', tweets: 2 },
      { year: '2022', tweets: 2 },
    ]);
    expect(numbers.best.map((item) => item.id)).toEqual(['5', '3']);
    expect(numbers.hashtags).toEqual([{ tag: 'Coffee', count: 1 }]);
  });
});

describe('website export', () => {
  it('escapes text and links bare URLs without the trailing period', () => {
    expect(escapeHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;');
    expect(renderText('see https://a.example/x. <now>')).toBe(
      'see <a href="https://a.example/x" rel="nofollow">https://a.example/x</a>. &lt;now&gt;',
    );
  });

  it('builds a page per year and a feed, without retweets or replies to others by default', () => {
    const files = websiteFiles(archive(), { title: 'Owner', replies: false, baseUrl: '' });
    expect(Object.keys(files).sort()).toEqual([
      '2021.html',
      '2022.html',
      'feed.xml',
      'index.html',
      'style.css',
    ]);
    expect(files['2021.html']).toContain('A thread about Mastodon');
    expect(files['2021.html']).not.toContain('yes exactly');
    expect(files['index.html']).not.toContain('their words');
    expect(files['index.html']).toContain('Writes &lt;things&gt;');
    expect(files['feed.xml']).toContain('<guid isPermaLink="false">tweet-5</guid>');
  });

  it('includes replies to others when asked, and absolute feed links with a base URL', () => {
    const files = websiteFiles(archive(), {
      title: 'Owner',
      replies: true,
      baseUrl: 'https://me.example/tweets/',
    });
    expect(files['2021.html']).toContain('yes exactly');
    expect(files['feed.xml']).toContain('https://me.example/tweets/2022.html#t5');
  });

  it('zips the site under one folder', async () => {
    const zipped = new Uint8Array(
      await websiteZip(archive(), { title: 'O', replies: false, baseUrl: '' }).arrayBuffer(),
    );
    expect(Object.keys(unzipSync(zipped))).toContain('site/index.html');
  });
});

describe('contacts export', () => {
  const contactJs = `window.YTD.contact.part0 = ${JSON.stringify([
    { contact: { emails: ['a@b.example'], phoneNumbers: ['+1 555; 0100'] } },
    { contact: { phoneNumbers: ['+44 20'] } },
    { contact: { emails: [] } },
  ])}`;

  it('reads emails and numbers and skips empty cards', () => {
    expect(parseContacts(contactJs)).toEqual([
      { emails: ['a@b.example'], phones: ['+1 555; 0100'] },
      { emails: [], phones: ['+44 20'] },
    ]);
  });

  it('writes vCard 3.0 with CRLF endings, escaped values and a usable name', () => {
    const vcard = contactsVcard(parseContacts(contactJs));
    expect(vcard.split('BEGIN:VCARD')).toHaveLength(3);
    expect(vcard).toContain('FN:a@b.example\r\n');
    expect(vcard).toContain('TEL:+1 555\\; 0100\r\n');
    expect(vcard).toContain('FN:+44 20\r\n');
    expect(vcard.endsWith('END:VCARD\r\n')).toBe(true);
  });

  it('opens only contact.js from the zip, and says when there is none', async () => {
    const blob = new Blob([
      zipSync({
        'data/contact.js': strToU8(contactJs),
        'data/tweets.js': strToU8('not json'),
      }) as BlobPart,
    ]);
    expect(await readContacts([{ path: 'x.zip', blob }])).toHaveLength(2);
    const empty = new Blob([zipSync({ 'data/tweets.js': strToU8('x') }) as BlobPart]);
    expect(await readContacts([{ path: 'x.zip', blob: empty }])).toBeNull();
  });
});
