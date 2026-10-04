import { Injectable, signal } from '@angular/core';
import { scopedKey } from './account-scope';

const STORAGE_KEY = 'mockingbird_recent_feeds';
export const RECENT_FEED_SLOTS = 5;

export interface RecentFeed {
  url: string;
  label: string;
  pinned: boolean;
}

/** A directory/category is not a timeline. Also drops category shortcuts from the first release. */
function isFeedUrl(url: string): boolean {
  if (!url.startsWith('/') || url.startsWith('//')) return false;
  const parsed = new URL(url, 'https://local.invalid');
  const path = parsed.pathname;
  if (path === '/search') return !!parsed.searchParams.get('saved');
  if (path === '/collections/starter') return false;
  return (
    /^\/(lists|client-lists|tags|tag-bundles|collections|endorsed|accounts)\/[^/]+$/.test(path) ||
    /^\/feeds\/(local|federated|trending|news|bluesky\/[^/]+)$/.test(path)
  );
}

/** Five browser-local shortcuts. Pins retain their slot; other slots rotate by recency. */
@Injectable({ providedIn: 'root' })
export class RecentFeeds {
  readonly entries = signal<RecentFeed[]>([]);
  private key = '';

  refresh(): void {
    const key = scopedKey(STORAGE_KEY);
    if (key === this.key) return;
    this.key = key;
    try {
      const data: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      const seen = new Set<string>();
      this.entries.set(
        (Array.isArray(data) ? data : [])
          .filter((entry): entry is RecentFeed => {
            if (
              !entry ||
              typeof entry.url !== 'string' ||
              !isFeedUrl(entry.url) ||
              typeof entry.label !== 'string' ||
              typeof entry.pinned !== 'boolean' ||
              seen.has(entry.url)
            )
              return false;
            seen.add(entry.url);
            return true;
          })
          .slice(0, RECENT_FEED_SLOTS),
      );
    } catch {
      this.entries.set([]);
    }
  }

  visit(feed: Omit<RecentFeed, 'pinned'>): void {
    this.refresh();
    if (!isFeedUrl(feed.url)) return;
    const current = this.entries();
    const pinned = current.find((entry) => entry.url === feed.url && entry.pinned);
    if (pinned) {
      this.save(current.map((entry) => (entry === pinned ? { ...feed, pinned: true } : entry)));
      return;
    }
    const rotating = [
      { ...feed, pinned: false },
      ...current.filter((entry) => !entry.pinned && entry.url !== feed.url),
    ];
    const next: RecentFeed[] = [];
    for (let slot = 0; slot < RECENT_FEED_SLOTS; slot++) {
      const entry = current[slot]?.pinned ? current[slot] : rotating.shift();
      if (entry) next.push(entry);
    }
    this.save(next);
  }

  togglePin(url: string): void {
    this.refresh();
    this.save(
      this.entries().map((entry) =>
        entry.url === url ? { ...entry, pinned: !entry.pinned } : entry,
      ),
    );
  }

  private save(entries: RecentFeed[]): void {
    this.entries.set(entries);
    try {
      localStorage.setItem(this.key, JSON.stringify(entries));
    } catch {
      // Shortcuts still work when browser storage is unavailable.
    }
  }
}
