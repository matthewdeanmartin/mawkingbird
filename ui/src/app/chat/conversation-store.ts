import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../account-scope';

const BASE_KEY = 'mockingbird_conversations';
const STATE_VERSION = 1;

/**
 * How many conversations are kept per correspondent before the oldest is
 * dropped, and how many messages one conversation holds.
 *
 * These exist because localStorage is a hard ~5MB shared with every other
 * preference in the app, and an LLM transcript is the only thing here that
 * grows without a natural end. Overrunning it does not fail politely — it
 * throws on write, and the next preference to be saved is the one that breaks.
 * So the cap is deliberately well short of the ceiling.
 */
export const MAX_CONVERSATIONS_PER_PEER = 20;
export const MAX_MESSAGES_PER_CONVERSATION = 100;

/** Who wrote one line. `them` covers Eliza, a model, or a real correspondent. */
export type MessageAuthor = 'me' | 'them';

export interface ConversationMessage {
  id: string;
  from: MessageAuthor;
  text: string;
  createdAt: string;
  /**
   * The reply was still streaming when it was last written down.
   *
   * Set while chunks are arriving and cleared when the stream ends. It survives
   * a closed tab on purpose: a partial answer the user paid for is worth more
   * than a clean-looking empty slot, and marking it is how the UI can say so
   * rather than presenting a truncated thought as a finished one.
   */
  incomplete?: boolean;
}

export interface Conversation {
  id: string;
  /** Correspondent key: 'eliza', 'openrouter', or an account id. */
  peer: string;
  /**
   * Shown in the dropdown. Taken from the opening message rather than asked
   * for — nobody titles a chat before having it, and "Recent: how do I…" is a
   * better handle than "Conversation 3".
   */
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

interface StoreState {
  version: typeof STATE_VERSION;
  conversations: Conversation[];
}

function storageKey(): string {
  return scopedKey(BASE_KEY);
}

function loadState(): StoreState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey()) ?? 'null',
    ) as Partial<StoreState> | null;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.conversations)) {
      return { version: STATE_VERSION, conversations: [] };
    }
    return {
      version: STATE_VERSION,
      conversations: parsed.conversations.filter(
        (c): c is Conversation =>
          typeof c?.id === 'string' && typeof c.peer === 'string' && Array.isArray(c.messages),
      ),
    };
  } catch {
    return { version: STATE_VERSION, conversations: [] };
  }
}

let counter = 0;
function freshId(prefix: string): string {
  counter += 1;
  return `${prefix}:${Date.now()}-${counter}`;
}

/** A dropdown label from the first thing said, since nothing else names it. */
export function titleFrom(text: string): string {
  const line = text.trim().replace(/\s+/g, ' ');
  if (!line) {
    return 'New conversation';
  }
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
}

/**
 * Conversations with every correspondent that has them, browser-local.
 *
 * One store rather than one per provider: the chat page needs "which
 * conversations does this peer have" answered the same way whether the peer is
 * a language model, Eliza, or a person, and three stores with the same shape
 * would drift.
 *
 * **Eliza is the deliberate exception to persistence.** Her conversations are
 * kept while they are happening, but "new conversation" *clears* rather than
 * archives — an ELIZA transcript has no value to come back to, being a
 * pattern-matcher with no memory between turns, and keeping twenty of them
 * would spend the storage budget on the one correspondent whose history is
 * worthless. See {@link startNew}.
 */
@Injectable({ providedIn: 'root' })
export class ConversationStore {
  private readonly state = signal<StoreState>(loadState());

  /** Peers whose history is discarded on "new conversation" rather than kept. */
  private static readonly EPHEMERAL_PEERS = new Set(['eliza']);

  /** Re-read from storage after an account switch changes the scope. */
  refresh(): void {
    this.state.set(loadState());
  }

  /** Every conversation with one peer, most recently active first. */
  forPeer(peer: string): Conversation[] {
    return this.state()
      .conversations.filter((c) => c.peer === peer)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  /** Every conversation across every peer, most recently active first. */
  readonly all = computed(() =>
    [...this.state().conversations].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    ),
  );

  get(id: string): Conversation | undefined {
    return this.state().conversations.find((c) => c.id === id);
  }

  /**
   * The conversation to show when a peer's chat is opened: their most recent,
   * or a fresh one when there is none.
   */
  currentFor(peer: string): Conversation {
    return this.forPeer(peer)[0] ?? this.create(peer);
  }

  /**
   * Begin a new conversation with this peer.
   *
   * For an ephemeral peer this *replaces* their history rather than adding to
   * it — see the class note. For everyone else the previous conversation stays
   * in the dropdown.
   */
  startNew(peer: string): Conversation {
    if (ConversationStore.EPHEMERAL_PEERS.has(peer)) {
      this.persist(this.state().conversations.filter((c) => c.peer !== peer));
    }
    return this.create(peer);
  }

  private create(peer: string): Conversation {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: freshId('conv'),
      peer,
      title: 'New conversation',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.persist([...this.state().conversations, conversation]);
    return conversation;
  }

  /** Append a message, titling the conversation from the first thing said. */
  append(conversationId: string, message: Omit<ConversationMessage, 'id' | 'createdAt'>): string {
    const id = freshId('msg');
    this.update(conversationId, (conversation) => {
      const messages = [...conversation.messages, { ...message, id, createdAt: nowIso() }];
      return {
        ...conversation,
        messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
        title:
          conversation.messages.length === 0 && message.from === 'me'
            ? titleFrom(message.text)
            : conversation.title,
      };
    });
    return id;
  }

  /**
   * Replace a streaming message's text with everything received so far.
   *
   * Called on each chunk, so the transcript on disk is never more than one
   * chunk behind what the model has actually sent. That is the whole mechanism
   * behind surviving a closed tab.
   */
  updateMessage(
    conversationId: string,
    messageId: string,
    text: string,
    incomplete: boolean,
  ): void {
    this.update(conversationId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((m) =>
        m.id === messageId ? { ...m, text, incomplete: incomplete || undefined } : m,
      ),
    }));
  }

  remove(conversationId: string): void {
    this.persist(this.state().conversations.filter((c) => c.id !== conversationId));
  }

  /** Drop every conversation with one peer. Used when a connector is removed. */
  clearPeer(peer: string): void {
    this.persist(this.state().conversations.filter((c) => c.peer !== peer));
  }

  private update(id: string, change: (conversation: Conversation) => Conversation): void {
    this.persist(
      this.state().conversations.map((c) =>
        c.id === id ? { ...change(c), updatedAt: nowIso() } : c,
      ),
    );
  }

  /**
   * Write through, evicting the oldest conversations per peer over the cap.
   *
   * Eviction is per peer rather than global so a busy chat with one
   * correspondent cannot push out every conversation with another.
   */
  private persist(conversations: Conversation[]): void {
    const kept: Conversation[] = [];
    const byPeer = new Map<string, Conversation[]>();
    for (const conversation of conversations) {
      const list = byPeer.get(conversation.peer) ?? [];
      list.push(conversation);
      byPeer.set(conversation.peer, list);
    }
    for (const list of byPeer.values()) {
      list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      kept.push(...list.slice(0, MAX_CONVERSATIONS_PER_PEER));
    }

    this.state.set({ version: STATE_VERSION, conversations: kept });
    try {
      localStorage.setItem(
        storageKey(),
        JSON.stringify({ version: STATE_VERSION, conversations: kept }),
      );
    } catch {
      // Out of storage. The in-memory state stands so the current conversation
      // keeps working; it simply will not survive a reload. Better than
      // throwing into a chat send and losing the message on screen too.
    }
  }
}

function nowIso(): string {
  return new Date().toISOString();
}
