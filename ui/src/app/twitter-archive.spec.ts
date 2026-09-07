import { describe, expect, it } from 'vitest';
import {
  extractArchiveHashtags,
  extractTwitterArchive,
  TwitterArchiveSource,
  twitterArchiveCsv,
} from './twitter-archive';

function archiveFile(name: string, variable: string, rows: unknown[]): TwitterArchiveSource {
  return {
    name,
    text: `window.YTD.${variable}.part0 = ${JSON.stringify(rows)}`,
  };
}

describe('extractTwitterArchive', () => {
  it('joins numeric following IDs to handles found in reply and mention history', () => {
    const summary = extractTwitterArchive([
      archiveFile('data/following.js', 'following', [
        { following: { accountId: '1', userLink: 'https://twitter.com/intent/user?user_id=1' } },
        { following: { accountId: '2', userLink: 'https://twitter.com/intent/user?user_id=2' } },
      ]),
      archiveFile('data/tweets.js', 'tweets', [
        {
          tweet: {
            created_at: 'Wed Jul 22 01:25:10 +0000 2026',
            retweeted: false,
            in_reply_to_user_id_str: '1',
            in_reply_to_screen_name: 'NewName',
            entities: {
              user_mentions: [
                { id_str: '1', screen_name: 'NewName', name: 'New Display Name' },
                { id_str: '3', screen_name: 'OtherPerson' },
              ],
            },
          },
        },
        {
          tweet: {
            created_at: 'Wed Jul 21 01:25:10 +0000 2025',
            retweeted: false,
            in_reply_to_user_id_str: '1',
            in_reply_to_screen_name: 'OldName',
            entities: { user_mentions: [{ id_str: '1', screen_name: 'OldName' }] },
          },
        },
      ]),
    ]);

    expect(summary.currentFollowingCount).toBe(2);
    expect(summary.currentFollowingWithHandleCount).toBe(1);
    expect(summary.repliedPeopleCount).toBe(1);
    expect(summary.replyCount).toBe(2);
    expect(summary.mentionedPeopleCount).toBe(2);
    expect(summary.people).toHaveLength(3);
    expect(summary.people.find((person) => person.twitter_account_id === '1')).toMatchObject({
      twitter_handle: 'NewName',
      twitter_name: 'New Display Name',
      previous_handles: ['oldname'],
      currently_following: true,
      reply_count: 2,
      mention_count: 2,
      first_interaction_at: '2025-07-21T01:25:10.000Z',
      last_interaction_at: '2026-07-22T01:25:10.000Z',
    });
    expect(summary.people.find((person) => person.twitter_account_id === '2')).toMatchObject({
      twitter_handle: null,
      currently_following: true,
    });
  });

  it('includes deleted authored tweets but ignores mentions copied into retweets', () => {
    const summary = extractTwitterArchive([
      archiveFile('deleted-tweets.js', 'deleted_tweets', [
        {
          tweet: {
            created_at: 'Mon Apr 16 13:45:17 +0000 2018',
            retweeted: false,
            in_reply_to_screen_name: 'deletedReply',
            entities: { user_mentions: [] },
          },
        },
      ]),
      archiveFile('tweets.js', 'tweets', [
        {
          tweet: {
            created_at: 'Wed Jul 22 01:25:10 +0000 2026',
            retweeted: true,
            entities: { user_mentions: [{ id_str: '9', screen_name: 'notMyMention' }] },
          },
        },
      ]),
    ]);

    expect(summary.people).toHaveLength(1);
    expect(summary.people[0].twitter_handle).toBe('deletedReply');
    expect(summary.people[0].reply_count).toBe(1);
  });

  it('merges a handle-only reply into the same followed ID when a later mention supplies the ID', () => {
    const summary = extractTwitterArchive([
      archiveFile('following.js', 'following', [{ following: { accountId: '42' } }]),
      archiveFile('deleted-tweets.js', 'deleted_tweets', [
        {
          tweet: {
            created_at: 'Mon Apr 16 13:45:17 +0000 2018',
            retweeted: false,
            in_reply_to_screen_name: 'same_person',
            entities: { user_mentions: [] },
          },
        },
      ]),
      archiveFile('tweets.js', 'tweets', [
        {
          tweet: {
            created_at: 'Wed Jul 22 01:25:10 +0000 2026',
            retweeted: false,
            entities: { user_mentions: [{ id_str: '42', screen_name: 'same_person' }] },
          },
        },
      ]),
    ]);

    expect(summary.people).toHaveLength(1);
    expect(summary.people[0]).toMatchObject({
      twitter_account_id: '42',
      twitter_handle: 'same_person',
      currently_following: true,
      reply_count: 1,
      mention_count: 1,
    });
  });

  it('rejects unrelated and malformed files with a useful message', () => {
    expect(() => extractTwitterArchive([{ name: 'account.js', text: '[]' }])).toThrow(
      'No supported archive files',
    );
    expect(() => extractTwitterArchive([{ name: 'tweets.js', text: 'not an archive' }])).toThrow(
      'tweets.js is not a recognized',
    );
  });
});

describe('twitterArchiveCsv', () => {
  it('writes relationship evidence and safely quotes cells', () => {
    const csv = twitterArchiveCsv([
      {
        twitter_handle: 'alice',
        twitter_name: 'Alice Example',
        twitter_account_id: '1',
        previous_handles: ['alice_old'],
        currently_following: true,
        reply_count: 2,
        mention_count: 3,
        first_interaction_at: '2020-01-01T00:00:00.000Z',
        last_interaction_at: '2021-01-01T00:00:00.000Z',
        twitter_profile_url: 'https://twitter.com/intent/user?user_id=1',
      },
    ]);

    expect(csv).toContain(
      'alice,Alice Example,1,following|replied|mentioned,2,3,2020-01-01T00:00:00.000Z,2021-01-01T00:00:00.000Z',
    );
    expect(csv).toContain('alice_old,https://twitter.com/intent/user?user_id=1');
  });
});

describe('extractArchiveHashtags', () => {
  function tweet(hashtags: string[], retweeted = false) {
    return {
      tweet: {
        created_at: 'Wed Jul 22 01:25:10 +0000 2026',
        retweeted,
        entities: { hashtags: hashtags.map((text) => ({ text })) },
      },
    };
  }

  it('counts the owner’s own hashtags, most-used first', () => {
    const tags = extractArchiveHashtags([
      archiveFile('data/tweets.js', 'tweets', [
        tweet(['baking', 'Cats']),
        tweet(['cats']),
        tweet(['cats']),
      ]),
    ]);

    expect(tags.map((t) => [t.tag, t.count])).toEqual([
      ['cats', 3],
      ['baking', 1],
    ]);
    expect(tags[0].lastUsedAt).not.toBeNull();
  });

  it('skips retweets and tags Mastodon cannot represent', () => {
    const tags = extractArchiveHashtags([
      archiveFile('data/tweets.js', 'tweets', [
        tweet(['mine']),
        tweet(['notmine'], true),
        tweet(['2026']),
      ]),
    ]);

    expect(tags.map((t) => t.tag)).toEqual(['mine']);
  });

  it('rejects a selection with no tweets file', () => {
    expect(() =>
      extractArchiveHashtags([archiveFile('data/following.js', 'following', [])]),
    ).toThrow(/tweets\.js/);
  });
});
