import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlueskyChatApi } from './bluesky-chat-api';
import { BlueskySession, BskySession } from './bluesky-session';
import { BskyConvoList, BskyMessageView } from './bluesky-types';
import { seedBskySession } from '../../testing/seed-storage';

const SERVICE = 'https://bsky.social';
/** Chat calls go to the account's real PDS, never the entryway (it 501s). */
const PDS = 'https://shiitake.test';
const PROXY = 'did:web:api.bsky.chat#bsky_chat';

function storedSession(overrides: Partial<BskySession> = {}): BskySession {
  return {
    service: SERVICE,
    handle: 'me.bsky.social',
    did: 'did:plc:me',
    accessJwt: 'access-1',
    refreshJwt: 'refresh-1',
    pdsUrl: PDS,
    ...overrides,
  };
}

describe('BlueskyChatApi', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function seed(overrides: Partial<BskySession> = {}): BlueskyChatApi {
    seedBskySession(storedSession(overrides));
    return TestBed.inject(BlueskyChatApi);
  }

  it('listConvos hits the real PDS with the chat service-proxy header', () => {
    const chat = seed();
    let result: BskyConvoList | undefined;
    chat.listConvos().subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === `${PDS}/xrpc/chat.bsky.convo.listConvos`);
    expect(req.request.headers.get('atproto-proxy')).toBe(PROXY);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({ convos: [], cursor: undefined });

    expect(result?.convos).toEqual([]);
  });

  it('resolves the PDS from plc.directory once and remembers it', () => {
    const chat = seed({ pdsUrl: undefined });
    chat.listConvos().subscribe();

    httpMock.expectOne(`https://plc.directory/did:plc:me`).flush({
      service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: PDS }],
    });
    httpMock
      .expectOne((r) => r.url === `${PDS}/xrpc/chat.bsky.convo.listConvos`)
      .flush({
        convos: [],
      });

    expect(TestBed.inject(BlueskySession).session()?.pdsUrl).toBe(PDS);

    // Second call goes straight to the PDS — no directory lookup.
    chat.getLog().subscribe();
    httpMock.expectOne((r) => r.url === `${PDS}/xrpc/chat.bsky.convo.getLog`).flush({ logs: [] });
  });

  it('getMessages passes the convoId', () => {
    const chat = seed();
    chat.getMessages('convo-1').subscribe();

    const req = httpMock.expectOne((r) => r.url === `${PDS}/xrpc/chat.bsky.convo.getMessages`);
    expect(req.request.params.get('convoId')).toBe('convo-1');
    expect(req.request.headers.get('atproto-proxy')).toBe(PROXY);
    req.flush({ messages: [] });
  });

  it('sendMessage posts text and detected link facets', () => {
    const chat = seed();
    let sent: BskyMessageView | undefined;
    chat.sendMessage('convo-1', 'see https://example.com').subscribe((m) => (sent = m));

    const req = httpMock.expectOne((r) => r.url === `${PDS}/xrpc/chat.bsky.convo.sendMessage`);
    expect(req.request.headers.get('atproto-proxy')).toBe(PROXY);
    const body = req.request.body as {
      convoId: string;
      message: { text: string; facets?: unknown[] };
    };
    expect(body.convoId).toBe('convo-1');
    expect(body.message.text).toBe('see https://example.com');
    expect(body.message.facets?.length).toBe(1);
    req.flush({
      id: 'm1',
      rev: '1',
      text: 'see https://example.com',
      sender: { did: 'did:plc:me' },
      sentAt: '2026-01-01T00:00:00Z',
    });

    expect(sent?.id).toBe('m1');
  });

  it('updateRead posts the convo and message ids', () => {
    const chat = seed();
    chat.updateRead('convo-1', 'm9').subscribe();

    const req = httpMock.expectOne((r) => r.url === `${PDS}/xrpc/chat.bsky.convo.updateRead`);
    expect(req.request.body).toEqual({ convoId: 'convo-1', messageId: 'm9' });
    req.flush({});
  });
});
