import { translatedComputed } from '../../i18n/translated';
import { UiLocale } from '../../i18n/locale';
import { languageName } from '../../language/language-catalog';
import { accountProfilePath } from '../../accounts/account-route';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, EMPTY, forkJoin, map, of } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { AccountLanguages, inferAccountLanguages, writesIn } from '../../language/account-language';
import { LanguageSelect } from '../../language/language-select/language-select';
import { AdultVerdict } from '../../moderation/adult-content/adult-classifier';
import {
  AdultBadge,
  AdultCollapsed,
  AdultFilterControl,
} from '../../moderation/adult-content/adult-explain';
import { AdultResults } from '../../moderation/adult-content/adult-results';
import { NativeEvidence } from '../../moderation/adult-content/native-evidence';
import { AdultFilter, ClientPrefs } from '../../platform/storage/client-prefs';
import { Api } from '../../platform/api/api';
import { Account, Relationship, Status } from '../../platform/api/models';
import { Server } from '../../platform/http/server';
import { AccountResultCard } from '../search/account-result-card';
import { AccountWithMatches } from '../search/account-refine';
import { AnonymousCapabilities } from '../../accounts/anonymous/anonymous-capabilities';
import { AnonymousFollows } from '../../accounts/anonymous/anonymous-follows';
import { anonymousAccountRouteRef } from '../../accounts/anonymous/anonymous-route-ref';

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
// i18n pages.directory.language: Posts in
// i18n pages.directory.languageAny: Any language
// i18n pages.directory.unknown.one: {{count}} person hidden: we can’t tell their language from their profile yet.
// i18n pages.directory.unknown.other: {{count}} people hidden: we can’t tell their language from their profile yet.
// i18n pages.directory.check: Check their recent posts ({{count}} requests)
// i18n pages.directory.checking: Checking…
// i18n pages.directory.noneInLanguage: Nobody loaded so far posts in {{language}}. Load more, or check the people we can’t tell yet.
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
  imports: [
    RouterLink,
    AccountResultCard,
    TranslocoPipe,
    LanguageSelect,
    AdultFilterControl,
    AdultCollapsed,
    AdultBadge,
    MbButton,
  ],
  templateUrl: './directory.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
  private locale = inject(UiLocale);
  private nativeEvidence = inject(NativeEvidence);

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
  protected host = translatedComputed(
    () =>
      this.server.baseUrl().replace(/^https?:\/\//, '') ||
      this.transloco.translate<string>('pages.directory.thisServer'),
  );

  // --- Language and adult filters (spec/moderation-facets.md §4, Sprint 6) ---

  /** At most this many profiles are checked per click; more is the reader's call. */
  static readonly CHECK_BATCH = 10;
  /** Show people who post in this language; '' for anyone. Client side only. */
  protected language = signal('');
  /** Recent posts fetched per account by "Check their recent posts". */
  private postsById = signal<ReadonlyMap<string, Status[]>>(new Map());
  protected checking = signal(false);

  /** The card takes the search page's shape; posts appear once checked. */
  protected allItems = computed<AccountWithMatches[]>(() =>
    this.accounts().map((account) => ({
      account,
      matchingPosts: this.postsById().get(account.id) ?? [],
    })),
  );

  private languages = computed(() => {
    const out = new Map<string, AccountLanguages>();
    for (const item of this.allItems()) {
      out.set(item.account.id, inferAccountLanguages(item.account, item.matchingPosts));
    }
    return out;
  });

  /** Loaded people whose language is unknown and whose posts were not checked. */
  protected unknownLanguage = computed(() =>
    this.language()
      ? this.allItems().filter(
          (i) => !this.languages().get(i.account.id)?.votes && !this.postsById().has(i.account.id),
        )
      : [],
  );
  protected checkCount = computed(() =>
    Math.min(Directory.CHECK_BATCH, this.unknownLanguage().length),
  );

  private readonly adult = new AdultResults(
    inject(ClientPrefs),
    () => [],
    () => this.allItems(),
  );
  protected readonly adultFilter = this.adult.filter;

  /** What the list shows: language first, then the adult filter's Only. */
  protected items = computed<AccountWithMatches[]>(() => {
    const language = this.language();
    const byLanguage = language
      ? this.allItems().filter((i) => {
          const langs = this.languages().get(i.account.id);
          return !!langs && writesIn(langs, language);
        })
      : this.allItems();
    return this.adult.keepPeople(byLanguage);
  });

  protected adultHidden = computed(
    () => this.items().filter((i) => this.adult.collapsedAccount(i.account.id)).length,
  );
  protected adultDropped = this.adult.droppedPeople;

  protected languageName = computed(() =>
    this.language() ? languageName(this.language(), this.locale.active()) : '',
  );

  protected setAdultFilter(value: AdultFilter): void {
    this.adult.choose(value);
  }

  /** The adult filter shows only when someone loaded is adult (or under Only). */
  protected adultOfferPeople = this.adult.offerForPeople;

  protected adultCollapsed(id: string): AdultVerdict | null {
    return this.adult.collapsedAccount(id);
  }

  protected revealAdult(id: string): void {
    this.adult.reveal(`a:${id}`);
  }

  /** Why a shown person is adult (Only, or revealed): the line above them. */
  protected adultBadgeAccount(id: string): AdultVerdict | null {
    return this.adult.badgeAccount(id);
  }

  /**
   * Native: posts already in the local archive count as checked, at no API
   * cost, so "Check their recent posts" is only offered for the rest.
   */
  private addCachedPosts(accounts: Account[]): void {
    if (!this.nativeEvidence.available || !accounts.length) return;
    void this.nativeEvidence.postsFor(accounts).then((cached) => {
      if (!cached.size) return;
      this.postsById.update((cur) => {
        const next = new Map(cur);
        for (const [id, posts] of cached) if (!next.has(id)) next.set(id, posts);
        return next;
      });
    });
  }

  /**
   * Fetch recent posts for the next unknown-language people, one request each
   * and at most {@link Directory.CHECK_BATCH} per click. Failures count as
   * checked, with no evidence, so the button never loops on a broken profile.
   */
  protected checkLanguages(): void {
    const batch = this.unknownLanguage().slice(0, Directory.CHECK_BATCH);
    if (!batch.length || this.checking()) return;
    this.checking.set(true);
    forkJoin(
      batch.map((item) =>
        this.api.getAccountStatuses(item.account.id, { limit: 20 }).pipe(
          catchError(() => of([] as Status[])),
          map((posts) => [item.account.id, posts] as const),
        ),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((pairs) => {
        this.postsById.update((cur) => {
          const next = new Map(cur);
          for (const [id, posts] of pairs) next.set(id, posts);
          return next;
        });
        this.checking.set(false);
      });
  }

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
    this.postsById.set(new Map());
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
        this.addCachedPosts(accounts);
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
        this.addCachedPosts(fresh);
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
      : accountProfilePath(account);
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
