import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  archiveBaseName,
  ArchiveReadError,
  buildArchive,
  closeness,
  isDataFile,
  rankPeople,
  readTwitterArchive,
  UnbirdPerson,
} from './unbird-archive';

const ytd = (name: string, rows: unknown[]) => `window.YTD.${name}.part0 = ${JSON.stringify(rows)}`;

function tweet(id: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    tweet: {
      id_str: id,
      created_at: 'Wed Mar 05 10:00:00 +0000 2014',
      full_text: text,
      favorite_count: '3',
      retweet_count: '1',
      entities: { user_mentions: [], hashtags: [], urls: [] },
      ...extra,
    },
  };
}

const manifest = `window.__THAR_CONFIG = ${JSON.stringify({
  userInfo: { accountId: '1', userName: 'owner', displayName: 'Owner' },
  archiveInfo: { generationDate: '2026-07-24T00:00:00.000Z' },
  dataTypes: { tweets: { files: [{ count: '3' }] }, like: { files: [{ count: '1' }] } },
})}`;

const sources = [
  { name: 'data/manifest.js', text: manifest },
  {
    name: 'data/profile.js',
    text: ytd('profile', [
      { profile: { description: { bio: 'Hi', website: 'https://x.example', location: 'Here' } } },
    ]),
  },
  {
    name: 'data/following.js',
    text: ytd('following', [
      { following: { accountId: '10' } },
      { following: { accountId: '11' } },
    ]),
  },
  { name: 'data/follower.js', text: ytd('follower', [{ follower: { accountId: '10' } }]) },
  {
    name: 'data/tweets-part1.js',
    text: ytd('tweets', [
      tweet('100', 'Hello &amp; welcome https://t.co/a', {
        entities: {
          user_mentions: [],
          hashtags: [],
          urls: [{ url: 'https://t.co/a', expanded_url: 'https://example.com/post' }],
        },
      }),
      tweet('101', 'and a thread', { in_reply_to_status_id_str: '100' }),
      tweet('102', '@friend sure thing', {
        in_reply_to_status_id_str: '999',
        in_reply_to_user_id_str: '10',
        in_reply_to_screen_name: 'friend',
        entities: {
          user_mentions: [{ id_str: '10', screen_name: 'friend', name: 'Friend' }],
          hashtags: [],
          urls: [],
        },
      }),
    ]),
  },
  {
    name: 'data/like.js',
    text: ytd('like', [
      { like: { tweetId: '5', fullText: 'Liked &lt;3', expandedUrl: 'https://u' } },
    ]),
  },
  { name: 'data/saved-search.js', text: ytd('saved', [{ savedSearch: { query: '#mastodon' } }]) },
  { name: 'data/account.js', text: ytd('account', [{ account: { email: 'secret@example.com' } }]) },
];

describe('Unbird archive', () => {
  it('names split parts by their base file', () => {
    expect(archiveBaseName('data/tweets-part12.js')).toBe('tweets.js');
    expect(archiveBaseName('Data\\Like.js')).toBe('like.js');
    expect(isDataFile('twitter-x/data/tweets.js')).toBe(true);
    expect(isDataFile('data/tweets_media/1.jpg')).toBe(false);
  });

  it('reads owner, profile, counts and saved searches, and never the account file', () => {
    const archive = buildArchive(sources, 7);
    expect(archive.owner).toEqual({ accountId: '1', userName: 'owner', displayName: 'Owner' });
    expect(archive.profile).toEqual({ bio: 'Hi', website: 'https://x.example', location: 'Here' });
    expect(archive.counts).toEqual({ tweets: 3, like: 1 });
    expect(archive.savedSearches).toEqual(['#mastodon']);
    expect(archive.files.opened).not.toContain('account.js');
    expect(JSON.stringify(archive)).not.toContain('secret@example.com');
  });

  it('decodes and expands tweet text, and tells threads from replies to others', () => {
    const tweets = new Map(buildArchive(sources).tweets.map((item) => [item.id, item]));
    expect(tweets.get('100')?.text).toBe('Hello & welcome https://example.com/post');
    expect(tweets.get('101')).toMatchObject({ selfReply: true, replyTo: '100' });
    expect(tweets.get('102')).toMatchObject({ replyToOther: true });
    expect(tweets.get('100')?.selfReply).toBeUndefined();
  });

  it('keeps likes with their text', () => {
    expect(buildArchive(sources).likes).toEqual([{ id: '5', text: 'Liked <3', url: 'https://u' }]);
  });

  it('ranks people by closeness and marks who followed back', () => {
    const archive = buildArchive(sources);
    expect(archive.followingCount).toBe(2);
    expect(archive.followerCount).toBe(1);
    const friend = archive.people.find((person) => person.twitter_handle === 'friend');
    expect(friend).toMatchObject({ mutual: true, currently_following: true });
    expect(archive.people[0]).toBe(friend);
  });

  it('never lists the owner among their own people, even from self-mentions', () => {
    const archive = buildArchive(sources);
    const withSelf = {
      ...archive,
      people: [
        ...archive.people,
        { ...archive.people[0], twitter_handle: 'Owner', twitter_account_id: null, mutual: false },
        { ...archive.people[0], twitter_handle: 'x', twitter_account_id: '1', mutual: false },
      ],
    };
    expect(rankPeople(withSelf).map((person) => person.twitter_handle)).not.toContain('Owner');
    expect(rankPeople(withSelf).map((person) => person.twitter_handle)).not.toContain('x');
  });

  it('puts friends first: mutuals, steady conversation and recent talk outrank volume alone', () => {
    const person = (extra: Partial<UnbirdPerson>): UnbirdPerson => ({
      twitter_handle: 'p',
      twitter_name: null,
      twitter_account_id: null,
      previous_handles: [],
      currently_following: false,
      reply_count: 0,
      mention_count: 0,
      first_interaction_at: null,
      last_interaction_at: null,
      twitter_profile_url: '',
      mutual: false,
      closeness: 0,
      ...extra,
    });
    const end = Date.parse('2026-07-24T00:00:00Z');
    const mutualFriend = person({ currently_following: true, mutual: true, reply_count: 3 });
    const loudStranger = person({ reply_count: 12 });
    expect(closeness(mutualFriend, true, end)).toBeGreaterThan(closeness(loudStranger, false, end));
    const recent = person({ reply_count: 4, last_interaction_at: '2026-03-01T00:00:00Z' });
    const longAgo = person({ reply_count: 4, last_interaction_at: '2015-03-01T00:00:00Z' });
    expect(closeness(recent, false, end)).toBeGreaterThan(closeness(longAgo, false, end));
  });

  it('reads straight from the zip, opening only the allowlisted files', async () => {
    const files = Object.fromEntries(sources.map((source) => [source.name, strToU8(source.text)]));
    files['data/contact.js'] = strToU8(ytd('contact', [{ contact: { emails: ['a@b'] } }]));
    files['data/tweets_media/1.jpg'] = strToU8('jpg');
    const blob = new Blob([zipSync(files) as BlobPart]);
    const archive = await readTwitterArchive([{ path: 'twitter.zip', blob }]);
    expect(archive.hasContacts).toBe(true);
    expect(archive.files.total).toBe(9);
    expect(archive.files.opened).toEqual([
      'follower.js',
      'following.js',
      'like.js',
      'manifest.js',
      'profile.js',
      'saved-search.js',
      'tweets.js',
    ]);
    expect(archive.tweets).toHaveLength(3);
  });

  it('accepts loose data files from an unzipped folder', async () => {
    const archive = await readTwitterArchive(
      sources.map((source) => ({ path: `archive/${source.name}`, blob: new Blob([source.text]) })),
    );
    expect(archive.owner.userName).toBe('owner');
  });

  it('says so when nothing picked is a Twitter archive', async () => {
    await expect(
      readTwitterArchive([{ path: 'notes.txt', blob: new Blob(['hello']) }]),
    ).rejects.toBeInstanceOf(ArchiveReadError);
  });
});
