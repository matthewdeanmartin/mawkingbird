import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';
import { Account } from './models';

/** The relay instance. Every tag there is an account that boosts posts for it. */
export const TAGS_PUB_HOST = 'tags.pub';

export type RelayStatus = 'unknown' | 'checking' | 'following' | 'not_following' | 'missing';

export interface RelayRow {
  /** Bare tag name, as followed locally. */
  tag: string;
  /** The relay handle, `tag@tags.pub`. */
  handle: string;
  status: RelayStatus;
  /** Resolved relay account, once found. */
  account?: Account;
}

/** How many handles are resolved before the batched relationship read. */
const RESOLVE_BATCH = 20;

/**
 * tags.pub relay follows.
 *
 * Following a hashtag only shows posts your own server has already seen, which
 * on a small instance is a fraction of them. tags.pub runs one account per tag
 * that boosts posts from across the network, so following `#foo` locally *and*
 * `@foo@tags.pub` fills in what your server missed.
 *
 * Checking whether you already follow a relay is the expensive part: each tag
 * needs a `search?resolve=true` to turn `foo@tags.pub` into an account id.
 * Those cannot be batched — Mastodon has no bulk resolve — but the follow-state
 * read that follows them can, via `relationships(ids)`, which takes the whole
 * set in one request. So the cost is one request per tag plus one, paid only
 * when the reader asks for it.
 *
 * Deliberately not cached. A cache here would have to be invalidated by follows
 * and unfollows made anywhere else (this app, another client, the web UI), and
 * a stale "already following" is worse than a re-check: it hides the button
 * that fixes the problem the reader came here to fix.
 */
@Injectable({ providedIn: 'root' })
export class TagsPub {
  private api = inject(Api);

  readonly rows = signal<RelayRow[]>([]);
  readonly checking = signal(false);
  readonly following = signal(false);
  readonly error = signal<string | null>(null);

  /** Spacing between follow writes; tests set this to 0. */
  delayMs = 250;

  private stopRequested = false;

  reset(): void {
    this.rows.set([]);
    this.error.set(null);
    this.checking.set(false);
    this.following.set(false);
    this.stopRequested = false;
  }

  stop(): void {
    this.stopRequested = true;
  }

  /** Rows whose relay exists and is not yet followed — what "follow all" writes. */
  pending(): RelayRow[] {
    return this.rows().filter((row) => row.status === 'not_following');
  }

  /**
   * Resolve each tag's relay account, then read all follow states in one call.
   *
   * A tag with no relay account is marked `missing` rather than failed: not
   * every hashtag has one, and that is a normal answer, not an error.
   */
  async check(tags: readonly string[]): Promise<void> {
    if (this.checking() || !tags.length) {
      return;
    }
    this.stopRequested = false;
    this.checking.set(true);
    this.error.set(null);
    this.rows.set(
      tags.map((tag) => ({
        tag,
        handle: `${tag}@${TAGS_PUB_HOST}`,
        status: 'checking' as const,
      })),
    );
    try {
      const found: { index: number; account: Account }[] = [];
      for (let i = 0; i < this.rows().length; i += RESOLVE_BATCH) {
        if (this.stopRequested) {
          break;
        }
        const slice = this.rows().slice(i, i + RESOLVE_BATCH);
        const resolved = await Promise.all(
          slice.map((row, offset) =>
            this.resolve(row.handle).then((account) => ({ index: i + offset, account })),
          ),
        );
        for (const { index, account } of resolved) {
          if (account) {
            found.push({ index, account });
            this.patch(index, { account });
          } else {
            this.patch(index, { status: 'missing' });
          }
        }
      }

      if (!found.length) {
        return;
      }
      // The one batched read: every resolved relay's follow state at once.
      const relationships = await firstValueFrom(
        this.api.relationships(found.map(({ account }) => account.id)),
      );
      const followingIds = new Set(
        relationships.filter((rel) => rel.following).map((rel) => rel.id),
      );
      for (const { index, account } of found) {
        this.patch(index, {
          status: followingIds.has(account.id) ? 'following' : 'not_following',
        });
      }
    } catch {
      this.error.set('Could not check tags.pub. Please try again.');
    } finally {
      this.checking.set(false);
    }
  }

  /** Follow every relay found but not yet followed, one at a time. */
  async followAll(): Promise<void> {
    if (this.following()) {
      return;
    }
    this.stopRequested = false;
    this.following.set(true);
    this.error.set(null);
    try {
      for (let i = 0; i < this.rows().length; i++) {
        if (this.stopRequested) {
          break;
        }
        const row = this.rows()[i];
        if (row.status !== 'not_following' || !row.account) {
          continue;
        }
        try {
          await firstValueFrom(this.api.follow(row.account.id));
          this.patch(i, { status: 'following' });
        } catch {
          // One relay refusing does not stop the rest; the row stays actionable.
          this.error.set('Some relays could not be followed.');
        }
        if (this.delayMs) {
          await sleep(this.delayMs);
        }
      }
    } finally {
      this.following.set(false);
    }
  }

  private async resolve(handle: string): Promise<Account | undefined> {
    try {
      const results = await firstValueFrom(
        this.api.search(handle, 'accounts', { resolve: true, limit: 5 }),
      );
      const wanted = handle.toLowerCase();
      return (results.accounts ?? []).find((a) => a.acct.toLowerCase() === wanted);
    } catch {
      return undefined;
    }
  }

  private patch(i: number, changes: Partial<RelayRow>): void {
    this.rows.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...changes } : r)));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
