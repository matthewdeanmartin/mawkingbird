import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';

const PASTE_FEEDS_KEY_BASE = 'mockingbird_paste_feeds';

export interface PasteFeedSubscription {
  providerId: string;
  url: string;
  label: string;
  enabled: boolean;
  /**
   * Fetch this feed through the configured CORS proxy instead of directly.
   *
   * Opt-in per feed and absent by default, exactly as {@link RssFeedSub}
   * defines it: none of the paste hosts send `access-control-*` headers, so
   * without a proxy their feeds cannot be read from a browser at all. That
   * makes the temptation to switch it on automatically strong and the reason
   * not to unchanged — a proxy operator sees every address and every byte that
   * passes through, so routing traffic through one stays a decision the user
   * makes per feed. A subscription stored before this field existed reads as
   * `undefined` and keeps fetching directly.
   */
  useProxy?: boolean;
}

function load(key: string): PasteFeedSubscription[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? (parsed as PasteFeedSubscription[]) : [];
  } catch {
    return [];
  }
}

/**
 * Read this account's subscriptions, adopting any pre-scoping list on the way.
 *
 * Paste feeds were originally stored under one unscoped key shared by every
 * account, which contradicts what a subscription means: `@johndoe` following
 * openSUSE's feed says nothing about what Anonymous wants in its timeline. The
 * fix is {@link scopedKey}, and the migration is a one-time adoption — the
 * legacy list becomes the property of whichever account reads it first, rather
 * than being dropped on the floor and silently unsubscribing someone.
 *
 * The legacy key is removed once adopted, so the next account starts empty
 * instead of inheriting the same list a second time.
 */
function loadWithMigration(scoped: string): PasteFeedSubscription[] {
  const current = load(scoped);
  if (current.length || scoped === PASTE_FEEDS_KEY_BASE) {
    return current;
  }
  const legacy = load(PASTE_FEEDS_KEY_BASE);
  if (!legacy.length) {
    return current;
  }
  try {
    localStorage.setItem(scoped, JSON.stringify(legacy));
    localStorage.removeItem(PASTE_FEEDS_KEY_BASE);
  } catch {
    // Storage-disabled browsers keep the adopted list for this session only.
  }
  return legacy;
}

/**
 * Opt-in public paste feeds, per account.
 *
 * The storage key is scoped to the active account (see {@link scopedKey}) for
 * the same reason RSS subscriptions are: one account's feeds must not bleed
 * into another's. The key is resolved once at construction; switching accounts
 * hard-reloads the app, which reconstructs this service against the new key.
 *
 * Paste *providers* are global — every account can post to the same services —
 * but which public feeds appear in your timeline is a per-account choice.
 */
@Injectable({ providedIn: 'root' })
export class PasteFeedSubscriptions {
  private readonly storageKey = scopedKey(PASTE_FEEDS_KEY_BASE);
  readonly feeds = signal<PasteFeedSubscription[]>(loadWithMigration(this.storageKey));
  readonly enabledFeeds = computed(() => this.feeds().filter((feed) => feed.enabled));

  has(providerId: string): boolean {
    return this.feeds().some((feed) => feed.providerId === providerId && feed.enabled);
  }

  follow(providerId: string, url: string, label: string): void {
    const existing = this.feeds().find((feed) => feed.providerId === providerId);
    const next = existing
      ? this.feeds().map((feed) =>
          feed.providerId === providerId ? { ...feed, url, label, enabled: true } : feed,
        )
      : [...this.feeds(), { providerId, url, label, enabled: true }];
    this.persist(next);
  }

  unfollow(providerId: string): void {
    this.persist(
      this.feeds().map((feed) =>
        feed.providerId === providerId ? { ...feed, enabled: false } : feed,
      ),
    );
  }

  /** Route this feed through the configured CORS proxy, or stop doing so. */
  setUseProxy(providerId: string, useProxy: boolean): void {
    this.persist(
      this.feeds().map((feed) => (feed.providerId === providerId ? { ...feed, useProxy } : feed)),
    );
  }

  /** Whether this provider's feed is set to go through the proxy. */
  usesProxy(providerId: string): boolean {
    return this.feeds().find((feed) => feed.providerId === providerId)?.useProxy === true;
  }

  private persist(feeds: PasteFeedSubscription[]): void {
    this.feeds.set(feeds);
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(feeds));
    } catch {
      // Storage-disabled browsers keep the choice for this session only.
    }
  }
}
