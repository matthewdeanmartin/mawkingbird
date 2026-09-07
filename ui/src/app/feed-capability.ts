import { inject, Injectable, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { Server } from './server';

/**
 * Which feeds does the server in front of us actually serve?
 *
 * ## The problem
 *
 * We link to feeds a given server will not give us. `mastodon.social` answers
 * `/timelines/public` with 422 to an anonymous client; plenty of servers turn
 * the local or federated timeline off entirely; some serve no trending links.
 * The user clicks, gets an error page, and learns only that something is
 * broken — which reads as *our* bug, not the server's configuration.
 *
 * ## Hide, rather than disable
 *
 * An unsupported feed is not rendered at all. Not greyed out, not tooltipped.
 *
 * A disabled row is a permanent advertisement for something this server will
 * never provide, and it invites repeated clicking to check. This is a fact
 * about the server, not a preference the user could change — the place that
 * explains a server's limits is its own About page, which we already link.
 *
 * Hiding the *link* is a discovery decision, not access control: the routes
 * still work if reached directly, and land on the existing unavailable page.
 *
 * ## Rare, but not permanent
 *
 * Unlike {@link SearchCapability} — which deliberately holds its answers in
 * memory only, because a stale "search is broken here" outliving the fix would
 * be worse than the bug — these answers *are* persisted. Five probes on every
 * page load is a real cost, and server configuration changes on the timescale
 * of an admin editing a file, not of a page view.
 *
 * So: a {@link TTL_MS}-day cache, used immediately when stale and refreshed in
 * the background, so a server that just enabled a feed comes back on the next
 * visit rather than the next click.
 *
 * ## Why the token is part of the key
 *
 * The signed-in and anonymous answers genuinely differ — the 422 above is
 * exactly that. An anonymous "refused" that survived login would hide a feed
 * the user can now see, which is the same class of error this fixes, pointed
 * the other way.
 */

/** The feeds worth asking about, each one somewhere we render a link. */
export type FeedKind =
  | 'public-local'
  | 'public-federated'
  | 'trending-links'
  | 'trending-tags'
  | 'trending-statuses';

export const FEED_KINDS: readonly FeedKind[] = [
  'public-local',
  'public-federated',
  'trending-links',
  'trending-tags',
  'trending-statuses',
];

/** What we know about one feed on one host. */
export type FeedAbility =
  | 'unknown'
  /**
   * Answered. Note an empty 200 counts: a server with nothing trending right
   * now is not a server without trends, and hiding a working feed because the
   * moment is quiet would be this bug in reverse.
   */
  | 'works'
  /** Explicitly refused — 401/403/404/410/422 — i.e. not offered here. */
  | 'refused'
  /** Couldn't be reached (network, CORS, 5xx). Assumed temporary. */
  | 'unreachable';

export type HostFeeds = Partial<Record<FeedKind, FeedAbility>>;

interface CacheEntry {
  checkedAt: number;
  feeds: HostFeeds;
}

/** Registered in `storage-registry.ts` as cache. */
const STORAGE_KEY = 'mockingbird_feed_capability_v1';

/** How long an answer is trusted before a background refresh. */
export const TTL_MS = 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class FeedCapability {
  private api = inject(Api);
  private auth = inject(Auth);
  private server = inject(Server);

  private known = signal<Record<string, CacheEntry>>(this.read());

  /** In-flight probes, so N callers for one host+feed make one request. */
  private pending = new Map<string, Promise<FeedAbility>>();

  /**
   * Whether to show the link for `kind` on the current host.
   *
   * Optimistic while unknown: a feed we have not asked about yet stays visible,
   * because hiding every link for the first few hundred milliseconds of every
   * session would be a worse flicker than the occasional dud click this fixes.
   * `unreachable` is also shown — a server that was down once is not a server
   * without the feature.
   */
  shows(kind: FeedKind): boolean {
    return this.peek(kind) !== 'refused';
  }

  /** What we currently know, without asking. */
  peek(kind: FeedKind): FeedAbility {
    return this.known()[this.key()]?.feeds[kind] ?? 'unknown';
  }

  /** Probe every feed for the current host, unless a fresh answer is on hand. */
  ensureAll(): void {
    for (const kind of FEED_KINDS) {
      void this.ensure(kind);
    }
  }

  /**
   * Probe one feed unless we already know, or are already asking.
   *
   * A stale entry is returned immediately *and* refreshed behind the caller, so
   * nothing waits on a request whose answer is nearly always the same as the
   * one we already have.
   */
  async ensure(kind: FeedKind): Promise<FeedAbility> {
    const host = this.key();
    const entry = this.known()[host];
    const cached = entry?.feeds[kind];
    const fresh = !!entry && Date.now() - entry.checkedAt < TTL_MS;
    if (cached && fresh) {
      return cached;
    }

    const inFlight = this.pending.get(`${host}:${kind}`);
    if (inFlight) {
      return cached ?? inFlight;
    }

    const probe = this.run(kind)
      .then((ability) => {
        this.write(host, kind, ability);
        return ability;
      })
      .catch(() => {
        this.write(host, kind, 'unreachable');
        return 'unreachable' as FeedAbility;
      })
      .finally(() => this.pending.delete(`${host}:${kind}`));

    this.pending.set(`${host}:${kind}`, probe);
    // Stale-while-revalidate: an old answer beats a spinner.
    return cached ?? probe;
  }

  /** Forget everything, so the next look asks again. Backs a settings button. */
  reset(): void {
    this.known.set({});
    this.pending.clear();
    localStorage.removeItem(STORAGE_KEY);
  }

  /** When the current host was last probed, for the settings page to state. */
  checkedAt(): number | null {
    return this.known()[this.key()]?.checkedAt ?? null;
  }

  /**
   * One probe.
   *
   * Goes through {@link Api} rather than raw `fetch` so it inherits the
   * interceptors — the bearer token when there is one, the configured server,
   * and nothing when anonymous. The answer then describes the request the UI
   * will actually make, which is the only version worth having. Same reasoning
   * as `search-capability.ts`.
   */
  private async run(kind: FeedKind): Promise<FeedAbility> {
    try {
      await firstValueFrom(this.request(kind));
      return 'works';
    } catch (error: unknown) {
      return refused(error) ? 'refused' : 'unreachable';
    }
  }

  /** The call for one feed. The payload is never read — only whether it came. */
  private request(kind: FeedKind): Observable<unknown> {
    switch (kind) {
      case 'public-local':
        return this.api.publicTimeline(true);
      case 'public-federated':
        return this.api.publicTimeline(false);
      case 'trending-links':
        return this.api.trendingLinks();
      case 'trending-tags':
        return this.api.trendingTags();
      case 'trending-statuses':
        return this.api.trendingStatuses();
    }
  }

  /**
   * Cache key: the host, plus which kind of session asked.
   *
   * See the class comment — anonymous and signed-in answers differ, and sharing
   * one entry between them would hide feeds from whichever asked second.
   *
   * A Bluesky-primary session needs a third value rather than folding into either.
   * It probes a Mastodon host *anonymously* (it holds no Mastodon token), so
   * filing its answers under `auth` would be wrong — but filing them under `anon`
   * would let a real anonymous session inherit them, and vice versa, which is the
   * same cross-contamination the two-value key was introduced to prevent. Sprint
   * 4 attaches a real Mastodon account to some of these sessions, at which point
   * the two genuinely diverge.
   */
  private key(): string {
    const host = this.server.baseUrl() || 'same-origin';
    return `${host}|${this.sessionKind()}`;
  }

  private sessionKind(): 'anon' | 'bsky' | 'auth' {
    if (this.auth.isAnonymous) {
      return 'anon';
    }
    return this.auth.isBlueskyPrimary ? 'bsky' : 'auth';
  }

  private write(host: string, kind: FeedKind, ability: FeedAbility): void {
    this.known.update((all) => {
      const entry = all[host];
      const next: CacheEntry = {
        checkedAt: Date.now(),
        feeds: { ...entry?.feeds, [kind]: ability },
      };
      const updated = { ...all, [host]: next };
      this.persist(updated);
      return updated;
    });
  }

  private read(): Record<string, CacheEntry> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
    } catch {
      // Corrupt cache is not worth a failure: it is all refetchable.
      return {};
    }
  }

  private persist(all: Record<string, CacheEntry>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // A full quota costs us the cache, not the feature.
    }
  }
}

/**
 * Did the server say "not here"?
 *
 * 404 and 410 mean the endpoint isn't served; 401/403 mean not to us; 422 is in
 * the list because some Mastodon builds use it for token-only endpoints — the
 * quirk `search-capability.ts` already accounts for, and the exact status
 * `mastodon.social` returns for an anonymous public timeline.
 */
function refused(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403 || status === 404 || status === 410 || status === 422;
}
