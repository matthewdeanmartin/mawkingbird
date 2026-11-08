import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, switchMap, throwError } from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { qualifiedHandle } from './account-handle';
import { LocalModeration } from './local-moderation';
import { Account, ProviderId } from './models';
import { AnonymousCapabilities } from './providers/anonymous/anonymous-capabilities';
import { BlueskyGraph } from './providers/bluesky/bluesky-graph';
import { BlueskySession } from './providers/bluesky/bluesky-session';

/**
 * Where a mute or block of an author goes.
 *
 * - `local`: the browser-local list, which exists only so Anonymous readers get
 *   the same tools as everyone else. A signed-in reader never uses it: their
 *   server already keeps mutes private, and two kinds of mute would only confuse.
 * - `mastodon` / `bluesky`: the reader's own account on that network.
 * - `null`: nothing can mute this author for this reader (a Twitter or RSS
 *   source, or a network the reader is not signed in to), so offer no action.
 */
export type ModerationRoute = 'local' | 'mastodon' | 'bluesky' | null;

export interface ModerationTarget {
  account: Account;
  /** The network the account was read from; defaults to Mastodon-shaped. */
  provider?: ProviderId | string;
  /**
   * True when `account.id` is an id on the reader's own Mastodon server. When
   * false or unknown the account is looked up there by handle first: an id read
   * from another server may name someone else on this one.
   */
  native?: boolean;
}

/** The one place that decides how an author is muted or blocked. */
@Injectable({ providedIn: 'root' })
export class AuthorModeration {
  private auth = inject(Auth);
  private api = inject(Api);
  private local = inject(LocalModeration);
  private capabilities = inject(AnonymousCapabilities);
  private bluesky = inject(BlueskySession);
  private bskyGraph = inject(BlueskyGraph);

  route(target: ModerationTarget): ModerationRoute {
    if (this.auth.isAnonymous) return 'local';
    const provider = target.provider ?? providerFromId(target.account.id);
    if (provider === 'bluesky') return this.bluesky.linked() ? 'bluesky' : null;
    if (provider === 'mastodon' || provider === 'anonymous-mastodon')
      return this.capabilities.canManageRelationships ? 'mastodon' : null;
    return null;
  }

  /** Muted by this reader, as far as this visit knows (the server is the record). */
  isMuted(target: ModerationTarget): boolean {
    return this.route(target) === 'local'
      ? this.local.isMuted(target.account)
      : this.local.isSuppressed(target.account);
  }

  /** Mute for `seconds`, or indefinitely when null. Errors when no route exists. */
  mute(target: ModerationTarget, seconds: number | null): Observable<void> {
    switch (this.route(target)) {
      case 'local':
        this.local.mute(target.account, seconds);
        return of(undefined);
      case 'mastodon':
        return this.nativeId(target).pipe(
          switchMap((id) => this.api.muteAccount(id, seconds ?? undefined)),
          map(() => this.local.hideAfterServerAction(target.account)),
        );
      case 'bluesky':
        // Bluesky mutes have no duration; the reader asked for at least this much.
        return this.bskyGraph
          .mute(didOf(target.account))
          .pipe(map(() => this.local.hideAfterServerAction(target.account)));
      default:
        return throwError(() => new Error('This account cannot be muted here.'));
    }
  }

  block(target: ModerationTarget): Observable<void> {
    switch (this.route(target)) {
      case 'local':
        this.local.block(target.account);
        return of(undefined);
      case 'mastodon':
        return this.nativeId(target).pipe(
          switchMap((id) => this.api.block(id)),
          map(() => this.local.hideAfterServerAction(target.account)),
        );
      case 'bluesky':
        return this.bskyGraph
          .block(didOf(target.account))
          .pipe(map(() => this.local.hideAfterServerAction(target.account)));
      default:
        return throwError(() => new Error('This account cannot be blocked here.'));
    }
  }

  /** Undo a mute made here: locally, or on the reader's server. */
  unmute(target: ModerationTarget): Observable<void> {
    const route = this.route(target);
    this.local.clear(target.account);
    switch (route) {
      case 'mastodon':
        return this.nativeId(target).pipe(
          switchMap((id) => this.api.unmuteAccount(id)),
          map(() => undefined),
        );
      case 'bluesky':
        return this.bskyGraph.unmute(didOf(target.account)).pipe(map(() => undefined));
      default:
        return of(undefined);
    }
  }

  private nativeId(target: ModerationTarget): Observable<string> {
    if (target.native) return of(target.account.id);
    const handle = qualifiedHandle(target.account) ?? target.account.acct;
    return this.api.lookupAccount(handle).pipe(
      catchError(() =>
        this.api
          .resolveReplyMention(handle)
          .pipe(
            switchMap((results) =>
              results.accounts[0]
                ? of(results.accounts[0])
                : throwError(() => new Error(`${handle} is not known to your server.`)),
            ),
          ),
      ),
      map((account) => account.id),
    );
  }
}

/** An account read without its post's provider: Bluesky, Twitter and RSS ids carry a prefix. */
function providerFromId(id: string): string {
  if (id.startsWith('bsky:') || id.startsWith('did:')) return 'bluesky';
  if (id.startsWith('twitter:')) return 'twitter';
  if (id.startsWith('rss:')) return 'rss';
  return 'mastodon';
}

function didOf(account: Account): string {
  return account.id.replace(/^bsky:/, '');
}
