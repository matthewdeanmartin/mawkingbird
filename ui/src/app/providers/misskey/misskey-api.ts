import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { Auth } from '../../auth';
import { externalFetch } from '../external-fetch';
import { misskeyIdentity } from './misskey-identity-store';
import {
  MK_TIMELINE_ENDPOINTS,
  MkErrorBody,
  MkMeta,
  MkMiAuthCheck,
  MkNote,
  MkTimeline,
  MkUserDetailed,
} from './misskey-types';

/** A Misskey API failure, carrying the server's own error code when it sent one. */
export class MisskeyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** e.g. `NO_SUCH_NOTE`, `CREDENTIAL_REQUIRED`, `RATE_LIMIT_EXCEEDED`. */
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'MisskeyApiError';
  }

  /** The token was revoked or expired: the reader must sign in again. */
  get signInRequired(): boolean {
    return (
      this.status === 401 ||
      this.code === 'CREDENTIAL_REQUIRED' ||
      this.code === 'AUTHENTICATION_FAILED'
    );
  }
}

function toMisskeyError(err: unknown): MisskeyApiError {
  if (err instanceof MisskeyApiError) return err;
  if (err instanceof HttpErrorResponse) {
    const body = err.error as MkErrorBody | null;
    const code = typeof body?.error?.code === 'string' ? body.error.code : null;
    const message =
      err.status === 0
        ? 'Could not reach the Misskey server (network request failed).'
        : `Misskey request failed (HTTP ${err.status}${code ? `; ${code}` : ''}).`;
    return new MisskeyApiError(message, err.status, code);
  }
  return new MisskeyApiError(
    err instanceof Error ? err.message : 'Misskey request failed.',
    0,
    null,
  );
}

/**
 * The Misskey HTTP API: every endpoint is `POST /api/<name>` with a JSON body.
 *
 * Calls go from the browser straight to the reader's server. Misskey answers
 * `/api` with `Access-Control-Allow-Origin: *`, so no CORS proxy and never the
 * Mawkingbird Plus proxy. `externalFetch()` keeps the Mastodon auth and server
 * interceptors off these requests, so a Mastodon token can never leak to a
 * Misskey host.
 *
 * The token travels in the body as `i`, which every Misskey version accepts.
 *
 * Signed calls act as *this tab's* identity (`Auth.activeMisskeyKey`), not the
 * shared active pointer in localStorage: another tab switching accounts must
 * not change who this tab reads (or, later, writes) as.
 */
@Injectable({ providedIn: 'root' })
export class MisskeyApi {
  private http = inject(HttpClient);
  private auth = inject(Auth);

  /** Call `endpoint` on `server` with an explicit token (or none). */
  call<T>(
    server: string,
    endpoint: string,
    body: object = {},
    token: string | null = null,
  ): Observable<T> {
    const payload = token ? { ...body, i: token } : body;
    return this.http
      .post<T>(`${server}/api/${endpoint}`, payload, { context: externalFetch() })
      .pipe(catchError((err: unknown) => throwError(() => toMisskeyError(err))));
  }

  /** Call `endpoint` as the active (or named) Misskey identity. */
  private signed<T>(endpoint: string, body: object = {}, identityKey?: string): Observable<T> {
    const key = identityKey ?? this.auth.activeMisskeyKey();
    const identity = key ? misskeyIdentity(key) : null;
    if (!identity) {
      return throwError(
        () => new MisskeyApiError('Not signed in to Misskey.', 401, 'CREDENTIAL_REQUIRED'),
      );
    }
    return this.call<T>(identity.profile.server, endpoint, body, identity.credentials.token);
  }

  /** Public server information; no token. Also how a server is recognised as Misskey. */
  meta(server: string): Observable<MkMeta> {
    return this.call<MkMeta>(server, 'meta', { detail: false });
  }

  /** Exchange a completed MiAuth session for a token. Single use. */
  miauthCheck(server: string, session: string): Observable<MkMiAuthCheck> {
    return this.http
      .post<MkMiAuthCheck>(
        `${server}/api/miauth/${encodeURIComponent(session)}/check`,
        {},
        {
          context: externalFetch(),
        },
      )
      .pipe(catchError((err: unknown) => throwError(() => toMisskeyError(err))));
  }

  /** The signed-in account. */
  i(): Observable<MkUserDetailed> {
    return this.signed<MkUserDetailed>('i');
  }

  /** One page of a timeline, newest first; `untilId` pages backwards. */
  timeline(timeline: MkTimeline, untilId: string | null, limit = 20): Observable<MkNote[]> {
    return this.signed<MkNote[]>(MK_TIMELINE_ENDPOINTS[timeline], {
      limit,
      ...(untilId ? { untilId } : {}),
    });
  }

  note(noteId: string): Observable<MkNote> {
    return this.signed<MkNote>('notes/show', { noteId });
  }

  /** The notes this one replies to, nearest parent first. */
  conversation(noteId: string, limit = 30): Observable<MkNote[]> {
    return this.signed<MkNote[]>('notes/conversation', { noteId, limit });
  }

  /**
   * Translate a note with the server's own translator (the admin's DeepL key).
   *
   * DeepL detects the source language itself, so no source is sent. The
   * server joins a content warning and the body as `cw + '
-----
' + text`
   * and translates them as one string. Resolves to null when the note has no
   * text (the server answers 204). Fails with code `UNAVAILABLE` when the
   * server has no translator or the reader's role may not use it.
   */
  translate(
    noteId: string,
    targetLang: string,
  ): Observable<{ sourceLang: string; text: string } | null> {
    return this.signed<{ sourceLang: string; text: string } | null>('notes/translate', {
      noteId,
      targetLang,
    });
  }

  /** Direct replies to this note, plus quotes of it (Misskey counts both as children). */
  children(noteId: string, limit = 30): Observable<MkNote[]> {
    return this.signed<MkNote[]>('notes/children', { noteId, limit });
  }
}
