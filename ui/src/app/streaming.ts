import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { Auth } from './auth';
import { DiagnosticLog } from './diagnostic-log';
import { Server } from './server';
import { serverRole } from './server-role';

/** A parsed event from a Mastodon streaming WebSocket. */
export interface StreamEvent {
  event: string;
  payload: unknown;
}

export type StreamKind =
  | { stream: 'user' }
  | { stream: 'user:notification' }
  | { stream: 'public'; local?: boolean }
  | { stream: 'hashtag'; tag: string; local?: boolean }
  | { stream: 'list'; list: string }
  | { stream: 'direct' };

/** Events forwarded to subscribers; anything else (e.g. `filters_changed`) is dropped. */
const FORWARDED = new Set(['update', 'status_update', 'delete', 'notification', 'conversation']);

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 5 * 60_000;
const STABLE_CONNECTION_MS = 60_000;
/**
 * Handshakes that fail before the socket ever opens, in a row and across all of an
 * instance's streams, before WebSockets pause for that instance. Small servers (e.g.
 * a household board) may simply not implement streaming.
 */
const HANDSHAKE_FAILURE_LIMIT = 3;
/** The pause matches the longest normal backoff, so outages cost no more than before. */
const UNSUPPORTED_PAUSE_MS = MAX_RETRY_MS;
const LOG_AREA = 'Mockingbird Streaming';

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
 *
 * Servers without streaming are left alone: an instance that advertises
 * `configuration.urls.streaming: null` gets no WebSockets at all, and one whose
 * handshakes keep failing is paused (shared by every stream and page). Both
 * decisions log a warning to the console and the diagnostic timeline.
 */
@Injectable({ providedIn: 'root' })
export class Streaming {
  private auth = inject(Auth);
  private server = inject(Server);
  private http = inject(HttpClient);
  private log = inject(DiagnosticLog);

  /**
   * Resolved wss:// base per instance, so `/api/v2/instance` is fetched at most once.
   * `null` means the instance said it has no streaming.
   */
  private baseCache = new Map<string, Promise<string | null>>();
  private baseRetryAt = new Map<string, number>();
  /** Consecutive never-opened handshakes per instance. */
  private handshakeFailures = new Map<string, number>();
  /** Until when WebSockets to an instance are paused after repeated handshake failures. */
  private pausedUntil = new Map<string, number>();

  open(kind: StreamKind): Observable<StreamEvent> {
    return new Observable<StreamEvent>((subscriber) => {
      let socket: WebSocket | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let retryMs = INITIAL_RETRY_MS;
      let closed = false;
      let openedAt: number | null = null;

      const connect = async () => {
        const instance = this.server.baseUrl();
        const base = await this.streamingBase();
        // No streaming on this server: stay subscribed but silent. Pages keep
        // their normal refresh; nothing ever connects or retries.
        if (closed || base === null) {
          return;
        }
        const pausedMs = (this.pausedUntil.get(instance) ?? 0) - Date.now();
        if (pausedMs > 0) {
          retryTimer = setTimeout(() => void connect(), pausedMs);
          return;
        }
        socket = new WebSocket(this.buildUrl(base, kind));
        openedAt = null;
        socket.onopen = () => {
          openedAt = Date.now();
          this.handshakeFailures.delete(instance);
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
          if (openedAt === null) {
            this.noteHandshakeFailure(instance);
          }
          const pausedMs = (this.pausedUntil.get(instance) ?? 0) - Date.now();
          if (pausedMs > 0) {
            retryTimer = setTimeout(() => void connect(), pausedMs);
            return;
          }
          // A handshake followed by immediate rejection is still a failure.
          if (openedAt !== null && Date.now() - openedAt >= STABLE_CONNECTION_MS) {
            retryMs = INITIAL_RETRY_MS;
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
  private streamingBase(): Promise<string | null> {
    const instance = this.server.baseUrl();
    if ((this.baseRetryAt.get(instance) ?? 0) <= Date.now() && this.baseRetryAt.has(instance)) {
      this.baseCache.delete(instance);
      this.baseRetryAt.delete(instance);
    }
    const cached = this.baseCache.get(instance);
    if (cached) {
      return cached;
    }
    const resolved = this.resolveBase(instance).catch(() => {
      // Reconnects share the fallback during an outage instead of rediscovering
      // the instance on every attempt. Retry discovery after the cooldown.
      this.baseRetryAt.set(instance, Date.now() + MAX_RETRY_MS);
      return toWs(instance || location.origin);
    });
    this.baseCache.set(instance, resolved);
    return resolved;
  }

  private async resolveBase(instance: string): Promise<string | null> {
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
    const urls = info.configuration?.urls;
    // An explicit null (or empty) value is the server saying it has no streaming;
    // Elk and other clients open no WebSocket then. A missing key is merely
    // unadvertised, so the instance host is still tried.
    if (urls && 'streaming' in urls && !urls.streaming) {
      this.log.write('warn', LOG_AREA, 'server has no streaming; live updates are off', {
        instance,
        reason: 'configuration.urls.streaming is null in /api/v2/instance',
      });
      return null;
    }
    const advertised = urls?.streaming;
    return advertised ? advertised.replace(/\/+$/, '') : toWs(instance);
  }

  /**
   * Count a handshake that failed before the socket opened. After
   * {@link HANDSHAKE_FAILURE_LIMIT} in a row the instance is paused for every stream,
   * and then probed once: a single further failure pauses it again.
   */
  private noteHandshakeFailure(instance: string): void {
    const failures = (this.handshakeFailures.get(instance) ?? 0) + 1;
    if (failures < HANDSHAKE_FAILURE_LIMIT) {
      this.handshakeFailures.set(instance, failures);
      return;
    }
    this.handshakeFailures.set(instance, HANDSHAKE_FAILURE_LIMIT - 1);
    if ((this.pausedUntil.get(instance) ?? 0) > Date.now()) {
      return; // another stream already paused this instance
    }
    this.pausedUntil.set(instance, Date.now() + UNSUPPORTED_PAUSE_MS);
    this.log.write(
      'warn',
      LOG_AREA,
      'server does not seem to support WebSockets; pausing live updates',
      {
        instance: instance || location.origin,
        failedHandshakes: failures,
        retryInSeconds: UNSUPPORTED_PAUSE_MS / 1000,
      },
    );
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
      case 'user:notification':
        return 'user:notification';
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
