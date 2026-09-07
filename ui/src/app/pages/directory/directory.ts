import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, EMPTY } from 'rxjs';
import { Api } from '../../api';
import { Account, Relationship } from '../../models';
import { Server } from '../../server';
import { AccountResultCard } from '../search/account-result-card';
import { AccountWithMatches } from '../search/account-refine';
import { AnonymousCapabilities } from '../../providers/anonymous/anonymous-capabilities';
import { AnonymousFollows } from '../../providers/anonymous/anonymous-follows';
import { anonymousAccountRouteRef } from '../../providers/anonymous/anonymous-route-ref';

export type DirectoryOrder = 'active' | 'new';

/** Mastodon caps the directory at 80 per page; page at the cap to halve calls. */
const PAGE_SIZE = 80;

/**
 * The instance's profile directory — the opt-in list of discoverable accounts.
 *
 * It gets its own page rather than a Search tab because it has no query: the
 * controls are browse controls (sort, local/remote, offset), and every one of
 * search's mechanisms — the DSL, refine facets, saved searches, search-server
 * redirection — is meaningless against an endpoint you cannot ask a question.
 * It is reached from the Lists hub, which is where the app already collects
 * "built-in things this server offers as a feed".
 *
 * Two honest limits worth knowing, both surfaced in the template rather than
 * papered over:
 *  - This is profile *discovery*, not a registration log. Accounts that opted
 *    out of discovery are absent, so `new` is "recently joined and discoverable",
 *    which is a strictly smaller set than "recently joined".
 *  - `local=false` includes remote accounts the server happens to know about,
 *    which is a function of who its members follow, not of the wider network.
 *
 * State lives in the URL (`?order=&local=`) so a view is linkable and the back
 * button restores it, matching how search's URL sync already behaves.
 */
// i18n pages.directory.heading: Server directory
// i18n pages.directory.blurb: Accounts on {{host}} that chose to appear in the public directory. Opting out is the default on some servers, so this is a slice of the membership, not a roster.
// i18n pages.directory.tabs.active: Recently active
// i18n pages.directory.tabs.new: Recently joined
// i18n pages.directory.thisServerOnly: This server only
// i18n pages.directory.remoteNote: Including remote accounts {{host}} has seen — that depends on who its members follow, not on the whole network.
// i18n pages.directory.searchFallback.a: You can still
// i18n pages.directory.searchFallback.b: search for accounts
// i18n pages.directory.searchFallback.c: by name or handle.
// i18n pages.directory.loading: Loading…
// i18n pages.directory.noAccountsListed.local: No accounts listed on this server.
// i18n pages.directory.noAccountsListed.any: No accounts listed.
// i18n pages.directory.tryUnchecking: Try unchecking “This server only”.
// i18n pages.directory.loadMore: Load more
// i18n pages.directory.everyoneListed: That's everyone the directory lists.
// i18n pages.directory.thisServer: this server
// i18n pages.directory.errorMessage: {{host}} didn't return a profile directory. The server may have it turned off.
@Component({
  selector: 'app-directory',
  imports: [RouterLink, AccountResultCard, TranslocoPipe],
  templateUrl: './directory.html',
  styleUrl: './directory.css',
})
export class Directory implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private server = inject(Server);
  private destroyRef = inject(DestroyRef);
  protected capabilities = inject(AnonymousCapabilities);
  private anonymousFollows = inject(AnonymousFollows);
  private transloco = inject(TranslocoService);

  protected order = signal<DirectoryOrder>('active');
  protected local = signal(true);

  protected accounts = signal<Account[]>([]);
  protected loading = signal(true);
  protected loadingMore = signal(false);
  /** A short page means the directory is exhausted; hides "Load more". */
  protected exhausted = signal(false);
  /** Set when the endpoint errors — some instances disable the directory. */
  protected error = signal('');

  protected relationships = signal<Record<string, Relationship>>({});
  protected followBusy = signal<Set<string>>(new Set());
  private expanded = signal<Set<string>>(new Set());

  /** Named host for the copy. `baseUrl()` is '' for the app's own server. */
  protected host = computed(
    () =>
      this.server.baseUrl().replace(/^https?:\/\//, '') ||
      this.transloco.translate<string>('pages.directory.thisServer'),
  );

  /** The card takes the search page's shape; the directory has no matching posts. */
  protected items = computed<AccountWithMatches[]>(() =>
    this.accounts().map((account) => ({ account, matchingPosts: [] })),
  );

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const order = params.get('order');
      this.order.set(order === 'new' ? 'new' : 'active');
      // Absent means the default (local-only): the narrower, more legible view.
      this.local.set(params.get('local') !== 'false');
      this.load();
    });
  }

  /** Write the controls into the URL; the subscription above reloads. */
  private navigate(order: DirectoryOrder, local: boolean): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { order, local: String(local) },
      replaceUrl: true,
    });
  }

  setOrder(order: DirectoryOrder): void {
    if (order !== this.order()) {
      this.navigate(order, this.local());
    }
  }

  toggleLocal(): void {
    this.navigate(this.order(), !this.local());
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    this.exhausted.set(false);
    this.accounts.set([]);
    this.relationships.set({});
    this.expanded.set(new Set());
    this.api
      .directory({ order: this.order(), local: this.local(), limit: PAGE_SIZE })
      .pipe(
        catchError(() => {
          this.error.set(
            this.transloco.translate<string>('pages.directory.errorMessage', {
              host: this.host(),
            }),
          );
          this.loading.set(false);
          return EMPTY;
        }),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((accounts) => {
        this.accounts.set(accounts);
        this.exhausted.set(accounts.length < PAGE_SIZE);
        this.loading.set(false);
        this.loadRelationships(accounts);
      });
  }

  loadMore(): void {
    if (this.loadingMore() || this.exhausted()) {
      return;
    }
    this.loadingMore.set(true);
    this.api
      .directory({
        order: this.order(),
        local: this.local(),
        limit: PAGE_SIZE,
        offset: this.accounts().length,
      })
      .pipe(
        catchError(() => {
          this.loadingMore.set(false);
          this.exhausted.set(true);
          return EMPTY;
        }),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((accounts) => {
        // Offset paging can repeat an account when the underlying order shifts
        // between calls (someone posts, and `active` reshuffles beneath us).
        const seen = new Set(this.accounts().map((a) => a.id));
        const fresh = accounts.filter((a) => !seen.has(a.id));
        this.accounts.update((cur) => [...cur, ...fresh]);
        this.exhausted.set(accounts.length < PAGE_SIZE);
        this.loadingMore.set(false);
        this.loadRelationships(fresh);
      });
  }

  /** Batch-fetch relationships, or read the local store when anonymous. */
  private loadRelationships(accounts: Account[]): void {
    if (!accounts.length) {
      return;
    }
    if (this.capabilities.active) {
      const server = this.server.baseUrl();
      const map: Record<string, Relationship> = {};
      for (const a of accounts) {
        map[a.id] = this.anonymousFollows.relationship(a, server);
      }
      this.relationships.update((cur) => ({ ...cur, ...map }));
      return;
    }
    this.api
      .relationships(accounts.map((a) => a.id))
      .pipe(catchError(() => EMPTY))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rels) => {
        this.relationships.update((cur) => {
          const next = { ...cur };
          for (const r of rels) {
            next[r.id] = r;
          }
          return next;
        });
      });
  }

  relationshipFor(id: string): Relationship | null {
    return this.relationships()[id] ?? null;
  }

  isFollowBusy(id: string): boolean {
    return this.followBusy().has(id);
  }

  isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  toggleExpand(id: string): void {
    this.expanded.update((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  private setFollowBusy(id: string, busy: boolean): void {
    this.followBusy.update((set) => {
      const next = new Set(set);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Directory ids are always minted by the browsing server — no search-server
   *  namespace hazard here (compare search's `accountLink`). */
  accountLink(account: Account): (string | number)[] {
    return this.capabilities.active
      ? [
          '/accounts',
          anonymousAccountRouteRef({
            server: this.server.baseUrl(),
            id: account.id,
            originalUrl: account.url || undefined,
          }),
        ]
      : ['/accounts', account.id];
  }

  onFollow(account: Account): void {
    if (this.capabilities.active) {
      const result = this.anonymousFollows.follow(account, this.server.baseUrl());
      if (result.ok) {
        this.relationships.update((cur) => ({ ...cur, [account.id]: result.relationship }));
      }
      return;
    }
    this.setFollowBusy(account.id, true);
    this.api
      .follow(account.id)
      .pipe(catchError(() => EMPTY))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rel) => this.relationships.update((cur) => ({ ...cur, [account.id]: rel })),
        complete: () => this.setFollowBusy(account.id, false),
      });
  }

  onUnfollow(account: Account): void {
    if (this.capabilities.active) {
      const rel = this.anonymousFollows.unfollow(account, this.server.baseUrl());
      this.relationships.update((cur) => ({ ...cur, [account.id]: rel }));
      return;
    }
    this.setFollowBusy(account.id, true);
    this.api
      .unfollow(account.id)
      .pipe(catchError(() => EMPTY))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rel) => this.relationships.update((cur) => ({ ...cur, [account.id]: rel })),
        complete: () => this.setFollowBusy(account.id, false),
      });
  }
}
