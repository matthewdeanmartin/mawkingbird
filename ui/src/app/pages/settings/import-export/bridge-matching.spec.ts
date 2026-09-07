import { describe, expect, it } from 'vitest';
import { Account } from '../../../models';
import {
  blueskyHandleInText,
  compareMatches,
  handleInText,
  mastodonHandleInText,
  rankBridgeCandidate,
  searchableProfileText,
  verifiedLinkTo,
} from './bridge-matching';

function account(username: string, changes: Partial<Account> = {}): Account {
  return {
    id: username,
    username,
    acct: `${username}@social.example`,
    display_name: username,
    note: '',
    url: `https://social.example/@${username}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...changes,
  };
}

describe('blueskyHandleInText', () => {
  it('reads a handle from a bsky.app profile link', () => {
    expect(blueskyHandleInText('also at https://bsky.app/profile/alex.bsky.social')).toEqual({
      handle: 'alex.bsky.social',
      evidence: 'Bluesky profile linked in bio',
    });
  });

  it('reads a bare *.bsky.social handle', () => {
    expect(blueskyHandleInText('find me @alex.bsky.social these days')?.handle).toBe(
      'alex.bsky.social',
    );
  });

  it('reads the handle out of escaped HTML from a Mastodon note', () => {
    const note = '<p>bsky: <a href="https://bsky.app/profile/alex.bsky.social">alex</a></p>';
    expect(blueskyHandleInText(note)?.handle).toBe('alex.bsky.social');
  });

  it('ignores a bare custom domain, which is almost always a website', () => {
    // hboon.com is a real Bluesky handle *and* a real homepage; in free text the
    // two are indistinguishable, and guessing costs a lookup per bio. Pass 2
    // finds these people instead.
    expect(blueskyHandleInText('my site is https://hboon.com')).toBeNull();
  });

  it('returns null when there is no handle at all', () => {
    expect(blueskyHandleInText('just a normal bio about cats')).toBeNull();
  });
});

describe('mastodonHandleInText', () => {
  it('reads an @user@host address', () => {
    expect(mastodonHandleInText('over at @alex@fosstodon.org now')).toEqual({
      handle: 'alex@fosstodon.org',
      evidence: 'Mastodon address written in bio',
    });
  });

  it('reads a profile URL', () => {
    expect(mastodonHandleInText('https://fosstodon.org/@alex')?.handle).toBe('alex@fosstodon.org');
  });

  it('does not mistake a Bluesky handle for a fediverse address', () => {
    // '@someone@bsky.social' parses as a fediverse handle by shape alone, and
    // honouring it would send a Mastodon lookup after a Bluesky account.
    expect(mastodonHandleInText('@someone@bsky.social')).toBeNull();
  });

  it('returns null for a plain email-looking string with no leading @', () => {
    expect(mastodonHandleInText('mail me at alex@example.com')).toBeNull();
  });
});

describe('handleInText', () => {
  it('dispatches on the target network', () => {
    const bio = 'mastodon @alex@fosstodon.org and bluesky @alex.bsky.social';
    expect(handleInText(bio, 'bluesky')?.handle).toBe('alex.bsky.social');
    expect(handleInText(bio, 'mastodon')?.handle).toBe('alex@fosstodon.org');
  });
});

describe('searchableProfileText', () => {
  it('includes profile fields, not just the note', () => {
    const person = account('alex', {
      note: 'hello',
      fields: [{ name: 'Bluesky', value: 'https://bsky.app/profile/alex.bsky.social' }],
    });
    expect(handleInText(searchableProfileText(person), 'bluesky')?.handle).toBe('alex.bsky.social');
  });
});

describe('verifiedLinkTo', () => {
  it('is true only when the server verified the field', () => {
    const verified = account('alex', {
      fields: [
        {
          name: 'Bluesky',
          value: 'https://bsky.app/profile/alex.bsky.social',
          verified_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const unverified = account('alex', {
      fields: [{ name: 'Bluesky', value: 'https://bsky.app/profile/alex.bsky.social' }],
    });
    expect(verifiedLinkTo(verified, 'alex.bsky.social')).toBe(true);
    expect(verifiedLinkTo(unverified, 'alex.bsky.social')).toBe(false);
  });
});

describe('rankBridgeCandidate', () => {
  it('calls a shared handle strong on its own', () => {
    const person = account('alex', { display_name: 'Alex Doe' });
    const candidate = account('alex', { acct: 'alex.bsky.social', display_name: 'Someone Else' });
    const match = rankBridgeCandidate(person, candidate);
    expect(match.confidence).toBe('strong');
    expect(match.signals).toContain('Handle is the same on both networks');
  });

  it('calls a display name alone weak', () => {
    // The world has many people called Alex Doe; a name is not evidence by itself.
    const person = account('alex', { display_name: 'Alex Doe' });
    const candidate = account('adoe', { acct: 'adoe.bsky.social', display_name: 'Alex Doe' });
    const match = rankBridgeCandidate(person, candidate);
    expect(match.confidence).toBe('weak');
    expect(match.signals).toEqual(['Display name is identical']);
  });

  it('promotes a name match to strong once something corroborates it', () => {
    const person = account('alex', { display_name: 'Alex Doe' });
    const candidate = account('adoe', {
      acct: 'adoe.bsky.social',
      display_name: 'Alex Doe',
      note: 'also @alex on the fediverse',
    });
    const match = rankBridgeCandidate(person, candidate);
    expect(match.confidence).toBe('strong');
    expect(match.signals).toHaveLength(2);
  });

  it('folds accents when comparing names', () => {
    const person = account('jose', { display_name: 'José Ruiz' });
    const candidate = account('jr', { acct: 'jr.bsky.social', display_name: 'Jose Ruiz' });
    expect(rankBridgeCandidate(person, candidate).signals).toContain('Display name is identical');
  });

  it('treats a shared homepage as corroboration but ignores generic hosts', () => {
    const person = account('alex', {
      display_name: 'Alex Doe',
      note: 'https://alex.example and https://github.com/alex',
    });
    const shared = account('a', {
      acct: 'a.bsky.social',
      display_name: 'Alex Doe',
      note: 'https://alex.example',
    });
    const genericOnly = account('b', {
      acct: 'b.bsky.social',
      display_name: 'Alex Doe',
      note: 'https://github.com/someone-else',
    });
    expect(rankBridgeCandidate(person, shared).signals).toContain(
      'Both profiles link to alex.example',
    );
    expect(rankBridgeCandidate(person, genericOnly).signals).toEqual(['Display name is identical']);
  });

  it('produces no signals for an unrelated account', () => {
    const person = account('alex', { display_name: 'Alex Doe' });
    const candidate = account('zoe', { acct: 'zoe.bsky.social', display_name: 'Zoe Smith' });
    expect(rankBridgeCandidate(person, candidate).signals).toEqual([]);
  });
});

describe('compareMatches', () => {
  it('sorts exact before strong before weak', () => {
    const mk = (confidence: 'exact' | 'strong' | 'weak', acct: string) => ({
      account: account(acct, { acct }),
      signals: ['s'],
      confidence,
    });
    const sorted = [mk('weak', 'c'), mk('exact', 'a'), mk('strong', 'b')].sort(compareMatches);
    expect(sorted.map((match) => match.confidence)).toEqual(['exact', 'strong', 'weak']);
  });

  it('breaks ties on handle so the list does not reshuffle between runs', () => {
    const mk = (acct: string) => ({
      account: account(acct, { acct }),
      signals: ['s'],
      confidence: 'strong' as const,
    });
    expect([mk('zoe'), mk('alex')].sort(compareMatches).map((m) => m.account.acct)).toEqual([
      'alex',
      'zoe',
    ]);
  });
});
