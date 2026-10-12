import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';

const FEEDS_KEY_BASE = 'mockingbird_video_feeds';

export const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
export const videoFeedUrl = (id: string): string =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

export interface VideoSubscription {
  id: string;
  title: string;
  enabled: boolean;
}

function read(key: string): VideoSubscription[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((item): item is VideoSubscription => {
      if (
        !item ||
        typeof item !== 'object' ||
        !CHANNEL_ID.test(item.id) ||
        typeof item.title !== 'string' ||
        typeof item.enabled !== 'boolean' ||
        seen.has(item.id)
      )
        return false;
      seen.add(item.id);
      return true;
    });
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class VideoSubscriptions {
  private readonly key = scopedKey(FEEDS_KEY_BASE);
  readonly feeds = signal(read(this.key));
  readonly enabled = computed(() => this.feeds().filter((feed) => feed.enabled));

  has(id: string): boolean {
    return this.feeds().some((feed) => feed.id === id);
  }
  add(id: string, title: string): void {
    if (!CHANNEL_ID.test(id)) throw new Error('Invalid YouTube channel ID');
    if (!this.has(id))
      this.persist([...this.feeds(), { id, title: title.trim() || id, enabled: true }]);
  }
  remove(id: string): void {
    this.persist(this.feeds().filter((feed) => feed.id !== id));
  }
  setEnabled(id: string, enabled: boolean): void {
    this.persist(this.feeds().map((feed) => (feed.id === id ? { ...feed, enabled } : feed)));
  }
  private persist(feeds: VideoSubscription[]): void {
    localStorage.setItem(this.key, JSON.stringify(feeds));
    this.feeds.set(feeds);
  }
}
