import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, of, switchMap, tap } from 'rxjs';
import { externalFetch } from '../external-fetch';
import { BlueskyApi } from './bluesky-api';
import { detectFacets } from './bluesky-facets';
import { BlueskySession } from './bluesky-session';
import { BskyChatLogEntry, BskyConvoList, BskyMessageView } from './bluesky-types';

/**
 * Bluesky DMs live on a central chat service, not the PDS: requests go to the
 * PDS which proxies them onward when this header names the chat appview.
 */
const CHAT_PROXY = { 'atproto-proxy': 'did:web:api.bsky.chat#bsky_chat' };

/**
 * Chat endpoints need an app password created with "Allow access to your
 * direct messages" checked; sessions from any other app password get a
 * Bad token scope error, which the UI turns into a relink hint.
 */
export function isChatScopeError(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse)) {
    return false;
  }
  const message = (err.error as { message?: string } | null)?.message ?? '';
  return err.status === 401 || /token scope/i.test(message);
}

interface DidDocument {
  service?: { id: string; type: string; serviceEndpoint: string }[];
}

/** DM client: `chat.bsky.convo.*` proxied through the linked account's PDS. */
@Injectable({ providedIn: 'root' })
export class BlueskyChatApi {
  private http = inject(HttpClient);
  private api = inject(BlueskyApi);
  private session = inject(BlueskySession);

  listConvos(cursor?: string): Observable<BskyConvoList> {
    let params = new HttpParams().set('limit', '50');
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.chatGet<BskyConvoList>('chat.bsky.convo.listConvos', params);
  }

  /** Newest-first page of messages; callers reverse for chat order. */
  getMessages(
    convoId: string,
    cursor?: string,
  ): Observable<{ messages: BskyMessageView[]; cursor?: string }> {
    let params = new HttpParams().set('convoId', convoId).set('limit', '50');
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.chatGet<{ messages: BskyMessageView[]; cursor?: string }>(
      'chat.bsky.convo.getMessages',
      params,
    );
  }

  /** Send a text message; links and @mentions become facets like replies do. */
  sendMessage(convoId: string, text: string): Observable<BskyMessageView> {
    return detectFacets(text, (handle) => this.api.resolveHandle(handle)).pipe(
      switchMap((facets) =>
        this.chatPost<BskyMessageView>('chat.bsky.convo.sendMessage', {
          convoId,
          message: { text, ...(facets.length ? { facets } : {}) },
        }),
      ),
    );
  }

  updateRead(convoId: string, messageId: string): Observable<unknown> {
    return this.chatPost('chat.bsky.convo.updateRead', { convoId, messageId });
  }

  /** Everything that happened across all convos since `cursor` (for polling). */
  getLog(cursor?: string): Observable<{ logs: BskyChatLogEntry[]; cursor?: string }> {
    let params = new HttpParams();
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.chatGet<{ logs: BskyChatLogEntry[]; cursor?: string }>(
      'chat.bsky.convo.getLog',
      params,
    );
  }

  private chatGet<T>(nsid: string, params: HttpParams): Observable<T> {
    return this.pds().pipe(switchMap((pds) => this.api.get<T>(nsid, params, CHAT_PROXY, pds)));
  }

  private chatPost<T>(nsid: string, body: unknown): Observable<T> {
    return this.pds().pipe(switchMap((pds) => this.api.request<T>(nsid, body, CHAT_PROXY, pds)));
  }

  /**
   * The account's real PDS host. Proxied chat calls 501 on the bsky.social
   * entryway, so the DID document's #atproto_pds endpoint is resolved once
   * and remembered on the session.
   */
  private pds(): Observable<string> {
    const session = this.session.session();
    if (!session) {
      return of(''); // BlueskyApi raises the "not linked" error downstream
    }
    if (session.pdsUrl) {
      return of(session.pdsUrl);
    }
    if (!session.did.startsWith('did:plc:')) {
      return of(session.service); // did:web etc. — let the entryway try
    }
    return this.http
      .get<DidDocument>(`https://plc.directory/${session.did}`, { context: externalFetch() })
      .pipe(
        map(
          (doc) =>
            doc.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint ?? session.service,
        ),
        tap((url) => this.session.setPdsUrl(url)),
      );
  }
}
