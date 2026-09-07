import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';

const FOLLOWS_KEY_BASE = 'mockingbird_twitter_follows';

/**
 * How many Twitter accounts one Mastodon account may follow here.
 *
 * Two hundred, which is deliberately the page size of the provider's
 * `user/followings` endpoint — so a bulk import of someone's real X following
 * list maps onto exactly one request per cap's worth.
 *
 * ## Why this was 10, and why 10 was wrong
 *
 * The original cap was set when nothing else limited spend, so it had to do all
 * the protecting by itself. That is no longer true: {@link TwitterUsage}
 * enforces a daily request limit, the timeline cache suppresses repeat fetches,
 * and `refreshMany` runs sequentially and stops on a rate limit. With those in
 * place, a low follow cap protects nothing the daily limit does not already
 * protect, while making the feature useless to the people it is aimed at —
 * someone keeping up with the friends who never left X plausibly has dozens.
 *
 * ## What the real constraint turned out to be
 *
 * Measured: a timeline page is ~6 credits, roughly $0.0001. Two hundred follows
 * refreshed once a day is about $0.36 a month — not the binding constraint.
 * The binding constraint is the CORS proxy's rate limit (Corsfix's free tier is
 * 60/min), which is a *pacing* problem, not a budget one. That is why the cap
 * can rise now and why the answer beyond a few hundred is rotation rather than
 * a bigger number — see `spec/ui/twitter_remaining_roadmap.md` §6.
 */
export const TWITTER_FOLLOW_LIMIT = 200;

/**
 * Above this many follows, refreshing everything stops being quick.
 *
 * Not a limit — a threshold for telling the truth. At 60 requests a minute
 * through a free proxy, fifty accounts is about a minute of solid requesting,
 * so past this point the UI should say what a full refresh actually involves
 * rather than letting someone discover it by watching a spinner.
 */
export const TWITTER_FOLLOW_COMFORTABLE = 50;

/**
 * One locally-followed Twitter account.
 *
 * "Follow" here is a subscription stored in this browser. It is emphatically
 * *not* a follow on Twitter: no request is made to Twitter, nobody is notified, and the
 * followed account cannot tell. The spec is explicit that following is a
 * mutation requiring an authenticated Twitter session (§2.2), which this app never
 * asks for — so this is the honest thing the app can actually do.
 */
export interface TwitterFollow {
  /**
   * The numeric X user id, once known.
   *
   * Recorded on the first successful profile lookup and preferred for every
   * fetch afterwards. Two reasons: §6.5 notes the id-based timeline endpoint is
   * faster because the provider skips an internal handle lookup, and — more
   * importantly — the id survives a rename while the handle does not. Somebody
   * who changes their @ should not silently vanish from the feed.
   */
  userId?: string;
  /** The handle, without `@`. The thing the user typed and recognises. */
  username: string;
  /** Display name at the time of following, for rendering the row. */
  displayName: string;
  /** Avatar URL, so the list looks like people rather than a list of strings. */
  avatar?: string;
  /** Epoch ms. */
  addedAt: number;
  /** Whether this account contributes to feeds. */
  enabled: boolean;
}

function load(key: string): TwitterFollow[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item): item is TwitterFollow =>
          !!item && typeof item === 'object' && typeof item.username === 'string',
      )
      .slice(0, TWITTER_FOLLOW_LIMIT);
  } catch {
    return [];
  }
}

/**
 * The Twitter accounts this Mastodon account follows locally.
 *
 * ## Why this is account-scoped when the API key is not
 *
 * The key belongs to whoever pays for the credits — one human, one balance,
 * shared across personas (see {@link TwitterSettings}). But *who you read* is a
 * property of the persona: a work alt and a personal account plausibly follow
 * entirely different people, and merging them would leak one context into the
 * other. So follows go through {@link scopedKey} exactly like RSS
 * subscriptions, and the Anonymous account gets its own set too.
 */
@Injectable({ providedIn: 'root' })
export class TwitterFollows {
  private readonly storageKey = scopedKey(FOLLOWS_KEY_BASE);
  readonly follows = signal<TwitterFollow[]>(load(this.storageKey));

  readonly enabled = computed(() => this.follows().filter((f) => f.enabled));
  readonly atLimit = computed(() => this.follows().length >= TWITTER_FOLLOW_LIMIT);

  /** Handles are compared case-insensitively: X treats @NASA and @nasa as one. */
  has(username: string): boolean {
    const needle = username.toLowerCase();
    return this.follows().some((f) => f.username.toLowerCase() === needle);
  }

  find(username: string): TwitterFollow | null {
    const needle = username.toLowerCase();
    return this.follows().find((f) => f.username.toLowerCase() === needle) ?? null;
  }

  /** Look a follow up by the namespaced account id the app renders it under. */
  findByAccountId(accountId: string): TwitterFollow | null {
    const match = /^twitter:@(.+)$/.exec(accountId);
    return match ? this.find(match[1]) : null;
  }

  /**
   * Follow an account.
   *
   * @returns an error message, or null on success. A message rather than a
   * thrown error because every caller is a form that wants to display it.
   */
  add(follow: Omit<TwitterFollow, 'addedAt' | 'enabled'>): string | null {
    if (this.has(follow.username)) {
      return `You already follow @${follow.username}.`;
    }
    if (this.atLimit()) {
      return (
        `You can follow up to ${TWITTER_FOLLOW_LIMIT} Twitter accounts here. ` +
        'Unfollow someone to make room.'
      );
    }
    this.persist([...this.follows(), { ...follow, addedAt: Date.now(), enabled: true }]);
    return null;
  }

  remove(username: string): void {
    const needle = username.toLowerCase();
    this.persist(this.follows().filter((f) => f.username.toLowerCase() !== needle));
  }

  setEnabled(username: string, enabled: boolean): void {
    const needle = username.toLowerCase();
    this.persist(
      this.follows().map((f) => (f.username.toLowerCase() === needle ? { ...f, enabled } : f)),
    );
  }

  /**
   * Record what a fetch just learned: the stable id, and the current display
   * name and avatar.
   *
   * Called from read paths rather than by the UI, so the rows improve as a
   * side effect of browsing rather than costing a request of their own. Writes
   * only on an actual change — this runs on every feed load, and re-serializing
   * the list each time would be a pointless write per refresh.
   */
  recordProfile(
    username: string,
    details: { userId?: string; displayName?: string; avatar?: string },
  ): void {
    const needle = username.toLowerCase();
    const existing = this.follows().find((f) => f.username.toLowerCase() === needle);
    if (!existing) {
      return;
    }
    const next: TwitterFollow = {
      ...existing,
      userId: details.userId ?? existing.userId,
      displayName: details.displayName || existing.displayName,
      avatar: details.avatar ?? existing.avatar,
    };
    if (
      next.userId === existing.userId &&
      next.displayName === existing.displayName &&
      next.avatar === existing.avatar
    ) {
      return;
    }
    this.persist(this.follows().map((f) => (f.username.toLowerCase() === needle ? next : f)));
  }

  private persist(follows: TwitterFollow[]): void {
    this.follows.set(follows);
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(follows));
    } catch {
      // Honoured for this session; the list is rebuilt from storage next time.
    }
  }
}
