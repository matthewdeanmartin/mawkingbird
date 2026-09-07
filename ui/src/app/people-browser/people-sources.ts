import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { Api } from '../api';
import { Auth } from '../auth';
import { Account, Relationship } from '../models';
import { AnonymousAccount } from '../providers/anonymous/anonymous-account';
import { AnonymousFollows } from '../providers/anonymous/anonymous-follows';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { anonymousAccountRouteRef } from '../providers/anonymous/anonymous-route-ref';
import { BlueskyApi } from '../providers/bluesky/bluesky-api';
import { BlueskyGraph } from '../providers/bluesky/bluesky-graph';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { adaptProfile, adaptRelationship } from '../providers/bluesky/bluesky-adapter';
import { BskyProfile } from '../providers/bluesky/bluesky-types';
import { PeopleMode, PeoplePage, PeopleSource } from './people-source';

/** Mastodon's own followers/following, paged by `max_id`. */
class MastodonPeopleSource implements PeopleSource {
  readonly canFollow = true;

  constructor(
    private api: Api,
    private accountId: string,
  ) {}

  /**
   * One page, walked by the `Link` header rather than by account id.
   *
   * ## Why the obvious cursor is the wrong one
   *
   * This used to read `accounts.at(-1).id` and pass it as the next `max_id`,
   * with a comment claiming Mastodon "has no cursor". It does — it is just not
   * in the response body. `/followers` and `/following` paginate by the id of
   * the internal *follow relationship*, which is a different number from the id
   * of the account on the end of it, and it appears only in the `Link` header.
   *
   * Feeding an account id back as `max_id` therefore asks the server for
   * "relationships older than <an unrelated number>". The result depends on how
   * that number happens to compare with the relationship ids, so the symptom is
   * not a clean failure: the list stops early, and *where* it stops varies by
   * account. An account whose followers all arrived before the account ids in
   * play terminates on page one, which reads exactly like a privacy setting.
   *
   * {@link Api.accountFollowersPage} already existed for this reason — bulk
   * walkers were fixed earlier — but this browser was still guessing. Now an
   * absent `next` link, rather than an empty page, is what ends the walk.
   */
  fetch(mode: PeopleMode, cursor: string | null): Observable<PeoplePage> {
    const maxId = cursor ?? undefined;
    const page =
      mode === 'followers'
        ? this.api.accountFollowersPage(this.accountId, maxId)
        : this.api.accountFollowingPage(this.accountId, maxId);
    return page.pipe(
      map(({ accounts, nextMaxId, source }) => ({
        accounts,
        cursor: nextMaxId,
        approximate: source === 'account-id-fallback',
      })),
    );
  }

  relationships(accounts: Account[]): Observable<Map<string, Relationship>> {
    const ids = accounts.map((a) => a.id);
    if (!ids.length) {
      return of(new Map());
    }
    return this.api.relationships(ids).pipe(map((list) => new Map(list.map((r) => [r.id, r]))));
  }

  follow(account: Account): Observable<Relationship> {
    return this.api.follow(account.id);
  }

  unfollow(account: Account): Observable<Relationship> {
    return this.api.unfollow(account.id);
  }

  accountLink(account: Account): (string | number)[] {
    return ['/accounts', account.id];
  }
}

/**
 * Another instance's lists, read without a token.
 *
 * Follows are local rows in `localStorage`, never writes to that server — the
 * anonymous-follow model established in `sprint/anonymous-mastodon-*`.
 */
class AnonymousPeopleSource implements PeopleSource {
  readonly canFollow = true;

  constructor(
    private publicApi: AnonymousPublicApi,
    private follows: AnonymousFollows,
    private accountId: string,
    private server: string,
  ) {}

  /** Link-header cursor, for the reason given on {@link MastodonPeopleSource.fetch}. */
  fetch(mode: PeopleMode, cursor: string | null): Observable<PeoplePage> {
    const ref = { server: this.server, id: this.accountId };
    const maxId = cursor ?? undefined;
    const page =
      mode === 'followers'
        ? this.publicApi.getAccountFollowersPage(ref, maxId)
        : this.publicApi.getAccountFollowingPage(ref, maxId);
    return page.pipe(
      map(({ accounts, nextMaxId, source }) => ({
        accounts,
        cursor: nextMaxId,
        approximate: source === 'account-id-fallback',
      })),
    );
  }

  relationships(accounts: Account[]): Observable<Map<string, Relationship>> {
    return of(new Map(accounts.map((a) => [a.id, this.follows.relationship(a, this.server)])));
  }

  follow(account: Account): Observable<Relationship> {
    const result = this.follows.follow(account, this.server);
    // A refused follow (the anonymous cap) reports the unchanged relationship
    // rather than throwing; the cap is a normal outcome, not a failure.
    return of(result.relationship);
  }

  unfollow(account: Account): Observable<Relationship> {
    this.follows.unfollow(account, this.server);
    return of(this.follows.relationship(account, this.server));
  }

  accountLink(account: Account): (string | number)[] {
    return [
      '/accounts',
      anonymousAccountRouteRef({
        server: this.server,
        id: account.id,
        ...(account.url ? { originalUrl: account.url } : {}),
      }),
    ];
  }
}

/** The viewer's own anonymous follow list, which lives entirely in localStorage. */
class LocalAnonymousPeopleSource implements PeopleSource {
  readonly canFollow = true;

  constructor(
    private follows: AnonymousFollows,
    private server: string,
  ) {}

  fetch(mode: PeopleMode): Observable<PeoplePage> {
    // An anonymous identity has no followers — nobody can follow a browser.
    const accounts =
      mode === 'following' ? this.follows.follows().map((follow) => follow.account) : [];
    return of({ accounts, cursor: null });
  }

  relationships(accounts: Account[]): Observable<Map<string, Relationship>> {
    return of(new Map(accounts.map((a) => [a.id, this.follows.relationship(a, this.server)])));
  }

  follow(account: Account): Observable<Relationship> {
    return of(this.follows.follow(account, this.server).relationship);
  }

  unfollow(account: Account): Observable<Relationship> {
    this.follows.unfollow(account, this.server);
    return of(this.follows.relationship(account, this.server));
  }

  accountLink(account: Account): (string | number)[] {
    return ['/accounts', account.id];
  }
}

/**
 * A Bluesky account's followers/follows.
 *
 * Relationships come attached to the accounts themselves — `getFollowers`
 * returns `profileView`s whose `viewer` block is populated when the call was
 * authenticated — so no separate relationship request is needed. Signed out
 * there is no `viewer` at all, which is why {@link canFollow} is false: the
 * accounts are readable but there is no session to write a follow with.
 */
class BlueskyPeopleSource implements PeopleSource {
  /**
   * Follow state harvested from the page that was just fetched, keyed by
   * account id. Filled by {@link fetch}, drained by {@link relationships}.
   */
  private viewerState = new Map<string, Relationship>();

  constructor(
    private api: BlueskyApi,
    private graph: BlueskyGraph,
    private did: string,
    readonly canFollow: boolean,
  ) {}

  fetch(mode: PeopleMode, cursor: string | null): Observable<PeoplePage> {
    // getFollows is "who this actor follows" — named inconsistently with
    // getFollowers, and easy to swap in a way the tab labels would hide.
    const page: Observable<{ profiles: BskyProfile[]; cursor?: string }> =
      mode === 'followers'
        ? this.api
            .getFollowers(this.did, cursor)
            .pipe(map((r) => ({ profiles: r.followers, cursor: r.cursor })))
        : this.api
            .getFollows(this.did, cursor)
            .pipe(map((r) => ({ profiles: r.follows, cursor: r.cursor })));
    return page.pipe(
      map((result) => {
        for (const profile of result.profiles) {
          if (profile.viewer) {
            this.viewerState.set(`bsky:${profile.did}`, adaptRelationship(profile));
            this.graph.remember(profile.did, profile.viewer.following);
          }
        }
        return {
          accounts: result.profiles.map(adaptProfile),
          cursor: result.cursor && result.cursor !== cursor ? result.cursor : null,
        };
      }),
    );
  }

  /**
   * No request: the follow state arrived inline on the profiles.
   *
   * `getFollowers`/`getFollows` populate `viewer` when the call is
   * authenticated, so asking again would be a second round trip per page for
   * data already in hand. Signed out there is no `viewer` and this is empty,
   * which the browser reads as "unknown" — correct, since it genuinely is.
   */
  relationships(accounts: Account[]): Observable<Map<string, Relationship>> {
    const out = new Map<string, Relationship>();
    for (const account of accounts) {
      const rel = this.viewerState.get(account.id);
      if (rel) {
        out.set(account.id, rel);
      }
    }
    return of(out);
  }

  follow(account: Account): Observable<Relationship> {
    return this.graph.follow(didOf(account));
  }

  unfollow(account: Account): Observable<Relationship> {
    return this.graph.unfollow(didOf(account));
  }

  accountLink(account: Account): (string | number)[] {
    return ['/accounts', account.id];
  }
}

/** `bsky:did:plc:…` → `did:plc:…`. */
function didOf(account: Account): string {
  return account.id.replace(/^bsky:/, '');
}

/**
 * Picks the right {@link PeopleSource} for an account being viewed.
 *
 * A factory rather than four injected services because the choice depends on
 * *which account* is on screen — a `bsky:` id needs the Bluesky source even for
 * a signed-in Mastodon user — and that is not knowable at injection time.
 */
@Injectable({ providedIn: 'root' })
export class PeopleSourceFactory {
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymous = inject(AnonymousAccount);
  private anonymousFollows = inject(AnonymousFollows);
  private anonymousPublic = inject(AnonymousPublicApi);
  private bskyApi = inject(BlueskyApi);
  private bskyGraph = inject(BlueskyGraph);
  private bskySession = inject(BlueskySession);

  /**
   * @param accountId the profile being browsed
   * @param server public instance, when Anonymous browses another account
   */
  create(accountId: string, server: string | null): PeopleSource {
    if (accountId.startsWith('bsky:')) {
      return new BlueskyPeopleSource(
        this.bskyApi,
        this.bskyGraph,
        accountId.slice('bsky:'.length),
        this.bskySession.linked(),
      );
    }
    if (this.auth.isAnonymous && accountId === this.anonymous.account().id) {
      return new LocalAnonymousPeopleSource(this.anonymousFollows, this.anonymous.server());
    }
    if (this.auth.isAnonymous && server) {
      return new AnonymousPeopleSource(
        this.anonymousPublic,
        this.anonymousFollows,
        accountId,
        server,
      );
    }
    if (this.auth.isAnonymous) {
      // Anonymous with no server to read from: local follows are all we have.
      return new LocalAnonymousPeopleSource(this.anonymousFollows, this.anonymous.server());
    }
    return new MastodonPeopleSource(this.api, accountId);
  }
}
