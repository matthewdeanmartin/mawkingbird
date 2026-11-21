import { describe, expect, it } from 'vitest';
import { Status } from '../platform/api/models';
import { belowMine, isIncomingConversation, threadReplyGuyMode } from './reply-guys-model';

function post(id: string, author: string, inReplyTo: string | null = null): Status {
  return {
    id,
    in_reply_to_id: inReplyTo,
    account: { id: author },
  } as unknown as Status;
}

describe('reply-guys model', () => {
  it('treats replies, mentions and quotes as incoming conversation, not engagement', () => {
    expect(isIncomingConversation('mention')).toBe(true);
    expect(isIncomingConversation('reply')).toBe(true);
    expect(isIncomingConversation('quote')).toBe(true);
    expect(isIncomingConversation('favourite')).toBe(false);
    expect(isIncomingConversation('follow')).toBe(false);
    expect(isIncomingConversation(undefined)).toBe(false);
  });

  it('finds every reply below one of my posts, however deep', () => {
    const statuses = [
      post('root', 'alice'),
      post('mine', 'me', 'root'),
      post('a', 'guy', 'mine'),
      post('b', 'other', 'a'),
      post('c', 'other', 'root'),
    ];
    const below = belowMine(statuses, (s) => s.account.id === 'me');
    expect([...below].sort()).toEqual(['a', 'b']);
  });

  it('stops at an unknown parent and survives a cycle', () => {
    const statuses = [post('x', 'guy', 'missing'), post('p', 'a', 'q'), post('q', 'b', 'p')];
    expect(belowMine(statuses, () => false).size).toBe(0);
  });

  it('guards replies in my conversation and only chips the rest', () => {
    const reply = post('r', 'guy', 'root');
    expect(threadReplyGuyMode(reply, 'alice', true)).toBe('guard');
    expect(threadReplyGuyMode(reply, 'alice', false)).toBe('chip');
  });

  it('never marks the thread root or its author answering in their own thread', () => {
    expect(threadReplyGuyMode(post('root', 'alice'), 'alice', false)).toBe('off');
    expect(threadReplyGuyMode(post('r', 'alice', 'x'), 'alice', true)).toBe('off');
  });
});
