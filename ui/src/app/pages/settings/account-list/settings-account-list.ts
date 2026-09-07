import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { Api } from '../../../api';
import { BulkActionId, BulkActions } from '../../../bulk-actions';
import { BulkActionsDialog } from '../../../bulk-actions-dialog/bulk-actions-dialog';
import { BulkProgress } from '../../../bulk-progress/bulk-progress';
import { Account } from '../../../models';

/**
 * Which list is on screen. The first two are accounts; `domains` is a different
 * shape entirely (bare strings, its own endpoints) and takes its own code path
 * rather than being forced through the account paging machinery.
 */
type Kind = 'mutes' | 'blocks' | 'domains';

/** The two account-shaped lists, where {@link Kind} needs narrowing. */
type AccountKind = 'mutes' | 'blocks';

const PAGE_SIZE = 40;

/** Domains per page. Mastodon defaults to 100 here and caps at 200. */
const DOMAIN_PAGE_SIZE = 100;

/**
 * Combined muted / blocked / domain-blocked management, initially chosen by
 * route data and switchable in place.
 *
 * The Domains tab is the same page's third list but a different shape: the API
 * returns bare strings rather than entities, adding is the primary action (you
 * cannot block a domain from a profile the way you block a person), and there
 * is no amnesty. It therefore runs on its own loader rather than being squeezed
 * through the account paging machinery below — see {@link loadDomainPage}.
 *
 * Carries the matching amnesty action at the top, because looking at a list of
 * 200 blocks you no longer care about is exactly when you want to be rid of all
 * of them, and hunting through Settings for the tab that does it is friction at
 * the wrong moment. It is the same job the Bulk actions tab starts, same dialog,
 * same progress panel.
 *
 * ## Paging
 *
 * The list used to render whatever the first unpaginated read returned — 40
 * accounts — while amnesty, which walks every page, reported 280. Same list, two
 * numbers, and no way to reach accounts 41 onward.
 *
 * Mastodon paginates these two lists by *relationship* id, a value that appears
 * nowhere in the account objects, so the cursor only ever arrives in the `Link`
 * header (see {@link Api.accountListPage}). That makes random access impossible:
 * page 5 is only reachable by fetching pages 1-4 first. So "last page" walks
 * forward, and every page it passes through lands in {@link cursors} and
 * {@link pageCache} — which is what keeps First/Prev/Next/Last from re-hitting
 * the server once a page has been seen.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.accountList.title: Muted & Blocked
// i18n settings.accountList.subtitle.mutes: You won't see posts or notifications from these accounts. They can still follow you.
// i18n settings.accountList.subtitle.blocks: These accounts can't follow you, see your posts, or interact with you.
// i18n settings.accountList.subtitle.domains: Blocking a domain hides every account on that server at once — their posts, their notifications, and any followers you have there.
// i18n settings.accountList.tabs: Account restriction
// i18n settings.accountList.tab.mutes: Mute
// i18n settings.accountList.tab.blocks: Block
// i18n settings.accountList.tab.domains: Domains
// i18n settings.accountList.amnesty.mutes: Unmute everyone
// i18n settings.accountList.amnesty.blocks: Unblock everyone
// i18n settings.accountList.amnesty.hint: Done with this list? {{action}} at once — you’ll be shown exactly how many accounts that is, and offered a backup, before anything changes.
// i18n settings.accountList.blockDomain: Block a domain
// i18n settings.accountList.domain.hint.before: A handle or a link works too —
// i18n settings.accountList.domain.hint.after: or a profile URL will be reduced to the domain.
// i18n settings.accountList.noDomains: No blocked domains.
// i18n settings.accountList.empty: Nothing here.
// i18n settings.accountList.unblock: Unblock
// i18n settings.accountList.unmute: Unmute
// i18n settings.accountList.also.blocked: also blocked
// i18n settings.accountList.also.muted: also muted
// i18n settings.accountList.alsoApply.block: Also block this account, keeping the current restriction
// i18n settings.accountList.alsoApply.mute: Also mute this account, keeping the current restriction
// i18n settings.accountList.convert.block: Convert to block
// i18n settings.accountList.convert.mute: Convert to mute
// i18n settings.accountList.convert.block.title: Replace this with a block
// i18n settings.accountList.convert.mute.title: Replace this with a mute
// i18n settings.accountList.following: following
// i18n settings.accountList.following.title: You still follow this account
// i18n settings.accountList.unfollow: Unfollow
// i18n settings.accountList.unfollow.title: Stop following — the mute stays as it is
// i18n settings.accountList.pages: Pages
// i18n settings.accountList.first: « First
// i18n settings.accountList.previous: ‹ Previous
// i18n settings.accountList.page: Page {{page}}
// i18n settings.accountList.pageOf: of {{total}}
// i18n settings.accountList.next: Next ›
// i18n settings.accountList.last: Last »
// i18n common.running: Running…
@Component({
  selector: 'app-settings-account-list',
  imports: [RouterLink, FormsModule, BulkActionsDialog, BulkProgress, TranslocoPipe],
  templateUrl: './settings-account-list.html',
  styleUrl: './settings-account-list.css',
})
export class SettingsAccountList implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private bulk = inject(BulkActions);

  protected kind = signal<Kind>('mutes');
  protected accounts = signal<Account[]>([]);
  protected loading = signal(false);

  /** True while the Domains tab is showing — the non-account code path. */
  protected readonly isDomains = computed(() => this.kind() === 'domains');

  /**
   * The current kind narrowed to an account list.
   *
   * Every account-shaped read goes through this rather than `kind()` so a
   * 'domains' value can never reach an endpoint that expects mutes or blocks.
   * Falls back to 'blocks' because Domains sits under it conceptually — but the
   * callers all guard on {@link isDomains} first, so the fallback is a
   * type-safety belt rather than a behaviour anyone should hit.
   */
  private accountKind(): AccountKind {
    const kind = this.kind();
    return kind === 'domains' ? 'blocks' : kind;
  }

  // -------------------------------------------------------------- domains

  /** Blocked domains on the current page. */
  protected domains = signal<string[]>([]);

  /** What the user has typed into "Block a domain". */
  protected domainInput = signal('');

  /** Set while a domain add/remove is in flight, keyed by domain. */
  protected domainBusy = signal<ReadonlySet<string>>(new Set());

  /** Shown when the server rejects an add — usually a malformed domain. */
  protected domainError = signal('');

  /** True once the domain list has no further `Link` cursor. */
  private domainCursors: (string | undefined)[] = [undefined];

  // ---------------------------------------------------------------- paging

  /** 0-based index of the page on screen. */
  protected page = signal(0);

  /**
   * `cursors[n]` is the `max_id` that fetches page `n`; `cursors[0]` is always
   * undefined (page 1 needs no cursor). Grows by one each time a page reveals a
   * `Link` header pointing further on.
   */
  private cursors: (string | undefined)[] = [undefined];

  /** Pages already fetched, by index — the microcache behind Prev/Last. */
  private pageCache = new Map<number, Account[]>();

  /**
   * The other-list flags for each cached page.
   *
   * Cached beside the page itself, so revisiting one costs nothing at all.
   * Without this, paging back re-asked `/relationships` every time and the
   * microcache only half worked — the expensive part of a Prev click is the
   * round trip, not which endpoint it goes to.
   */
  private otherCache = new Map<number, ReadonlySet<string>>();

  /** Follow state per cached page, kept beside {@link otherCache}. */
  private followingCache = new Map<number, ReadonlySet<string>>();

  /** True once a page comes back with no `rel="next"`: the walk has an end. */
  protected lastPageKnown = signal(false);

  /** Highest page index we know exists, or null while still unknown. */
  protected lastPage = signal<number | null>(null);

  protected readonly canPrev = computed(() => this.page() > 0 && !this.loading());
  protected readonly canNext = computed(
    () => !this.loading() && (this.lastPage() === null || this.page() < this.lastPage()!),
  );

  /**
   * Whether the pager is worth showing.
   *
   * A single-page list gets no controls — five greyed-out buttons under six
   * blocked domains is noise. It appears as soon as there is somewhere to go,
   * or once we know there is more than one page.
   */
  protected readonly showPager = computed(() => {
    if (this.loading()) {
      return false;
    }
    const last = this.lastPage();
    return this.page() > 0 || last === null || last > 0;
  });

  /**
   * Human range for the header, e.g. "41–80". Deliberately not "of 280": the
   * total is unknowable until the whole list has been walked, and claiming a
   * total we have not verified is the bug this page started with.
   */
  protected readonly rangeLabel = computed(() => {
    const domains = this.isDomains();
    const size = domains ? DOMAIN_PAGE_SIZE : PAGE_SIZE;
    const count = domains ? this.domains().length : this.accounts().length;
    const start = this.page() * size + 1;
    return count ? `${start}–${start + count - 1}` : '';
  });

  // ------------------------------------------------------- the other list

  /**
   * Ids that are *also* on the opposite list (blocked accounts that are muted
   * too, or vice versa).
   *
   * Converting a mute to a block is a decision you cannot make without knowing
   * whether the block already exists, and the row gave no clue either way.
   */
  protected alsoOther = signal<ReadonlySet<string>>(new Set());

  /**
   * Ids on this page that the viewer still follows.
   *
   * Muting does not unfollow, so "muted but still followed" is an ordinary
   * state rather than an edge case — and this page is where you notice it.
   * Blocking *does* force an unfollow server-side, which is why the Blocked
   * list never shows this and only the Muted one offers Unfollow.
   */
  protected following = signal<ReadonlySet<string>>(new Set());

  /** Rows whose convert/add button is mid-flight, so it can disable itself. */
  protected busy = signal<ReadonlySet<string>>(new Set());

  // -------------------------------------------------------------- amnesty

  protected readonly amnestyRunning = this.bulk.running;
  /** True while the confirmation dialog for this page's amnesty is open. */
  protected readonly asking = signal(false);

  protected readonly amnestyAction = computed<BulkActionId>(() =>
    this.kind() === 'mutes' ? 'mute-amnesty' : 'block-amnesty',
  );

  protected readonly amnestyLabelKey = computed(() =>
    this.kind() === 'mutes'
      ? 'settings.accountList.amnesty.mutes'
      : 'settings.accountList.amnesty.blocks',
  );

  /**
   * Whether to offer the bulk "clear this list" action at all.
   *
   * Not on Domains: there is no domain amnesty in {@link BulkActions}, and the
   * blast radius is different in kind — unblocking every domain at once would
   * re-admit whole servers someone blocked one at a time and deliberately. The
   * per-row Unblock is the right granularity for a list this short.
   */
  protected readonly canAmnesty = computed(() => !this.isDomains());

  constructor() {
    // Reload once the job finishes so the list reflects what just happened
    // rather than showing accounts that are no longer muted or blocked.
    effect(() => {
      const phase = this.bulk.job()?.phase;
      if (phase === 'done' || phase === 'cancelled' || phase === 'failed') {
        this.reset();
      }
    });
  }

  protected askAmnesty(): void {
    if (!this.amnestyRunning()) {
      this.asking.set(true);
    }
  }

  protected cancelAmnesty(): void {
    this.asking.set(false);
  }

  protected confirmAmnesty(): void {
    this.asking.set(false);
    void this.bulk.start(this.amnestyAction());
  }

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.kind.set((data['kind'] as Kind) ?? 'mutes');
      this.reset();
    });
  }

  protected show(kind: Kind): void {
    if (kind === this.kind()) {
      return;
    }
    this.kind.set(kind);
    this.asking.set(false);
    this.reset();
  }

  protected get subtitleKey(): string {
    switch (this.kind()) {
      case 'mutes':
        return 'settings.accountList.subtitle.mutes';
      case 'blocks':
        return 'settings.accountList.subtitle.blocks';
      case 'domains':
        return 'settings.accountList.subtitle.domains';
    }
  }

  /**
   * Keys naming the *opposite* list, for the row buttons and badges.
   *
   * These used to be word fragments composed in the template
   * (`'Also ' + otherWord`, `'Convert to ' + otherWord`). English tolerates that;
   * most languages do not — the noun inflects with the verb, and the original
   * comment here already noted that even English needed "muteed" spelled out by
   * hand. So each phrase is now one whole key per direction, and no sentence is
   * built by concatenation.
   */
  protected get otherVerbKey(): string {
    return this.kind() === 'mutes'
      ? 'settings.accountList.tab.blocks'
      : 'settings.accountList.tab.mutes';
  }

  protected get otherAlsoKey(): string {
    return this.kind() === 'mutes'
      ? 'settings.accountList.also.blocked'
      : 'settings.accountList.also.muted';
  }

  protected get otherAlsoApplyKey(): string {
    return this.kind() === 'mutes'
      ? 'settings.accountList.alsoApply.block'
      : 'settings.accountList.alsoApply.mute';
  }

  protected get otherConvertKey(): string {
    return this.kind() === 'mutes'
      ? 'settings.accountList.convert.block'
      : 'settings.accountList.convert.mute';
  }

  protected get otherConvertTitleKey(): string {
    return this.kind() === 'mutes'
      ? 'settings.accountList.convert.block.title'
      : 'settings.accountList.convert.mute.title';
  }

  // ------------------------------------------------------------ fetching

  /** Throw away every cached page and cursor, then load page 1. */
  private reset(): void {
    this.cursors = [undefined];
    this.domainCursors = [undefined];
    this.pageCache.clear();
    this.otherCache.clear();
    this.followingCache.clear();
    this.lastPageKnown.set(false);
    this.lastPage.set(null);
    this.page.set(0);
    this.domainError.set('');
    if (this.isDomains()) {
      this.accounts.set([]);
      this.loadDomainPage(0);
      return;
    }
    this.domains.set([]);
    this.loadPage(0);
  }

  /**
   * Load one page of blocked domains.
   *
   * Deliberately simpler than the account pager: the payload is bare strings,
   * the page size is 100, and nobody has 400 blocked domains — so there is no
   * microcache and no forward walk, just cursors recorded as they arrive.
   */
  private loadDomainPage(index: number): void {
    this.loading.set(true);
    this.api.domainBlocksPage(this.domainCursors[index], DOMAIN_PAGE_SIZE).subscribe({
      next: ({ domains, nextMaxId }) => {
        this.page.set(index);
        this.domains.set(domains);
        if (nextMaxId && domains.length) {
          if (this.domainCursors.length === index + 1) {
            this.domainCursors.push(nextMaxId);
          }
        } else {
          this.lastPageKnown.set(true);
          this.lastPage.set(index);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /**
   * Show page `index`, fetching only the pages not already cached.
   *
   * Walks forward from the furthest known cursor when `index` is beyond it,
   * because a `Link`-paginated list offers no way to jump.
   */
  private loadPage(index: number): void {
    const cached = this.pageCache.get(index);
    if (cached) {
      this.page.set(index);
      this.accounts.set(cached);
      // Flags come from the cache too — a revisited page costs no requests at all.
      this.alsoOther.set(this.otherCache.get(index) ?? new Set());
      this.following.set(this.followingCache.get(index) ?? new Set());
      return;
    }

    if (index >= this.cursors.length) {
      // Need the intervening pages first to learn this page's cursor.
      this.walkTo(index);
      return;
    }

    this.loading.set(true);
    this.api.accountListPage(this.accountKind(), this.cursors[index], PAGE_SIZE).subscribe({
      next: ({ accounts, nextMaxId }) => {
        this.pageCache.set(index, accounts);
        this.page.set(index);
        this.accounts.set(accounts);
        this.recordCursor(index, accounts, nextMaxId);
        this.loading.set(false);
        this.markOtherList(index, accounts);
      },
      error: () => this.loading.set(false),
    });
  }

  /**
   * Fetch pages one at a time until `target` is reached or the list runs out.
   *
   * Used by "Last page" (target `Infinity`) and by any jump past the furthest
   * cursor we hold. Each hop is cached, so walking to the end once makes every
   * page in between free from then on.
   */
  private walkTo(target: number): void {
    const next = this.cursors.length - 1;
    const cursor = this.cursors[next];
    if (next > 0 && cursor === undefined) {
      // No further cursor: we are already at the end of the list.
      this.loadPage(next);
      return;
    }

    this.loading.set(true);
    this.api.accountListPage(this.accountKind(), cursor, PAGE_SIZE).subscribe({
      next: ({ accounts, nextMaxId }) => {
        this.pageCache.set(next, accounts);
        this.recordCursor(next, accounts, nextMaxId);

        const atEnd = !nextMaxId || !accounts.length;
        if (atEnd || next >= target) {
          const landing = atEnd ? Math.min(target, next) : target;
          this.loading.set(false);
          this.page.set(landing);
          this.accounts.set(this.pageCache.get(landing) ?? []);
          // Only the page we land on needs its flags — the ones walked past were
          // never displayed, so asking about them would be pure waste.
          this.markOtherList(landing, this.pageCache.get(landing) ?? []);
          return;
        }
        this.walkTo(target);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Remember where the page after `index` starts, and whether one exists. */
  private recordCursor(index: number, accounts: Account[], nextMaxId: string | null): void {
    if (nextMaxId && accounts.length) {
      if (this.cursors.length === index + 1) {
        this.cursors.push(nextMaxId);
      }
    } else {
      this.lastPageKnown.set(true);
      this.lastPage.set(index);
    }
  }

  /** Route a page request to whichever list is on screen. */
  private goToPage(index: number): void {
    if (this.isDomains()) {
      this.loadDomainPage(index);
    } else {
      this.loadPage(index);
    }
  }

  protected first(): void {
    if (this.page() !== 0) {
      this.goToPage(0);
    }
  }

  protected prev(): void {
    if (this.canPrev()) {
      this.goToPage(this.page() - 1);
    }
  }

  protected next(): void {
    if (this.canNext()) {
      this.goToPage(this.page() + 1);
    }
  }

  protected last(): void {
    if (this.loading()) {
      return;
    }
    const known = this.lastPage();
    if (known !== null) {
      this.goToPage(known);
      return;
    }
    if (this.isDomains()) {
      // No forward walk for domains: without a cached ladder the only way on is
      // one page at a time, and Next already does that.
      this.goToPage(this.page() + 1);
      return;
    }
    this.walkTo(Number.MAX_SAFE_INTEGER);
  }

  /**
   * Ask the server which accounts on this page are on the other list too.
   *
   * One `/relationships` call per page rather than per row — it takes the whole
   * page's ids at once, so paging costs one extra request, not forty.
   */
  private markOtherList(index: number, accounts: Account[]): void {
    if (!accounts.length) {
      this.alsoOther.set(new Set());
      this.following.set(new Set());
      return;
    }
    this.api.relationships(accounts.map((a) => a.id)).subscribe({
      next: (rels) => {
        const muting = this.kind() === 'mutes';
        const flagged = new Set(
          rels.filter((r) => (muting ? r.blocking : r.muting)).map((r) => r.id),
        );
        // The same response already says whether you follow them — muting does
        // not unfollow, so this is a common state and worth reading off here
        // rather than spending a second call on it.
        const followed = new Set(rels.filter((r) => r.following).map((r) => r.id));
        this.otherCache.set(index, flagged);
        this.followingCache.set(index, followed);
        // Only paint if this is still the page on screen: a fast Next while the
        // lookup was in flight would otherwise flag the wrong rows.
        if (this.page() === index) {
          this.alsoOther.set(flagged);
          this.following.set(followed);
        }
      },
      error: () => {
        if (this.page() === index) {
          this.alsoOther.set(new Set());
          this.following.set(new Set());
        }
      },
    });
  }

  // ------------------------------------------------------------ row actions

  /** True when this account is on the opposite list as well as this one. */
  protected isAlsoOther(id: string): boolean {
    return this.alsoOther().has(id);
  }

  /**
   * Whether to offer Unfollow for this row.
   *
   * Muted lists only. A block already forces the unfollow server-side, so the
   * button could never do anything there — and there is deliberately no Follow
   * counterpart: nobody arrives at their mute list to start following someone,
   * and the profile is one click away for the rare case that they do.
   */
  protected canUnfollow(id: string): boolean {
    return this.kind() === 'mutes' && this.following().has(id);
  }

  /** Stop following without touching the mute — the two are independent. */
  protected unfollow(acc: Account): void {
    if (this.isBusy(acc.id)) {
      return;
    }
    this.setBusy(acc.id, true);
    this.api.unfollow(acc.id).subscribe({
      next: () => {
        this.clearFollow(acc.id);
        this.setBusy(acc.id, false);
      },
      error: () => this.setBusy(acc.id, false),
    });
  }

  /** Forget that this account is followed, on screen and in the page cache. */
  private clearFollow(id: string): void {
    const left = new Set(this.following());
    left.delete(id);
    this.following.set(left);
    this.followingCache.set(this.page(), left);
  }

  protected isBusy(id: string): boolean {
    return this.busy().has(id);
  }

  private setBusy(id: string, on: boolean): void {
    this.busy.update((set) => {
      const copy = new Set(set);
      if (on) {
        copy.add(id);
      } else {
        copy.delete(id);
      }
      return copy;
    });
  }

  /** Drop a row from the page on screen and from its cached copy. */
  private dropRow(id: string): void {
    this.accounts.update((list) => list.filter((a) => a.id !== id));
    const cached = this.pageCache.get(this.page());
    if (cached) {
      this.pageCache.set(
        this.page(),
        cached.filter((a) => a.id !== id),
      );
    }
  }

  undo(acc: Account): void {
    const call =
      this.kind() === 'mutes' ? this.api.unmuteAccount(acc.id) : this.api.unblockAccount(acc.id);
    call.subscribe(() => this.dropRow(acc.id));
  }

  /**
   * Add the other list's state and keep this one — "block them as well as
   * muting them". Someone reaching for this has decided one restriction is not
   * enough, so the row stays where it is and gains the badge.
   */
  protected alsoApply(acc: Account): void {
    if (this.isBusy(acc.id)) {
      return;
    }
    this.setBusy(acc.id, true);
    const call = this.kind() === 'mutes' ? this.api.block(acc.id) : this.api.muteAccount(acc.id);
    call.subscribe({
      next: () => {
        const flagged = new Set(this.alsoOther()).add(acc.id);
        this.alsoOther.set(flagged);
        this.otherCache.set(this.page(), flagged);
        // Blocking forces an unfollow server-side, so the Unfollow button on
        // this row has just become a no-op. Drop it rather than leave a control
        // that would fire a request the server has already made moot.
        if (this.kind() === 'mutes') {
          this.clearFollow(acc.id);
        }
        this.setBusy(acc.id, false);
      },
      error: () => this.setBusy(acc.id, false),
    });
  }

  /**
   * Swap one restriction for the other: apply the opposite, lift this one, and
   * let the row leave the list it no longer belongs to.
   *
   * Applied before the lift so a failure leaves the account restricted rather
   * than briefly unrestricted — the safe direction to fail in.
   */
  protected convert(acc: Account): void {
    if (this.isBusy(acc.id)) {
      return;
    }
    this.setBusy(acc.id, true);
    const muting = this.kind() === 'mutes';
    const apply: Observable<unknown> = this.isAlsoOther(acc.id)
      ? of(null)
      : muting
        ? this.api.block(acc.id)
        : this.api.muteAccount(acc.id);
    const lift = muting ? this.api.unmuteAccount(acc.id) : this.api.unblockAccount(acc.id);

    apply.subscribe({
      next: () => {
        lift.subscribe({
          next: () => {
            this.dropRow(acc.id);
            this.setBusy(acc.id, false);
          },
          error: () => this.setBusy(acc.id, false),
        });
      },
      error: () => this.setBusy(acc.id, false),
    });
  }

  // ------------------------------------------------------- domain actions

  protected isDomainBusy(domain: string): boolean {
    return this.domainBusy().has(domain);
  }

  private setDomainBusy(domain: string, on: boolean): void {
    this.domainBusy.update((set) => {
      const copy = new Set(set);
      if (on) {
        copy.add(domain);
      } else {
        copy.delete(domain);
      }
      return copy;
    });
  }

  /**
   * Tidy what someone pasted into something the API will accept.
   *
   * People paste `https://mastodon.social/@alice` or `@bob@nsfw.social` far more
   * often than they type a bare hostname, and the server's only answer to either
   * is a 422 that says "not a valid domain name". Pulling the host out here is
   * the difference between the field working and the field looking broken.
   */
  private normalizeDomain(raw: string): string {
    let value = raw.trim().toLowerCase();
    if (!value) {
      return '';
    }
    // Scheme and path go first. Order matters: `https://nsfw.social/@alice` has
    // an '@' in it, and handling that before stripping the path would return
    // "alice" — the username — instead of the host.
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    value = value.split('/')[0];
    // What's left may still be a handle (`@someone@nsfw.social` or
    // `someone@nsfw.social`); the domain is whatever follows the last '@'.
    if (value.includes('@')) {
      value = value.slice(value.lastIndexOf('@') + 1);
    }
    // Strip a port and any stray trailing dot.
    return value.split(':')[0].replace(/\.$/, '');
  }

  /** Whether the typed value looks like a domain we can send. */
  protected readonly canBlockDomain = computed(() => {
    const domain = this.normalizeDomain(this.domainInput());
    // At least one dot and no whitespace — the two things the server rejects.
    return domain.length > 2 && domain.includes('.') && !/\s/.test(domain);
  });

  /**
   * Block whatever is in the input.
   *
   * The server treats blocking an already-blocked domain as a success, so the
   * only real failure here is a malformed value — which the input guard already
   * catches. On success the list is reloaded rather than patched: a domain block
   * can drop followers, and re-reading is the honest way to show what changed.
   */
  protected blockDomain(): void {
    const domain = this.normalizeDomain(this.domainInput());
    if (!domain || this.isDomainBusy(domain)) {
      return;
    }
    this.domainError.set('');
    this.setDomainBusy(domain, true);
    this.api.blockDomain(domain).subscribe({
      next: () => {
        this.domainInput.set('');
        this.setDomainBusy(domain, false);
        this.reset();
      },
      error: () => {
        this.domainError.set(`Couldn't block ${domain}. Check it is a plain domain name.`);
        this.setDomainBusy(domain, false);
      },
    });
  }

  /** Lift a domain block. Idempotent server-side, so no confirmation. */
  protected unblockDomain(domain: string): void {
    if (this.isDomainBusy(domain)) {
      return;
    }
    this.setDomainBusy(domain, true);
    this.api.unblockDomain(domain).subscribe({
      next: () => {
        this.domains.update((list) => list.filter((d) => d !== domain));
        this.setDomainBusy(domain, false);
      },
      error: () => {
        this.domainError.set(`Couldn't unblock ${domain}.`);
        this.setDomainBusy(domain, false);
      },
    });
  }
}
