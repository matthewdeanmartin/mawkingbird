import { computed, Injectable, signal } from '@angular/core';
import { SearchServerStatus } from './search-server-probe';

/**
 * Search servers we already checked and can't use.
 *
 * Hunting for a search server means walking a directory of ~1000 instances, most
 * of which will refuse anonymous search or return no posts at all. Without a memory,
 * every hunt re-probes the same duds — and each probe is a real cross-origin
 * request with a real timeout, so the second hunt is exactly as slow as the first.
 *
 * This is the one piece of probe state that *is* persisted, and it is persisted
 * because it answers a different question from {@link SearchCapability}: not "is
 * search working where I am" (which must never go stale) but "don't bother asking
 * this host again while I look for a better one". A server that turns search on
 * should become findable again, hence {@link clear} and hence the count in the UI —
 * an invisible cache with a mystery Clear button is worse than no cache.
 */

const REJECTS_KEY = 'mockingbird_search_server_rejects_v1';
const STATE_VERSION = 1;

/**
 * Ceiling on remembered domains. The bundled directory is ~1000 entries, so this
 * is generous enough to hold a complete failed sweep while still bounding what a
 * long-lived browser can accumulate. Oldest entries are evicted first.
 */
export const MAX_REJECTS = 500;

export interface RejectedSearchServer {
  domain: string;
  /** Why it failed, so the UI can say something better than "didn't work". */
  status: SearchServerStatus;
  rejectedAt: string;
}

interface RejectState {
  version: typeof STATE_VERSION;
  servers: RejectedSearchServer[];
}

/** Bare lowercase host, so `https://Foo.social/` and `foo.social` are one entry. */
export function rejectKey(domainOrUrl: string): string {
  return domainOrUrl
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

/** Human-readable reason, for the settings list. */
export function rejectReason(status: SearchServerStatus): string {
  switch (status) {
    case 'auth-required':
      return 'search needs a login';
    case 'no-results':
      return 'no search results';
    case 'unreachable':
      return 'unreachable';
    case 'ok':
      // Reached only by the discovery bar: answered, but not usefully — accounts
      // worked and post search did not.
      return 'no post search';
    default:
      return 'not usable';
  }
}

function loadState(): RejectState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(REJECTS_KEY) ?? 'null',
    ) as Partial<RejectState> | null;
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.servers)) {
      return { version: STATE_VERSION, servers: [] };
    }
    const servers = parsed.servers.filter(
      (item): item is RejectedSearchServer =>
        typeof item?.domain === 'string' &&
        !!item.domain &&
        typeof item.status === 'string' &&
        typeof item.rejectedAt === 'string',
    );
    return { version: STATE_VERSION, servers: servers.slice(-MAX_REJECTS) };
  } catch {
    // A corrupt payload is an empty list, never a throw. Every store in this app
    // does this, and it is always the first bug when one doesn't.
    return { version: STATE_VERSION, servers: [] };
  }
}

@Injectable({ providedIn: 'root' })
export class SearchServerRejects {
  private state = signal<RejectState>(loadState());

  readonly all = computed(() => this.state().servers);
  readonly count = computed(() => this.all().length);

  /** Newest first — what the settings page lists. */
  readonly recent = computed(() => [...this.all()].reverse());

  /** Should discovery skip this host? */
  has(domainOrUrl: string): boolean {
    const key = rejectKey(domainOrUrl);
    return this.all().some((server) => server.domain === key);
  }

  /** Every remembered domain, ready to hand to `MastodonServers.shuffled(excluded)`. */
  domains(): Set<string> {
    return new Set(this.all().map((server) => server.domain));
  }

  /**
   * Remember a failure. Re-rejecting a known host refreshes its reason rather
   * than adding a duplicate — the newest verdict is the true one.
   */
  add(domainOrUrl: string, status: SearchServerStatus): void {
    const key = rejectKey(domainOrUrl);
    if (!key) {
      return;
    }
    const entry: RejectedSearchServer = {
      domain: key,
      status,
      rejectedAt: new Date().toISOString(),
    };
    const kept = this.all().filter((server) => server.domain !== key);
    // Appended, so `slice(-MAX)` evicts the oldest.
    this.persist([...kept, entry].slice(-MAX_REJECTS));
  }

  /** Forget one host, e.g. because the user typed it in by hand and wants a retry. */
  remove(domainOrUrl: string): void {
    const key = rejectKey(domainOrUrl);
    this.persist(this.all().filter((server) => server.domain !== key));
  }

  /** Forget everything. Behind a button, per the roadmap's decision 6. */
  clear(): void {
    this.persist([]);
  }

  private persist(servers: RejectedSearchServer[]): void {
    const state: RejectState = { version: STATE_VERSION, servers };
    this.state.set(state);
    try {
      if (servers.length === 0) {
        localStorage.removeItem(REJECTS_KEY);
      } else {
        localStorage.setItem(REJECTS_KEY, JSON.stringify(state));
      }
    } catch {
      // Non-persistent (quota, private mode), but honour it for this session.
    }
  }
}
