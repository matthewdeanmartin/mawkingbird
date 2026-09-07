import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from './auth';
import { Server } from './server';
import { Streaming } from './streaming';

/** Minimal fake standing in for the browser's WebSocket. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  message(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>);
  }

  close(): void {
    this.closed = true;
  }
}

/** Drain pending microtasks so the async connect path inside open() runs. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

/** A real-Mastodon multiplexed WS frame (payload is a JSON-encoded string). */
function frame(event: string, payload: string): string {
  return JSON.stringify({ stream: ['user'], event, payload });
}

describe('Streaming', () => {
  let streaming: Streaming;
  let auth: Auth;
  let httpMock: HttpTestingController;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    localStorage.clear();
    FakeWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    // @ts-expect-error -- test double, not a full WebSocket implementation
    globalThis.WebSocket = FakeWebSocket;

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    streaming = TestBed.inject(Streaming);
    auth = TestBed.inject(Auth);
    httpMock = TestBed.inject(HttpTestingController);
    auth.setToken('test-token-123');
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    httpMock.verify();
    localStorage.clear();
  });

  function lastSocket(): FakeWebSocket {
    return FakeWebSocket.instances.at(-1)!;
  }

  async function open(kind: Parameters<Streaming['open']>[0]) {
    const sub = streaming.open(kind).subscribe();
    await settle();
    return sub;
  }

  it('builds the user-stream URL with the access token and stream param', async () => {
    const sub = await open({ stream: 'user' });
    const url = new URL(lastSocket().url);
    expect(url.protocol).toBe('ws:');
    expect(url.pathname).toBe('/api/v1/streaming');
    expect(url.searchParams.get('access_token')).toBe('test-token-123');
    expect(url.searchParams.get('stream')).toBe('user');
    sub.unsubscribe();
  });

  it('streams from the UI origin when targeting the mock ("this server")', async () => {
    const sub = await open({ stream: 'user' });
    const url = new URL(lastSocket().url);
    expect(url.host).toBe(location.host);
    sub.unsubscribe();
  });

  it('discovers the streaming host from /api/v2/instance for real instances', async () => {
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    const sub = streaming.open({ stream: 'user' }).subscribe();
    await settle();
    httpMock
      .expectOne('/api/v2/instance')
      .flush({ configuration: { urls: { streaming: 'wss://streaming.mastodon.social' } } });
    await settle();
    expect(lastSocket().url.startsWith('wss://streaming.mastodon.social/api/v1/streaming?')).toBe(
      true,
    );
    sub.unsubscribe();
  });

  it('falls back to wss://<instance-host> when the instance advertises no streaming URL', async () => {
    TestBed.inject(Server).setBaseUrl('https://example.social');
    const sub = streaming.open({ stream: 'user' }).subscribe();
    await settle();
    httpMock.expectOne('/api/v2/instance').flush({ configuration: { urls: {} } });
    await settle();
    expect(lastSocket().url.startsWith('wss://example.social/api/v1/streaming?')).toBe(true);
    sub.unsubscribe();
  });

  it('fetches /api/v2/instance only once per instance across streams', async () => {
    TestBed.inject(Server).setBaseUrl('https://mastodon.social');
    const sub1 = streaming.open({ stream: 'user' }).subscribe();
    await settle();
    httpMock
      .expectOne('/api/v2/instance')
      .flush({ configuration: { urls: { streaming: 'wss://streaming.mastodon.social' } } });
    await settle();
    const sub2 = streaming.open({ stream: 'public' }).subscribe();
    await settle();
    httpMock.expectNone('/api/v2/instance');
    expect(FakeWebSocket.instances.length).toBe(2);
    sub1.unsubscribe();
    sub2.unsubscribe();
  });

  it('maps public (non-local) to stream=public', async () => {
    const sub = await open({ stream: 'public' });
    expect(new URL(lastSocket().url).searchParams.get('stream')).toBe('public');
    sub.unsubscribe();
  });

  it('maps public+local to stream=public:local', async () => {
    const sub = await open({ stream: 'public', local: true });
    expect(new URL(lastSocket().url).searchParams.get('stream')).toBe('public:local');
    sub.unsubscribe();
  });

  it('maps hashtag to stream=hashtag with a tag param', async () => {
    const sub = await open({ stream: 'hashtag', tag: 'CatsOfMastodon' });
    const url = new URL(lastSocket().url);
    expect(url.searchParams.get('stream')).toBe('hashtag');
    expect(url.searchParams.get('tag')).toBe('CatsOfMastodon');
    sub.unsubscribe();
  });

  it('maps local hashtag to stream=hashtag:local', async () => {
    const sub = await open({ stream: 'hashtag', tag: 'art', local: true });
    expect(new URL(lastSocket().url).searchParams.get('stream')).toBe('hashtag:local');
    sub.unsubscribe();
  });

  it('maps list to stream=list with a list param', async () => {
    const sub = await open({ stream: 'list', list: '42' });
    const url = new URL(lastSocket().url);
    expect(url.searchParams.get('stream')).toBe('list');
    expect(url.searchParams.get('list')).toBe('42');
    sub.unsubscribe();
  });

  it('maps direct to stream=direct', async () => {
    const sub = await open({ stream: 'direct' });
    expect(new URL(lastSocket().url).searchParams.get('stream')).toBe('direct');
    sub.unsubscribe();
  });

  it('omits access_token when not authenticated', async () => {
    auth.logout();
    const sub = await open({ stream: 'user' });
    expect(new URL(lastSocket().url).searchParams.has('access_token')).toBe(false);
    sub.unsubscribe();
  });

  it('decodes the double-encoded JSON payload of update frames', async () => {
    const received: unknown[] = [];
    const sub = streaming.open({ stream: 'user' }).subscribe((ev) => received.push(ev));
    await settle();
    lastSocket().message(frame('update', '{"id":"123","content":"hi"}'));
    expect(received).toEqual([{ event: 'update', payload: { id: '123', content: 'hi' } }]);
    sub.unsubscribe();
  });

  it('passes delete payloads through as bare id strings', async () => {
    const received: unknown[] = [];
    const sub = streaming.open({ stream: 'user' }).subscribe((ev) => received.push(ev));
    await settle();
    lastSocket().message(frame('delete', '123456'));
    expect(received).toEqual([{ event: 'delete', payload: '123456' }]);
    sub.unsubscribe();
  });

  it('drops unknown events (e.g. filters_changed)', async () => {
    const received: unknown[] = [];
    const sub = streaming.open({ stream: 'user' }).subscribe((ev) => received.push(ev));
    await settle();
    lastSocket().message(JSON.stringify({ stream: ['user'], event: 'filters_changed' }));
    expect(received).toEqual([]);
    sub.unsubscribe();
  });

  it('closes the underlying WebSocket on unsubscribe', async () => {
    const sub = await open({ stream: 'user' });
    const socket = lastSocket();
    expect(socket.closed).toBe(false);
    sub.unsubscribe();
    expect(socket.closed).toBe(true);
  });

  it('reconnects after the socket drops', async () => {
    vi.useFakeTimers();
    try {
      const sub = await open({ stream: 'user' });
      expect(FakeWebSocket.instances.length).toBe(1);
      lastSocket().onclose?.();
      vi.advanceTimersByTime(1_000);
      await settle();
      expect(FakeWebSocket.instances.length).toBe(2);
      sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reconnect after unsubscribe', async () => {
    vi.useFakeTimers();
    try {
      const sub = await open({ stream: 'user' });
      lastSocket().onclose?.();
      sub.unsubscribe();
      vi.advanceTimersByTime(60_000);
      await settle();
      expect(FakeWebSocket.instances.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens a fresh WebSocket per subscription', async () => {
    const obs = streaming.open({ stream: 'public' });
    const sub1 = obs.subscribe();
    const sub2 = obs.subscribe();
    await settle();
    expect(FakeWebSocket.instances.length).toBe(2);
    sub1.unsubscribe();
    sub2.unsubscribe();
  });
});
