import { Injectable, signal } from '@angular/core';

/**
 * A curated instance from the joinmastodon.org server index, trimmed to the fields the
 * server picker actually shows. The full API row carries thumbnails, blurhashes, version
 * strings, etc.; storing all of that would bloat localStorage for no UI gain.
 */
export interface ServerSuggestion {
  domain: string;
  description: string;
  category: string;
  /** Rough size, for a "big vs cozy" hint. 0 when the API omitted it. */
  users: number;
}

/** joinmastodon's public, CORS-open index (Access-Control-Allow-Origin: *). */
const SERVERS_URL = 'https://api.joinmastodon.org/servers';
/** A complete point-in-time copy of the same directory, shipped with the client. */
const BUNDLED_SERVERS_URL = 'mastodon-servers.json';

const CACHE_KEY = 'mastodon_mock_server_index';
/** Re-fetch the index at most weekly — it barely changes and the payload is ~200KB. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedIndex {
  fetchedAt: number;
  servers: ServerSuggestion[];
}

/** One row as returned by the joinmastodon API (only the fields we read). */
interface RawServer {
  domain: string;
  description?: string;
  category?: string;
  total_users?: number;
}

/**
 * Loads and caches the joinmastodon.org curated server list so the login picker can offer
 * real, described instances instead of a hardcoded handful. Client-side only: the list is
 * public and CORS-open, so an OAuth client with no backend can fetch it directly.
 */
@Injectable({ providedIn: 'root' })
export class MastodonServers {
  /** The full index once loaded; empty until the first successful fetch. */
  readonly servers = signal<ServerSuggestion[]>(this.readCache());
  /** True while a network fetch is in flight (for a subtle "loading suggestions" hint). */
  readonly loading = signal(false);
  /** Where the currently-visible directory came from. */
  readonly source = signal<'cache' | 'bundled' | 'live'>(
    this.servers().length ? 'cache' : 'bundled',
  );

  private loadingPromise: Promise<void> | null = null;
  private bundledPromise: Promise<void> | null = null;

  /**
   * Ensure we have a reasonably fresh index. Serves the cache immediately (already loaded
   * into the signal) and only hits the network when the cache is missing or stale. Failures
   * are swallowed — a stale or empty list still lets the user type a domain by hand.
   */
  ensureLoaded(): Promise<void> {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }
    if (this.servers().length && this.cacheIsFresh()) {
      return Promise.resolve();
    }
    this.loading.set(true);
    this.loadingPromise = this.loadDirectory().finally(() => {
      this.loading.set(false);
      this.loadingPromise = null;
    });
    return this.loadingPromise;
  }

  /** Wait only until some usable directory is available; a blocked live refresh stays background work. */
  async ready(): Promise<void> {
    const complete = this.ensureLoaded();
    if (this.servers().length) {
      return;
    }
    if (this.bundledPromise) {
      await this.bundledPromise;
    }
    if (!this.servers().length) {
      await complete;
    }
  }

  private async loadDirectory(): Promise<void> {
    // Start both reads together. Callers that only need candidates can await ready(), which
    // returns as soon as the same-origin snapshot arrives instead of waiting on a blocked API.
    this.bundledPromise = this.servers().length ? Promise.resolve() : this.loadBundled();
    await Promise.all([this.bundledPromise, this.refreshLive()]);
  }

  private async loadBundled(): Promise<void> {
    try {
      const bundledUrl = new URL(BUNDLED_SERVERS_URL, document.baseURI).toString();
      const response = await fetch(bundledUrl);
      if (response.ok && !this.servers().length) {
        this.servers.set(this.trim((await response.json()) as RawServer[]));
        this.source.set('bundled');
      }
    } catch {
      // A live refresh remains available if the static asset cannot be read.
    }
  }

  private async refreshLive(): Promise<void> {
    try {
      const response = await fetch(SERVERS_URL, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const trimmed = this.trim((await response.json()) as RawServer[]);
        this.servers.set(trimmed);
        this.source.set('live');
        this.writeCache(trimmed);
      }
    } catch {
      // Blocked, offline, or timed out: the bundled snapshot (or stale cache) is the fallback.
    }
  }

  private trim(raw: RawServer[]): ServerSuggestion[] {
    return raw
      .filter((server) => server.domain)
      .map((server) => ({
        domain: server.domain,
        description: (server.description ?? '').replace(/\s+/g, ' ').trim(),
        category: server.category ?? '',
        users: server.total_users ?? 0,
      }));
  }

  /**
   * A fresh random order that alternates large and smaller communities. This keeps
   * random discovery from clustering around the largest (and most commonly blocked)
   * instances without condemning anonymous users to only tiny-instance limitations.
   */
  shuffled(excluded: ReadonlySet<string> = new Set()): ServerSuggestion[] {
    const available = this.servers().filter((server) => !excluded.has(server.domain.toLowerCase()));
    const large = available.filter((server) => server.users >= 10_000);
    const small = available.filter((server) => server.users < 10_000);
    this.shuffle(large);
    this.shuffle(small);
    const result: ServerSuggestion[] = [];
    while (large.length || small.length) {
      const preferred = result.length % 2 === 0 ? large : small;
      const fallback = preferred === large ? small : large;
      const next = preferred.pop() ?? fallback.pop();
      if (next) result.push(next);
    }
    return result;
  }

  private shuffle(servers: ServerSuggestion[]): void {
    for (let index = servers.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [servers[index], servers[other]] = [servers[other], servers[index]];
    }
  }

  /**
   * Rank the index against what the user has typed. Prefix matches on the domain win, then
   * any substring match on the domain, then description hits — bigger servers first within a
   * tier so the obvious general instances float up. With no query, returns the largest few
   * as a sensible default suggestion list.
   */
  search(query: string, limit = 7): ServerSuggestion[] {
    const all = this.servers();
    const q = query
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '');
    if (!q) {
      return [...all].sort((a, b) => b.users - a.users).slice(0, limit);
    }
    const scored = all
      .map((s) => ({ s, score: this.score(s, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.s.users - a.s.users);
    return scored.slice(0, limit).map((x) => x.s);
  }

  private score(s: ServerSuggestion, q: string): number {
    const domain = s.domain.toLowerCase();
    if (domain === q) return 100;
    if (domain.startsWith(q)) return 80;
    if (domain.includes(q)) return 50;
    if (s.category.toLowerCase() === q) return 30;
    if (s.description.toLowerCase().includes(q)) return 10;
    return 0;
  }

  // ---------- localStorage cache ----------

  private readCache(): ServerSuggestion[] {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      return (JSON.parse(raw) as CachedIndex).servers ?? [];
    } catch {
      return [];
    }
  }

  private cacheIsFresh(): boolean {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const { fetchedAt } = JSON.parse(raw) as CachedIndex;
      return Date.now() - fetchedAt < MAX_AGE_MS;
    } catch {
      return false;
    }
  }

  private writeCache(servers: ServerSuggestion[]): void {
    try {
      const payload: CachedIndex = { fetchedAt: Date.now(), servers };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Quota or private-mode failures are non-fatal; we just refetch next time.
    }
  }
}
