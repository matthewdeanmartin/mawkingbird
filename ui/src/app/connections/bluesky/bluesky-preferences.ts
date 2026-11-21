import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BlueskyApi } from './bluesky-api';
import { BskySavedFeed } from './bluesky-types';

/** One entry of the account's preferences union; unknown members pass through. */
export type BskyPreference = { $type?: string } & Record<string, unknown>;

export const SAVED_FEEDS_PREF = 'app.bsky.actor.defs#savedFeedsPrefV2';
export const FEED_VIEW_PREF = 'app.bsky.actor.defs#feedViewPref';
export const THREAD_VIEW_PREF = 'app.bsky.actor.defs#threadViewPref';
export const INTERESTS_PREF = 'app.bsky.actor.defs#interestsPref';
export const POST_INTERACTION_PREF = 'app.bsky.actor.defs#postInteractionSettingsPref';

/**
 * The one owner of `app.bsky.actor.putPreferences` (spec/bsky_parity.md).
 *
 * That call replaces the account's whole preferences list, which bsky.app and
 * every other Bluesky app share. So every change here re-reads the list right
 * before writing, changes only the entry it owns, keeps every other entry
 * (including types this client has never heard of) exactly as read and in
 * place, and writes the result back. Nothing else may call putPreferences.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyPreferences {
  private api = inject(BlueskyApi);

  async read(): Promise<BskyPreference[]> {
    const { preferences } = await firstValueFrom(this.api.getPreferences());
    return preferences as BskyPreference[];
  }

  /**
   * Re-read, replace the entry matching `match` (or add one), write back.
   * `edit` gets the current entry, or undefined; returning null removes it.
   * Resolves to the list as written.
   */
  async edit(
    match: string | ((pref: BskyPreference) => boolean),
    edit: (current: BskyPreference | undefined) => BskyPreference | null,
  ): Promise<BskyPreference[]> {
    const next = replacePreference(await this.read(), match, edit);
    await firstValueFrom(this.api.request('app.bsky.actor.putPreferences', { preferences: next }));
    return next;
  }
}

/**
 * The preferences list with one entry replaced, added at the end, or removed.
 * Every other entry keeps its value and position. When several entries match
 * (an older client may have written duplicates), the first is edited and the
 * rest are dropped, which is what bsky.app does on its next write.
 */
export function replacePreference(
  preferences: readonly BskyPreference[],
  match: string | ((pref: BskyPreference) => boolean),
  edit: (current: BskyPreference | undefined) => BskyPreference | null,
): BskyPreference[] {
  const matches = typeof match === 'string' ? (p: BskyPreference) => p.$type === match : match;
  const at = preferences.findIndex(matches);
  const replacement = edit(at >= 0 ? preferences[at] : undefined);
  const out: BskyPreference[] = [];
  preferences.forEach((pref, index) => {
    if (index === at) {
      if (replacement) out.push(replacement);
    } else if (!matches(pref)) {
      out.push(pref);
    }
  });
  if (at < 0 && replacement) out.push(replacement);
  return out;
}

// ------------------------------------------------------------ saved feeds

/** The saved-feeds items, or bsky.app's starting list (Following, pinned). */
export function savedFeedItems(pref: BskyPreference | undefined): BskySavedFeed[] {
  const items = pref?.['items'];
  if (Array.isArray(items)) return items as BskySavedFeed[];
  return [{ id: newSavedFeedId(), type: 'timeline', value: 'following', pinned: true }];
}

/** A fresh item id. bsky.app uses TIDs; any unique string is valid. */
export function newSavedFeedId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}${random}`;
}

/** Save a feed or list (no-op when already saved). Pinned ones join the end of the tabs. */
export function withSaved(
  items: readonly BskySavedFeed[],
  uri: string,
  type: 'feed' | 'list',
  pinned: boolean,
): BskySavedFeed[] {
  if (items.some((item) => item.value === uri)) return [...items];
  return [...items, { id: newSavedFeedId(), type, value: uri, pinned }];
}

export function withoutSaved(items: readonly BskySavedFeed[], uri: string): BskySavedFeed[] {
  return items.filter((item) => item.value !== uri);
}

/** Pin or unpin. A newly pinned item moves after the last pinned one, as on bsky.app. */
export function withPinned(
  items: readonly BskySavedFeed[],
  uri: string,
  pinned: boolean,
): BskySavedFeed[] {
  const item = items.find((i) => i.value === uri);
  if (!item || item.pinned === pinned) return [...items];
  const rest = items.filter((i) => i !== item);
  const updated = { ...item, pinned };
  if (!pinned) return [...rest, updated];
  const lastPinned = rest.map((i) => i.pinned).lastIndexOf(true);
  return [...rest.slice(0, lastPinned + 1), updated, ...rest.slice(lastPinned + 1)];
}

/** Move a pinned item one place left (-1) or right (+1) among the pinned ones. */
export function withPinMoved(
  items: readonly BskySavedFeed[],
  uri: string,
  delta: -1 | 1,
): BskySavedFeed[] {
  const pinned = items.filter((i) => i.pinned);
  const from = pinned.findIndex((i) => i.value === uri);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= pinned.length) return [...items];
  [pinned[from], pinned[to]] = [pinned[to], pinned[from]];
  let next = 0;
  return items.map((item) => (item.pinned ? pinned[next++] : item));
}
