import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../platform/api/api';
import { Account } from '../platform/api/models';
import { SearchServer } from '../platform/http/search-server';
import { Server } from '../platform/http/server';
import { rankTwitterMatch } from '../settings/import-export/twitter-friend-discovery';
import type { PickedFile, UnbirdArchive, UnbirdPerson } from './unbird-archive';
import { StoredMatch, StoredMatchRow, UnbirdStore } from './unbird-store';

/**
 * Finds the archive's people on Mastodon, closest first, and remembers what it
 * found.
 *
 * Two ways to search, because the payoff has to come before the sign-up ask:
 *
 * - `public`: no account. Unauthenticated `GET /api/v2/search` on a large
 *   server ({@link PUBLIC_SEARCH_SERVER}), which knows most active accounts
 *   across the fediverse. Mastodon allows this without a token as long as the
 *   search does not `resolve` remote accounts; it is rate limited per IP, so
 *   the first pass is the closest {@link FIRST_PASS} people.
 * - `account`: through the signed-in server's own search, like the classic
 *   importer, so results carry ids that can be followed.
 *
 * Matches keep the classic importer's rule: only a username or a profile link
 * that matches the Twitter handle counts. A matching display name alone does
 * not. Nothing is ever followed automatically.
 */

export const PUBLIC_SEARCH_SERVER = 'mastodon.social';
/** People searched before anyone presses "keep looking". */
export const FIRST_PASS = 120;
const TIMEOUT_MS = 8000;

export type SearchVia = 'public' | 'account';
export type AccountSearch = (handle: string) => Promise<Account[]>;

/** Unauthenticated account search on a public server; throws `{ status }` on HTTP failure. */
export async function publicAccountSearch(
  handle: string,
  fetchImpl: typeof fetch = fetch,
  server = PUBLIC_SEARCH_SERVER,
): Promise<Account[]> {
  const url = `https://${server}/api/v2/search?type=accounts&limit=8&q=${encodeURIComponent(handle)}`;
  const response = await fetchImpl(url, {
    credentials: 'omit',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw { status: response.status };
  const body = (await response.json()) as { accounts?: Account[] };
  return body.accounts ?? [];
}

/** A handle as `user@server`, filling in the server that answered for local accounts. */
export function fullAcct(acct: string, answeredBy: string): string {
  return acct.includes('@') ? acct : `${acct}@${answeredBy}`;
}

/** The strong matches for one person, best first, in their stored form. */
export function strongMatches(
  person: UnbirdPerson,
  accounts: readonly Account[],
  answeredBy: string,
): StoredMatch[] {
  return accounts
    .map((account) => rankTwitterMatch(person, account))
    .filter((match) =>
      match.signals.some(
        (signal) =>
          signal === 'Mastodon username matches Twitter handle' ||
          signal === 'Mastodon username matches a previous Twitter handle' ||
          signal === 'Mastodon profile links back to Twitter handle',
      ),
    )
    .sort(
      (left, right) =>
        Number(right.confidence === 'likely') - Number(left.confidence === 'likely') ||
        right.signals.length - left.signals.length ||
        left.account.acct.localeCompare(right.account.acct),
    )
    .slice(0, 3)
    .map(({ account, signals, confidence }) => ({
      acct: fullAcct(account.acct, answeredBy),
      url: account.url,
      displayName: account.display_name || account.username,
      avatar: account.avatar_static || account.avatar,
      signals,
      confidence,
      lastStatusAt: account.last_status_at ?? null,
      bot: !!account.bot,
      statuses: account.statuses_count,
      followers: account.followers_count,
    }));
}

/** The servers where the reader's people landed, most first. */
export function serverShares(rows: Iterable<StoredMatchRow>): { server: string; people: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const best = row.matches.find((match) => match.confidence === 'likely');
    if (!best) continue;
    const server = best.acct.split('@')[1]?.toLowerCase();
    if (server) counts.set(server, (counts.get(server) ?? 0) + 1);
  }
  return [...counts]
    .map(([server, people]) => ({ server, people }))
    .sort((left, right) => right.people - left.people || left.server.localeCompare(right.server));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable({ providedIn: 'root' })
export class UnbirdMatcher {
  private readonly store = inject(UnbirdStore);
  private readonly api = inject(Api, { optional: true });
  private readonly server = inject(Server, { optional: true });
  private readonly searchServer = inject(SearchServer, { optional: true });
  private stopRequested = false;

  readonly archive = signal<UnbirdArchive | null>(null);
  /**
   * The files the archive was read from, this visit only. Never stored: a
   * contacts export reopens them for `contact.js`, and after a reload the
   * reader picks the archive again.
   */
  picked: readonly PickedFile[] | null = null;
  readonly rows = signal<ReadonlyMap<string, StoredMatchRow>>(new Map());
  readonly running = signal(false);
  readonly rateLimited = signal(false);
  /** Courtesy pause between searches; tests set it to zero. */
  delayMs = 400;
  /** Replaceable for tests. */
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  /** People Unbird can search for: those with a known handle, closest first. */
  readonly searchable = computed(() =>
    (this.archive()?.people ?? []).filter((person) => !!person.twitter_handle),
  );
  readonly searched = computed(() => this.rows().size);
  readonly remaining = computed(
    () => this.searchable().filter((person) => !this.rows().has(key(person))).length,
  );
  readonly found = computed(
    () => [...this.rows().values()].filter((row) => row.matches.length > 0).length,
  );
  readonly servers = computed(() => serverShares(this.rows().values()));

  /** Show an archive and whatever was already found for it. */
  async use(archive: UnbirdArchive, previous?: readonly StoredMatchRow[]): Promise<void> {
    this.stopRequested = true;
    this.archive.set(archive);
    const rows = previous ?? (await this.store.loadMatches());
    this.rows.set(new Map(rows.map((row) => [row.handle, row])));
    this.rateLimited.set(false);
  }

  /** Restore the archive saved on this device, if any. */
  async restore(): Promise<UnbirdArchive | null> {
    if (this.archive()) return this.archive();
    const archive = await this.store.loadArchive();
    if (archive) await this.use(archive);
    return archive;
  }

  /** Keep a new archive, replacing the saved one and its results. */
  async adopt(archive: UnbirdArchive): Promise<boolean> {
    const saved = await this.store.saveArchive(archive);
    await this.use(archive, []);
    return saved;
  }

  async forget(): Promise<void> {
    this.stop();
    await this.store.forget();
    this.archive.set(null);
    this.picked = null;
    this.rows.set(new Map());
  }

  stop(): void {
    this.stopRequested = true;
  }

  row(person: UnbirdPerson): StoredMatchRow | null {
    return this.rows().get(key(person)) ?? null;
  }

  /** Search the next `count` unsearched people, closest first. */
  async search(via: SearchVia, count = FIRST_PASS): Promise<void> {
    if (this.running()) return;
    const search: AccountSearch =
      via === 'account' && this.api
        ? async (handle) =>
            (
              await firstValueFrom(
                this.api!.search(handle, 'accounts', { resolve: false, limit: 10 }),
              )
            ).accounts ?? []
        : (handle) => publicAccountSearch(handle, this.fetchImpl);
    const answeredBy = via === 'account' ? '' : PUBLIC_SEARCH_SERVER;
    const queue = this.searchable()
      .filter((person) => !this.rows().has(key(person)))
      .slice(0, count);
    this.stopRequested = false;
    this.rateLimited.set(false);
    this.running.set(true);
    let pending: StoredMatchRow[] = [];
    try {
      for (const person of queue) {
        if (this.stopRequested) break;
        const row: StoredMatchRow = {
          handle: key(person),
          status: 'complete',
          matches: [],
          checkedAt: Date.now(),
        };
        try {
          const accounts = await search(person.twitter_handle!);
          row.matches = strongMatches(person, accounts, answeredBy || this.homeServer());
        } catch (error: unknown) {
          if ((error as { status?: number })?.status === 429) {
            this.rateLimited.set(true);
            break;
          }
          row.status = 'failed';
        }
        if (row.status === 'complete') {
          this.rows.update((rows) => new Map(rows).set(row.handle, row));
          pending.push(row);
        }
        if (pending.length >= 10) {
          await this.store.saveMatches(pending);
          pending = [];
        }
        if (this.delayMs) await delay(this.delayMs);
      }
    } finally {
      await this.store.saveMatches(pending);
      this.running.set(false);
    }
  }

  /** The host that answered an account search, for local results that come back without one. */
  private homeServer(): string {
    const searchHost = this.searchServer?.host();
    if (searchHost) return searchHost;
    try {
      return new URL(this.server?.baseUrl() ?? '').host;
    } catch {
      return '';
    }
  }
}

function key(person: UnbirdPerson): string {
  return person.twitter_handle!.toLowerCase();
}
