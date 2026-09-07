import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ConversationStore,
  MAX_CONVERSATIONS_PER_PEER,
  MAX_MESSAGES_PER_CONVERSATION,
  titleFrom,
} from './conversation-store';

describe('titleFrom', () => {
  it('names a conversation after the first thing said', () => {
    expect(titleFrom('how does the borrow checker work')).toBe('how does the borrow checker work');
  });

  it('truncates something too long to be a label', () => {
    const title = titleFrom('x'.repeat(200));
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith('…')).toBe(true);
  });

  it('falls back rather than showing an empty dropdown entry', () => {
    expect(titleFrom('   ')).toBe('New conversation');
  });
});

describe('ConversationStore', () => {
  let store: ConversationStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    store = TestBed.inject(ConversationStore);
  });

  it('keeps conversations separate per correspondent', () => {
    const a = store.startNew('openrouter');
    const b = store.startNew('someone-else');

    expect(store.forPeer('openrouter').map((c) => c.id)).toEqual([a.id]);
    expect(store.forPeer('someone-else').map((c) => c.id)).toEqual([b.id]);
  });

  it('titles a conversation from the first message the user sends', () => {
    const conversation = store.startNew('openrouter');

    store.append(conversation.id, { from: 'me', text: 'what is a monad' });
    store.append(conversation.id, { from: 'them', text: 'a long answer' });

    expect(store.get(conversation.id)?.title).toBe('what is a monad');
  });

  it('does not let the reply rename the conversation', () => {
    const conversation = store.startNew('openrouter');

    store.append(conversation.id, { from: 'them', text: 'unprompted' });

    expect(store.get(conversation.id)?.title).toBe('New conversation');
  });

  it('archives a model conversation when a new one starts', () => {
    const first = store.startNew('openrouter');
    store.append(first.id, { from: 'me', text: 'keep me' });

    const second = store.startNew('openrouter');

    expect(
      store
        .forPeer('openrouter')
        .map((c) => c.id)
        .sort(),
    ).toEqual([first.id, second.id].sort());
  });

  it('discards Eliza’s previous conversation instead of archiving it', () => {
    // An ELIZA transcript has nothing to come back to — she is a pattern
    // matcher with no memory between turns — so keeping twenty of them would
    // spend the storage budget on the one correspondent whose history is
    // worthless.
    const first = store.startNew('eliza');
    store.append(first.id, { from: 'me', text: 'hello' });

    const second = store.startNew('eliza');

    expect(store.forPeer('eliza').map((c) => c.id)).toEqual([second.id]);
    expect(store.get(first.id)).toBeUndefined();
  });

  it('evicts the oldest conversations past the per-peer cap', () => {
    for (let i = 0; i < MAX_CONVERSATIONS_PER_PEER + 5; i += 1) {
      const conversation = store.startNew('openrouter');
      store.append(conversation.id, { from: 'me', text: `message ${i}` });
    }

    expect(store.forPeer('openrouter')).toHaveLength(MAX_CONVERSATIONS_PER_PEER);
  });

  it('evicts per peer, so one busy chat cannot push out another', () => {
    const other = store.startNew('eliza');
    store.append(other.id, { from: 'me', text: 'still here' });
    for (let i = 0; i < MAX_CONVERSATIONS_PER_PEER + 5; i += 1) {
      store.startNew('openrouter');
    }

    expect(store.forPeer('eliza')).toHaveLength(1);
  });

  it('trims a conversation that outgrows the message cap', () => {
    const conversation = store.startNew('openrouter');
    for (let i = 0; i < MAX_MESSAGES_PER_CONVERSATION + 10; i += 1) {
      store.append(conversation.id, { from: 'me', text: `line ${i}` });
    }

    const messages = store.get(conversation.id)!.messages;
    expect(messages).toHaveLength(MAX_MESSAGES_PER_CONVERSATION);
    // The newest survive; the oldest are what go.
    expect(messages.at(-1)!.text).toBe(`line ${MAX_MESSAGES_PER_CONVERSATION + 9}`);
  });

  it('rewrites a streaming message in place, so a chunk is never a new bubble', () => {
    const conversation = store.startNew('openrouter');
    const id = store.append(conversation.id, { from: 'them', text: '', incomplete: true });

    store.updateMessage(conversation.id, id, 'partial', true);
    store.updateMessage(conversation.id, id, 'partial answer', true);

    const messages = store.get(conversation.id)!.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('partial answer');
    expect(messages[0].incomplete).toBe(true);
  });

  it('clears the incomplete flag when the stream finishes', () => {
    const conversation = store.startNew('openrouter');
    const id = store.append(conversation.id, { from: 'them', text: '', incomplete: true });

    store.updateMessage(conversation.id, id, 'the whole answer', false);

    expect(store.get(conversation.id)!.messages[0].incomplete).toBeUndefined();
  });

  it('survives a reload, which is the point of persisting each chunk', () => {
    const conversation = store.startNew('openrouter');
    const id = store.append(conversation.id, { from: 'them', text: '', incomplete: true });
    store.updateMessage(conversation.id, id, 'half an answer', true);

    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(ConversationStore);

    const messages = reloaded.get(conversation.id)!.messages;
    expect(messages[0].text).toBe('half an answer');
    expect(messages[0].incomplete).toBe(true);
  });

  it('opens the most recent conversation, or makes one when there is none', () => {
    const created = store.currentFor('openrouter');
    expect(store.forPeer('openrouter')).toHaveLength(1);

    expect(store.currentFor('openrouter').id).toBe(created.id);
  });

  it('drops every conversation with one peer on request', () => {
    store.startNew('eliza');
    store.startNew('openrouter');

    store.clearPeer('eliza');

    expect(store.forPeer('eliza')).toEqual([]);
    expect(store.forPeer('openrouter')).toHaveLength(1);
  });

  it('starts clean when storage holds nonsense', () => {
    localStorage.setItem('mockingbird_conversations', '{not json');
    TestBed.resetTestingModule();

    expect(TestBed.inject(ConversationStore).all()).toEqual([]);
  });
});
