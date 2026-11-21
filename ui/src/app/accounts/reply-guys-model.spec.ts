import { describe, expect, it } from 'vitest';
import { Status } from '../platform/api/models';
import {
  collapsibleReplyGuys,
  hasHashtags,
  isIncomingConversation,
  isMyQuietConversation,
  threadReplyGuyMode,
} from './reply-guys-model';

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

  it('sees hashtags in status tags or in rendered hashtag links', () => {
    expect(hasHashtags({ tags: [{ name: 'pizza', url: '' }], content: '' })).toBe(true);
    expect(
      hasHashtags({ content: '<a href="https://bsky.app/hashtag/pizza">#pizza</a>' } as Status),
    ).toBe(true);
    expect(
      hasHashtags({ content: '<a class="mention hashtag" rel="tag" href="x">#p</a>' } as Status),
    ).toBe(true);
    expect(hasHashtags({ tags: [], content: '<p>peach on pizza</p>' })).toBe(false);
  });

  it('a quiet conversation is one I started, without a hashtag', () => {
    const isMine = (s: Status) => s.account.id === 'me';
    const root = { ...post('root', 'me'), content: '<p>peach on pizza</p>' } as Status;
    expect(isMyQuietConversation(root, isMine)).toBe(true);
    // Somebody else's thread I jumped into: the mosh pit.
    expect(isMyQuietConversation({ ...root, account: { id: 'alice' } } as Status, isMine)).toBe(
      false,
    );
    // My own post, but I tagged it: bring it on.
    expect(
      isMyQuietConversation({ ...root, tags: [{ name: 'pizza', url: '' }] } as Status, isMine),
    ).toBe(false);
    // The thread didn't load to its root: no answer, nothing guarded.
    expect(isMyQuietConversation(post('r', 'me', 'parent'), isMine)).toBe(false);
    expect(isMyQuietConversation(null, isMine)).toBe(false);
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

  describe('folding a pile-on', () => {
    const strangers = new Set(['g1', 'g2', 'g3', 'g4']);
    const guarded = () => true;
    const stranger = (s: Status) => strangers.has(s.account.id);
    const ids = (set: Set<string>) => [...set].sort();

    it('folds three or more stranger replies, and nothing below that', () => {
      const three = [post('a', 'g1', 'mine'), post('b', 'g2', 'mine'), post('c', 'g3', 'mine')];
      expect(ids(collapsibleReplyGuys(three, guarded, stranger))).toEqual(['a', 'b', 'c']);
      expect(collapsibleReplyGuys(three.slice(0, 2), guarded, stranger).size).toBe(0);
    });

    it('folds a stranger branch whole, but never one the reader or a friend is in', () => {
      const statuses = [
        post('a', 'g1', 'mine'),
        post('a1', 'g2', 'a'),
        post('b', 'g3', 'mine'),
        post('b1', 'me', 'b'),
        post('c', 'g4', 'mine'),
      ];
      expect(ids(collapsibleReplyGuys(statuses, guarded, stranger))).toEqual(['a', 'a1', 'c']);
    });

    it('leaves unguarded replies alone, wherever they are', () => {
      const statuses = [post('a', 'g1', 'x'), post('b', 'g2', 'x'), post('c', 'g3', 'x')];
      expect(collapsibleReplyGuys(statuses, () => false, stranger).size).toBe(0);
    });
  });
});
