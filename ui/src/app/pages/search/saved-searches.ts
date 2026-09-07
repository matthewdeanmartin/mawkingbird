import { computed, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { scopedKey } from '../../account-scope';
import { MawkingbirdSearch } from './mawkingbird-search';
import { BlueskyPostSearch } from '../../providers/bluesky/bluesky-post-search';

// i18n pages.search.saved.limitReached: You can save up to {{limit}} searches. Delete one to make room.
// i18n pages.search.saved.untitled: Untitled search

const STORAGE_KEY_BASE = 'mockingbird_saved_searches';
/**
 * 2 — added {@link SavedSearch.network}, so a Bluesky search can be saved too.
 *
 * Bumped rather than shape-shifted silently: a saved search that fails to load
 * is a user's own curation quietly disappearing, and this app has had that class
 * of bug before (see the `logout-vs-leave` note). {@link load} migrates v1 rows
 * instead of discarding them.
 */
const STATE_VERSION = 2;
/** Cap on saved searches — localStorage is shared with other features (§15). */
export const SAVED_SEARCH_LIMIT = 20;

/** A saved search stores the structured definition only — never results, post
 *  bodies, or facet caches (§15). */
/** Which engine a saved search runs against. */
export type SavedSearchNetwork = 'mastodon' | 'bluesky';

export interface SavedSearch {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /**
   * The Mastodon instance the search was defined against. Empty string for a
   * Bluesky search — Bluesky has no per-user instances, so there is nothing to
   * record and nothing to restore before re-running.
   */
  instance: string;
  authenticated: boolean;
  /**
   * Which engine to run this against. Absent in v1 blobs, where every saved
   * search was Mastodon by construction — {@link load} fills it in.
   */
  network: SavedSearchNetwork;
  /**
   * The structured definition. Shape follows {@link network}: a
   * {@link MawkingbirdSearch} for Mastodon, a `BlueskyPostSearch` for Bluesky.
   * Never results, post bodies or facet caches (§15).
   */
  search: MawkingbirdSearch | BlueskyPostSearch;
}

/** Narrow a saved search to the Mastodon side, for the Mastodon-shaped callers. */
export function isMastodonSaved(
  saved: SavedSearch,
): saved is SavedSearch & { search: MawkingbirdSearch } {
  return saved.network === 'mastodon';
}

/**
 * Narrow to the Bluesky side.
 *
 * The complement of {@link isMastodonSaved} rather than a `!` on it: a negated
 * type predicate does not narrow the union in the `else` branch, so callers
 * handing the definition to the Bluesky panel need a predicate of their own.
 */
export function isBlueskySaved(
  saved: SavedSearch,
): saved is SavedSearch & { search: BlueskyPostSearch } {
  return saved.network === 'bluesky';
}

interface SavedSearchState {
  version: typeof STATE_VERSION;
  searches: SavedSearch[];
}

function load(): SavedSearchState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(scopedKey(STORAGE_KEY_BASE)) ?? 'null',
    ) as Partial<SavedSearchState> | null;
    // v1 and v2 share a row shape apart from `network`, so v1 is migrated rather
    // than dropped. Anything older or unrecognised starts empty, as before.
    if (
      (parsed?.version !== STATE_VERSION && parsed?.version !== 1) ||
      !Array.isArray(parsed.searches)
    ) {
      return { version: STATE_VERSION, searches: [] };
    }
    // Keep only well-formed entries, newest-first, capped.
    const searches = parsed.searches
      .filter((s): s is SavedSearch => !!s && typeof s.id === 'string' && !!s.search)
      .map((s) => ({
        ...s,
        // The v1 migration: every saved search predating this field was
        // Mastodon by construction, since Bluesky ones could not be saved.
        network: s.network === 'bluesky' ? ('bluesky' as const) : ('mastodon' as const),
      }))
      .slice(0, SAVED_SEARCH_LIMIT);
    return { version: STATE_VERSION, searches };
  } catch {
    return { version: STATE_VERSION, searches: [] };
  }
}

/** Browser-local saved search definitions, scoped per account (see {@link scopedKey}). */
@Injectable({ providedIn: 'root' })
export class SavedSearches {
  private transloco = inject(TranslocoService);
  private state = signal(load());

  readonly all = computed(() => this.state().searches);
  readonly count = computed(() => this.all().length);
  readonly atLimit = computed(() => this.count() >= SAVED_SEARCH_LIMIT);

  /** Save a new search under `name`. Returns the created entry, or an error when
   *  the per-account cap is reached. */
  save(
    name: string,
    search: MawkingbirdSearch | BlueskyPostSearch,
    context: { instance: string; authenticated: boolean; network?: SavedSearchNetwork },
  ): { ok: true; saved: SavedSearch } | { ok: false; error: string } {
    if (this.atLimit()) {
      return {
        ok: false,
        error: this.transloco.translate<string>('pages.search.saved.limitReached', {
          limit: SAVED_SEARCH_LIMIT,
        }),
      };
    }
    const now = new Date().toISOString();
    const saved: SavedSearch = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || this.transloco.translate<string>('pages.search.saved.untitled'),
      createdAt: now,
      updatedAt: now,
      instance: context.instance,
      authenticated: context.authenticated,
      // Defaulted rather than required, so the ~existing Mastodon call sites
      // keep working unchanged and only the Bluesky one has to say so.
      network: context.network ?? 'mastodon',
      // Deep-clone so later form edits can't mutate the stored definition.
      search: structuredClone(search),
    };
    // Newest first.
    this.persist([saved, ...this.all()]);
    return { ok: true, saved };
  }

  rename(id: string, name: string): void {
    this.persist(
      this.all().map((s) =>
        s.id === id
          ? { ...s, name: name.trim() || s.name, updatedAt: new Date().toISOString() }
          : s,
      ),
    );
  }

  /** Duplicate an existing search (subject to the cap). */
  duplicate(id: string): void {
    const original = this.all().find((s) => s.id === id);
    if (!original || this.atLimit()) {
      return;
    }
    this.save(`${original.name} (copy)`, original.search, {
      instance: original.instance,
      authenticated: original.authenticated,
      network: original.network,
    });
  }

  delete(id: string): void {
    this.persist(this.all().filter((s) => s.id !== id));
  }

  private persist(searches: SavedSearch[]): void {
    const capped = searches.slice(0, SAVED_SEARCH_LIMIT);
    const state: SavedSearchState = { version: STATE_VERSION, searches: capped };
    this.state.set(state);
    try {
      localStorage.setItem(scopedKey(STORAGE_KEY_BASE), JSON.stringify(state));
    } catch {
      // Storage full/unavailable — keep the in-memory copy so the UI still works.
    }
  }
}
