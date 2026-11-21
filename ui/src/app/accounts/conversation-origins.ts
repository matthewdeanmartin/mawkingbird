import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable, map } from 'rxjs';
import { adaptPost } from '../connections/bluesky/bluesky-adapter';
import { BlueskyApi } from '../connections/bluesky/bluesky-api';
import { BskyRef } from '../connections/bluesky/bluesky-types';
import { MisskeyRef } from '../connections/misskey/misskey-adapter';
import { MisskeyApi } from '../connections/misskey/misskey-api';
import { Api } from '../platform/api/api';
import { Status } from '../platform/api/models';
import { accountScopeSuffix } from '../platform/session/account-scope';
import { hasHashtags, isMyQuietConversation } from './reply-guys-model';
import { ReplyGuys } from './reply-guys';

/**
 * Reply-guy controls: did this post *start* something with the reader?
 *
 * A notification only carries the reply, not the conversation around it, so
 * this answers the question reply-guys-model.ts asks of a thread: is the
 * stranger replying in a conversation the reader began without a hashtag
 * (uninvited), or in a thread the reader joined or tagged (the mosh pit)?
 *
 * - A fresh mention, or a quote, that is nobody's reply: uninvited. A quote of
 *   one of the reader's own tagged posts is the exception: they asked for it.
 * - A reply: answered from its conversation's root. Bluesky names the root's
 *   author in every reply, so someone else's thread costs nothing; otherwise
 *   one lookup per post (Mastodon `/context`, Misskey `notes/conversation`).
 *
 * Callers ask only about strangers, so lookups stay few. Until an answer
 * arrives, or if it can't be had, the post is treated as the mosh pit: shown,
 * never guarded or hidden. The default protection is a click, and a missing
 * click costs less than hiding a reply the reader invited.
 */
@Injectable({ providedIn: 'root' })
export class ConversationOrigins {
  private api = inject(Api);
  private bluesky = inject(BlueskyApi);
  private misskey = inject(MisskeyApi);
  private replyGuys = inject(ReplyGuys);

  /** status id → the stranger started this (true) or joined the reader's crowd (false). */
  private answers = signal<ReadonlyMap<string, boolean>>(new Map());
  private asked = new Set<string>();
  private scope = accountScopeSuffix();

  /** True for uninvited; false for the mosh pit; null while it is being looked up. */
  unsolicited(status: Status | null | undefined): boolean | null {
    if (!status) return true;
    if (!status.in_reply_to_id) {
      const quoted = status.quote?.quoted_status;
      if (quoted && this.replyGuys.isSelf(quoted.account)) return !hasHashtags(quoted);
      return true;
    }
    const known = this.answers().get(status.id);
    if (known !== undefined) return known;
    if (status.provider === 'bluesky') {
      const rootUri = (status.providerRef as BskyRef | undefined)?.replyRoot?.uri;
      const did = rootUri?.split('/')[2];
      // Somebody else's thread: no lookup needed.
      if (!did || !this.replyGuys.isSelf({ id: `bsky:${did}` })) return false;
    }
    this.lookup(status);
    return null;
  }

  private lookup(status: Status): void {
    const scope = accountScopeSuffix();
    if (scope !== this.scope) {
      this.scope = scope;
      this.asked.clear();
      this.answers.set(new Map());
    }
    if (this.asked.has(status.id)) return;
    this.asked.add(status.id);
    const id = status.id;
    void firstValueFrom(this.rootIsQuiet(status))
      .catch(() => false)
      .then((quiet) => {
        if (scope !== this.scope) return;
        this.answers.update((all) => new Map(all).set(id, quiet));
      });
  }

  /** Whether the conversation's root is the reader's own, untagged post. */
  private rootIsQuiet(status: Status): Observable<boolean> {
    const isMine = (post: Status): boolean => this.replyGuys.isSelf(post.account);
    if (status.provider === 'bluesky') {
      const rootUri = (status.providerRef as BskyRef).replyRoot.uri;
      return this.bluesky
        .getPosts([rootUri])
        .pipe(map(({ posts }) => !!posts[0] && isMyQuietConversation(adaptPost(posts[0]), isMine)));
    }
    if (status.provider === 'misskey') {
      const noteId = (status.providerRef as MisskeyRef).noteId;
      // Nearest first; the last note is the root when the walk reached it.
      return this.misskey.conversation(noteId).pipe(
        map((notes) => {
          const root = notes.at(-1);
          return (
            !!root &&
            !root.replyId &&
            this.replyGuys.isSelf({ id: `mk:${root.userId}` }) &&
            !root.tags?.length
          );
        }),
      );
    }
    return this.api.getContext(status.id).pipe(
      map(({ ancestors }) =>
        isMyQuietConversation(
          ancestors.find((post) => !post.in_reply_to_id),
          isMine,
        ),
      ),
    );
  }
}
