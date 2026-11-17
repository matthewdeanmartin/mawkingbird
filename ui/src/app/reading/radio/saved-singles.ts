import { inject, Injectable, signal } from '@angular/core';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { RadioPlayer, RadioTrack } from './radio-player';

const KEY = 'mockingbird_radio_singles';
/** Oldest Singles drop off past this; a browser's storage is not a music library. */
export const SINGLES_LIMIT = 500;

export interface SavedSingle {
  track: RadioTrack;
  /** Epoch milliseconds. */
  savedAt: number;
}

/**
 * Singles the listener kept, newest first, in this browser for this account.
 * Each keeps its post copy, so it plays without fetching the post again.
 */
@Injectable({ providedIn: 'root' })
export class SavedSingles {
  private readonly player = inject(RadioPlayer);
  readonly items = signal<SavedSingle[]>([]);
  readonly error = signal(false);
  private key = '';

  refresh(): void {
    this.key = KEY + accountScopeSuffix();
    this.error.set(false);
    try {
      const data: unknown = JSON.parse(localStorage.getItem(this.key) ?? '[]');
      this.items.set(
        (Array.isArray(data) ? data : []).flatMap((item: Partial<SavedSingle>) => {
          const saved = item?.track;
          if (!saved?.post?.account || !Array.isArray(saved.post.media_attachments)) return [];
          const track = this.player
            .singleTracks(saved.post)
            .find((candidate) => candidate.key === saved.key);
          if (!track) return [];
          const title =
            typeof saved.title === 'string' && saved.title.trim()
              ? { title: saved.title.trim().slice(0, 200) }
              : {};
          return [
            {
              track: { ...track, ...title },
              savedAt: Number.isFinite(item.savedAt) ? item.savedAt! : 0,
            },
          ];
        }),
      );
    } catch {
      this.items.set([]);
      this.error.set(true);
    }
  }

  has(key: string): boolean {
    return this.items().some((item) => item.track.key === key);
  }

  /** Keep these Singles at the top of the list; returns how many were new. */
  save(tracks: readonly RadioTrack[]): number {
    this.refresh();
    const known = new Set(this.items().map((item) => item.track.key));
    const now = Date.now();
    const added = tracks
      .filter((track) => !known.has(track.key) && !!known.add(track.key))
      .map((track) => ({ track, savedAt: now }));
    if (added.length) this.write([...added, ...this.items()].slice(0, SINGLES_LIMIT));
    return this.error() ? 0 : added.length;
  }

  remove(key: string): void {
    this.refresh();
    this.write(this.items().filter((item) => item.track.key !== key));
  }

  private write(items: SavedSingle[]): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(items));
      this.items.set(items);
      this.error.set(false);
    } catch {
      this.error.set(true);
    }
  }
}
