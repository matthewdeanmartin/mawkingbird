import { Observable } from 'rxjs';
import { Account, Relationship } from '../models';

/** Which list a browser pages through. */
export type PeopleMode = 'followers' | 'following';

/**
 * One page of people, plus whatever the source needs to fetch the next one.
 *
 * `cursor` is deliberately opaque and source-defined. Mastodon pages by
 * `max_id` — the last account's id — while Bluesky returns a cursor string that
 * means nothing outside its own service. The browser never inspects it; it only
 * hands it back. A null cursor means the list is fully paged in.
 */
export interface PeoplePage {
  accounts: Account[];
  cursor: string | null;
  /**
   * True when `cursor` is a best guess rather than the server's own cursor.
   *
   * Only Mastodon sets this, and only when the `Link` header did not survive the
   * trip (a CORS proxy that does not forward it). The walk continues on the
   * account-id cursor instead of stopping at one page, but it may skip or repeat
   * rows, so the browser says the list is approximate rather than presenting a
   * possibly-incomplete list as complete. See `peopleCursorFrom`.
   */
  approximate?: boolean;
}

/**
 * Where a people browser gets its accounts, relationships and follow writes.
 *
 * Extracted because `PeopleBrowser` had two transports hard-coded into every
 * method — an `auth.isAnonymous && server` branch in the fetch, another in the
 * relationship load, another in the follow toggle — and Bluesky would have made
 * three of each. The component now asks a source and stops knowing that other
 * protocols exist, matching how `ListSource` handles the Lists tab.
 *
 * Implementations are chosen by {@link peopleSourceFor}, not injected, because
 * the choice depends on the account being viewed rather than on global state.
 */
export interface PeopleSource {
  /** A page of the list; pass the previous page's `cursor` to continue. */
  fetch(mode: PeopleMode, cursor: string | null): Observable<PeoplePage>;

  /**
   * Relationships for a batch of accounts.
   *
   * Returned as a map rather than an array because sources disagree about
   * completeness: Mastodon answers for every id, Bluesky's come attached to the
   * profiles themselves, and an anonymous source computes them locally. A
   * missing entry means "unknown", which the browser renders as no follow
   * button rather than as "not following".
   */
  relationships(accounts: Account[]): Observable<Map<string, Relationship>>;

  follow(account: Account): Observable<Relationship>;
  unfollow(account: Account): Observable<Relationship>;

  /**
   * Whether this source can write follows at all.
   *
   * False for an anonymous Bluesky view: the accounts are real and readable but
   * there is no session to write with, so the button comes off rather than
   * failing on click.
   */
  readonly canFollow: boolean;

  /** Route link for an account card, which differs for cross-instance views. */
  accountLink(account: Account): (string | number)[];
}
