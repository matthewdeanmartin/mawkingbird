import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NEVER, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { ClientPrefs } from '../../client-prefs';
import { Streaming } from '../../streaming';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { BlueskyChatApi } from '../../providers/bluesky/bluesky-chat-api';
import { BskyMessageView } from '../../providers/bluesky/bluesky-types';
import { Conversations, Chat } from './conversations';

describe('Conversations configured networks', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Conversations>;
  const linked = signal(true);
  const open = vi.fn();
  const listConvos = vi.fn();
  const getMessages = vi.fn();
  const sendMessage = vi.fn();
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
    refreshBskyConvos(): void;
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
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: { open } },
        { provide: BlueskySession, useValue: { linked, session: signal({ did: 'did:plc:me' }) } },
        {
          provide: BlueskyChatApi,
          useValue: { listConvos, getMessages, sendMessage, updateRead: () => of(undefined) },
        },
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
      .expectOne('/api/v1/conversations?limit=20')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    http.expectOne('/api/v1/notifications').flush([]);
    fixture.detectChanges();
    expect(open).toHaveBeenCalledWith({ stream: 'direct' });
    expect(open).toHaveBeenCalledWith({ stream: 'user' });
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
    state().refreshBskyConvos();
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
