import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';

/**
 * The queries you actually typed, remembered automatically.
 *
 * Deliberately *not* {@link SavedSearches}, which sits next door and looks
 * similar. Saved searches are curation: you name them, they hold a full
 * structured {@link MawkingbirdSearch} definition, they are capped at 20 and
 * they never expire. These are history: unnamed, just the words and which tab
 * you were on, small, and they roll off the end. Merging the two would mean
 * either polluting a hand-built list with every typo, or asking someone to name
 * a search before they are allowed to repeat it.
 *
 * Only the query string and target tab are stored — never results, never post
 * bodies, never account data (§15). Re-running a recent search re-runs the
 * search; it does not restore a cached answer.
 */

const STORAGE_KEY_BASE = 'mockingbird_recent_searches';
const STATE_VERSION = 1;

/**
 * How many to keep. Ten is about a session's worth of "wait, what did I type
 * before?" — enough to recover the thing you meant, short enough that the list
 * stays scannable under a search box on a phone.
 */
export const RECENT_SEARCH_LIMIT = 10;

/** Which tab the query was run against, so re-running lands where it did. */
export type RecentSearchType = 'accounts' | 'statuses' | 'hashtags';

export interface RecentSearch {
  /** Exactly what was typed, trimmed. */
  query: string;
  type: RecentSearchType;
  /** ISO timestamp of the most recent run, for ordering and expiry. */
  ranAt: string;
}

interface RecentState {
  version: number;
  searches: RecentSearch[];
}

function storageKey(): string {
  return scopedKey(STORAGE_KEY_BASE);
}

function load(): RecentState {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) {
      return { version: STATE_VERSION, searches: [] };
    }
    const parsed = JSON.parse(raw) as Partial<RecentState>;
    const searches = (Array.isArray(parsed.searches) ? parsed.searches : [])
      // Anything malformed is dropped rather than repaired. This is convenience
      // history: a corrupt row is worth nothing and must not break the page it
      // renders under.
      .filter(
        (entry): entry is RecentSearch =>
          !!entry &&
          typeof entry.query === 'string' &&
          entry.query.trim().length > 0 &&
          (entry.type === 'accounts' || entry.type === 'statuses' || entry.type === 'hashtags') &&
          typeof entry.ranAt === 'string',
      )
      .slice(0, RECENT_SEARCH_LIMIT);
    return { version: STATE_VERSION, searches };
  } catch {
    return { version: STATE_VERSION, searches: [] };
  }
}

/** Browser-local recent search history, scoped per account (see {@link scopedKey}). */
@Injectable({ providedIn: 'root' })
export class RecentSearches {
  private state = signal(load());

  readonly all = computed(() => this.state().searches);
  readonly count = computed(() => this.all().length);

  /**
   * Record a query that actually ran.
   *
   * Re-running something already in the list moves it to the front rather than
   * adding a second row — a list where "cats" appears four times is a worse
   * answer to "what did I search for?" than one where it appears once, at the
   * top. Matching is on the trimmed query *and* the tab, so the same words
   * searched as posts and as accounts stay distinct: they are different
   * searches with different results.
   */
  record(query: string, type: RecentSearchType): void {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    const entry: RecentSearch = { query: trimmed, type, ranAt: new Date().toISOString() };
    const rest = this.all().filter((r) => !(r.query === trimmed && r.type === type));
    this.persist([entry, ...rest].slice(0, RECENT_SEARCH_LIMIT));
  }

  /** Forget one entry — the per-row ✕. */
  remove(query: string, type: RecentSearchType): void {
    this.persist(this.all().filter((r) => !(r.query === query && r.type === type)));
  }

  /** Forget everything. Search history is the kind of thing people want a
   *  one-click way out of, without hunting through Settings. */
  clear(): void {
    this.persist([]);
  }

  private persist(searches: RecentSearch[]): void {
    const state: RecentState = { version: STATE_VERSION, searches };
    this.state.set(state);
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch {
      // A full or unavailable localStorage must not break searching. The list
      // stays correct in memory for this session and is simply not persisted.
    }
  }
}
