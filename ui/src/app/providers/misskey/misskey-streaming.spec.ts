import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MisskeyStreaming, misskeyStreamUrl } from './misskey-streaming';
import { MkNote } from './misskey-types';

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((message: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
}

describe('MisskeyStreaming (M3 live updates)', () => {
  let streaming: MisskeyStreaming;
  let sockets: FakeSocket[];

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    streaming = TestBed.inject(MisskeyStreaming);
    streaming.socketFactory = (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    };
  });

  afterEach(() => vi.useRealTimers());

  it('builds the streaming URL, with the token only when there is one', () => {
    expect(misskeyStreamUrl('https://misskey.io', 'tok')).toBe('wss://misskey.io/streaming?i=tok');
    expect(misskeyStreamUrl('https://misskey.io', null)).toBe('wss://misskey.io/streaming');
  });

  it("connects to the timeline's channel and passes on its notes only", () => {
    const notes: MkNote[] = [];
    const sub = streaming
      .notes('https://misskey.io', null, 'local')
      .subscribe((n) => notes.push(n));
    const socket = sockets[0];
    socket.onopen?.();
    const connect = JSON.parse(socket.sent[0]) as { body: { channel: string; id: string } };
    expect(connect.body.channel).toBe('localTimeline');
    const note = { id: 'n1' } as MkNote;
    socket.receive({ type: 'channel', body: { id: connect.body.id, type: 'note', body: note } });
    socket.receive({ type: 'channel', body: { id: 'someone-else', type: 'note', body: note } });
    socket.receive({ type: 'noteUpdated', body: {} });
    expect(notes).toEqual([note]);
    sub.unsubscribe();
    expect(socket.closed).toBe(true);
  });

  it('reconnects after the socket drops, backing off, and stops when unsubscribed', () => {
    const sub = streaming.notes('https://misskey.io', 'tok', 'home').subscribe();
    sockets[0].onclose?.();
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    sockets[1].onclose?.();
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(3);
    sub.unsubscribe();
    sockets[2].onclose?.();
    vi.advanceTimersByTime(10 * 60_000);
    expect(sockets).toHaveLength(3);
  });
});
