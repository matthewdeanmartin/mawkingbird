import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { Auth } from '../session/auth';
import { DiagnosticLog } from '../diagnostics/diagnostic-log';
import { Server } from '../http/server';
import { serverRole } from '../http/server-role';

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

/**
 * Where one stream's connection stands, for pages that show it (chat's Live
 * indicator) or fall back to polling while it is not `live`.
 *
 * - `connecting`: a socket is being opened (first time or after a drop).
 * - `live`: the socket is open; events arrive as they happen.
 * - `down`: the socket closed or is paused after failed handshakes; a retry is scheduled.
 * - `unavailable`: the server has no streaming at all; nothing will connect.
 */
export type StreamState = 'connecting' | 'live' | 'down' | 'unavailable';

/**
 * What one stream knows about its connection, for a "why is it not live" panel.
 * Browsers hide WebSocket failure details on purpose (no status code, no
 * message), so the close code and reason are the most a page can show.
 */
export interface StreamDiagnostics {
  /** The streaming server tried, host only (no token). */
  server: string | null;
  /** Failed attempts since the stream was last live. */
  failures: number;
  /** The last close: 1006 means the connection failed or dropped without a reason. */
  lastClose: { code: number; reason: string; at: number } | null;
  /** When the next attempt is scheduled, if one is. */
  nextAttemptAt: number | null;
  /** Live updates for this server are paused after repeated failed handshakes. */
  pausedUntil: number | null;
  /** The server could not be asked where it streams, so its own host was tried. */
  discoveryFailed: boolean;
  /** The server says it has no streaming at all. */
  noStreaming: boolean;
}

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

function hostOf(url: string): string | null {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
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
  /** Instances whose streaming URL could not be discovered (their own host is tried). */
  private discoveryFailed = new Set<string>();

  /**
   * Forget the backoff and any pause for the current server, so the next
   * attempt happens as soon as a stream is (re)opened. For "Reconnect now".
   */
  retryNow(): void {
    const instance = this.server.baseUrl();
    this.pausedUntil.delete(instance);
    this.handshakeFailures.delete(instance);
    if (this.discoveryFailed.has(instance)) {
      this.baseCache.delete(instance);
      this.baseRetryAt.delete(instance);
    }
  }

  open(
    kind: StreamKind,
    onState?: (state: StreamState, diagnostics: StreamDiagnostics) => void,
  ): Observable<StreamEvent> {
    return new Observable<StreamEvent>((subscriber) => {
      let socket: WebSocket | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let retryMs = INITIAL_RETRY_MS;
      let closed = false;
      let openedAt: number | null = null;
      const diagnostics: StreamDiagnostics = {
        server: null,
        failures: 0,
        lastClose: null,
        nextAttemptAt: null,
        pausedUntil: null,
        discoveryFailed: false,
        noStreaming: false,
      };
      const report = (state: StreamState, instance: string) => {
        const paused = this.pausedUntil.get(instance) ?? 0;
        onState?.(state, {
          ...diagnostics,
          pausedUntil: paused > Date.now() ? paused : null,
          discoveryFailed: this.discoveryFailed.has(instance),
        });
      };
      const retryIn = (ms: number) => {
        diagnostics.nextAttemptAt = Date.now() + ms;
        retryTimer = setTimeout(() => void connect(), ms);
      };

      const connect = async () => {
        const instance = this.server.baseUrl();
        diagnostics.nextAttemptAt = null;
        const base = await this.streamingBase();
        // No streaming on this server: stay subscribed but silent. Pages keep
        // their normal refresh; nothing ever connects or retries.
        if (closed) {
          return;
        }
        if (base === null) {
          diagnostics.noStreaming = true;
          report('unavailable', instance);
          return;
        }
        diagnostics.server = hostOf(base);
        const pausedMs = (this.pausedUntil.get(instance) ?? 0) - Date.now();
        if (pausedMs > 0) {
          retryIn(pausedMs);
          report('down', instance);
          return;
        }
        report('connecting', instance);
        socket = new WebSocket(this.buildUrl(base, kind));
        openedAt = null;
        socket.onopen = () => {
          openedAt = Date.now();
          this.handshakeFailures.delete(instance);
          diagnostics.failures = 0;
          report('live', instance);
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
        socket.onclose = (event?: CloseEvent) => {
          if (closed) {
            return;
          }
          diagnostics.failures += 1;
          // 1006 is what a browser reports for a socket that failed without a close frame.
          diagnostics.lastClose = {
            code: event?.code ?? 1006,
            reason: event?.reason ?? '',
            at: Date.now(),
          };
          if (openedAt === null) {
            this.noteHandshakeFailure(instance);
          }
          const pausedMs = (this.pausedUntil.get(instance) ?? 0) - Date.now();
          if (pausedMs > 0) {
            retryIn(pausedMs);
            report('down', instance);
            return;
          }
          // A handshake followed by immediate rejection is still a failure.
          if (openedAt !== null && Date.now() - openedAt >= STABLE_CONNECTION_MS) {
            retryMs = INITIAL_RETRY_MS;
          }
          retryIn(retryMs);
          retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
          report('down', instance);
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
    const resolved = this.resolveBase(instance).then(
      (base) => {
        this.discoveryFailed.delete(instance);
        return base;
      },
      () => {
        // Reconnects share the fallback during an outage instead of rediscovering
        // the instance on every attempt. Retry discovery after the cooldown.
        this.baseRetryAt.set(instance, Date.now() + MAX_RETRY_MS);
        this.discoveryFailed.add(instance);
        return toWs(instance || location.origin);
      },
    );
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
