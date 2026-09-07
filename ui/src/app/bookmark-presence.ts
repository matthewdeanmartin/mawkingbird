import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api';
import { Auth } from './auth';
import { AnonymousBookmarks } from './providers/anonymous/anonymous-bookmarks';

const KEY = 'mockingbird_has_bookmarks_v1';

/**
 * How long a "no bookmarks" answer is trusted before asking again.
 *
 * A day, because the question is cheap to be wrong about in one direction only.
 * The button being briefly absent for someone who just saved their first
 * bookmark elsewhere is a small loss; asking the server on every feed render is
 * a cost paid by everyone forever.
 */
const EMPTY_TTL_MS = 24 * 60 * 60 * 1000;

interface Cached {
  has: boolean;
  at: number;
}

/**
 * Does this reader have any bookmarks at all?
 *
 * Asked so that Home can show a "Review bookmarks" button only to people it
 * would do something for. A dead button beside a live one is noise, and the
 * button is the whole feature — so the question has to be answered before the
 * end of the feed is reached, and cheaply.
 *
 * ## The caching rule, and why it is asymmetric
 *
 * The boss's constraint:
 *
 * > "you check if we got any bookmarks, that's an API call. Then if it is >0,
 * > they have bookmarks FOREVER. We're not going to assume they have only 1 and
 * > they delete it... who cares. If they don't have any bookmarks, we check
 * > every day I guess."
 *
 * So the two answers are cached differently, and deliberately:
 *
 *  - **Yes is permanent.** Someone who has bookmarked once is a person who
 *    bookmarks. If they later delete every one, the button leads to an empty
 *    review — a trivial cost, and one no request budget should be spent
 *    preventing.
 *  - **No expires after a day.** New readers acquire bookmarks, and a
 *    permanently cached "no" would hide the feature from them forever.
 *
 * The result is at most one request per day for someone with no bookmarks, and
 * exactly one ever for someone who has them.
 *
 * Anonymous readers cost nothing at all: their bookmarks are rows in
 * localStorage, so the answer is a synchronous read with no cache needed.
 */
@Injectable({ providedIn: 'root' })
export class BookmarkPresence {
  private api = inject(Api);
  private auth = inject(Auth);
  private anonymous = inject(AnonymousBookmarks);

  /** Null until known. Home shows no button rather than guessing either way. */
  readonly has = signal<boolean | null>(null);

  private asked = false;

  /**
   * Answer the question, using at most one request.
   *
   * Safe to call on every feed load: the in-memory `asked` guard makes repeat
   * calls within a session free, and the stored answer makes them free across
   * sessions too until a "no" goes stale.
   */
  check(): void {
    if (this.auth.isAnonymous) {
      this.has.set(this.anonymous.bookmarks().length > 0);
      return;
    }
    if (this.asked) {
      return;
    }
    const cached = this.read();
    if (cached?.has) {
      // Yes, forever. Never re-asked.
      this.has.set(true);
      this.asked = true;
      return;
    }
    if (cached && Date.now() - cached.at < EMPTY_TTL_MS) {
      this.has.set(false);
      this.asked = true;
      return;
    }
    this.asked = true;
    // One is all the question needs: this asks whether any exist, not how many.
    this.api.bookmarks(undefined, 1).subscribe({
      next: (marks) => {
        const has = marks.length > 0;
        this.has.set(has);
        this.write({ has, at: Date.now() });
      },
      // A failure is not a "no". Leaving it null hides the button for this
      // session rather than caching a wrong answer for a day.
      error: () => this.has.set(null),
    });
  }

  /** Called when the reader bookmarks something, so the button appears at once. */
  noteBookmarked(): void {
    this.has.set(true);
    this.write({ has: true, at: Date.now() });
  }

  private read(): Cached | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Cached;
      return typeof parsed?.has === 'boolean' && typeof parsed?.at === 'number' ? parsed : null;
    } catch {
      return null;
    }
  }

  private write(value: Cached): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      // A full or blocked store just means the question gets asked again.
    }
  }
}
