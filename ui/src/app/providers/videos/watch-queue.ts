import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';
import { VideoSource } from '../../video-player/media-source';

const QUEUE_KEY_BASE = 'mockingbird_watch_queue';

/** Long enough for an evening, short enough that the list stays a list. */
export const WATCH_QUEUE_LIMIT = 200;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PARAM_NAMES = new Set(['post', 'server', 'youtube', 'attachment']);

/**
 * One video waiting to be watched.
 *
 * Stored as the Watch page's own query params rather than a media URL: a
 * queued post is resolved again when it is played, so the queue never holds
 * (or grants) anything Watch would not load from a fresh link. See
 * `watchParams` in media-source.ts.
 */
export interface QueuedVideo {
  key: string;
  title: string;
  poster?: string;
  params: Record<string, string>;
  addedAt: number;
}

/** Identity of a Watch destination, so the same video is queued once. */
export function queueKey(params: Record<string, string>): string {
  return params['post']
    ? `post:${params['server'] ?? ''}|${params['post']}|${params['attachment'] ?? params['youtube'] ?? ''}`
    : `youtube:${params['youtube'] ?? ''}`;
}

/** The params that name a Watch video, without page extras such as party tags. */
export function pickWatchParams(params: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(params).filter(([name]) => PARAM_NAMES.has(name)));
}

/** Only the params Watch understands, in the shapes it accepts. */
export function validWatchParams(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const params = value as Record<string, unknown>;
  const names = Object.keys(params);
  if (!names.every((name) => PARAM_NAMES.has(name) && typeof params[name] === 'string'))
    return false;
  const youtube = params['youtube'] as string | undefined;
  if (youtube !== undefined && !VIDEO_ID.test(youtube)) return false;
  const post = params['post'] as string | undefined;
  if (post === undefined) return youtube !== undefined && names.length === 1;
  return (
    post.length > 0 && post.length <= 4000 && (youtube !== undefined || !!params['attachment'])
  );
}

/** A queue entry for a source shown outside Watch; null when it cannot be replayed. */
export function queueEntry(
  source: VideoSource,
  watch: Record<string, string> | null,
): Omit<QueuedVideo, 'addedAt'> | null {
  const params =
    watch ?? (source.kind === 'youtube' && source.videoId ? { youtube: source.videoId } : null);
  if (!params || !validWatchParams(params)) return null;
  return {
    key: queueKey(params),
    title: source.title && source.title !== 'YouTube' ? source.title : '',
    ...(source.poster ? { poster: source.poster } : {}),
    params,
  };
}

function read(key: string): QueuedVideo[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .filter((item): item is QueuedVideo => {
        if (
          !item ||
          typeof item !== 'object' ||
          typeof item.title !== 'string' ||
          typeof item.addedAt !== 'number' ||
          (item.poster !== undefined && typeof item.poster !== 'string') ||
          !validWatchParams(item.params)
        )
          return false;
        // Recomputed, never trusted: the key is what de-duplication rests on.
        const key = queueKey(item.params);
        if (seen.has(key)) return false;
        seen.add(key);
        item.key = key;
        return true;
      })
      .slice(0, WATCH_QUEUE_LIMIT);
  } catch {
    return [];
  }
}

/** The account's watch queue: videos saved to play in order, on Watch. */
@Injectable({ providedIn: 'root' })
export class WatchQueue {
  private readonly key = scopedKey(QUEUE_KEY_BASE);
  readonly items = signal(read(this.key));
  readonly full = computed(() => this.items().length >= WATCH_QUEUE_LIMIT);

  has(key: string): boolean {
    return this.items().some((item) => item.key === key);
  }

  /** Adds to the end. False when already queued, full, or not replayable. */
  add(entry: Omit<QueuedVideo, 'addedAt' | 'key'> & { key?: string }): boolean {
    if (!validWatchParams(entry.params)) return false;
    const key = queueKey(entry.params);
    if (this.has(key) || this.full()) return false;
    this.persist([
      ...this.items(),
      {
        key,
        title: entry.title.trim().slice(0, 300),
        ...(entry.poster ? { poster: entry.poster } : {}),
        params: { ...entry.params },
        addedAt: Date.now(),
      },
    ]);
    return true;
  }

  remove(key: string): void {
    this.persist(this.items().filter((item) => item.key !== key));
  }

  /** Moves an entry `offset` places, clamped to the ends of the queue. */
  move(key: string, offset: number): void {
    const items = [...this.items()];
    const from = items.findIndex((item) => item.key === key);
    if (from < 0) return;
    const to = Math.max(0, Math.min(items.length - 1, from + offset));
    if (to === from) return;
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    this.persist(items);
  }

  /** What plays after `key`: the entry behind it, or the head when it is not queued. */
  next(key: string | null): QueuedVideo | null {
    const items = this.items();
    const at = key === null ? -1 : items.findIndex((item) => item.key === key);
    return items.find((item, index) => index > at && item.key !== key) ?? null;
  }

  clear(): void {
    this.persist([]);
  }

  private persist(items: QueuedVideo[]): void {
    this.items.set(items);
    try {
      localStorage.setItem(this.key, JSON.stringify(items));
    } catch {
      // The queue still works for this page load without storage.
    }
  }
}
