import { computed, inject, Injectable, signal } from '@angular/core';
import { PageDiagnostics } from '../../page-diagnostics';
import { ProfileCollections } from './profile-collections';
import { isDurableBlock, WriteBlock, writeBlockFor } from './write-block';
import type { CollectionResult } from './profile-collections';

/**
 * The OPML subscription list, stored on a Mawkingbird Plus account.
 *
 * ## What is stored, and what is deliberately not
 *
 * The *list*: feed URL, title, and the folders it sat under. Never the feed
 * **contents** — those are cache, they are large, they are refetched anyway, and
 * storing them would turn a small document that changes when you subscribe to
 * something into a large one that changes every few minutes. The whole index is
 * rewritten on every write (see `mawkingbird_profile/docs/01-data-model.md`), so
 * churn is the cost that matters.
 *
 * `folders` is carried even though today's UI flattens them. The OPML parser
 * already reads folder paths, so keeping them costs nothing now and means
 * enabling folders later is a UI change rather than a data migration.
 *
 * ## A decided rule: a secret in a URL is not a secret
 *
 * Private feed URLs (Feedbin, Miniflux, Google Alerts) routinely embed an API
 * key in the URL itself. Those URLs are stored **as-is** and are not treated as
 * credentials, and the user is not warned about it. Protecting a key pasted into
 * a URL field would mean encrypting the subscription list, which is not worth
 * what it buys — and real secret storage is separate future work. The app does
 * not lecture people about what they paste.
 *
 * ## Not synced: `useProxy`, `enabled`
 *
 * Both are per-browser operational facts rather than part of the subscription.
 * `useProxy` in particular is a decision to route one feed through a third party,
 * and `RssSubscriptions` is emphatic that the app never turns it on for someone;
 * syncing it would do exactly that on the next browser.
 */

const COLLECTION = 'feeds';

/** One subscription, as stored server-side. */
export interface ProfileFeed {
  /** The feed URL. Also the identity of the subscription. */
  url: string;
  title: string;
  /** Folder path this feed sat under, outermost first. Empty when top-level. */
  folders: string[];
}

@Injectable({ providedIn: 'root' })
export class ProfileFeeds {
  private collections = inject(ProfileCollections);
  private diagnostics = inject(PageDiagnostics);

  private state = signal<ProfileFeed[]>([]);
  private ready = signal(false);
  private failure = signal<string | null>(null);
  private writable = signal(true);
  private block = signal<WriteBlock | null>(null);

  readonly feeds = computed(() => this.state());
  readonly count = computed(() => this.state().length);
  /** Whether the collection has been fetched. Distinct from "is empty". */
  readonly loaded = computed(() => this.ready());
  readonly error = computed(() => this.failure());
  readonly canWrite = computed(() => this.writable());

  /**
   * Why writes are blocked, or null.
   *
   * Exposed alongside `canWrite` so the UI can say what actually happened. A
   * bare boolean is what let three screens describe every refusal as a lapsed
   * subscription — the reason was thrown away before the template saw it.
   */
  readonly writeBlock = computed(() => this.block());

  async load(): Promise<void> {
    const result = await this.collections.index<ProfileFeed>(COLLECTION);
    if (result.kind === 'ok') {
      this.state.set(
        result.value.index.items
          .map((item) => item.inline)
          .filter((feed): feed is ProfileFeed => isFeed(feed)),
      );
      this.ready.set(true);
      this.failure.set(null);
      this.writable.set(true);
      this.block.set(null);
      return;
    }
    if (result.kind === 'unchanged') {
      this.ready.set(true);
      return;
    }
    this.note(result);
  }

  /**
   * Add or replace one subscription.
   *
   * Keyed by URL, so re-adding a feed updates its title rather than storing it
   * twice — the same thing the local store does, and the behaviour a user
   * expects from re-importing an OPML file they have edited.
   */
  async put(feed: ProfileFeed): Promise<boolean> {
    const id = feedId(feed.url);
    if (!id) {
      return false;
    }
    const previous = this.state();
    const others = previous.filter((existing) => existing.url !== feed.url);
    this.state.set([...others, feed]);

    const result = await this.collections.put(COLLECTION, id, feed);
    if (result.kind !== 'ok') {
      this.state.set(previous);
      this.note(result);
      return false;
    }
    return true;
  }

  async remove(url: string): Promise<boolean> {
    const id = feedId(url);
    if (!id) {
      return false;
    }
    const previous = this.state();
    this.state.set(previous.filter((feed) => feed.url !== url));

    const result = await this.collections.remove(COLLECTION, id);
    if (result.kind !== 'ok') {
      this.state.set(previous);
      this.note(result);
      return false;
    }
    return true;
  }

  /**
   * Upload a whole subscription list in one write.
   *
   * One batch rather than N puts racing each other for the index — the same
   * reasoning as `ProfileLists.copyIn`. Feeds already stored under the same URL
   * are replaced rather than duplicated, because a feed's identity *is* its URL.
   */
  async replaceAll(feeds: ProfileFeed[]): Promise<boolean> {
    const operations = feeds
      .map((feed) => ({ feed, id: feedId(feed.url) }))
      .filter((entry): entry is { feed: ProfileFeed; id: string } => entry.id !== null)
      .map(({ feed, id }) => ({ op: 'put' as const, id, value: feed }));
    if (operations.length === 0) {
      return true;
    }

    const result = await this.collections.batch(COLLECTION, operations);
    if (result.kind !== 'ok') {
      this.note(result);
      return false;
    }
    await this.load();
    this.diagnostics.info('ProfileFeeds', 'feeds:upload', { count: operations.length });
    return true;
  }

  private note(result: CollectionResult<unknown>): void {
    if (result.kind === 'ok' || result.kind === 'unchanged') {
      return;
    }
    const blocked = writeBlockFor(result);
    if (blocked) {
      this.block.set(blocked);
      // Only a durable refusal latches read-only. A transport failure that
      // flipped this would leave the UI making a claim about the account long
      // after the network came back.
      if (isDurableBlock(blocked)) {
        this.writable.set(false);
      }
    }
    if (result.kind === 'absent') {
      // Nothing stored is not a failure; it is an empty collection.
      this.ready.set(true);
      this.failure.set(null);
      return;
    }
    this.failure.set(result.message);
    this.diagnostics.info('ProfileFeeds', 'request:failed', { kind: result.kind });
  }

  /** Reset to construction state. For tests and for signing out. */
  reset(): void {
    this.state.set([]);
    this.ready.set(false);
    this.failure.set(null);
    this.writable.set(true);
    this.block.set(null);
  }
}

/**
 * A stable object id for a feed URL.
 *
 * The URL cannot be the id directly: ids are concatenated into an R2 key, so the
 * service refuses anything holding a path separator, and caps the whole thing at
 * 128 characters. Percent- or hex-encoding a URL blows that cap on any feed with
 * a query string, and truncating to fit would let two feeds collide onto one id
 * and silently overwrite each other.
 *
 * So: a hash. Opaque in a bucket listing, which is the real cost, but stable,
 * always legal, and always the same length. The URL itself is stored *inside*
 * the object, so nothing is lost — a listing shows opaque ids, and one GET says
 * which feed each is.
 *
 * FNV-1a rather than SHA-256 because this is a naming scheme, not a security
 * boundary: it needs to avoid accidental collisions between one person's feeds,
 * not resist someone constructing one. Synchronous, which keeps every caller
 * synchronous too — `crypto.subtle` would make `put()` and `remove()` await a
 * digest before they could name the thing they are writing. The URL is included
 * alongside the hash so an accidental collision would have to match both the
 * hash and the length.
 */
export function feedId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    // The FNV prime, via shifts: a plain `hash * 16777619` exceeds 2^53 and
    // silently loses the low bits that make the hash a hash.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `feed-${hash.toString(36)}-${trimmed.length.toString(36)}`;
}

function isFeed(value: unknown): value is ProfileFeed {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ProfileFeed>;
  return (
    typeof candidate.url === 'string' &&
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.folders)
  );
}
