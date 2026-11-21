import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { Streaming } from '../../platform/api/streaming';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BlueskyChatApi } from '../../connections/bluesky/bluesky-chat-api';
import { BskyConvoView, BskyMessageView } from '../../connections/bluesky/bluesky-types';
import { AppDialogs } from '../../shell/app-dialogs';
import { Conversations, Chat } from './conversations';

/** Bluesky group chats, live updates and paging (parity sprint 7). */
describe('Conversations: Bluesky groups and live updates', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Conversations>;
  const listConvos = vi.fn();
  const getMessages = vi.fn();
  const getLog = vi.fn();

  const group: BskyConvoView = {
    id: 'g1',
    rev: '1',
    members: [
      { did: 'did:plc:me', handle: 'me.test', kind: { role: 'owner' } },
      { did: 'did:plc:ana', handle: 'ana.test', displayName: 'Ana', kind: { role: 'standard' } },
    ],
    unreadCount: 0,
    kind: {
      $type: 'chat.bsky.convo.defs#groupConvo',
      name: 'Birders',
      memberCount: 2,
      memberLimit: 50,
      lockStatus: 'unlocked',
      createdAt: '2026-11-21T00:00:00Z',
    },
  };
  const joined = {
    $type: 'chat.bsky.convo.defs#systemMessageView',
    id: 's1',
    rev: '2',
    sentAt: '2026-11-21T00:01:00Z',
    sender: { did: 'did:plc:ana' },
    data: {
      $type: 'chat.bsky.convo.defs#systemMessageDataMemberJoin',
      member: { did: 'did:plc:ana' },
    },
  } as unknown as BskyMessageView;
  const hello: BskyMessageView = {
    id: 'm1',
    rev: '3',
    text: 'hello birders',
    sender: { did: 'did:plc:ana' },
    sentAt: '2026-11-21T00:02:00Z',
  };

  interface Internals {
    chats: () => Chat[];
    bskyMessages: () => BskyMessageView[];
    select(chat: Chat): void;
    title(chat: Chat): string;
    loadMoreChats(): void;
    followBskyLog(): void;
  }
  const page = () => fixture.componentInstance as unknown as Internals;

  beforeEach(() => {
    localStorage.clear();
    listConvos.mockReset().mockReturnValue(of({ convos: [group] }));
    getMessages.mockReset().mockReturnValue(of({ messages: [hello, joined] }));
    getLog.mockReset().mockReturnValue(of({ logs: [], cursor: 'c0' }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Streaming, useValue: { open: vi.fn(() => NEVER) } },
        {
          provide: BlueskySession,
          useValue: {
            linked: signal(true),
            session: signal({ did: 'did:plc:me', handle: 'me.test' }),
          },
        },
        {
          provide: BlueskyChatApi,
          useValue: { listConvos, getMessages, getLog, updateRead: () => of(undefined) },
        },
        { provide: AppDialogs, useValue: { confirm: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).kind.set('bluesky');
    fixture = TestBed.createComponent(Conversations);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  const groupChat = () =>
    page()
      .chats()
      .find((c) => c.convoId === 'g1')!;

  it('titles a group by its name and knows who owns it', () => {
    expect(page().title(groupChat())).toBe('Birders');
    expect(groupChat().groupOwner).toBe(true);
  });

  it('keeps system messages in the thread and shows them as a line', () => {
    page().select(groupChat());
    fixture.detectChanges();
    expect(
      page()
        .bskyMessages()
        .map((m) => m.id),
    ).toEqual(['s1', 'm1']);
    const line = (fixture.nativeElement as HTMLElement).querySelector('.system-line');
    expect(line?.textContent).toContain('Ana joined');
  });

  it('follows the chat log: the first read only finds its place', () => {
    page().select(groupChat());
    getMessages.mockClear();
    listConvos.mockClear();
    page().followBskyLog();
    expect(getLog).toHaveBeenCalledWith(undefined);
    expect(getMessages).not.toHaveBeenCalled();
    expect(listConvos).not.toHaveBeenCalled();
  });

  it('re-reads the open chat quietly when the log shows it changed', () => {
    page().select(groupChat());
    page().followBskyLog();
    getLog.mockReturnValue(
      of({ logs: [{ $type: 'x#logCreateMessage', rev: '4', convoId: 'g1' }], cursor: 'c1' }),
    );
    const newer: BskyMessageView = { ...hello, id: 'm2', text: 'new one', rev: '4' };
    getMessages.mockReturnValue(of({ messages: [newer, hello, joined] }));
    page().followBskyLog();
    expect(getLog).toHaveBeenLastCalledWith('c0');
    expect(
      page()
        .bskyMessages()
        .map((m) => m.id),
    ).toEqual(['s1', 'm1', 'm2']);
    expect(listConvos).toHaveBeenCalled();
  });

  it('pages Bluesky chats past the first 50 with Load more', () => {
    fixture.destroy();
    listConvos
      .mockReset()
      .mockImplementation((cursor?: string) =>
        of(cursor ? { convos: [{ ...group, id: 'g2' }] } : { convos: [group], cursor: 'page2' }),
      );
    fixture = TestBed.createComponent(Conversations);
    fixture.detectChanges();
    page().loadMoreChats();
    expect(listConvos).toHaveBeenLastCalledWith('page2');
    expect(
      page()
        .chats()
        .map((c) => c.convoId)
        .filter(Boolean),
    ).toEqual(expect.arrayContaining(['g1', 'g2']));
  });
});
