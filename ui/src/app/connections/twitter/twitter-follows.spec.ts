import { beforeEach, describe, expect, it } from 'vitest';
import {
  TwitterFollows,
  TWITTER_FOLLOW_COMFORTABLE,
  TWITTER_FOLLOW_LIMIT,
} from './twitter-follows';

describe('TwitterFollows', () => {
  let follows: TwitterFollows;

  beforeEach(() => {
    localStorage.clear();
    follows = new TwitterFollows();
  });

  const add = (username: string) => follows.add({ username, displayName: username.toUpperCase() });

  it('follows an account and persists it', () => {
    expect(add('NASA')).toBeNull();
    expect(follows.has('NASA')).toBe(true);
    expect(new TwitterFollows().has('NASA')).toBe(true);
  });

  it('treats handles case-insensitively, as X does', () => {
    add('NASA');
    // @NASA and @nasa are the same account; allowing both would fetch one
    // person's timeline twice and bill for it twice.
    expect(follows.has('nasa')).toBe(true);
    expect(add('nasa')).toMatch(/already follow/i);
    expect(follows.follows()).toHaveLength(1);
  });

  it('caps the list and says how to make room', () => {
    for (let i = 0; i < TWITTER_FOLLOW_LIMIT; i++) {
      expect(add(`user${i}`)).toBeNull();
    }
    const error = add('one-too-many');
    expect(error).toMatch(new RegExp(`${TWITTER_FOLLOW_LIMIT}`));
    expect(error).toMatch(/unfollow/i);
    expect(follows.follows()).toHaveLength(TWITTER_FOLLOW_LIMIT);
  });

  it('caps at the provider followings page size, so a bulk import maps cleanly', () => {
    // 200 is `user/followings`' page size. The cap was 10 when nothing else
    // limited spend; TwitterUsage's daily limit does that job now, so the cap
    // exists to bound the follow *list*, not the bill.
    expect(TWITTER_FOLLOW_LIMIT).toBe(200);
    expect(TWITTER_FOLLOW_COMFORTABLE).toBeLessThan(TWITTER_FOLLOW_LIMIT);
  });

  it('unfollows regardless of the case typed', () => {
    add('NASA');
    follows.remove('nasa');
    expect(follows.follows()).toHaveLength(0);
  });

  it('disables an account without forgetting it', () => {
    add('NASA');
    follows.setEnabled('NASA', false);
    expect(follows.has('NASA')).toBe(true);
    expect(follows.enabled()).toHaveLength(0);
  });

  it('resolves a namespaced account id back to a follow', () => {
    add('NASA');
    expect(follows.findByAccountId('twitter:@NASA')?.username).toBe('NASA');
    expect(follows.findByAccountId('twitter:@nasa')?.username).toBe('NASA');
    expect(follows.findByAccountId('rss:https://example.com')).toBeNull();
  });

  describe('recordProfile', () => {
    it('banks the stable numeric id from a fetch that was happening anyway', () => {
      // The id survives a rename where the handle does not, and lets later
      // fetches use the faster by-id endpoint.
      add('NASA');
      follows.recordProfile('NASA', { userId: '11348282' });
      expect(follows.find('NASA')?.userId).toBe('11348282');
    });

    it('does not write when nothing changed', () => {
      // Runs on every feed load; re-serializing the list each time would be a
      // pointless localStorage write per refresh.
      add('NASA');
      follows.recordProfile('NASA', { displayName: 'NASA', userId: '1' });
      const before = localStorage.getItem('mockingbird_twitter_follows');
      follows.recordProfile('NASA', { displayName: 'NASA', userId: '1' });
      expect(localStorage.getItem('mockingbird_twitter_follows')).toBe(before);
    });

    it('ignores an account that is not followed', () => {
      expect(() => follows.recordProfile('stranger', { userId: '9' })).not.toThrow();
      expect(follows.follows()).toHaveLength(0);
    });

    it('keeps the existing name when the update has none', () => {
      add('NASA');
      follows.recordProfile('NASA', { displayName: '' });
      expect(follows.find('NASA')?.displayName).toBe('NASA');
    });
  });

  describe('storage robustness', () => {
    it('survives a corrupt blob', () => {
      localStorage.setItem('mockingbird_twitter_follows', 'not json');
      expect(new TwitterFollows().follows()).toEqual([]);
    });

    it('drops entries that are not follows', () => {
      localStorage.setItem(
        'mockingbird_twitter_follows',
        JSON.stringify([{ username: 'ok', displayName: 'OK' }, { nope: true }, null]),
      );
      expect(new TwitterFollows().follows()).toHaveLength(1);
    });

    it('truncates a list longer than the cap', () => {
      const many = Array.from({ length: TWITTER_FOLLOW_LIMIT + 20 }, (_, i) => ({
        username: `u${i}`,
        displayName: `U${i}`,
        addedAt: 1,
        enabled: true,
      }));
      localStorage.setItem('mockingbird_twitter_follows', JSON.stringify(many));
      expect(new TwitterFollows().follows()).toHaveLength(TWITTER_FOLLOW_LIMIT);
    });
  });
});
