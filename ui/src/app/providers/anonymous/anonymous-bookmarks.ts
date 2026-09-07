import { computed, Injectable, signal } from '@angular/core';
import { Status } from '../../models';

const STORAGE_KEY = 'mockingbird_anonymous_bookmarks';
const STATE_VERSION = 1;

interface AnonymousBookmarkState {
  version: typeof STATE_VERSION;
  bookmarks: Status[];
}

function bookmarkKey(status: Status): string {
  const shown = status.reblog ?? status;
  if (shown.url) {
    return shown.url;
  }
  return `${shown.provider ?? 'mastodon'}:${shown.id}`;
}

function loadState(): AnonymousBookmarkState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<AnonymousBookmarkState> | null;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.bookmarks)) {
      return { version: STATE_VERSION, bookmarks: [] };
    }
    return {
      version: STATE_VERSION,
      bookmarks: parsed.bookmarks.filter(
        (status): status is Status =>
          typeof status?.id === 'string' && typeof status.account?.username === 'string',
      ),
    };
  } catch {
    return { version: STATE_VERSION, bookmarks: [] };
  }
}

/** Owns complete locally renderable bookmark snapshots for Anonymous. */
@Injectable({ providedIn: 'root' })
export class AnonymousBookmarks {
  private state = signal(loadState());

  readonly bookmarks = computed(() => this.state().bookmarks);

  has(status: Status): boolean {
    const key = bookmarkKey(status);
    return this.bookmarks().some((bookmark) => bookmarkKey(bookmark) === key);
  }

  toggle(status: Status): Status {
    const shown = status.reblog ?? status;
    const key = bookmarkKey(shown);
    if (this.has(shown)) {
      this.persist(this.bookmarks().filter((bookmark) => bookmarkKey(bookmark) !== key));
      return { ...shown, bookmarked: false };
    }
    const saved = { ...shown, bookmarked: true };
    this.persist([saved, ...this.bookmarks()]);
    return saved;
  }

  private persist(bookmarks: Status[]): void {
    const state: AnonymousBookmarkState = { version: STATE_VERSION, bookmarks };
    this.state.set(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}
