import { describe, expect, it } from 'vitest';
import { TargetAvailability } from '../compose/post-targets';
import { intentIdsFor, postTargetsFor } from './share-targets';

/** Nothing connected, signed in. */
const NOTHING: TargetAvailability = {
  anonymous: false,
  bskyLinked: false,
  mataroaConnected: false,
  bloggerReady: false,
  hugoConnected: false,
  pastebinEnabled: false,
  mataroaEnabled: false,
  bloggerEnabled: false,
  hugoEnabled: false,
};

const INTENTS = ['reddit', 'bluesky', 'tumblr', 'linkedin', 'hacker-news'];

describe('postTargetsFor', () => {
  it('offers Mastodon to a signed-in user with nothing else linked', () => {
    expect(postTargetsFor(NOTHING)).toEqual(['fedi']);
  });

  it('offers nothing to post to when anonymous and nothing is enabled', () => {
    // Anonymous has no Mastodon token, so there is no in-app post to make.
    expect(postTargetsFor({ ...NOTHING, anonymous: true })).toEqual([]);
  });

  it('adds a target once its connector is ready', () => {
    expect(postTargetsFor({ ...NOTHING, bskyLinked: true })).toContain('bsky');
  });

  it('requires both the connection and the flag for a blog', () => {
    // Connected but flagged off is not usable, and neither is the reverse.
    expect(postTargetsFor({ ...NOTHING, mataroaConnected: true })).not.toContain('blog');
    expect(postTargetsFor({ ...NOTHING, mataroaEnabled: true })).not.toContain('blog');
    expect(postTargetsFor({ ...NOTHING, mataroaConnected: true, mataroaEnabled: true })).toContain(
      'blog',
    );
  });

  it('never offers the combined Mastodon-and-Bluesky target', () => {
    // One press must reach one destination. The composer still offers `both`
    // once open, where the user chooses it with the post in front of them.
    const everything = postTargetsFor({
      ...NOTHING,
      bskyLinked: true,
      pastebinEnabled: true,
    });
    expect(everything).not.toContain('both');
  });

  it('lets an anonymous visitor post a paste', () => {
    // Pastes need no account, which is the whole reason they are the anonymous
    // fallback in the composer too.
    expect(postTargetsFor({ ...NOTHING, anonymous: true, pastebinEnabled: true })).toEqual([
      'paste',
    ]);
  });
});

describe('intentIdsFor', () => {
  it('keeps every intent when no connector covers one', () => {
    expect(intentIdsFor(INTENTS, NOTHING)).toEqual(INTENTS);
  });

  it('drops the Bluesky intent once Bluesky is linked', () => {
    // Otherwise Bluesky appears in both sections and the user has to know what
    // the difference is.
    const kept = intentIdsFor(INTENTS, { ...NOTHING, bskyLinked: true });
    expect(kept).not.toContain('bluesky');
    expect(kept).toContain('reddit');
  });

  it('keeps the Bluesky intent for an anonymous visitor', () => {
    // `bskyLinked` can be true while anonymous, but posting still needs the
    // link to be usable — the intent is what actually works here.
    expect(intentIdsFor(INTENTS, { ...NOTHING, anonymous: true })).toContain('bluesky');
  });

  it('never drops an intent that has no connector at all', () => {
    const everything = intentIdsFor(INTENTS, {
      ...NOTHING,
      bskyLinked: true,
      mataroaConnected: true,
      mataroaEnabled: true,
      pastebinEnabled: true,
    });
    // Reddit, Tumblr, LinkedIn and HN are intents forever — nothing can connect
    // to them, so nothing can promote them.
    expect(everything).toEqual(['reddit', 'tumblr', 'linkedin', 'hacker-news']);
  });

  it('preserves the given order', () => {
    expect(intentIdsFor(['linkedin', 'reddit'], NOTHING)).toEqual(['linkedin', 'reddit']);
  });
});

describe('the two sections together', () => {
  it('never lists the same service twice', () => {
    const state: TargetAvailability = { ...NOTHING, bskyLinked: true, pastebinEnabled: true };
    const posts = postTargetsFor(state);
    const intents = intentIdsFor(INTENTS, state);

    expect(posts).toContain('bsky');
    expect(intents).not.toContain('bluesky');
  });

  it('always offers a way to share something', () => {
    // Even with nothing connected at all, the intents remain — a share dialog
    // that can offer nothing would be worse than no dialog.
    const state = { ...NOTHING, anonymous: true };
    expect(postTargetsFor(state).length + intentIdsFor(INTENTS, state).length).toBeGreaterThan(0);
  });
});
