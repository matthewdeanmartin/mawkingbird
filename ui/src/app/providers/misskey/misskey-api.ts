import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, firstValueFrom, map, Observable, throwError } from 'rxjs';
import { Auth } from '../../auth';
import { externalFetch } from '../external-fetch';
import { misskeyIdentity } from './misskey-identity-store';
import {
  MK_SOCIAL_NOTIFICATION_TYPES,
  MK_TIMELINE_ENDPOINTS,
  MkErrorBody,
  MkCreateNote,
  MkDriveFile,
  MkEmoji,
  MkMeta,
  MkMiAuthCheck,
  MkNote,
  MkNotification,
  MkRelation,
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

  /** The token lacks a `write:*` permission: an M1 read-only sign-in. */
  get needsWriteApproval(): boolean {
    return this.status === 403 && this.code === 'PERMISSION_DENIED';
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

  /** The server's custom emoji (public; no token). */
  emojis(server: string): Observable<{ emojis: MkEmoji[] }> {
    return this.call<{ emojis: MkEmoji[] }>(server, 'emojis');
  }

  private readonly noteLengths = new Map<string, Promise<number>>();

  /** The server's note length limit, from `meta`, asked once per server; 3,000 if unknown. */
  maxNoteLength(server: string): Promise<number> {
    let limit = this.noteLengths.get(server);
    if (!limit) {
      limit = firstValueFrom(this.meta(server)).then(
        (meta) => meta.maxNoteTextLength ?? 3000,
        () => 3000,
      );
      this.noteLengths.set(server, limit);
    }
    return limit;
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

  /**
   * One page of the reader's notifications, newest first, social types only.
   * `markAsRead` stays on (Misskey's default), as reading them here is reading them.
   */
  notifications(untilId: string | null, limit = 30): Observable<MkNotification[]> {
    return this.signed<MkNotification[]>('i/notifications', {
      limit,
      includeTypes: [...MK_SOCIAL_NOTIFICATION_TYPES],
      ...(untilId ? { untilId } : {}),
    });
  }

  // ---------------------------------------------------------------- search

  /**
   * Full-text note search. Servers can switch it off, globally or per role;
   * then it fails with code `UNAVAILABLE` ({@link MisskeyApiError.code}).
   */
  searchNotes(query: string, untilId: string | null, limit = 20): Observable<MkNote[]> {
    return this.signed<MkNote[]>('notes/search', { query, limit, ...(untilId ? { untilId } : {}) });
  }

  /** Notes carrying a hashtag (without the #), newest first. */
  notesByTag(tag: string, untilId: string | null, limit = 20): Observable<MkNote[]> {
    return this.signed<MkNote[]>('notes/search-by-tag', {
      tag,
      limit,
      ...(untilId ? { untilId } : {}),
    });
  }

  /** People by name or username, local and remote; paged by offset. */
  searchUsers(query: string, offset = 0, limit = 20): Observable<MkUserDetailed[]> {
    return this.signed<MkUserDetailed[]>('users/search', {
      query,
      offset,
      limit,
      origin: 'combined',
    });
  }

  /** Hashtag names (without #) starting with or containing `query`. */
  searchHashtags(query: string, limit = 20): Observable<string[]> {
    return this.signed<string[]>('hashtags/search', { query, limit });
  }

  /** Trending hashtags on the server, with how many people used each recently. */
  trendingHashtags(): Observable<{ tag: string; usersCount: number }[]> {
    return this.signed<{ tag: string; usersCount: number }[]>('hashtags/trend', {});
  }

  // ---------------------------------------------------------------- writes
  // Each needs a `write:*` permission; a token without it gets HTTP 403
  // `PERMISSION_DENIED`, which {@link MisskeyApiError.needsWriteApproval} names.

  /** Post a note. Returns the created note. */
  createNote(body: MkCreateNote): Observable<MkNote> {
    return this.signed<{ createdNote: MkNote }>('notes/create', body).pipe(
      map((result) => result.createdNote),
    );
  }

  deleteNote(noteId: string): Observable<void> {
    return this.signed<void>('notes/delete', { noteId });
  }

  /** React; one reaction per user per note (unreact first to change it). */
  react(noteId: string, reaction: string): Observable<void> {
    return this.signed<void>('notes/reactions/create', { noteId, reaction });
  }

  unreact(noteId: string): Observable<void> {
    return this.signed<void>('notes/reactions/delete', { noteId });
  }

  /** Remove every renote of this note by the reader. */
  unrenote(noteId: string): Observable<void> {
    return this.signed<void>('notes/unrenote', { noteId });
  }

  vote(noteId: string, choice: number): Observable<void> {
    return this.signed<void>('notes/polls/vote', { noteId, choice });
  }

  /** Upload one file straight to the reader's Drive (never through a proxy). */
  uploadFile(
    file: File,
    options: { comment?: string; isSensitive?: boolean } = {},
  ): Observable<MkDriveFile> {
    const key = this.auth.activeMisskeyKey();
    const identity = key ? misskeyIdentity(key) : null;
    if (!identity) {
      return throwError(
        () => new MisskeyApiError('Not signed in to Misskey.', 401, 'CREDENTIAL_REQUIRED'),
      );
    }
    const form = new FormData();
    form.append('i', identity.credentials.token);
    form.append('file', file, file.name);
    if (options.comment) form.append('comment', options.comment);
    if (options.isSensitive) form.append('isSensitive', 'true');
    return this.http
      .post<MkDriveFile>(`${identity.profile.server}/api/drive/files/create`, form, {
        context: externalFetch(),
      })
      .pipe(catchError((err: unknown) => throwError(() => toMisskeyError(err))));
  }

  /** The reader's relationship to these users. */
  relation(userId: string): Observable<MkRelation> {
    return this.signed<MkRelation>('users/relation', { userId });
  }

  follow(userId: string): Observable<unknown> {
    return this.signed<unknown>('following/create', { userId });
  }

  unfollow(userId: string): Observable<unknown> {
    return this.signed<unknown>('following/delete', { userId });
  }

  /** Withdraw a follow request the reader sent to a locked account. */
  cancelFollowRequest(userId: string): Observable<unknown> {
    return this.signed<unknown>('following/requests/cancel', { userId });
  }

  acceptFollowRequest(userId: string): Observable<void> {
    return this.signed<void>('following/requests/accept', { userId });
  }

  rejectFollowRequest(userId: string): Observable<void> {
    return this.signed<void>('following/requests/reject', { userId });
  }

  mute(userId: string): Observable<void> {
    return this.signed<void>('mute/create', { userId });
  }

  unmute(userId: string): Observable<void> {
    return this.signed<void>('mute/delete', { userId });
  }

  block(userId: string): Observable<unknown> {
    return this.signed<unknown>('blocking/create', { userId });
  }

  unblock(userId: string): Observable<unknown> {
    return this.signed<unknown>('blocking/delete', { userId });
  }

  /** A user's profile, by id or by `username` + `host` (null host = this server). */
  user(
    query: { userId: string } | { username: string; host: string | null },
  ): Observable<MkUserDetailed> {
    return this.signed<MkUserDetailed>('users/show', query);
  }

  /** One page of a user's notes, newest first; renotes in, replies out unless asked. */
  userNotes(
    userId: string,
    untilId: string | null,
    options: { withReplies?: boolean; withRenotes?: boolean; limit?: number } = {},
  ): Observable<MkNote[]> {
    return this.signed<MkNote[]>('users/notes', {
      userId,
      limit: options.limit ?? 20,
      withReplies: options.withReplies ?? false,
      withRenotes: options.withRenotes ?? true,
      ...(untilId ? { untilId } : {}),
    });
  }

  /** Direct replies to this note, plus quotes of it (Misskey counts both as children). */
  children(noteId: string, limit = 30): Observable<MkNote[]> {
    return this.signed<MkNote[]>('notes/children', { noteId, limit });
  }
}
