import { inject, Injectable, signal } from '@angular/core';
import { catchError, firstValueFrom, forkJoin, map, Observable, of } from 'rxjs';
import { accountScopeSuffix, scopedKey } from '../platform/session/account-scope';
import { Api } from '../platform/api/api';
import { ClientPrefs } from '../platform/storage/client-prefs';
import { Status } from '../platform/api/models';
import { AnonymousProviderRef } from '../accounts/anonymous/anonymous-mastodon-provider';
import { AnonymousPublicApi } from '../accounts/anonymous/anonymous-public-api';
import { adaptPost } from '../connections/bluesky/bluesky-adapter';
import { BlueskyApi } from '../connections/bluesky/bluesky-api';
import { BskyRef } from '../connections/bluesky/bluesky-types';
import { Server } from '../platform/http/server';

const STORAGE_BASE = 'mockingbird_post_history';
/** How many posts History remembers per account. */
export const POST_HISTORY_LIMIT = 500;
/** How much of each post is kept so the History filter works without fetching. */
export const POST_HISTORY_SNIPPET = 150;
/** Cards shown per History page. */
export const POST_HISTORY_PAGE = 40;
/** Mastodon's batch endpoint is capped server-side; 20 stays under every known cap. */
const MASTODON_BATCH = 20;
/** `app.bsky.feed.getPosts` accepts at most 25 uris. */
const BLUESKY_BATCH = 25;
const PERSIST_DELAY_MS = 1000;

export type HistoryNetwork = 'mastodon' | 'anonymous-mastodon' | 'bluesky';

/**
 * One remembered post: enough to fetch it again and to find it by text.
 *
 * Post ids are per server, so the address is network + server + id, never a
 * bare id. Bluesky's id is the post's at:// uri, which is global.
 */
export interface HistoryEntry {
  key: string;
  network: HistoryNetwork;
  /** Origin the id belongs to; null for Bluesky. */
  server: string | null;
  id: string;
  url: string | null;
  /** `@acct` of the author. */
  author: string;
  /** Display name of the author. */
  name: string;
  /** First {@link POST_HISTORY_SNIPPET} characters of the post's text. */
  text: string;
  /** When it last scrolled past, epoch ms. */
  seen: number;
}

function plainText(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, ' ');
  const template = document.createElement('template');
  // Paragraph and line breaks become spaces, or "end.Next" fuses into one word.
  template.innerHTML = html.replace(/<\/p>|<br\s*\/?>/gi, ' ');
  return template.content.textContent ?? '';
}

/** The history address of a status, or null when it is not re-fetchable. */
export function historyEntryFor(
  status: Status,
  homeServer: string,
  now = Date.now(),
): HistoryEntry | null {
  const shown = status.reblog ?? status;
  let network: HistoryNetwork;
  let server: string | null;
  let id: string;
  switch (shown.provider ?? 'mastodon') {
    case 'mastodon':
      // Synthetic posts carry namespaced ids ("rss:…"); a server id never has a colon.
      if (!shown.id || shown.id.includes(':')) return null;
      network = 'mastodon';
      server = homeServer;
      id = shown.id;
      break;
    case 'anonymous-mastodon': {
      const ref = shown.providerRef as AnonymousProviderRef | undefined;
      if (!ref?.server || !ref.statusId) return null;
      network = 'anonymous-mastodon';
      server = ref.server;
      id = ref.statusId;
      break;
    }
    case 'bluesky': {
      const ref = shown.providerRef as BskyRef | undefined;
      if (!ref?.uri) return null;
      network = 'bluesky';
      server = null;
      id = ref.uri;
      break;
    }
    default:
      return null;
  }
  const body = [shown.spoiler_text, plainText(shown.content)]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    key: `${network}|${server ?? ''}|${id}`,
    network,
    server,
    id,
    url: shown.url ?? null,
    author: (shown.account?.acct ?? '').slice(0, 320),
    name: (shown.account?.display_name ?? '').slice(0, 200),
    text: body.slice(0, POST_HISTORY_SNIPPET),
    seen: now,
  };
}

function isEntry(value: unknown): value is HistoryEntry {
  const e = value as HistoryEntry;
  return (
    typeof e?.key === 'string' &&
    (e.network === 'mastodon' || e.network === 'anonymous-mastodon' || e.network === 'bluesky') &&
    typeof e.id === 'string' &&
    typeof e.author === 'string' &&
    typeof e.text === 'string' &&
    typeof e.seen === 'number'
  );
}

/** One account's remembered posts, newest sighting first. */
export class PostHistoryStore {
  readonly entries = signal<HistoryEntry[]>([]);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly key: string) {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (Array.isArray(saved)) {
        this.entries.set(saved.filter(isEntry).slice(0, POST_HISTORY_LIMIT));
      }
    } catch {
      /* An unreadable history starts empty. */
    }
  }

  /** Remember a sighting: new posts go on top, a post seen again moves back to the top. */
  record(entry: HistoryEntry): void {
    this.entries.update((list) =>
      [entry, ...list.filter((item) => item.key !== entry.key)].slice(0, POST_HISTORY_LIMIT),
    );
    this.schedulePersist();
  }

  remove(key: string): void {
    this.entries.update((list) => list.filter((item) => item.key !== key));
    this.persistNow();
  }

  clear(): void {
    this.entries.set([]);
    this.persistNow();
  }

  /** Writes are batched: a fast scroll records dozens of posts a second. */
  private schedulePersist(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => this.persistNow(), PERSIST_DELAY_MS);
  }

  persistNow(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      const list = this.entries();
      if (list.length) localStorage.setItem(this.key, JSON.stringify(list));
      else localStorage.removeItem(this.key);
    } catch {
      /* Quota or blocked storage: history is best effort. */
    }
  }
}

/**
 * Posts this account scrolled past, so "the post I saw ten minutes ago" can be
 * found again. Browser-only, per account (Anonymous included), capped at
 * {@link POST_HISTORY_LIMIT}, and off when {@link ClientPrefs.postHistory} is.
 */
@Injectable({ providedIn: 'root' })
export class PostHistory {
  private prefs = inject(ClientPrefs);
  private server = inject(Server);
  private api = inject(Api);
  private anonymousApi = inject(AnonymousPublicApi);
  private blueskyApi = inject(BlueskyApi);
  private stores = new Map<string, PostHistoryStore>();
  private observer: IntersectionObserver | null = null;
  private watched = new WeakMap<Element, () => Status | null>();

  /** This account's history, or null with no account (signed out, not Anonymous). */
  current(): PostHistoryStore | null {
    if (!accountScopeSuffix()) return null;
    const key = scopedKey(STORAGE_BASE);
    let store = this.stores.get(key);
    if (!store) {
      store = new PostHistoryStore(key);
      this.stores.set(key, store);
    }
    return store;
  }

  record(status: Status): void {
    if (!this.prefs.postHistory()) return;
    const entry = historyEntryFor(status, this.server.baseUrl());
    if (entry) this.current()?.record(entry);
  }

  /**
   * Record `status()` the first time `element` is mostly on screen. One shared
   * observer for every card; returns the cleanup for the card's destroy hook.
   */
  watch(element: Element, status: () => Status | null): () => void {
    if (typeof IntersectionObserver === 'undefined') return () => undefined;
    this.observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const read = this.watched.get(entry.target);
          this.observer?.unobserve(entry.target);
          this.watched.delete(entry.target);
          const status = read?.();
          if (status) this.record(status);
        }
      },
      { threshold: 0.6 },
    );
    this.watched.set(element, status);
    this.observer.observe(element);
    return () => {
      this.watched.delete(element);
      this.observer?.unobserve(element);
    };
  }

  /**
   * Fetch full posts for `entries`, batched per network and server. Posts that
   * could not be fetched (deleted, private, server down) are absent from the map;
   * the History tab shows their remembered snippet instead.
   */
  async fetch(entries: HistoryEntry[]): Promise<Map<string, Status>> {
    const found = new Map<string, Status>();
    const groups = new Map<string, HistoryEntry[]>();
    for (const entry of entries) {
      const group = `${entry.network}|${entry.server ?? ''}`;
      groups.set(group, [...(groups.get(group) ?? []), entry]);
    }
    const jobs: Observable<void>[] = [];
    const home = this.server.baseUrl();
    for (const group of groups.values()) {
      const { network, server } = group[0];
      if (network === 'bluesky') {
        for (const batch of chunks(group, BLUESKY_BATCH)) {
          jobs.push(
            this.blueskyApi.getPosts(batch.map((e) => e.id)).pipe(
              map(({ posts }) => {
                for (const post of posts) {
                  const entry = batch.find((e) => e.id === post.uri);
                  if (entry) found.set(entry.key, adaptPost(post));
                }
              }),
              catchError(() => of(undefined)),
            ),
          );
        }
        continue;
      }
      const viaHome = network === 'mastodon' && server === home;
      for (const batch of chunks(group, MASTODON_BATCH)) {
        const ids = batch.map((e) => e.id);
        const batched = viaHome
          ? this.api.getStatuses(ids)
          : this.anonymousApi.getStatuses(server ?? '', ids);
        const single = (id: string): Observable<Status | null> =>
          (viaHome
            ? this.api.getStatus(id)
            : this.anonymousApi.getStatus({ server: server ?? '', id })
          ).pipe(catchError(() => of(null)));
        const rawId = (s: Status): string =>
          viaHome ? s.id : ((s.providerRef as AnonymousProviderRef | undefined)?.statusId ?? s.id);
        jobs.push(
          batched.pipe(
            // Servers older than Mastodon 4.3 have no batch endpoint: one request each.
            catchError(() =>
              forkJoin(ids.map(single)).pipe(
                map((list) => list.filter((s): s is Status => s !== null)),
              ),
            ),
            map((statuses) => {
              for (const status of statuses) {
                const entry = batch.find((e) => e.id === rawId(status));
                if (entry) found.set(entry.key, status);
              }
            }),
            catchError(() => of(undefined)),
          ),
        );
      }
    }
    if (jobs.length) await firstValueFrom(forkJoin(jobs));
    return found;
  }
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Case-insensitive match of a History filter against the remembered text and author. */
export function historyMatches(entry: HistoryEntry, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  return `${entry.name} @${entry.author} ${entry.text}`.toLocaleLowerCase().includes(q);
}
