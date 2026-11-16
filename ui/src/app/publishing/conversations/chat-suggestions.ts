import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Account } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';
import { PEOPLE_LIST_TITLES } from '../../feeds/lists/people-categories';

/** Just what a "Chat with" suggestion shows and submits. */
export interface ChatPerson {
  acct: string;
  name: string;
}

/** Where the mutual set came from, or why there is none. */
export type MutualSource = 'archive' | 'list' | 'built' | 'cache' | 'capped' | 'failed';

/** A mutual set is reused this long: follows change slowly, rebuilding is not free. */
export const MUTUALS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Above this many following + followers, building the set would cost more than
 * ~25 requests, so "Chat with" asks the server instead, one debounced search
 * per pause in typing.
 */
export const MUTUALS_BUILD_CAP = 2000;
/** Account-scoped (see `accountScopeSuffix`); registered as `cache`. */
const CACHE_KEY = 'mockingbird_chat_mutuals_v1';

interface StoredMutuals {
  v: 1;
  builtAt: number;
  people: ChatPerson[];
}

/**
 * The people "Chat with" offers as you type.
 *
 * Mastodon has no mutuals endpoint, so the set is assembled from the cheapest
 * source available, once, on first use of the box (never on page open):
 *
 * 1. a stored set younger than {@link MUTUALS_TTL_MS};
 * 2. Native's local archive, which already knows who follows back — no request;
 * 3. the "Mawkingbird: Mutuals" list, if People lists made one — two requests;
 * 4. following and followers, 80 a page, intersected — unless together they
 *    exceed {@link MUTUALS_BUILD_CAP}, when {@link searchFollowed} takes over.
 *
 * Every source but the archive is cached per account.
 */
@Injectable({ providedIn: 'root' })
export class ChatSuggestions {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly archive = inject(NATIVE_PROFILES);

  readonly mutuals = signal<ChatPerson[]>([]);
  readonly source = signal<MutualSource | null>(null);
  readonly loading = signal(false);
  private scope: string | null = null;

  /** Assemble the set once per account; later calls are free. */
  async ensure(force = false): Promise<void> {
    const scope = accountScopeSuffix();
    if (this.loading() || (!force && this.source() && this.scope === scope)) return;
    this.scope = scope;
    this.loading.set(true);
    try {
      if (!force && this.restore(scope)) return;
      if (await this.fromArchive()) return;
      if (await this.fromList(scope)) return;
      await this.build(scope);
    } catch {
      this.source.set('failed');
    } finally {
      this.loading.set(false);
    }
  }

  /** People you follow matching `query`, from the server. For large accounts. */
  searchFollowed(query: string): Observable<Account[]> {
    return this.api.searchFollowedAccounts(query);
  }

  private restore(scope: string): boolean {
    if (!scope) return false;
    try {
      const stored = JSON.parse(
        localStorage.getItem(CACHE_KEY + scope) ?? 'null',
      ) as StoredMutuals | null;
      if (
        stored?.v !== 1 ||
        !Array.isArray(stored.people) ||
        Date.now() - stored.builtAt >= MUTUALS_TTL_MS
      ) {
        return false;
      }
      this.mutuals.set(stored.people);
      this.source.set('cache');
      return true;
    } catch {
      return false;
    }
  }

  private save(scope: string, people: ChatPerson[], source: MutualSource): void {
    this.mutuals.set(people);
    this.source.set(source);
    if (!scope) return;
    const value: StoredMutuals = { v: 1, builtAt: Date.now(), people };
    try {
      localStorage.setItem(CACHE_KEY + scope, JSON.stringify(value));
    } catch {
      // Quota or a blocked store: the set still serves this session.
    }
  }

  private async fromArchive(): Promise<boolean> {
    const handle = this.auth.token();
    if (!this.archive || !handle?.startsWith('native-mastodon:')) return false;
    const members = await this.archive.peopleMembers(handle, 'mutuals');
    if (!members.length) return false;
    this.mutuals.set(members.map((m) => ({ acct: m.acct, name: m.displayName || m.acct })));
    this.source.set('archive');
    return true;
  }

  private async fromList(scope: string): Promise<boolean> {
    const lists = await firstValueFrom(this.api.lists());
    const list = lists.find((l) => l.title === PEOPLE_LIST_TITLES.mutuals);
    if (!list) return false;
    const accounts = await firstValueFrom(this.api.listAccounts(list.id, 0));
    if (!accounts.length) return false;
    this.save(scope, accounts.map(person), 'list');
    return true;
  }

  private async build(scope: string): Promise<void> {
    const me = this.auth.account();
    if (!me) {
      this.source.set('failed');
      return;
    }
    if ((me.following_count ?? 0) + (me.followers_count ?? 0) > MUTUALS_BUILD_CAP) {
      this.source.set('capped');
      return;
    }
    const [following, followers] = await Promise.all([
      this.everyPage((maxId) => this.api.accountFollowingPage(me.id, maxId)),
      this.everyPage((maxId) => this.api.accountFollowersPage(me.id, maxId)),
    ]);
    const followsMe = new Set(followers.map((a) => a.id));
    this.save(scope, following.filter((a) => followsMe.has(a.id)).map(person), 'built');
  }

  private async everyPage(
    page: (maxId?: string) => Observable<{ accounts: Account[]; nextMaxId: string | null }>,
  ): Promise<Account[]> {
    const all: Account[] = [];
    let cursor: string | undefined;
    // The cap bounds the walk; this bounds a server whose cursor never ends.
    for (let pages = 0; pages < Math.ceil(MUTUALS_BUILD_CAP / 80) + 1; pages++) {
      const { accounts, nextMaxId } = await firstValueFrom(page(cursor));
      all.push(...accounts);
      if (!nextMaxId || !accounts.length) break;
      cursor = nextMaxId;
    }
    return all;
  }
}

/** A Mastodon account as a suggestion: the handle is what "Chat with" submits. */
export function person(account: Pick<Account, 'acct' | 'display_name' | 'username'>): ChatPerson {
  return { acct: account.acct, name: account.display_name || account.username || account.acct };
}

/**
 * Up to `limit` people matching `query`, mutuals first and then `partners`,
 * each handle once. Matches the start of the handle, of any word of the name,
 * or of the server, so "sql" and "mastodon.soc" both find @mistersql@mastodon.social.
 */
export function rankSuggestions(
  query: string,
  mutuals: readonly ChatPerson[],
  partners: readonly ChatPerson[],
  limit = 12,
): ChatPerson[] {
  const q = query.trim().replace(/^@/, '').toLowerCase();
  const matches = (p: ChatPerson) => {
    if (!q) return true;
    const acct = p.acct.toLowerCase();
    return (
      acct.includes(q) ||
      p.name
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word.startsWith(q))
    );
  };
  const seen = new Set<string>();
  const out: ChatPerson[] = [];
  for (const p of [...mutuals, ...partners]) {
    const key = p.acct.toLowerCase();
    if (seen.has(key) || !matches(p)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
