import { describe, expect, it } from 'vitest';
import { inTab, lightsInboxDot, parseInboxTab } from './inbox-scenarios';

describe('inbox views', () => {
  it.each([
    ['mention', 'conversations'],
    ['reply', 'conversations'],
    ['quote', 'conversations'],
    ['poll', 'conversations'],
    ['pollEnded', 'conversations'],
    ['moderation_warning', 'conversations'],
    ['favourite', 'stats'],
    ['reblog', 'stats'],
    ['like', 'stats'],
    ['repost', 'stats'],
    ['reaction', 'stats'],
    ['renote', 'stats'],
    ['follow', 'who'],
  ] as const)('puts %s in %s, and everything in Stream', (type, tab) => {
    expect(inTab(tab, type)).toBe(true);
    expect(inTab('stream', type)).toBe(true);
    for (const other of ['conversations', 'stats', 'who'] as const) {
      if (other !== tab) expect(inTab(other, type)).toBe(false);
    }
  });

  it('shows a follow request in Who and in Conversations, since it needs an answer', () => {
    for (const type of ['follow_request', 'receiveFollowRequest']) {
      expect(inTab('who', type)).toBe(true);
      expect(inTab('conversations', type)).toBe(true);
      expect(inTab('stats', type)).toBe(false);
    }
  });

  it('leaves subscribed-post alerts to Stream', () => {
    expect(inTab('conversations', 'status')).toBe(false);
    expect(inTab('stream', 'status')).toBe(true);
  });

  it('lets only Conversations and Who light the Inbox dot', () => {
    for (const type of ['mention', 'reply', 'follow', 'follow_request']) {
      expect(lightsInboxDot(type)).toBe(true);
    }
    for (const type of ['favourite', 'reblog', 'like', 'repost', 'reaction', 'status', '', null]) {
      expect(lightsInboxDot(type)).toBe(false);
    }
  });

  it('opens on Conversations unless a known view is asked for', () => {
    expect(parseInboxTab(null)).toBe('conversations');
    expect(parseInboxTab('nonsense')).toBe('conversations');
    expect(parseInboxTab('stats')).toBe('stats');
  });
});
