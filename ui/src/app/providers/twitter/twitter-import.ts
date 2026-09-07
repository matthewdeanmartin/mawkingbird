import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TwitterApi } from './twitter-api';
import { TwitterFollows } from './twitter-follows';
import { TwitterPacer } from './twitter-pacer';
import { WireFollowing } from './twitterapi-io/wire-types';

/**
 * Import someone's Twitter following list, skipping the dead accounts.
 *
 * ## The two costs, which are nothing alike
 *
 * Measured 2026-08-01:
 *
 * - **Fetching the list is free and fast.** `user/followings` returns 200
 *   accounts per request and moved the credit balance by less than its
 *   resolution. Even 5,000 follows is ~25 requests.
 * - **Checking whether an account is still alive costs one request each**, and
 *   there is no bulk alternative: no endpoint on this service reports a
 *   last-tweet timestamp. `created_at` on both the profile and the followings
 *   entry is when the *account* was created, which says nothing about activity.
 *
 * How long that takes depends entirely on the plan. The *free* tier allows one
 * request every five seconds — the service says so in its own error body — so
 * 200 candidates is about seventeen minutes. On a paid balance, twenty
 * back-to-back requests all succeeded (measured 2026-08-01), and the same work
 * finishes in under a minute.
 *
 * The pace is therefore discovered at runtime by {@link TwitterPacer} rather
 * than hardcoded. But the *worst* case still shapes this design: the check
 * cannot be a modal spinner, it has to be interruptible, and partial results
 * have to be worth keeping.
 *
 * ## So the import is staged
 *
 * 1. **Fetch the list.** Cheap, fast, and reversible — nothing is followed yet.
 * 2. **Filter on what the list already tells us.** `statuses_count === 0` means
 *    the account has never posted; `protected` means we could never read it.
 *    Both are free to detect and remove real accounts from the candidate set
 *    before any per-account request is spent.
 * 3. **Optionally check liveness**, one account at a time, oldest-first, with
 *    live progress and a Stop button. Every verdict is applied as it arrives,
 *    so stopping halfway leaves a shorter but correct import rather than
 *    nothing.
 *
 * Step 3 is opt-in precisely because it is the expensive one. Without it the
 * import still works — it just includes accounts that stopped posting in 2019,
 * which is the thing the user said they most wanted gone.
 */

/** Default cutoff for "dead": no post in this many days. */
export const DEFAULT_INACTIVE_DAYS = 365;

/**
 * Pull handles out of pasted text.
 *
 * Accepts commas, newlines, spaces, and any mix — because the list is going to
 * be pasted from somewhere else (a note, a spreadsheet column, a thread) and
 * insisting on one separator would just make people edit it first. `@` is
 * optional, and a full profile URL works too, since that is what you get from
 * copying a link.
 *
 * Deliberately no network calls: this is free, instant, and reversible. It is
 * the path for someone who knows exactly which twenty accounts they want and
 * does not want to import four thousand to get them.
 */
export function parseHandles(text: string): string[] {
  const seen = new Set<string>();
  const handles: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) {
      continue;
    }
    // A pasted profile URL — x.com/NASA, twitter.com/NASA/, with or without
    // query junk — yields the handle rather than being rejected as malformed.
    const fromUrl = /(?:^|\/\/)(?:www\.|mobile\.)?(?:x|twitter|nitter\.\w+)\.com\/([^/?#]+)/i.exec(
      raw,
    );
    const candidate = (fromUrl ? fromUrl[1] : raw).replace(/^@+/, '').trim();
    // Twitter handles are 1-15 of [A-Za-z0-9_]. Anything else is a stray word
    // from the paste, not a handle someone meant to type.
    if (!/^[A-Za-z0-9_]{1,15}$/.test(candidate)) {
      continue;
    }
    const key = candidate.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      handles.push(candidate);
    }
  }
  return handles;
}

/** One account under consideration, with whatever we know so far. */
export interface ImportCandidate {
  userId: string;
  username: string;
  displayName: string;
  avatar?: string;
  /** Lifetime posts. Zero means never posted — free to detect. */
  statusesCount: number;
  protected: boolean;
  /** ISO date of the newest post, once checked. */
  lastPostedAt?: string | null;
  /** Why this candidate was excluded, or null if it is still in. */
  excluded: string | null;
  /** True once a liveness request has been spent on it. */
  checked: boolean;
}

export type ImportPhase = 'idle' | 'listing' | 'checking' | 'done' | 'stopped' | 'failed';

/**
 * How many times one account's check is retried when the service refuses it.
 *
 * A rate-limited request did no work, so retrying is not extra spend on a
 * result we already have — it is the only way to avoid silently dropping the
 * account from the import.
 */
export const RATE_LIMIT_RETRIES = 3;

@Injectable({ providedIn: 'root' })
export class TwitterImport {
  private api = inject(TwitterApi);
  private follows = inject(TwitterFollows);
  private pacer = inject(TwitterPacer);

  readonly phase = signal<ImportPhase>('idle');
  readonly candidates = signal<ImportCandidate[]>([]);
  readonly error = signal<string | null>(null);
  /** Requests spent by this import, so the panel can show the running cost. */
  readonly requests = signal(0);
  /** How many liveness checks have completed, for the progress line. */
  readonly checked = signal(0);

  /** Set while a run should abort at the next opportunity. */
  private stopRequested = false;

  readonly keeping = computed(() => this.candidates().filter((c) => !c.excluded));
  readonly excluded = computed(() => this.candidates().filter((c) => c.excluded));

  /** Candidates still needing a request to decide. */
  readonly unchecked = computed(() => this.candidates().filter((c) => !c.excluded && !c.checked));

  /**
   * Wall-clock estimate for checking the rest, in seconds.
   *
   * Reads the pacer's *current* interval rather than a constant, so the figure
   * reflects the plan actually in force: a paid account sees seconds where a
   * throttled free one sees minutes. It also moves during a run, which is the
   * honest behaviour — the estimate was wrong the moment the pace changed.
   */
  readonly checkSeconds = computed(() =>
    Math.round((this.unchecked().length * this.pacer.delayMs()) / 1000),
  );

  readonly running = computed(() => this.phase() === 'listing' || this.phase() === 'checking');

  /**
   * Whether the service has refused us at least once this run.
   *
   * Surfaced so a slowdown is explained rather than merely experienced: a run
   * that suddenly takes ten times longer looks broken unless the page says the
   * service is throttling.
   */
  readonly throttled = this.pacer.throttled;

  stop(): void {
    this.stopRequested = true;
  }

  reset(): void {
    this.stopRequested = false;
    this.phase.set('idle');
    this.candidates.set([]);
    this.error.set(null);
    this.requests.set(0);
    this.checked.set(0);
  }

  /**
   * Fetch the accounts `username` follows, up to `stopAfter`.
   *
   * Nothing is followed by this — it only builds the candidate list, so the
   * user can look at it, adjust the filters, and decide. An import that
   * silently added 200 accounts to someone's feed would be very hard to undo.
   */
  async list(username: string, stopAfter: number): Promise<void> {
    this.reset();
    this.pacer.reset();
    this.phase.set('listing');
    const collected: ImportCandidate[] = [];
    let cursor: string | undefined;

    try {
      while (collected.length < stopAfter) {
        const page = await firstValueFrom(this.api.getFollowings({ username }, cursor));
        this.requests.update((n) => n + 1);
        for (const user of page.users) {
          if (collected.length >= stopAfter) {
            break;
          }
          const candidate = toCandidate(user);
          if (candidate) {
            collected.push(candidate);
          }
        }
        this.candidates.set([...collected]);
        if (this.stopRequested) {
          this.phase.set('stopped');
          return;
        }
        if (!page.hasMore || !page.cursor) {
          break;
        }
        cursor = page.cursor;
        // Paging is a request too, so it is paced like everything else.
        this.pacer.noteSuccess();
        await this.pacer.wait();
      }
      this.applyFreeFilters();
      this.phase.set('done');
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Could not read that following list.',
      );
      this.phase.set('failed');
    }
  }

  /**
   * Exclusions that cost nothing, applied as soon as the list arrives.
   *
   * Worth doing separately from the liveness check: these remove real accounts
   * from the candidate set *before* any per-account request is spent on them,
   * so the expensive step has less to do.
   */
  private applyFreeFilters(): void {
    this.candidates.update((all) =>
      all.map((candidate) => {
        if (candidate.protected) {
          // We could never read their posts, so following them here would add a
          // permanently empty feed.
          return { ...candidate, excluded: 'Protected account — their posts cannot be read.' };
        }
        if (candidate.statusesCount === 0) {
          return { ...candidate, excluded: 'Has never posted.' };
        }
        return candidate;
      }),
    );
  }

  /**
   * Check each remaining candidate's last post, excluding the long-dormant.
   *
   * One request per account with a five-second gap, so this is minutes rather
   * than seconds — see the class comment. Verdicts are applied as they arrive
   * and {@link stop} takes effect between accounts, so stopping early leaves a
   * usable partial result.
   */
  async checkLiveness(inactiveDays = DEFAULT_INACTIVE_DAYS): Promise<void> {
    this.stopRequested = false;
    this.pacer.reset();
    this.phase.set('checking');
    const cutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;

    for (const candidate of this.unchecked()) {
      if (this.stopRequested) {
        this.phase.set('stopped');
        return;
      }
      // A rate-limited request did no work, so it is retried rather than
      // skipped — moving on would silently drop an account from the import.
      let attempts = 0;
      for (;;) {
        attempts++;
        try {
          const lastPostedAt = await firstValueFrom(this.api.getLastPostedAt(candidate.userId));
          this.requests.update((n) => n + 1);
          this.pacer.noteSuccess();
          const dead = !lastPostedAt || Date.parse(lastPostedAt) < cutoff;
          this.patch(candidate.userId, {
            lastPostedAt,
            checked: true,
            excluded: dead
              ? lastPostedAt
                ? `No posts since ${lastPostedAt.slice(0, 10)}.`
                : 'No readable posts.'
              : null,
          });
          break;
        } catch (error: unknown) {
          this.requests.update((n) => n + 1);
          const retry = this.pacer.noteFailure(error) && attempts < RATE_LIMIT_RETRIES;
          if (retry) {
            await this.pacer.wait();
            if (this.stopRequested) {
              this.phase.set('stopped');
              return;
            }
            continue;
          }
          // An account we cannot check is kept rather than dropped: excluding
          // someone because of a transient failure is the worse mistake, and
          // the user can still untick them by hand.
          this.patch(candidate.userId, { checked: true });
          break;
        }
      }
      this.checked.update((n) => n + 1);
      await this.pacer.wait();
    }
    this.phase.set('done');
  }

  /** Put a candidate back in, or take one out, by hand. */
  toggle(userId: string): void {
    this.candidates.update((all) =>
      all.map((candidate) =>
        candidate.userId === userId
          ? { ...candidate, excluded: candidate.excluded ? null : 'Skipped by you.' }
          : candidate,
      ),
    );
  }

  /**
   * Follow everyone still included, and report how many landed.
   *
   * Respects {@link TWITTER_FOLLOW_LIMIT} rather than silently overflowing it,
   * and returns the shortfall so the UI can say what was left out instead of
   * pretending the import was complete.
   */
  apply(): { added: number; skipped: number; capped: number; already: number } {
    const keeping = this.keeping();
    let added = 0;
    let already = 0;
    let capped = 0;
    for (const candidate of keeping) {
      // `add` reports duplicates and the cap by returning a message. Counting
      // its refusals as successes would tell someone 200 accounts were imported
      // when most were already followed.
      const refusal = this.follows.add({
        username: candidate.username,
        displayName: candidate.displayName,
        avatar: candidate.avatar,
        userId: candidate.userId,
      });
      if (!refusal) {
        added++;
      } else if (/already follow/i.test(refusal)) {
        already++;
      } else {
        capped++;
      }
    }
    return { added, skipped: this.excluded().length, capped, already };
  }

  /**
   * Follow a pasted list of handles directly, without verifying them.
   *
   * Costs **nothing**. A follow here is a local subscription, so an entry that
   * turns out to be a typo simply produces one failed timeline fetch later,
   * visible on the follow list, and is one click to remove. Spending a request
   * per handle to check spelling would make the cheap path expensive to protect
   * against a mistake the user can already see and fix.
   *
   * This is the path for someone who knows which accounts they want. Importing
   * a whole following list is the other one, and they are different jobs: a
   * following list from years ago may be thousands of accounts you no longer
   * care about, and wanting twenty of them is not a reason to import all four
   * thousand.
   */
  followPasted(text: string): {
    added: number;
    already: number;
    capped: number;
    invalid: number;
  } {
    const handles = parseHandles(text);
    // Count only tokens that were genuinely *unusable*, not ones parseHandles
    // merged as duplicates. Comparing raw token count to handle count blamed a
    // repeated @handle on bad input and reported "2 ignored" for one typo.
    const invalid = text
      .split(/[\s,;]+/)
      .filter(Boolean)
      .filter((token) => parseHandles(token).length === 0).length;
    let added = 0;
    let already = 0;
    let capped = 0;
    for (const username of handles) {
      const refusal = this.follows.add({ username, displayName: username });
      if (!refusal) {
        added++;
      } else if (/already follow/i.test(refusal)) {
        already++;
      } else {
        capped++;
      }
    }
    return { added, already, capped, invalid };
  }

  private patch(userId: string, changes: Partial<ImportCandidate>): void {
    this.candidates.update((all) =>
      all.map((candidate) =>
        candidate.userId === userId ? { ...candidate, ...changes } : candidate,
      ),
    );
  }
}

/**
 * A wire followings entry as a candidate, or null when it is unusable.
 *
 * The handle arrives as `screen_name` here and `userName` elsewhere in the same
 * API, so both are accepted. An entry with neither, or with no id, cannot be
 * followed or checked and is dropped.
 */
export function toCandidate(user: WireFollowing): ImportCandidate | null {
  const username = user.screen_name ?? user.userName;
  if (!username || !user.id) {
    return null;
  }
  return {
    userId: user.id,
    username,
    displayName: user.name || username,
    avatar: user.profile_image_url_https,
    statusesCount: user.statuses_count ?? 0,
    protected: user.protected === true,
    excluded: null,
    checked: false,
  };
}
