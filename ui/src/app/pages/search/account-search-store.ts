import { Injectable, inject } from '@angular/core';
import { Relationship } from '../../models';
import { AccountSearchCriteria } from './mawkingbird-search';
import { AccountFacetKind, AccountWithMatches, FollowFilter } from './account-refine';
import { AccountSortKey } from './search-sort';
import { SearchServer } from '../../search-server';

/**
 * A snapshot of a completed account search, held in memory so returning to the
 * search page (e.g. after clicking into a profile and hitting Back) restores the
 * whole result set — cards, relationships, refinements, and scroll position —
 * instead of dropping you back on an empty box. Building the set can cost many
 * queries (the posts→authors fan-out especially); losing it to a navigation is
 * exactly the frustration this avoids.
 *
 * This is deliberately in-memory only: it survives SPA navigation, not a hard
 * reload. A reload re-runs the search from the URL, which is the correct
 * behaviour for a fresh session.
 */
export interface AccountSearchSnapshot {
  /** The executed query text and type, used to confirm the restore still matches. */
  query: string;
  /** The raw merged result set (bio hits + post authors). */
  items: AccountWithMatches[];
  /** Relationship per account id at snapshot time. */
  relationships: Record<string, Relationship>;
  /** Expanded card ids. */
  expanded: string[];
  /** Selected facet values. */
  facets: { kind: AccountFacetKind; value: string }[];
  /** The loaded-result text filter. */
  filter: string;
  /** The chosen sort of the loaded people. */
  sort: AccountSortKey;
  /** Whether the list was narrowed to accounts the viewer does/doesn't follow. */
  followFilter?: FollowFilter;
  /** The numeric bounds the results were gated by. */
  bounds: AccountSearchCriteria;
  /** API calls the search spent (for the honesty line). */
  callsUsed: number;
  /** Vertical scroll offset of the results container. */
  scrollTop: number;
}

@Injectable({ providedIn: 'root' })
export class AccountSearchStore {
  private searchServer = inject(SearchServer);
  private snapshot: AccountSearchSnapshot | null = null;
  /** The search-server epoch the snapshot was fetched under. */
  private epoch = 0;

  save(snapshot: AccountSearchSnapshot): void {
    this.snapshot = snapshot;
    this.epoch = this.searchServer.epoch();
  }

  /**
   * The stored snapshot if it matches `query`, else null. Non-consuming — the
   * caller decides whether to clear after restoring.
   *
   * A snapshot from a different search server is refused however well the query
   * matches: account ids are local to an instance, so restoring kolectiva's results
   * while search now points at mastodon.social gives cards that link to whatever
   * account happens to hold that id there. Silently wrong beats visibly empty only
   * if you never click anything.
   */
  take(query: string): AccountSearchSnapshot | null {
    if (this.epoch !== this.searchServer.epoch()) {
      this.clear();
      return null;
    }
    if (this.snapshot && this.snapshot.query === query) {
      return this.snapshot;
    }
    return null;
  }

  clear(): void {
    this.snapshot = null;
  }
}
