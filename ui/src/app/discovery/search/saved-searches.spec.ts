import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptySearch, MawkingbirdSearch } from './mawkingbird-search';
import {
  isBlueskySaved,
  isMastodonSaved,
  SAVED_SEARCH_LIMIT,
  SavedSearches,
} from './saved-searches';

function postSearch(words: string): MawkingbirdSearch {
  const s = emptySearch('posts');
  s.post = { words };
  return s;
}

const ctx = { instance: 'mastodon.social', authenticated: true };

/**
 * A second instance that re-reads from storage.
 *
 * `new SavedSearches()` would be simpler, but the service injects
 * `TranslocoService` (its cap and untitled-name messages are translated), and
 * `inject()` outside an injection context throws NG0203. Resetting the module
 * and asking the injector again gives a genuinely fresh instance the supported
 * way.
 */
function reloadedFromStorage(): SavedSearches {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(SavedSearches);
}

describe('SavedSearches', () => {
  let svc: SavedSearches;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    svc = TestBed.inject(SavedSearches);
  });

  it('saves a search newest-first and persists it', () => {
    svc.save('First', postSearch('a'), ctx);
    svc.save('Second', postSearch('b'), ctx);
    expect(svc.all().map((s) => s.name)).toEqual(['Second', 'First']);
    // A fresh instance re-reads from storage.
    const reloaded = reloadedFromStorage();
    expect(reloaded.all().map((s) => s.name)).toEqual(['Second', 'First']);
  });

  it('deep-clones so later edits to the passed object do not mutate the saved copy', () => {
    const original = postSearch('a');
    svc.save('X', original, ctx);
    original.post!.words = 'mutated';
    const stored = svc.all()[0];
    // `search` is a union now that Bluesky searches can be saved too, so the
    // Mastodon shape has to be narrowed before its fields are readable.
    expect(isMastodonSaved(stored) && stored.search.post?.words).toBe('a');
  });

  it('enforces the per-account cap', () => {
    for (let i = 0; i < SAVED_SEARCH_LIMIT; i++) {
      expect(svc.save(`s${i}`, postSearch(`w${i}`), ctx).ok).toBe(true);
    }
    expect(svc.atLimit()).toBe(true);
    const overflow = svc.save('too many', postSearch('z'), ctx);
    expect(overflow.ok).toBe(false);
    expect(svc.count()).toBe(SAVED_SEARCH_LIMIT);
  });

  it('renames, duplicates, and deletes', () => {
    const saved = svc.save('Name', postSearch('a'), ctx);
    const id = saved.ok ? saved.saved.id : '';
    svc.rename(id, 'Renamed');
    expect(svc.all().find((s) => s.id === id)?.name).toBe('Renamed');

    svc.duplicate(id);
    expect(svc.count()).toBe(2);
    expect(svc.all().some((s) => s.name === 'Renamed (copy)')).toBe(true);

    svc.delete(id);
    expect(svc.all().some((s) => s.id === id)).toBe(false);
  });

  /**
   * Saved searches used to be Mastodon-only, which meant a Bluesky-primary
   * account — who now lands on the Bluesky panel by default — could not save a
   * single search. Adding a network to the row is a persisted schema change, so
   * the migration matters as much as the feature.
   */
  describe('two networks', () => {
    it('defaults a save to mastodon, so existing call sites are unchanged', () => {
      svc.save('X', postSearch('a'), ctx);
      expect(svc.all()[0].network).toBe('mastodon');
    });

    it('saves a Bluesky search with no instance', () => {
      svc.save(
        'Bsky',
        { text: 'angular' },
        { instance: '', authenticated: true, network: 'bluesky' },
      );
      const stored = svc.all()[0];

      expect(stored.network).toBe('bluesky');
      // Bluesky has no per-user instance to restore before re-running, so there
      // is nothing to record here.
      expect(stored.instance).toBe('');
      expect(isBlueskySaved(stored) && stored.search.text).toBe('angular');
    });

    it('keeps the two kinds apart in one list', () => {
      svc.save('M', postSearch('a'), ctx);
      svc.save('B', { text: 'b' }, { instance: '', authenticated: true, network: 'bluesky' });

      expect(
        svc
          .all()
          .filter(isBlueskySaved)
          .map((s) => s.name),
      ).toEqual(['B']);
      expect(
        svc
          .all()
          .filter(isMastodonSaved)
          .map((s) => s.name),
      ).toEqual(['M']);
    });

    it('carries the network through a duplicate', () => {
      const saved = svc.save(
        'B',
        { text: 'b' },
        {
          instance: '',
          authenticated: true,
          network: 'bluesky',
        },
      );
      svc.duplicate(saved.ok ? saved.saved.id : '');

      expect(svc.all().every((s) => s.network === 'bluesky')).toBe(true);
    });

    it('migrates v1 rows to mastodon instead of discarding them', () => {
      // What a browser that saved searches before this sprint has on disk: no
      // `network` field, version 1. Losing these would be a user's own curation
      // quietly disappearing.
      localStorage.setItem(
        'mockingbird_saved_searches',
        JSON.stringify({
          version: 1,
          searches: [
            {
              id: 'old1',
              name: 'From before',
              createdAt: 'x',
              updatedAt: 'x',
              instance: 'mastodon.social',
              authenticated: true,
              search: postSearch('legacy'),
            },
          ],
        }),
      );

      const reloaded = reloadedFromStorage();
      const row = reloaded.all()[0];
      expect(row?.name).toBe('From before');
      expect(row?.network).toBe('mastodon');
      expect(isMastodonSaved(row) && row.search.post?.words).toBe('legacy');
    });

    it('starts empty on a version it does not recognise', () => {
      localStorage.setItem(
        'mockingbird_saved_searches',
        JSON.stringify({ version: 99, searches: [{ id: 'x', search: {} }] }),
      );

      expect(reloadedFromStorage().all()).toEqual([]);
    });
  });
});
