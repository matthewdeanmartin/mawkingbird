import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { MkNote, MkTimeline } from './misskey-types';

/** Misskey's streaming channel for each timeline. */
export const MK_STREAM_CHANNELS: Record<MkTimeline, string> = {
  home: 'homeTimeline',
  social: 'hybridTimeline',
  local: 'localTimeline',
  global: 'globalTimeline',
};

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 5 * 60_000;
/** A socket that stayed up this long resets the backoff. */
const STABLE_MS = 60_000;

/** The `wss://<host>/streaming` URL for a server origin, with the token if there is one. */
export function misskeyStreamUrl(server: string, token: string | null): string {
  const url = new URL('/streaming', server);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  if (token) url.searchParams.set('i', token);
  return url.href;
}

/**
 * Misskey streaming: new notes on one timeline as they are posted.
 *
 * One WebSocket per subscription, straight to the reader's server (Misskey
 * takes the token as `?i=`; the visitor connects without one, which Misskey
 * allows for the Local and Global channels unless the admin turned them off).
 * Reconnects with doubling backoff; unsubscribing closes the socket.
 */
@Injectable({ providedIn: 'root' })
export class MisskeyStreaming {
  /** Overridable in tests. */
  socketFactory: (url: string) => WebSocket = (url) => new WebSocket(url);

  notes(server: string, token: string | null, timeline: MkTimeline): Observable<MkNote> {
    return new Observable<MkNote>((subscriber) => {
      let socket: WebSocket | null = null;
      let retryMs = INITIAL_RETRY_MS;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let openedAt = 0;
      let closed = false;
      const channelId = `mb-${Math.random().toString(36).slice(2)}`;

      const connect = (): void => {
        if (closed) return;
        try {
          socket = this.socketFactory(misskeyStreamUrl(server, token));
        } catch {
          scheduleRetry();
          return;
        }
        socket.onopen = () => {
          openedAt = Date.now();
          socket?.send(
            JSON.stringify({
              type: 'connect',
              body: { channel: MK_STREAM_CHANNELS[timeline], id: channelId, params: {} },
            }),
          );
        };
        socket.onmessage = (message: MessageEvent) => {
          try {
            const frame = JSON.parse(String(message.data)) as {
              type?: string;
              body?: { id?: string; type?: string; body?: unknown };
            };
            if (
              frame.type === 'channel' &&
              frame.body?.id === channelId &&
              frame.body.type === 'note' &&
              frame.body.body
            ) {
              subscriber.next(frame.body.body as MkNote);
            }
          } catch {
            // Not a frame we understand; ignore it.
          }
        };
        socket.onclose = () => {
          socket = null;
          if (closed) return;
          if (openedAt && Date.now() - openedAt >= STABLE_MS) retryMs = INITIAL_RETRY_MS;
          openedAt = 0;
          scheduleRetry();
        };
      };

      const scheduleRetry = (): void => {
        if (closed) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      };

      connect();
      return () => {
        closed = true;
        clearTimeout(retryTimer);
        if (socket) {
          socket.onclose = null;
          socket.close();
        }
      };
    });
  }
}
