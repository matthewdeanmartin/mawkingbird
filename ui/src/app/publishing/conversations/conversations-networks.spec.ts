import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NEVER, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { Streaming } from '../../platform/api/streaming';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BlueskyChatApi } from '../../connections/bluesky/bluesky-chat-api';
import { BskyMessageView } from '../../connections/bluesky/bluesky-types';
import { AppDialogs } from '../../shell/app-dialogs';
import { Conversations, Chat } from './conversations';

describe('Conversations configured networks', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Conversations>;
  const linked = signal(true);
  const open = vi.fn();
  const listConvos = vi.fn();
  const getMessages = vi.fn();
  const sendMessage = vi.fn();
  const getConvoForMembers = vi.fn();
  const acceptConvo = vi.fn();
  const leaveConvo = vi.fn();
  const setConvoMuted = vi.fn();
  const setReaction = vi.fn();
  const deleteMessageForSelf = vi.fn();
  const confirm = vi.fn();
  const convo = {
    id: 'one',
    rev: '1',
    members: [{ did: 'did:plc:peer', handle: 'peer.bsky.social' }],
    unreadCount: 0,
  };
  const message: BskyMessageView = {
    id: 'message',
    rev: '1',
    text: 'hello',
    sender: { did: 'did:plc:peer' },
    sentAt: '2026-09-12T12:00:00Z',
  };
  interface State {
    chats: () => Chat[];
    loading: () => boolean;
    bskyDraft: WritableSignal<string>;
    bskyMessages: () => BskyMessageView[];
    refreshAll(): void;
    retryThread(): void;
  }
  const state = () => fixture.componentInstance as unknown as State;

  beforeEach(() => {
    localStorage.clear();
    linked.set(true);
    open.mockReset().mockReturnValue(NEVER);
    listConvos.mockReset().mockReturnValue(of({ convos: [convo] }));
    getMessages.mockReset().mockReturnValue(of({ messages: [] }));
    sendMessage.mockReset().mockReturnValue(of(message));
    getConvoForMembers.mockReset().mockReturnValue(of({ convo }));
    acceptConvo.mockReset().mockReturnValue(of({}));
    leaveConvo.mockReset().mockReturnValue(of({}));
    setConvoMuted.mockReset().mockReturnValue(of({ convo: { ...convo, muted: true } }));
    setReaction.mockReset();
    deleteMessageForSelf.mockReset();
    confirm.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: { open } },
        { provide: BlueskySession, useValue: { linked, session: signal({ did: 'did:plc:me' }) } },
        {
          provide: BlueskyChatApi,
          useValue: {
            listConvos,
            getMessages,
            sendMessage,
            getConvoForMembers,
            acceptConvo,
            leaveConvo,
            setConvoMuted,
            setReaction,
            deleteMessageForSelf,
            updateRead: () => of(undefined),
          },
        },
        { provide: AppDialogs, useValue: { confirm } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).kind.set('bluesky');
  });
  afterEach(() => {
    fixture?.destroy();
    http.verify();
  });
  function create(): void {
    fixture = TestBed.createComponent(Conversations);
    fixture.detectChanges();
  }
  function select(): void {
    fixture.componentInstance.select(
      state()
        .chats()
        .find((c) => c.kind === 'bsky')!,
    );
    fixture.detectChanges();
  }

  it('opens the private Bluesky conversation for a profile Chat link without posting', () => {
    listConvos.mockReturnValue(of({ convos: [] }));
    create();
    fixture.componentInstance['pendingOpen'].set('bsky-person:bsky:did:plc:peer');
    fixture.componentInstance['pendingWith'].set('bsky:did:plc:peer');
    fixture.detectChanges();
    expect(getConvoForMembers).toHaveBeenCalledWith('did:plc:peer');
    expect(fixture.componentInstance['selected']()?.convoId).toBe('one');
    expect(sendMessage).not.toHaveBeenCalled();
    http.expectNone((r) => r.url.startsWith('/api/'));
  });

  it('loads Bluesky alone, without Mastodon requests, streams, or unavailable filters', () => {
    const prefs = TestBed.inject(ClientPrefs);
    prefs.setChatKind('private');
    prefs.setChatAudience('mutuals');
    create();
    expect(
      state()
        .chats()
        .some((c) => c.kind === 'bsky'),
    ).toBe(true);
    expect(state().loading()).toBe(false);
    expect(open).not.toHaveBeenCalled();
    http.expectNone((r) => r.url.startsWith('/api/'));
    expect(prefs.chatKind()).toBe('all');
    expect(prefs.chatAudience()).toBe('all');
    const filters = fixture.nativeElement.querySelector('.chat-filters').textContent;
    expect(filters).not.toContain('Mutuals');
    expect(filters).not.toContain('🔒');
    expect(filters).not.toContain('📢');
  });

  it('keeps bot-only Anonymous chat usable without either network', () => {
    TestBed.inject(Auth).enterAnonymous();
    linked.set(false);
    create();
    expect(state().loading()).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(listConvos).not.toHaveBeenCalled();
    http.expectNone((r) => r.url.startsWith('/api/'));
  });

  it('loads both networks with a Mastodon connector and preserves Bluesky after a Mastodon failure', () => {
    TestBed.inject(Auth).connectMastodon('connector-token');
    create();
    http
      .expectOne('/api/v1/conversations?limit=40')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    // Mentions only, 40 at a time; an empty page ends the history.
    http.expectOne('/api/v1/notifications?types%5B%5D=mention&limit=40').flush([]);
    fixture.detectChanges();
    expect(open).toHaveBeenCalledWith({ stream: 'direct' }, expect.any(Function));
    expect(open).toHaveBeenCalledWith({ stream: 'user' }, expect.any(Function));
    expect(
      state()
        .chats()
        .some((c) => c.kind === 'bsky'),
    ).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Mastodon');
    expect(state().loading()).toBe(false);
  });

  it('shows a Bluesky loading failure and clears it when a retry succeeds', () => {
    listConvos.mockReturnValueOnce(throwError(() => new Error('network down')));
    create();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Bluesky');
    state().refreshAll();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(
      state()
        .chats()
        .some((c) => c.kind === 'bsky'),
    ).toBe(true);
  });

  it('shows a Bluesky message-loading error and supports retry', () => {
    getMessages.mockReturnValueOnce(throwError(() => new Error('network down')));
    create();
    select();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Bluesky messages',
    );
    getMessages.mockReturnValue(of({ messages: [message] }));
    state().retryThread();
    fixture.detectChanges();
    expect(state().bskyMessages()).toEqual([message]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps a failed Bluesky send draft and displays the failure', () => {
    sendMessage.mockReturnValue(throwError(() => new Error('network down')));
    create();
    select();
    state().bskyDraft.set('keep my draft');
    fixture.componentInstance.sendBskyMessage();
    fixture.detectChanges();
    expect(state().bskyDraft()).toBe('keep my draft');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Could not send',
    );
  });

  describe('Bluesky chat actions', () => {
    const request = {
      ...convo,
      id: 'req',
      status: 'request' as const,
      members: [{ did: 'did:plc:stranger', handle: 'stranger.bsky.social' }],
      unreadCount: 1,
    };
    const el = () => fixture.nativeElement as HTMLElement;
    const buttons = () => [...el().querySelectorAll('button')];
    const button = (text: string) => buttons().find((b) => b.textContent?.trim() === text)!;
    const rows = () => [...el().querySelectorAll('.conv-row')].map((r) => r.textContent ?? '');
    const flush = async () => {
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    };

    it('lists message requests apart from chats with a count, and accepting moves one', () => {
      listConvos.mockReturnValue(of({ convos: [convo, request] }));
      create();
      expect(rows().some((r) => r.includes('stranger'))).toBe(false);
      expect(rows().some((r) => r.includes('peer'))).toBe(true);

      button('Requests (1)').click();
      fixture.detectChanges();
      expect(rows().length).toBe(1);
      expect(rows()[0]).toContain('stranger');
      expect(rows()[0]).toContain('Request');

      fixture.componentInstance.select(
        state()
          .chats()
          .find((c) => c.convoId === 'req')!,
      );
      fixture.detectChanges();
      expect(el().querySelector('.request-bar')?.textContent).toContain('wants to chat');
      button('Accept').click();
      fixture.detectChanges();

      expect(acceptConvo).toHaveBeenCalledWith('req');
      expect(el().querySelector('.request-bar')).toBeNull();
      expect(buttons().some((b) => b.textContent?.includes('Requests'))).toBe(false);
      expect(rows().some((r) => r.includes('stranger'))).toBe(true);
    });

    it('renders reactions as chips, removes your own, and shows the reaction limit', () => {
      const reacted: BskyMessageView = {
        ...message,
        reactions: [
          { value: '👍', sender: { did: 'did:plc:peer' }, createdAt: '2026-09-12T12:01:00Z' },
          { value: '👍', sender: { did: 'did:plc:me' }, createdAt: '2026-09-12T12:02:00Z' },
          { value: '🎉', sender: { did: 'did:plc:peer' }, createdAt: '2026-09-12T12:03:00Z' },
        ],
      };
      getMessages.mockReturnValue(of({ messages: [reacted] }));
      setReaction.mockReturnValue(
        of({ message: { ...reacted, reactions: reacted.reactions!.slice(0, 1) } }),
      );
      create();
      select();
      const chips = () => [...el().querySelectorAll<HTMLButtonElement>('.reaction-chip')];
      expect(chips().map((c) => c.textContent?.trim())).toEqual(['👍 2', '🎉 1']);
      expect(chips().map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false']);

      chips()[0].click();
      fixture.detectChanges();
      expect(setReaction).toHaveBeenCalledWith('one', 'message', '👍', false);
      expect(chips().map((c) => c.textContent?.trim())).toEqual(['👍 1']);

      setReaction.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { error: 'ReactionLimitReached', message: 'limit' },
            }),
        ),
      );
      chips()[0].click();
      fixture.detectChanges();
      expect(setReaction).toHaveBeenLastCalledWith('one', 'message', '👍', true);
      expect(el().querySelector('.bsky-action-error')?.textContent).toContain('reaction');
    });

    it('adds a picked emoji as a reaction but ignores custom :shortcodes:', () => {
      getMessages.mockReturnValue(of({ messages: [message] }));
      setReaction.mockReturnValue(of({ message }));
      create();
      select();
      const page = fixture.componentInstance as unknown as {
        pickReaction(m: BskyMessageView, v: string): void;
      };
      page.pickReaction(message, ':blobcat:');
      expect(setReaction).not.toHaveBeenCalled();
      page.pickReaction(message, '❤️');
      expect(setReaction).toHaveBeenCalledWith('one', 'message', '❤️', true);
    });

    it('leaves a conversation only after confirming', async () => {
      create();
      select();
      confirm.mockResolvedValueOnce(false);
      button('Leave conversation').click();
      await flush();
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(leaveConvo).not.toHaveBeenCalled();

      button('Leave conversation').click();
      await flush();
      expect(leaveConvo).toHaveBeenCalledWith('one');
      expect(
        state()
          .chats()
          .some((c) => c.kind === 'bsky'),
      ).toBe(false);
      expect(fixture.componentInstance['selected']()).toBeNull();
    });

    it('declines a request through leave, with its own confirmation', async () => {
      listConvos.mockReturnValue(of({ convos: [request] }));
      create();
      fixture.componentInstance.select(
        state()
          .chats()
          .find((c) => c.convoId === 'req')!,
      );
      fixture.detectChanges();
      el().querySelector<HTMLButtonElement>('.request-bar [data-tone="danger"]')!.click();
      await flush();
      expect(confirm.mock.calls[0][0]).toContain('Decline this message request');
      expect(leaveConvo).toHaveBeenCalledWith('req');
    });

    it('deletes a message for you only after confirming, then shows it as deleted', async () => {
      getMessages.mockReturnValue(of({ messages: [message] }));
      deleteMessageForSelf.mockReturnValue(
        of({ $type: 'chat.bsky.convo.defs#deletedMessageView', ...message, text: undefined }),
      );
      create();
      select();
      button('Delete for me').click();
      await flush();
      expect(confirm.mock.calls[0][0]).toContain('the other person keeps their copy');
      expect(deleteMessageForSelf).toHaveBeenCalledWith('one', 'message');
      expect(el().querySelector('.bubble-deleted')?.textContent).toContain('Message deleted');
      expect(el().querySelector('.reaction-chip')).toBeNull();
    });

    it('keeps messages you deleted earlier as "Message deleted" in the transcript', () => {
      getMessages.mockReturnValue(
        of({
          messages: [
            { $type: 'chat.bsky.convo.defs#deletedMessageView', ...message, text: undefined },
          ],
        }),
      );
      create();
      select();
      expect(el().querySelector('.bubble-deleted')?.textContent).toContain('Message deleted');
    });

    it('mutes and unmutes a conversation and marks it in the list', () => {
      create();
      select();
      button('Mute conversation').click();
      fixture.detectChanges();
      expect(setConvoMuted).toHaveBeenCalledWith('one', true);
      expect(el().querySelector('.conv-row .muted-mark')).not.toBeNull();

      setConvoMuted.mockReturnValue(of({ convo: { ...convo, muted: false } }));
      button('Unmute conversation').click();
      fixture.detectChanges();
      expect(setConvoMuted).toHaveBeenLastCalledWith('one', false);
      expect(el().querySelector('.conv-row .muted-mark')).toBeNull();
    });

    it('replying to a request accepts it', () => {
      listConvos.mockReturnValue(of({ convos: [request] }));
      sendMessage.mockReturnValue(of({ ...message, sender: { did: 'did:plc:me' } }));
      create();
      fixture.componentInstance.select(
        state()
          .chats()
          .find((c) => c.convoId === 'req')!,
      );
      state().bskyDraft.set('hi');
      fixture.componentInstance.sendBskyMessage();
      fixture.detectChanges();
      expect(
        state()
          .chats()
          .find((c) => c.convoId === 'req')?.request,
      ).toBe(false);
    });
  });

  it('ignores an old transcript after selecting another Bluesky conversation', () => {
    listConvos.mockReturnValue(of({ convos: [convo, { ...convo, id: 'two' }] }));
    const old = new Subject<{ messages: BskyMessageView[] }>();
    getMessages.mockReturnValueOnce(old).mockReturnValue(of({ messages: [] }));
    create();
    select();
    fixture.componentInstance.select(
      state()
        .chats()
        .find((c) => c.convoId === 'two')!,
    );
    old.next({ messages: [message] });
    old.complete();
    expect(state().bskyMessages()).toEqual([]);
  });
});
