import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientPrefs, isPostNoun, normalizeCustomTerminology } from './client-prefs';
import { Terminology } from './terminology';

describe('Terminology', () => {
  let words: Terminology['words'];
  let prefs: ClientPrefs;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    prefs = TestBed.inject(ClientPrefs);
    words = TestBed.inject(Terminology).words;
  });

  it('defaults to the fediverse vocabulary', () => {
    expect(words().Posts).toBe('Posts');
    expect(words().Boosts).toBe('Boosts');
  });

  it('swaps to tweets', () => {
    prefs.setPostNoun('tweet');
    expect(words().Posts).toBe('Tweets');
    expect(words().BoostedBy).toBe('Retweeted by');
  });

  it('swaps to florps, verb and all', () => {
    prefs.setPostNoun('florp');
    expect(words().post).toBe('florp');
    expect(words().Posts).toBe('Florps');
    expect(words().boost).toBe('reflorp');
    expect(words().Boosts).toBe('Reflorps');
    expect(words().BoostedBy).toBe('Reflorped by');
    expect(words().PostAll).toBe('Florp all');
  });

  it('ships Bluesky skeets and classic Mastodon toots as complete vocabularies', () => {
    prefs.setPostNoun('skeet');
    expect(words().Posts).toBe('Skeets');
    expect(words().BoostedBy).toBe('Reskeeted by');

    prefs.setPostNoun('toot');
    expect(words().Posts).toBe('Toots');
    expect(words().boosts).toBe('boosts');
    expect(words().PostAll).toBe('Toot all');
  });

  it('uses every custom grammatical form throughout the derived phrases', () => {
    prefs.setCustomTerminologyField('post', 'signal');
    prefs.setCustomTerminologyField('posts', 'signals');
    prefs.setCustomTerminologyField('poster', 'signaller');
    prefs.setCustomTerminologyField('posted', 'signalled');
    prefs.setCustomTerminologyField('boost', 'relay');
    prefs.setCustomTerminologyField('boosts', 'relays');
    prefs.setCustomTerminologyField('boosted', 'relayed');
    prefs.setPostNoun('custom');

    expect(words()).toMatchObject({
      post: 'signal',
      posts: 'signals',
      poster: 'signaller',
      posted: 'signalled',
      PostAll: 'Signal all',
      boosts: 'relays',
      UndoBoost: 'Undo relay',
      BoostedBy: 'Relayed by',
    });
  });

  it('keeps Unicode custom words while stripping controls and filling missing forms', () => {
    expect(
      normalizeCustomTerminology({ post: '  🐦  mot  ', posts: '', boost: 'écho\u0000' }),
    ).toMatchObject({ post: '🐦 mot', posts: 'chirps', boost: 'écho' });
  });

  it('rejects a noun it does not ship, leaving the current one alone', () => {
    prefs.setPostNoun('florp');
    prefs.setPostNoun('honk' as never);
    // Not 'post': the setter refuses the unknown value rather than resetting.
    expect(words().Posts).toBe('Florps');
  });

  it('recognises exactly the shipped nouns', () => {
    expect(isPostNoun('post')).toBe(true);
    expect(isPostNoun('tweet')).toBe(true);
    expect(isPostNoun('florp')).toBe(true);
    expect(isPostNoun('skeet')).toBe(true);
    expect(isPostNoun('toot')).toBe(true);
    expect(isPostNoun('custom')).toBe(true);
    // A value from a future build, or junk in localStorage, must not throw —
    // it falls back to posts, which is what an unrecognised setting means.
    expect(isPostNoun('honk')).toBe(false);
    expect(isPostNoun(undefined)).toBe(false);
  });
});
