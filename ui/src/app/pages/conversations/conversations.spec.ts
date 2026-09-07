import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { ClientPrefs } from '../../client-prefs';
import { Streaming, StreamEvent, StreamKind } from '../../streaming';
import { Account, Conversation, MastodonNotification, Relationship, Status } from '../../models';
import { Chat, Conversations, stripLeadingMentions } from './conversations';
import { BskyConvoView } from '../../providers/bluesky/bluesky-types';

interface ConversationsInternals {
  loading: WritableSignal<boolean>;
  privateConvs: WritableSignal<Conversation[]>;
  bskyConvos: WritableSignal<BskyConvoView[]>;
  pendingOpen: WritableSignal<string | null>;
  pendingWith: WritableSignal<string | null>;
  pendingContext: WritableSignal<string | null>;
  draftChat: WritableSignal<Chat | null>;
  selectedKey: WritableSignal<string | null>;
  messages: WritableSignal<Status[]>;
  chats: Signal<Chat[]>;
  visibleChats: Signal<Chat[]>;
  selected: Signal<Chat | null>;
  replyMentions: Signal<string>;
  replyToId: Signal<string | undefined>;
  replyVisibility: Signal<string>;
}

function internals(fixture: ComponentFixture<Conversations>): ConversationsInternals {
  return fixture.componentInstance as unknown as ConversationsInternals;
}

/**
 * The Mastodon and Bluesky chat rows — everything except the bots.
 *
 * Eliza is an unconditional correspondent, so `chats()` always carries at least
 * one row that has nothing to do with the plumbing most of these tests are
 * about. Filtering here keeps their assertions stating what they mean: "one
 * private chat", not "one private chat plus whatever bots exist today".
 */
function realChats(fixture: ComponentFixture<Conversations>): Chat[] {
  return internals(fixture)
    .chats()
    .filter((c) => c.kind !== 'bot');
}

/** Only the bot rows — the complement of {@link realChats}. */
function botRows(fixture: ComponentFixture<Conversations>): Chat[] {
  return internals(fixture)
    .chats()
    .filter((c) => c.kind === 'bot');
}

/** {@link realChats}, but after the audience and kind filters. */
function visibleReal(fixture: ComponentFixture<Conversations>): Chat[] {
  return internals(fixture)
    .visibleChats()
    .filter((c) => c.kind !== 'bot');
}

/** The component opens two streams (direct + user); track subscribers per kind. */
class MultiFakeStreaming {
  private subscribers = new Map<string, (ev: StreamEvent) => void>();
  openedKinds: string[] = [];

  open(kind: StreamKind) {
    this.openedKinds.push(kind.stream);
    return {
      subscribe: (fn: (ev: StreamEvent) => void): Subscription => {
        this.subscribers.set(kind.stream, fn);
        return new Subscription(() => this.subscribers.delete(kind.stream));
      },
    } as unknown as ReturnType<Streaming['open']>;
  }

  emit(stream: string, ev: StreamEvent): void {
    this.subscribers.get(stream)?.(ev);
  }
}

function makeAccount(id: string, acct = `user${id}`, display_name = `User ${id}`): Account {
  return {
    id,
    username: acct,
    acct,
    display_name,
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
  } as unknown as Account;
}

const ME = makeAccount('me', 'me_user', 'Me');

function makeStatus(id: string, overrides: Partial<Status> = {}): Status {
  return {
    id,
    created_at: '2026-01-01T00:00:00Z',
    edited_at: null,
    content: `<p>${id}</p>`,
    spoiler_text: '',
    visibility: 'direct',
    url: null,
    account: makeAccount('1'),
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    ...overrides,
  };
}

function makeConversation(id: string, overrides: Partial<Conversation> = {}): Conversation {
  return { id, unread: false, accounts: [], last_status: null, ...overrides };
}

function makeMention(
  id: string,
  status: Status,
  account: Account = status.account,
): MastodonNotification {
  return { id, type: 'mention', created_at: status.created_at, account, status };
}

describe('Conversations', () => {
  let httpMock: HttpTestingController;
  let streaming: MultiFakeStreaming;

  beforeEach(() => {
    localStorage.clear();
    streaming = new MultiFakeStreaming();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: streaming },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).account.set(ME);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(
    conversations: Conversation[] = [],
    notifications: MastodonNotification[] = [],
  ): ComponentFixture<Conversations> {
    const fixture = TestBed.createComponent(Conversations);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/api/v1/conversations').flush(conversations);
    httpMock.expectOne((r) => r.url === '/api/v1/notifications').flush(notifications);
    return fixture;
  }

  // ---------------------------------------------------------------- initial load

  it('fetches conversations and notifications on init and clears loading', () => {
    const fixture = TestBed.createComponent(Conversations);
    fixture.detectChanges();

    expect(internals(fixture).loading()).toBe(true);

    httpMock.expectOne((r) => r.url === '/api/v1/conversations').flush([makeConversation('1')]);
    httpMock.expectOne((r) => r.url === '/api/v1/notifications').flush([]);

    expect(internals(fixture).loading()).toBe(false);
    expect(realChats(fixture)).toHaveLength(1);
    expect(realChats(fixture)[0].kind).toBe('private');
  });

  it('clears loading even when both requests fail', () => {
    const fixture = TestBed.createComponent(Conversations);
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === '/api/v1/conversations')
      .flush('', { status: 500, statusText: 'Error' });
    httpMock
      .expectOne((r) => r.url === '/api/v1/notifications')
      .flush('', { status: 500, statusText: 'Error' });

    expect(internals(fixture).loading()).toBe(false);
  });

  it('opens the direct and user streams on init and closes them on destroy', () => {
    const fixture = setUp();
    expect(streaming.openedKinds.sort()).toEqual(['direct', 'user']);
    fixture.destroy();
  });

  // ---------------------------------------------------------------- public chat grouping

  it('groups mention notifications by author into one public chat', () => {
    const alice = makeAccount('2', 'alice');
    const s1 = makeStatus('s1', { visibility: 'public', account: alice });
    const s2 = makeStatus('s2', {
      visibility: 'public',
      account: alice,
      created_at: '2026-01-02T00:00:00Z',
    });
    const fixture = setUp([], [makeMention('n1', s1), makeMention('n2', s2)]);

    const chats = realChats(fixture);
    expect(chats).toHaveLength(1);
    expect(chats[0].kind).toBe('public');
    expect(chats[0].lastStatus?.id).toBe('s2');
  });

  it('widens a mismatched kind filter to All when a notification deep link opens a chat', () => {
    const alice = makeAccount('2', 'alice');
    const status = makeStatus('s1', { visibility: 'public', account: alice });
    const fixture = setUp([], [makeMention('n1', status)]);
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setChatKind('bsky');

    internals(fixture).pendingOpen.set('pub:alice');
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/statuses/s1/context').flush({ ancestors: [], descendants: [] });

    // 'all', not 'public': widening far enough to show the row beats snapping
    // the filter shut around it and hiding every other chat.
    expect(prefs.chatKind()).toBe('all');
    expect(internals(fixture).selected()?.kind).toBe('public');
  });

  it('leaves a kind filter that already shows the deep-linked chat untouched', () => {
    const alice = makeAccount('2', 'alice');
    const status = makeStatus('s1', { visibility: 'public', account: alice });
    const fixture = setUp([], [makeMention('n1', status)]);
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setChatKind('public');

    internals(fixture).pendingOpen.set('pub:alice');
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/statuses/s1/context').flush({ ancestors: [], descendants: [] });

    expect(prefs.chatKind()).toBe('public');
    expect(internals(fixture).selected()?.kind).toBe('public');
  });

  // ---------------------------------------------------------------- draft (de-novo) chat

  it('drafts a stub chat for a partner with no history when ?open has no match', () => {
    const alice = makeAccount('2', 'alice');
    const fixture = setUp(); // no conversations, no notifications → no rows

    internals(fixture).pendingOpen.set('pub:alice');
    internals(fixture).pendingWith.set('2');
    fixture.detectChanges();

    // The stub is materialised by fetching the partner's full account.
    httpMock.expectOne('/api/v1/accounts/2').flush(alice);

    const draft = internals(fixture).draftChat();
    expect(draft?.key).toBe('pub:alice');
    expect(draft?.kind).toBe('public');
    expect(draft?.accounts[0].id).toBe('2');
    // It appears in the list and is auto-selected with an empty history.
    expect(realChats(fixture).some((c) => c.key === 'pub:alice')).toBe(true);
    expect(internals(fixture).selected()?.key).toBe('pub:alice');
    expect(internals(fixture).messages()).toEqual([]);
  });

  it('shows the originating post when a deep link drafts a chat with no history', () => {
    const alice = makeAccount('2', 'alice');
    const origin = makeStatus('source-1', { visibility: 'public', account: alice });
    const fixture = setUp();

    internals(fixture).pendingOpen.set('pub:alice');
    internals(fixture).pendingWith.set('2');
    internals(fixture).pendingContext.set('source-1');
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/accounts/2').flush(alice);
    httpMock.expectOne('/api/v1/statuses/source-1').flush(origin);
    expect(internals(fixture).selected()?.key).toBe('pub:alice');
    httpMock
      .expectOne('/api/v1/statuses/source-1/context')
      .flush({ ancestors: [], descendants: [] });

    expect(
      internals(fixture)
        .messages()
        .map((status) => status.id),
    ).toEqual(['source-1']);
  });

  it('uses the originating post instead of stale history for an existing chat deep link', () => {
    const alice = makeAccount('2', 'alice');
    const stale = makeStatus('old-1', { visibility: 'public', account: alice });
    const origin = makeStatus('source-2', { visibility: 'public', account: alice });
    const fixture = setUp([], [makeMention('n1', stale)]);

    internals(fixture).pendingOpen.set('pub:alice');
    internals(fixture).pendingWith.set('2');
    internals(fixture).pendingContext.set('source-2');
    fixture.detectChanges();

    httpMock.expectNone('/api/v1/statuses/old-1/context');
    httpMock.expectOne('/api/v1/statuses/source-2').flush(origin);
    httpMock
      .expectOne('/api/v1/statuses/source-2/context')
      .flush({ ancestors: [], descendants: [] });

    expect(
      internals(fixture)
        .messages()
        .map((status) => status.id),
    ).toEqual(['source-2', 'old-1']);
  });

  it('prefers an existing chat over drafting when one already matches ?open', () => {
    const alice = makeAccount('2', 'alice');
    const status = makeStatus('s1', { visibility: 'public', account: alice });
    const fixture = setUp([], [makeMention('n1', status)]);

    internals(fixture).pendingOpen.set('pub:alice');
    internals(fixture).pendingWith.set('2');
    fixture.detectChanges();

    // The real public row exists, so no account fetch and no draft.
    httpMock.expectOne('/api/v1/statuses/s1/context').flush({ ancestors: [], descendants: [] });
    httpMock.expectNone('/api/v1/accounts/2');
    expect(internals(fixture).draftChat()).toBeNull();
    expect(internals(fixture).selected()?.lastStatus?.id).toBe('s1');
  });

  it('does not draft (leaves empty state) when the partner account cannot be fetched', () => {
    const fixture = setUp();

    internals(fixture).pendingOpen.set('pub:alice');
    internals(fixture).pendingWith.set('2');
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/accounts/2').flush('', { status: 404, statusText: 'Not Found' });

    expect(internals(fixture).draftChat()).toBeNull();
    expect(realChats(fixture).some((c) => c.key === 'pub:alice')).toBe(false);
  });

  it('retires the draft once a real reply is posted under its key', () => {
    const alice = makeAccount('2', 'alice');
    const fixture = setUp();

    internals(fixture).pendingOpen.set('pub:alice');
    internals(fixture).pendingWith.set('2');
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/accounts/2').flush(alice);
    expect(internals(fixture).draftChat()).not.toBeNull();

    // Posting my first public reply promotes the stub into a real row.
    const reply = makeStatus('r1', { visibility: 'public', account: ME });
    fixture.componentInstance.onReplyPosted(reply);

    expect(internals(fixture).draftChat()).toBeNull();
    // A real public row for the same key now carries the conversation.
    const row = realChats(fixture).find((c) => c.key === 'pub:alice');
    expect(row).toBeDefined();
    expect(row?.lastStatus?.id).toBe('r1');
    expect(internals(fixture).selected()?.key).toBe('pub:alice');
  });

  it('suppresses Bluesky chats whose participant resolved to missing.invalid', () => {
    const fixture = setUp();
    const convo = (id: string, handle: string): BskyConvoView => ({
      id,
      rev: '1',
      members: [{ did: `did:plc:${id}`, handle }],
      unreadCount: 0,
    });

    internals(fixture).bskyConvos.set([
      convo('broken', 'missing.invalid'),
      convo('also-broken', 'person.missing.invalid'),
      convo('valid', 'alice.bsky.social'),
    ]);

    expect(realChats(fixture).filter((chat) => chat.kind === 'bsky')).toHaveLength(1);
    expect(realChats(fixture).some((chat) => chat.key === 'bsky:valid')).toBe(true);
    expect(realChats(fixture).some((chat) => chat.key === 'bsky:broken')).toBe(false);
  });

  it('different authors produce different public chats', () => {
    const s1 = makeStatus('s1', { visibility: 'public', account: makeAccount('2', 'alice') });
    const s2 = makeStatus('s2', { visibility: 'public', account: makeAccount('3', 'bob') });
    const fixture = setUp([], [makeMention('n1', s1), makeMention('n2', s2)]);

    expect(realChats(fixture)).toHaveLength(2);
  });

  it('same author groups together even when replies mention different third parties', () => {
    const alice = makeAccount('2', 'alice');
    const s1 = makeStatus('s1', {
      visibility: 'public',
      account: alice,
      mentions: [{ id: 'me', username: 'me_user', acct: 'me_user', url: '' }],
    });
    const s2 = makeStatus('s2', {
      visibility: 'public',
      account: alice,
      created_at: '2026-01-02T00:00:00Z',
      mentions: [
        { id: 'me', username: 'me_user', acct: 'me_user', url: '' },
        { id: '3', username: 'bob', acct: 'bob', url: '' },
      ],
    });
    const fixture = setUp([], [makeMention('n1', s1), makeMention('n2', s2)]);

    const chats = realChats(fixture);
    expect(chats).toHaveLength(1);
    expect(chats[0].handles).toEqual(['alice']);
  });

  it('ignores direct-visibility mentions (those belong to the conversations API)', () => {
    const s1 = makeStatus('s1', { visibility: 'direct', account: makeAccount('2', 'alice') });
    const fixture = setUp([], [makeMention('n1', s1)]);

    expect(realChats(fixture)).toHaveLength(0);
  });

  it('always offers Eliza, even with no Mastodon conversations at all', () => {
    const fixture = setUp([], []);

    const bots = botRows(fixture);
    expect(bots.map((c) => c.key)).toContain('bot:eliza');
    // Nothing arrives from a bot while you are away, so nothing is ever unread.
    expect(bots.every((c) => !c.unread)).toBe(true);
  });

  it('keeps bots out of Mutuals, and never asks the server about their ids', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const fixture = setUp([], []);

    prefs.setChatAudience('mutuals');
    fixture.detectChanges();

    expect(
      internals(fixture)
        .visibleChats()
        .some((c) => c.kind === 'bot'),
    ).toBe(false);
    // A bot's id is synthetic ('eliza:self'), so a relationship lookup for one
    // could only 404. httpMock.verify() in afterEach is what enforces this.
  });

  it('shows only bots under the Bots filter', () => {
    const prefs = TestBed.inject(ClientPrefs);
    const s1 = makeStatus('s1', { visibility: 'public', account: makeAccount('2', 'alice') });
    const fixture = setUp([], [makeMention('n1', s1)]);

    prefs.setChatAudience('bots');
    fixture.detectChanges();

    const visible = internals(fixture).visibleChats();
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((c) => c.kind === 'bot')).toBe(true);
  });

  // ---------------------------------------------------------------- select / threads

  it('select on an unread private chat POSTs mark-read and fetches the thread context', () => {
    const status = makeStatus('s1');
    const conv = makeConversation('c1', { unread: true, last_status: status });
    const fixture = setUp([conv]);

    fixture.componentInstance.select(realChats(fixture)[0]);

    const read = httpMock.expectOne('/api/v1/conversations/c1/read');
    expect(read.request.method).toBe('POST');
    read.flush({ ...conv, unread: false });
    expect(internals(fixture).privateConvs()[0].unread).toBe(false);

    const ancestor = makeStatus('s0');
    httpMock
      .expectOne('/api/v1/statuses/s1/context')
      .flush({ ancestors: [ancestor], descendants: [] });

    expect(
      internals(fixture)
        .messages()
        .map((m) => m.id),
    ).toEqual(['s0', 's1']);
  });

  it('select on a public chat marks it read locally (no server call)', () => {
    const s1 = makeStatus('s1', { visibility: 'public', account: makeAccount('2', 'alice') });
    const fixture = setUp([], [makeMention('n1', s1)]);

    const chat = realChats(fixture)[0];
    expect(chat.unread).toBe(true);

    fixture.componentInstance.select(chat);
    httpMock.expectOne('/api/v1/statuses/s1/context').flush({ ancestors: [], descendants: [] });

    expect(realChats(fixture)[0].unread).toBe(false);
    httpMock.expectNone((r) => r.url.includes('/read'));
  });

  // ---------------------------------------------------------------- composer seeds

  it('replyMentions and replyVisibility: direct for private chats', () => {
    const conv = makeConversation('c1', {
      accounts: [makeAccount('2', 'alice'), makeAccount('3', 'bob')],
      last_status: makeStatus('s1'),
    });
    const fixture = setUp([conv]);
    internals(fixture).selectedKey.set('priv:alice,bob');

    expect(internals(fixture).replyMentions()).toBe('@alice @bob ');
    expect(internals(fixture).replyVisibility()).toBe('direct');
    expect(internals(fixture).replyToId()).toBe('s1');
  });

  it("replyVisibility: public chats reply with the thread's own visibility", () => {
    const s1 = makeStatus('s1', { visibility: 'unlisted', account: makeAccount('2', 'alice') });
    const fixture = setUp([], [makeMention('n1', s1)]);
    internals(fixture).selectedKey.set(realChats(fixture)[0].key);

    expect(internals(fixture).replyVisibility()).toBe('unlisted');
  });

  it('replyMentions (public): seeds the author AND the co-recipients so the reply pings them', () => {
    // On real Mastodon a bare reply threads but does not notify; the recipient
    // must be @-mentioned in the text. So alice (the author we're replying to)
    // keeps her handle in the box, alongside co-recipient bob.
    const alice = makeAccount('2', 'alice');
    const s1 = makeStatus('s1', {
      visibility: 'public',
      account: alice,
      mentions: [
        { id: 'me', username: 'me_user', acct: 'me_user', url: '' },
        { id: '3', username: 'bob', acct: 'bob', url: '' },
      ],
    });
    const fixture = setUp([], [makeMention('n1', s1)]);
    internals(fixture).selectedKey.set(realChats(fixture)[0].key);

    expect(internals(fixture).replyMentions()).toBe('@alice @bob ');
  });

  it('replyMentions (private 1:1): stays empty since the conversation notifies the partner', () => {
    // Direct chats reach the partner via the conversation itself, so a 1:1 gets a
    // clean box — the notification quirk only applies to public reply threads.
    const conv = makeConversation('c1', {
      accounts: [makeAccount('2', 'alice')],
      last_status: makeStatus('s1', { account: makeAccount('2', 'alice') }),
    });
    const fixture = setUp([conv]);
    internals(fixture).selectedKey.set('priv:alice');

    expect(internals(fixture).replyMentions()).toBe('');
  });

  it('replyToId chains onto the newest loaded message, not the list row', () => {
    const conv = makeConversation('c1', { last_status: makeStatus('s1') });
    const fixture = setUp([conv]);
    internals(fixture).selectedKey.set('priv:');
    internals(fixture).messages.set([
      makeStatus('s1'),
      makeStatus('s2', { created_at: '2026-01-02T00:00:00Z' }),
    ]);

    expect(internals(fixture).replyToId()).toBe('s2');
  });

  // ---------------------------------------------------------------- title()

  it('title: a public chat is named after its author (the reply guy)', () => {
    const alice = makeAccount('2', 'alice', 'Alice A');
    const s1 = makeStatus('s1', {
      visibility: 'public',
      account: alice,
      mentions: [{ id: '3', username: 'bob', acct: 'bob', url: '' }],
    });
    const fixture = setUp([], [makeMention('n1', s1)]);

    const chat = realChats(fixture)[0];
    expect(fixture.componentInstance.title(chat)).toBe('Alice A');
  });

  it('title: returns "Me" for a self-conversation with no participants', () => {
    const conv = makeConversation('c1');
    const fixture = setUp([conv]);
    expect(fixture.componentInstance.title(realChats(fixture)[0])).toBe('Me');
  });

  // ---------------------------------------------------------------- streaming

  it('a conversation stream event upserts the private chat list', () => {
    const fixture = setUp([]);
    const conv = makeConversation('c9', { unread: true, last_status: makeStatus('s9') });

    streaming.emit('direct', { event: 'conversation', payload: conv });

    const chats = realChats(fixture);
    expect(chats).toHaveLength(1);
    expect(chats[0].key).toBe('priv:');
  });

  it('a mention notification on the user stream adds a public chat row', () => {
    const fixture = setUp();
    const alice = makeAccount('2', 'alice');
    const s1 = makeStatus('s1', { visibility: 'public', account: alice });

    streaming.emit('user', { event: 'notification', payload: makeMention('n1', s1, alice) });

    const chats = realChats(fixture);
    expect(chats).toHaveLength(1);
    expect(chats[0].kind).toBe('public');
    expect(chats[0].accounts[0].acct).toBe('alice');
  });

  it('a streamed reply to the open thread is appended', () => {
    const s1 = makeStatus('s1', { visibility: 'public', account: makeAccount('2', 'alice') });
    const fixture = setUp([], [makeMention('n1', s1)]);
    fixture.componentInstance.select(realChats(fixture)[0]);
    httpMock.expectOne('/api/v1/statuses/s1/context').flush({ ancestors: [], descendants: [] });

    const reply = makeStatus('s2', {
      visibility: 'public',
      in_reply_to_id: 's1',
      created_at: '2026-01-02T00:00:00Z',
      account: makeAccount('2', 'alice'),
    });
    streaming.emit('user', { event: 'update', payload: reply });

    expect(
      internals(fixture)
        .messages()
        .map((m) => m.id),
    ).toEqual(['s1', 's2']);
  });

  it('a delete on the user stream removes the message from the open thread', () => {
    const fixture = setUp();
    internals(fixture).messages.set([makeStatus('s1'), makeStatus('s2')]);

    streaming.emit('user', { event: 'delete', payload: 's1' });

    expect(
      internals(fixture)
        .messages()
        .map((m) => m.id),
    ).toEqual(['s2']);
  });

  // ---------------------------------------------------------------- onReplyPosted

  it('onReplyPosted (private): appends the message and refreshes conversations', () => {
    const conv = makeConversation('c1', { last_status: makeStatus('s1') });
    const fixture = setUp([conv]);
    internals(fixture).selectedKey.set('priv:');

    const posted = makeStatus('s2', { created_at: '2026-01-02T00:00:00Z', account: ME });
    fixture.componentInstance.onReplyPosted(posted);

    expect(
      internals(fixture)
        .messages()
        .some((m) => m.id === 's2'),
    ).toBe(true);
    httpMock
      .expectOne((r) => r.url === '/api/v1/conversations')
      .flush([makeConversation('c1', { last_status: posted })]);
  });

  it('onReplyPosted (public): appends without refetching conversations', () => {
    const s1 = makeStatus('s1', { visibility: 'public', account: makeAccount('2', 'alice') });
    const fixture = setUp([], [makeMention('n1', s1)]);
    internals(fixture).selectedKey.set(realChats(fixture)[0].key);

    const posted = makeStatus('s2', {
      visibility: 'public',
      created_at: '2026-01-02T00:00:00Z',
      account: ME,
      mentions: [{ id: '2', username: 'alice', acct: 'alice', url: '' }],
    });
    fixture.componentInstance.onReplyPosted(posted);

    expect(
      internals(fixture)
        .messages()
        .some((m) => m.id === 's2'),
    ).toBe(true);
    httpMock.expectNone((r) => r.url === '/api/v1/conversations');
    // The posted status also advances the public chat row.
    expect(realChats(fixture)[0].lastStatus?.id).toBe('s2');
  });

  // ---------------------------------------------------------------- list filters

  it('the kind toggle filters the visible list without touching the underlying chats', () => {
    const conv = makeConversation('c1', { last_status: makeStatus('s0') });
    const s1 = makeStatus('s1', { visibility: 'public', account: makeAccount('2', 'alice') });
    const fixture = setUp([conv], [makeMention('n1', s1)]);
    const prefs = TestBed.inject(ClientPrefs);

    expect(visibleReal(fixture)).toHaveLength(2);

    prefs.setChatKind('private');
    expect(visibleReal(fixture).map((c) => c.kind)).toEqual(['private']);

    prefs.setChatKind('public');
    expect(visibleReal(fixture).map((c) => c.kind)).toEqual(['public']);

    expect(realChats(fixture)).toHaveLength(2);
  });

  it('the mutuals toggle fetches relationships lazily and hides non-mutual chats', () => {
    const alice = makeAccount('2', 'alice');
    const bob = makeAccount('3', 'bob');
    const s1 = makeStatus('s1', { visibility: 'public', account: alice });
    const s2 = makeStatus('s2', { visibility: 'public', account: bob });
    const fixture = setUp([], [makeMention('n1', s1), makeMention('n2', s2)]);
    const prefs = TestBed.inject(ClientPrefs);

    // No relationships requested while the filter is off.
    httpMock.expectNone((r) => r.url === '/api/v1/accounts/relationships');

    prefs.setChatAudience('mutuals');
    fixture.detectChanges();

    const rel = (id: string, mutual: boolean): Relationship => ({
      id,
      following: mutual,
      followed_by: mutual,
      requested: false,
      blocking: false,
      muting: false,
    });
    httpMock
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush([rel('2', true), rel('3', false)]);

    const visible = visibleReal(fixture);
    expect(visible).toHaveLength(1);
    expect(visible[0].accounts[0].acct).toBe('alice');

    prefs.setChatAudience('all');
    expect(visibleReal(fixture)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------- mention elision

describe('stripLeadingMentions', () => {
  it('drops a plain-text leading mention', () => {
    expect(stripLeadingMentions('<p>@mistersql hello there</p>')).toBe('<p>hello there</p>');
  });

  it('drops several leading mentions including domain forms', () => {
    expect(stripLeadingMentions('<p>@alice @bob@example.com sounds good</p>')).toBe(
      '<p>sounds good</p>',
    );
  });

  it("drops Mastodon's h-card mention markup", () => {
    const html =
      '<p><span class="h-card"><a href="https://x/@alice" class="u-url mention">@alice</a></span> the actual text</p>';
    expect(stripLeadingMentions(html)).toBe('<p>the actual text</p>');
  });

  it('keeps mentions that appear mid-sentence', () => {
    expect(stripLeadingMentions('<p>ask @alice about it</p>')).toBe('<p>ask @alice about it</p>');
  });

  it('falls back to the original when the message is only mentions', () => {
    expect(stripLeadingMentions('<p>@alice @bob</p>')).toBe('<p>@alice @bob</p>');
  });
});
