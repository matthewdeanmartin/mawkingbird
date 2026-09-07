import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { Auth } from './auth';
import { Server } from './server';
import { serverRole } from './server-role';

/** A parsed event from a Mastodon streaming WebSocket. */
export interface StreamEvent {
  event: string;
  payload: unknown;
}

export type StreamKind =
  | { stream: 'user' }
  | { stream: 'public'; local?: boolean }
  | { stream: 'hashtag'; tag: string; local?: boolean }
  | { stream: 'list'; list: string }
  | { stream: 'direct' };

/** Events forwarded to subscribers; anything else (e.g. `filters_changed`) is dropped. */
const FORWARDED = new Set(['update', 'status_update', 'delete', 'notification', 'conversation']);

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/** One WS frame of Mastodon's multiplexed stream; `payload` is a JSON-encoded string. */
interface WsFrame {
  event: string;
  payload?: string;
}

function toWs(httpUrl: string): string {
  return httpUrl.replace(/^http/i, 'ws');
}

/**
 * Mastodon streaming over WebSocket (`wss://…/api/v1/streaming?stream=…`), the only
 * transport real instances still support (the HTTP/SSE endpoints were removed in
 * Mastodon 4.2). The mock serves the same multiplexed WS API, so this single code
 * path works against both. The access token travels as a query param because the
 * browser WebSocket API cannot set an `Authorization` header (see
 * mastodon_mock/routers/streaming.py's `_account_from_query_token`).
 */
@Injectable({ providedIn: 'root' })
export class Streaming {
  private auth = inject(Auth);
  private server = inject(Server);
  private http = inject(HttpClient);

  /** Resolved wss:// base per instance, so `/api/v2/instance` is fetched at most once. */
  private baseCache = new Map<string, Promise<string>>();

  open(kind: StreamKind): Observable<StreamEvent> {
    return new Observable<StreamEvent>((subscriber) => {
      let socket: WebSocket | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let retryMs = INITIAL_RETRY_MS;
      let closed = false;

      const connect = async () => {
        const base = await this.streamingBase();
        if (closed) {
          return;
        }
        socket = new WebSocket(this.buildUrl(base, kind));
        socket.onopen = () => {
          retryMs = INITIAL_RETRY_MS;
        };
        socket.onmessage = (ev: MessageEvent<string>) => {
          const frame = JSON.parse(ev.data) as WsFrame;
          if (!FORWARDED.has(frame.event) || frame.payload === undefined) {
            return;
          }
          // `delete` payloads are bare status-id strings, not JSON — JSON.parse would
          // silently coerce a numeric-looking id (e.g. "123") to a number.
          const payload: unknown =
            frame.event === 'delete' ? frame.payload : JSON.parse(frame.payload);
          subscriber.next({ event: frame.event, payload });
        };
        // Unlike EventSource, a WebSocket never reconnects itself.
        socket.onclose = () => {
          if (closed) {
            return;
          }
          retryTimer = setTimeout(() => void connect(), retryMs);
          retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
        };
      };
      void connect();

      return () => {
        closed = true;
        if (retryTimer) {
          clearTimeout(retryTimer);
        }
        socket?.close();
      };
    });
  }

  /**
   * The `wss://…` origin to stream from. Real instances often host streaming on a
   * separate subdomain (mastodon.social uses wss://streaming.mastodon.social), so it
   * is discovered from `configuration.urls.streaming` in `GET /api/v2/instance`.
   */
  private streamingBase(): Promise<string> {
    const instance = this.server.baseUrl();
    const cached = this.baseCache.get(instance);
    if (cached) {
      return cached;
    }
    const resolved = this.resolveBase(instance).catch(() => {
      // Don't pin a transient failure; fall back to the API host for this attempt.
      this.baseCache.delete(instance);
      return toWs(instance || location.origin);
    });
    this.baseCache.set(instance, resolved);
    return resolved;
  }

  private async resolveBase(instance: string): Promise<string> {
    if (instance === '') {
      // The mock serves its WebSocket on the UI's own origin; its instance payload
      // advertises the *configured* domain, which the browser may not reach.
      return toWs(location.origin);
    }
    // Background: discovering the streaming URL is an optimisation. Failing it
    // costs live updates, not the app, so it must never raise the fail whale.
    const info = await firstValueFrom(
      this.http.get<{ configuration?: { urls?: { streaming?: string | null } } }>(
        '/api/v2/instance',
        { context: serverRole('background') },
      ),
    );
    const advertised = info.configuration?.urls?.streaming;
    return advertised ? advertised.replace(/\/+$/, '') : toWs(instance);
  }

  private buildUrl(base: string, kind: StreamKind): string {
    const params = new URLSearchParams();
    const token = this.auth.token();
    if (token) {
      params.set('access_token', token);
    }
    params.set(
      'stream',
      kind.stream === 'hashtag' && kind.local ? 'hashtag:local' : this.streamParam(kind),
    );
    if (kind.stream === 'hashtag') {
      params.set('tag', kind.tag);
    }
    if (kind.stream === 'list') {
      params.set('list', kind.list);
    }
    return `${base}/api/v1/streaming?${params.toString()}`;
  }

  private streamParam(kind: StreamKind): string {
    switch (kind.stream) {
      case 'user':
        return 'user';
      case 'public':
        return kind.local ? 'public:local' : 'public';
      case 'hashtag':
        return 'hashtag';
      case 'list':
        return 'list';
      case 'direct':
        return 'direct';
    }
  }
}
