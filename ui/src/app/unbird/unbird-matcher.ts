import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../platform/api/api';
import { Account } from '../platform/api/models';
import { SearchServer } from '../platform/http/search-server';
import { Server } from '../platform/http/server';
import { rankTwitterMatch } from '../settings/import-export/twitter-friend-discovery';
import { PickedFile, rankPeople, UnbirdArchive, UnbirdPerson } from './unbird-archive';
import { NATIVE_PROFILES } from '../platform/session/platform-login';
import {
  archiveId,
  ArchiveSummary,
  StoredMatch,
  StoredMatchRow,
  UnbirdStore,
} from './unbird-store';

/**
 * Finds the archive's people on Mastodon, closest first, and remembers what it
 * found.
 *
 * Two ways to search, because the payoff has to come before the sign-up ask:
 *
 * - `public`: no account. Unauthenticated `GET /api/v2/search` on a large
 *   server ({@link PUBLIC_SEARCH_SERVER}), which knows most active accounts
 *   across the fediverse. Mastodon allows this without a token as long as the
 *   search does not `resolve` remote accounts; it is rate limited per IP.
 * - `account`: through the signed-in server's own search, like the classic
 *   importer, so results carry ids that can be followed.
 *
 * Matches keep the classic importer's rule: only a username or a profile link
 * that matches the Twitter handle counts. A matching display name alone does
 * not. Nothing is ever followed automatically.
 */

export const PUBLIC_SEARCH_SERVER = 'mastodon.social';
/**
 * The closest people are searched briskly, for a fast first payoff; after
 * them the search keeps going on its own at about one a second, inside
 * Mastodon's default limit of 300 requests per five minutes, until everyone
 * is checked, the reader pauses, or a server says slow down.
 */
export const FIRST_PASS = 120;
const BRISK_MS = 400;
const STEADY_MS = 1100;
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

  /**
   * Native keeps several archives as import points; the web keeps one, and a
   * new archive replaces it.
   */
  readonly native = inject(NATIVE_PROFILES, { optional: true }) !== null;
  /** The archives kept on this device; one at most on the web. */
  readonly importPoints = signal<readonly ArchiveSummary[]>([]);

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
  /** Courtesy pauses between searches, brisk then steady; tests set both to zero. */
  delayMs = BRISK_MS;
  steadyDelayMs = STEADY_MS;
  /** Replaceable for tests. */
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  /** People Unbird can search for: a known handle, never the owner, closest first. */
  readonly searchable = computed(() => {
    const archive = this.archive();
    return archive ? rankPeople(archive).filter((person) => !!person.twitter_handle) : [];
  });
  /** Results for people still in the list (an old save may hold the owner's own row). */
  private readonly listedRows = computed(() =>
    this.searchable()
      .map((person) => this.rows().get(key(person)))
      .filter((row): row is StoredMatchRow => !!row),
  );
  readonly searched = computed(() => this.listedRows().length);
  readonly remaining = computed(() => this.searchable().length - this.searched());
  readonly found = computed(() => this.listedRows().filter((row) => row.matches.length).length);
  readonly servers = computed(() => serverShares(this.listedRows()));

  /** The current archive's id, which keys its matches and replay ledger. */
  readonly currentId = computed(() => {
    const archive = this.archive();
    return archive ? archiveId(archive) : null;
  });

  /** Show an archive and whatever was already found for it. */
  async use(archive: UnbirdArchive, previous?: readonly StoredMatchRow[]): Promise<void> {
    this.stopRequested = true;
    this.archive.set(archive);
    const rows = previous ?? (await this.store.loadMatches(archiveId(archive)));
    this.rows.set(new Map(rows.map((row) => [row.handle, row])));
    this.rateLimited.set(false);
  }

  /** Restore the archive saved on this device, if any. */
  async restore(): Promise<UnbirdArchive | null> {
    if (this.archive()) return this.archive();
    const archive = await this.store.loadArchive();
    if (archive) await this.use(archive);
    await this.refreshImportPoints();
    return archive;
  }

  /**
   * Keep a newly read archive and make it current. On the web it replaces the
   * saved one; reading the same archive again keeps what was found for it.
   */
  async adopt(archive: UnbirdArchive): Promise<boolean> {
    const id = archiveId(archive);
    const kept = { ...archive, id };
    const saved = await this.store.saveArchive(kept, this.native);
    await this.use(kept);
    await this.refreshImportPoints();
    return saved;
  }

  /** Native: switch to another kept archive. */
  async switchTo(id: string): Promise<void> {
    const archive = await this.store.loadArchive(id);
    if (!archive) return;
    await this.store.setCurrent(id);
    this.picked = null;
    await this.use(archive);
  }

  /** Forget the current archive (or the one named) and everything found from it. */
  async forget(id = this.currentId()): Promise<void> {
    if (!id) return;
    if (id === this.currentId()) {
      this.stop();
      this.archive.set(null);
      this.picked = null;
      this.rows.set(new Map());
    }
    await this.store.forget(id);
    await this.refreshImportPoints();
  }

  private async refreshImportPoints(): Promise<void> {
    this.importPoints.set(await this.store.listArchives());
  }

  stop(): void {
    this.stopRequested = true;
  }

  row(person: UnbirdPerson): StoredMatchRow | null {
    return this.rows().get(key(person)) ?? null;
  }

  /** Search unsearched people, closest first: everyone, unless `count` says fewer. */
  async search(via: SearchVia, count = Infinity): Promise<void> {
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
    const archiveKey = this.currentId();
    if (!archiveKey) return;
    const queue = this.searchable()
      .filter((person) => !this.rows().has(key(person)))
      .slice(0, count);
    this.stopRequested = false;
    this.rateLimited.set(false);
    this.running.set(true);
    let pending: StoredMatchRow[] = [];
    let done = this.searched();
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
          await this.store.saveMatches(archiveKey, pending);
          pending = [];
        }
        const pause = ++done < FIRST_PASS ? this.delayMs : this.steadyDelayMs;
        if (pause) await delay(pause);
      }
    } finally {
      await this.store.saveMatches(archiveKey, pending);
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
