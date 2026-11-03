import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { BlueskyApi } from './bluesky-api';
import { detectFacets } from './bluesky-facets';
import { BlueskySession } from './bluesky-session';
import { BlueskyPds } from './bluesky-pds';
import {
  BskyAllowIncoming,
  BskyConvoView,
  BskyChatLogEntry,
  BskyConvoList,
  BskyMessageView,
} from './bluesky-types';
import { IndicatorEvents } from '../../indicator-events';

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

const DECLARATION = 'chat.bsky.actor.declaration';

/** The XRPC error name in a failed response body, such as `ReactionLimitReached`. */
export function xrpcErrorCode(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) {
    return '';
  }
  return (err.error as { error?: string } | null)?.error ?? '';
}

/** DM client: `chat.bsky.convo.*` proxied through the linked account's PDS. */
@Injectable({ providedIn: 'root' })
export class BlueskyChatApi {
  private indicatorEvents = inject(IndicatorEvents);
  private api = inject(BlueskyApi);
  private session = inject(BlueskySession);
  private pdsResolver = inject(BlueskyPds);

  getConvoForMembers(did: string): Observable<{ convo: BskyConvoView }> {
    return this.chatGet(
      'chat.bsky.convo.getConvoForMembers',
      new HttpParams().append('members', did),
    );
  }

  /**
   * Without `status` the chat service returns accepted chats and message
   * requests together, each marked by `convo.status`; the page splits them.
   */
  listConvos(cursor?: string, status?: 'request' | 'accepted'): Observable<BskyConvoList> {
    let params = new HttpParams().set('limit', '50');
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    if (status) {
      params = params.set('status', status);
    }
    const did = this.session.session()?.did;
    return this.chatGet<BskyConvoList>('chat.bsky.convo.listConvos', params).pipe(
      tap((page) => {
        if (!did || did !== this.session.session()?.did) return;
        for (const row of page.convos) {
          if (!row.lastMessage) continue;
          this.indicatorEvents.received.next({
            did,
            id: `bsky-dm:${did}:${row.id}:${row.lastMessage.id}`,
            group: `bsky-conversation:${did}:${row.id}`,
            lane: 'chat',
            at: row.lastMessage.sentAt,
            unread: !!row.unreadCount && !row.muted && row.lastMessage.sender.did !== did,
          });
        }
      }),
    );
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

  /** Move a message request into your chats. Replying to it does the same. */
  acceptConvo(convoId: string): Observable<unknown> {
    return this.chatPost('chat.bsky.convo.acceptConvo', { convoId });
  }

  /** Drop a chat (or decline a request); it returns if the other side writes again. */
  leaveConvo(convoId: string): Observable<unknown> {
    return this.chatPost('chat.bsky.convo.leaveConvo', { convoId });
  }

  /** Silence (or restore) notifications for one chat; shown by `convo.muted`. */
  setConvoMuted(convoId: string, muted: boolean): Observable<{ convo: BskyConvoView }> {
    return this.chatPost(muted ? 'chat.bsky.convo.muteConvo' : 'chat.bsky.convo.unmuteConvo', {
      convoId,
    });
  }

  /** Add or remove one emoji reaction; the answer is the updated message. */
  setReaction(
    convoId: string,
    messageId: string,
    value: string,
    on: boolean,
  ): Observable<{ message: BskyMessageView }> {
    return this.chatPost(on ? 'chat.bsky.convo.addReaction' : 'chat.bsky.convo.removeReaction', {
      convoId,
      messageId,
      value,
    });
  }

  /** Hide a message from your own view only; the other side keeps their copy. */
  deleteMessageForSelf(convoId: string, messageId: string): Observable<BskyMessageView> {
    return this.chatPost('chat.bsky.convo.deleteMessageForSelf', { convoId, messageId });
  }

  /**
   * Who may start a chat with you. The declaration is an ordinary record in the
   * account's own repo, so it is read and written without the chat proxy; a
   * missing record means Bluesky's default, people you follow.
   */
  getAllowIncoming(): Observable<BskyAllowIncoming> {
    const params = new HttpParams()
      .set('repo', this.session.session()?.did ?? '')
      .set('collection', DECLARATION)
      .set('rkey', 'self');
    return this.api
      .get<{ value?: { allowIncoming?: BskyAllowIncoming } }>('com.atproto.repo.getRecord', params)
      .pipe(
        map((record) => record.value?.allowIncoming ?? 'following'),
        catchError((error: unknown) =>
          xrpcErrorCode(error) === 'RecordNotFound'
            ? of('following' as const)
            : throwError(() => error),
        ),
      );
  }

  setAllowIncoming(allowIncoming: BskyAllowIncoming): Observable<unknown> {
    return this.api.request('com.atproto.repo.putRecord', {
      repo: this.session.session()?.did ?? '',
      collection: DECLARATION,
      rkey: 'self',
      record: { $type: DECLARATION, allowIncoming },
    });
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

  /** The account's real PDS host; see {@link BlueskyPds}. */
  private pds(): Observable<string> {
    return this.pdsResolver.resolve();
  }
}
