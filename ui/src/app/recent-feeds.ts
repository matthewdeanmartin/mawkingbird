import { Injectable, signal } from '@angular/core';
import { scopedKey } from './account-scope';

const STORAGE_KEY = 'mockingbird_recent_feeds';
export const RECENT_FEED_SLOTS = 5;

export interface RecentFeed {
  url: string;
  label: string;
  labelKey?: string;
  pinned: boolean;
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
              !entry.url.startsWith('/') ||
              entry.url.startsWith('//') ||
              typeof entry.label !== 'string' ||
              typeof entry.pinned !== 'boolean' ||
              (entry.labelKey !== undefined && typeof entry.labelKey !== 'string') ||
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
