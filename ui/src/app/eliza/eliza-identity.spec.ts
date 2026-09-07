import { describe, expect, it } from 'vitest';
import {
  ELIZA_ID,
  ELIZA_NS,
  elizaAccount,
  elizaPostStatus,
  elizaTimeline,
  isElizaId,
} from './eliza-identity';
import { ELIZA_POSTS } from './eliza-content';

describe('isElizaId', () => {
  it('recognises the account and post ids', () => {
    expect(isElizaId(ELIZA_ID)).toBe(true);
    expect(isElizaId('eliza:post:welcome')).toBe(true);
  });

  it('rejects real (numeric) ids and empties', () => {
    expect(isElizaId('109273618273')).toBe(false);
    expect(isElizaId('')).toBe(false);
    expect(isElizaId(null)).toBe(false);
    expect(isElizaId(undefined)).toBe(false);
  });

  it('uses a namespace that cannot collide with real Mastodon ids', () => {
    // Real ids are numeric strings; the prefix contains a colon, so no overlap.
    expect(ELIZA_NS).toContain(':');
    expect(/^\d+$/.test(ELIZA_ID)).toBe(false);
  });
});

describe('elizaAccount', () => {
  it('is a plausible bot account with her post count', () => {
    const account = elizaAccount();
    expect(account.id).toBe(ELIZA_ID);
    expect(account.username).toBe('eliza');
    // Fully-qualified on a non-instance domain so lists/mentions can't resolve
    // to a real eliza@mastodon.social.
    expect(account.acct).toBe('eliza@mockingbird.com');
    expect(account.acct.endsWith('@mastodon.social')).toBe(false);
    expect(account.bot).toBe(true);
    expect(account.statuses_count).toBe(ELIZA_POSTS.length);
    expect(account.note).toContain('<p>');
  });
});

describe('elizaPostStatus', () => {
  it('dates the post agoMinutes before now and wraps the body in HTML', () => {
    const now = Date.parse('2026-07-21T12:00:00.000Z');
    const account = elizaAccount();
    const post = ELIZA_POSTS[0];
    const status = elizaPostStatus(post, account, now);

    expect(status.id).toBe(`eliza:post:${post.id}`);
    expect(status.content).toContain('<p>');
    expect(status.provider).toBe('anonymous-mastodon');
    expect(Date.parse(status.created_at)).toBe(now - post.agoMinutes * 60_000);
  });
});

describe('elizaTimeline', () => {
  it('returns every post with pinned hoisted to the top', () => {
    const timeline = elizaTimeline(Date.parse('2026-07-21T12:00:00.000Z'));
    expect(timeline.length).toBe(ELIZA_POSTS.length);

    const firstUnpinned = timeline.findIndex((s) => !s.pinned);
    const lastPinned = timeline.map((s) => s.pinned).lastIndexOf(true);
    // All pinned posts come before any unpinned one.
    if (firstUnpinned !== -1) {
      expect(lastPinned).toBeLessThan(firstUnpinned);
    }
  });

  it('gives every post a unique id', () => {
    const ids = elizaTimeline().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
