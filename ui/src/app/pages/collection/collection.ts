import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Account, CollectionWithAccounts, Status } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { BulkAddDialog } from '../../bulk-add-dialog/bulk-add-dialog';
import { BulkActions, BulkTarget } from '../../bulk-actions';
import { BulkActionsDialog } from '../../bulk-actions-dialog/bulk-actions-dialog';
import { BulkProgress } from '../../bulk-progress/bulk-progress';
import { ConfirmDialog } from '../../confirm-dialog/confirm-dialog';
import { AvatarFallback } from '../../avatar-fallback';
import { FollowButton } from '../../follow-button/follow-button';
import { FollowState } from '../../follow-state';
import { ImportFollows } from '../../import-follows';
import { ListCollectionConverter } from '../../list-collection-converter';
import { ListFeedResolver } from '../../lists/list-feed-resolver';
import { anonymousAccountRouteRef } from '../../providers/anonymous/anonymous-route-ref';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import {
  shippedStarterKit,
  shippedStarterKitCollection,
  ShippedStarterKit,
} from '../../starter-kits';

/**
 * Where to read a shipped member's posts from, or null for a local account.
 *
 * Their `url` is the only thing that says which instance they are on — the id is
 * meaningless anywhere else, which is precisely why asking the home server for
 * it 404s.
 */
function publicRefFor(account: Account): { server: string; id: string } | null {
  if (!account.url) {
    return null;
  }
  try {
    return { server: new URL(account.url).origin, id: account.id };
  } catch {
    return null;
  }
}

/** A member of the collection paired with its item id (needed for removal). */
interface Member {
  itemId: string;
  state: 'pending' | 'accepted';
  account: Account;
}

/**
 * A single Collection (Mastodon 4.6+): a curated set of accounts.
 * Shows the members and a client-side feed merged from the members' recent
 * statuses — the API has no collection timeline endpoint, so the feed is
 * synthesized in the browser (same client-side-only constraint as elsewhere).
 */
// i18n pages.collection.title: Collection
// i18n pages.collection.loading: Loading…
// i18n pages.collection.converting: Converting…
// i18n pages.collection.convertToList: Convert to list
// i18n pages.collection.curatedBy: Curated by
// i18n pages.collection.memberCount.one: {{count}} member
// i18n pages.collection.memberCount.other: {{count}} members
// i18n pages.collection.openOriginal: Open original on its home server ↗
// i18n pages.collection.workingFollowAll: Working…
// i18n pages.collection.followEveryone: Follow everyone in this collection
// i18n pages.collection.followingProgress: Following… {{done}}/{{total}}
// i18n pages.collection.followedSummary: Followed {{followed}} of {{total}}
// i18n pages.collection.addPeopleByName: Add people by name
// i18n pages.collection.deleteCollection: Delete collection
// i18n pages.collection.removeMe: Remove me from this collection
// i18n pages.collection.tabFeed: Feed
// i18n pages.collection.tabMembers: Members
// i18n pages.collection.bundledSectionsAriaLabel: Bundled collection sections
// i18n pages.collection.tabCollection: Collection
// i18n pages.collection.tabPosts: Posts
// i18n pages.collection.sampleOf: Sample of
// i18n pages.collection.sampleSizeAriaLabel: How many members to sample
// i18n pages.collection.membersSuffix: members
// i18n pages.collection.sampleAgain: Sample again
// i18n pages.collection.showMePosts: Show me some posts
// i18n pages.collection.sampleHint: One request per member, picked at random.
// i18n pages.collection.loadingPosts: Loading posts…
// i18n pages.collection.noSampledPosts: No recent posts from the members sampled.
// i18n pages.collection.endOfSample: —— end of sample ——
// i18n pages.collection.loadingFeed: Loading feed…
// i18n pages.collection.noMemberPosts: No recent posts from this collection's members.
// i18n pages.collection.searchAccountsPlaceholder: Search accounts to add…
// i18n pages.collection.search: Search
// i18n pages.collection.add: Add
// i18n pages.collection.noMembersYet: No members in this collection yet.
// i18n pages.collection.pending: pending
// i18n pages.collection.removeFromCollection: Remove from collection
// i18n pages.collection.deleteCollectionConfirmTitle: Delete this collection?
// i18n pages.collection.deleteCollectionConfirmMessage: “{{name}}” will be permanently deleted. This cannot be undone.
// i18n pages.collection.removeFromCollectionConfirmTitle: Remove from collection?
// i18n pages.collection.removeFromCollectionConfirmMessage: Remove @{{acct}} from “{{name}}”?
// i18n pages.collection.remove: Remove
// i18n pages.collection.errorNotFound: Collection not found (this server may not support collections).
// i18n pages.collection.errorLoadFailed: Could not load this collection.
// i18n pages.collection.convertPartAdded: {{count}} added
// i18n pages.collection.convertPartExisting: {{count}} already present
// i18n pages.collection.convertPartFailed: {{count}} skipped
// i18n pages.collection.convertNeedsFollowHint: Most servers only keep accounts you follow in a list — use “Follow everyone in this collection” first, then convert again.
// i18n pages.collection.convertedSummary: Converted to list: {{parts}}.{{hint}}
// i18n pages.collection.convertFailed: Could not convert this collection.
@Component({
  selector: 'app-collection',
  imports: [
    FormsModule,
    RouterLink,
    NgTemplateOutlet,
    StatusCard,
    BulkAddDialog,
    ConfirmDialog,
    FollowButton,
    BulkActionsDialog,
    BulkProgress,
    AvatarFallback,
    TranslocoPipe,
  ],
  // Component-scoped, so a bulk follow started here tracks this collection only.
  providers: [ImportFollows],
  templateUrl: './collection.html',
  styleUrl: './collection.css',
})
export class CollectionPage implements OnInit {
  private api = inject(Api);
  private auth = inject(Auth);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private converter = inject(ListCollectionConverter);
  private transloco = inject(TranslocoService);
  protected follows = inject(FollowState);
  protected bulk = inject(BulkActions);
  private feedResolver = inject(ListFeedResolver);
  private anonymousApi = inject(AnonymousPublicApi);
  protected importer = inject(ImportFollows);

  protected data = signal<CollectionWithAccounts | null>(null);
  protected shipped = signal<ShippedStarterKit | null>(null);
  protected loading = signal(true);
  protected error = signal('');
  protected tab = signal<'feed' | 'members'>('feed');

  protected feed = signal<Status[]>([]);
  protected feedLoading = signal(false);
  private feedLoadedFor = '';

  // Add-member search (owner only)
  protected query = signal('');
  protected searching = signal(false);
  protected results = signal<Account[]>([]);

  // Dialog state
  protected showBulk = signal(false);
  protected showDeleteConfirm = signal(false);
  protected memberToRemove = signal<Member | null>(null);
  protected converting = signal(false);
  protected conversionMessage = signal('');

  protected members = computed<Member[]>(() => {
    const d = this.data();
    if (!d) {
      return [];
    }
    const byId = new Map(d.accounts.map((a) => [a.id, a]));
    const out: Member[] = [];
    for (const item of d.collection.items) {
      const account = item.account_id ? byId.get(item.account_id) : undefined;
      if (account) {
        out.push({ itemId: item.id, state: item.state, account });
      }
    }
    return out;
  });

  /**
   * Whether this page can offer follow buttons at all.
   *
   * Signed-in only — an anonymous session has no relationships and no token to
   * write one with.
   *
   * Shipped starter kits are included, but by a different route. Their members
   * are accounts on other instances, so the ids they carry are meaningless
   * here; the button resolves each one to its local record first (webfinger via
   * `search?resolve=true`) and acts on that. See {@link foreignMember}.
   */
  protected canFollow = computed(() => !this.auth.isAnonymous);

  /**
   * The account to resolve before following, or null when its id is already
   * one this server can act on.
   *
   * Only shipped kits need it: a real server-side collection's members are
   * local records by definition.
   */
  protected foreignMember(account: Account): Account | null {
    return this.shipped() ? account : null;
  }

  /**
   * Resolve follow state for every member, in batches.
   *
   * The collection page's whole job is "here are people worth following", and
   * it used to answer the obvious follow-up — *which of them do I already
   * follow?* — only by making you open each one in a new tab.
   */
  private resolveFollows(): void {
    // Shipped kits are deliberately excluded: their ids are foreign, so asking
    // for relationships on them would answer about whoever holds those ids
    // locally. Each row resolves itself instead, one webfinger at a time.
    if (!this.canFollow() || this.shipped()) {
      return;
    }
    void this.follows.resolve(this.members().map((m) => m.account.id));
  }

  /** Whether the follow-everyone confirmation is open. */
  protected followAllOpen = signal(false);

  /**
   * This collection, as the bulk runner wants it.
   *
   * `list-follow` is reused rather than given a collection-specific twin: the
   * job is identical — read members, skip the ones already followed, write the
   * rest with pacing and rate-limit pauses — and the only difference is the
   * read, which {@link BulkTarget.kind} selects.
   */
  protected followAllTarget = computed<BulkTarget | undefined>(() => {
    const d = this.data();
    return d
      ? { listId: d.collection.id, listTitle: d.collection.name, kind: 'collection' }
      : undefined;
  });

  protected askFollowAll(): void {
    if (!this.bulk.running() && this.followAllTarget()) {
      this.followAllOpen.set(true);
    }
  }

  // -------------------------------------------- shipped kits: follow everyone
  //
  // A separate runner from the `BulkActions` one above, because a shipped kit's
  // members are accounts on other instances: the bulk runner follows by id, and
  // these ids belong to their home servers. `ImportFollows` is the mechanism
  // that already handles that — it resolves each member first when signed in,
  // and writes a browser-local row when anonymous.
  //
  // This is what made bundled collections the odd one out. The starter kits have
  // always offered one-click follow-everyone to anonymous visitors, and the kit
  // snapshot carries a resolved `Account` for every member, so there was never a
  // technical reason the collections could not.

  protected readonly kitFollowDone = computed(
    () =>
      this.importer
        .rows()
        .filter((row) => !['pending', 'resolving', 'following'].includes(row.status)).length,
  );
  protected readonly kitFollowed = computed(
    () => this.importer.rows().filter((row) => row.status === 'followed').length,
  );
  /** First real failure, usually the anonymous 50-follow cap. */
  protected readonly kitFollowError = computed(
    () => this.importer.rows().find((row) => row.status === 'failed')?.error ?? '',
  );

  /** Whether this page should offer follow-everyone through the importer. */
  protected readonly canFollowKit = computed(() => !!this.shipped() && this.members().length > 0);

  protected followAllShipped(): void {
    if (this.importer.running() || !this.shipped()) {
      return;
    }
    void this.importer.start();
  }

  /**
   * Seed the importer with this kit's members.
   *
   * Anonymous sessions use the snapshot accounts directly — no search, no token.
   * Signed-in ones pass handles, so each is webfingered to a local record the
   * home server can actually follow.
   */
  private loadKitRows(): void {
    this.importer.reset();
    const accounts = this.members().map((m) => m.account);
    if (!accounts.length) {
      return;
    }
    if (this.auth.isAnonymous) {
      this.importer.loadResolved(accounts.map((account) => ({ handle: account.acct, account })));
    } else {
      this.importer.load(accounts.map((account) => account.acct));
    }
  }

  protected confirmFollowAll(): void {
    this.followAllOpen.set(false);
    const target = this.followAllTarget();
    if (!target) {
      return;
    }
    // Not awaited: the progress panel reports it, and the user is free to leave.
    void this.bulk.start('list-follow', target).then(() => {
      // Re-read relationships so the per-row buttons agree with what just
      // happened, rather than showing "Follow" for people we just followed.
      this.follows.reset();
      this.resolveFollows();
    });
  }

  /**
   * Route to a member's profile, keeping them inside Mawkingbird.
   *
   * A shipped collection's members are accounts on other instances, so their
   * ids mean nothing to the home server. An anonymous route ref carries the
   * origin alongside the id, which is what lets the profile page fetch them —
   * the same resolution the collection widget on Home already used. Members of
   * a real server-side collection are local and route by plain id.
   */
  protected memberLink(account: Account): (string | number)[] {
    if (!this.shipped() || !account.url) {
      return ['/accounts', account.id];
    }
    try {
      return [
        '/accounts',
        anonymousAccountRouteRef({
          server: new URL(account.url).origin,
          id: account.id,
          originalUrl: account.url,
        }),
      ];
    } catch {
      return ['/accounts', account.id];
    }
  }

  protected curator = computed<Account | null>(() => {
    const d = this.data();
    return d ? (d.accounts.find((a) => a.id === d.collection.account_id) ?? null) : null;
  });

  protected isOwner = computed(() => {
    const d = this.data();
    return !this.shipped() && !!d && d.collection.account_id === this.auth.account()?.id;
  });

  /** My own item in someone else's collection, if I'm featured in it. */
  protected myItem = computed<Member | null>(() => {
    if (this.shipped()) {
      return null;
    }
    const me = this.auth.account()?.id;
    return (this.members().find((m) => m.account.id === me) as Member | undefined) ?? null;
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.load(id);
      }
    });
  }

  load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    this.feedLoadedFor = '';
    const kit = shippedStarterKit(id);
    if (kit) {
      this.shipped.set(kit);
      this.data.set(shippedStarterKitCollection(kit));
      this.tab.set('members');
      this.loading.set(false);
      this.loadKitRows();
      return;
    }
    this.shipped.set(null);
    this.importer.reset();
    this.api.getCollection(id).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        this.resolveFollows();
        if (this.tab() === 'feed') {
          this.loadFeed();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          this.transloco.translate<string>(
            err?.status === 404
              ? 'pages.collection.errorNotFound'
              : 'pages.collection.errorLoadFailed',
          ),
        );
      },
    });
  }

  setTab(tab: 'feed' | 'members'): void {
    this.tab.set(tab);
    // Shipped collections use the explicit, bounded sample control on Posts;
    // loading every member here would defeat that control and recreate the
    // giant injected feed this split is meant to avoid.
    if (tab === 'feed' && !this.shipped()) {
      this.loadFeed();
    }
    if (tab === 'feed') {
      this.autoSample();
    }
  }

  /** Merge each member's recent statuses into one reverse-chronological feed. */
  loadFeed(): void {
    const d = this.data();
    if (!d || this.feedLoadedFor === d.collection.id) {
      return;
    }
    const ids = this.members()
      .filter((m) => m.state === 'accepted')
      .map((m) => m.account.id);
    this.feedLoadedFor = d.collection.id;
    if (!ids.length) {
      this.feed.set([]);
      return;
    }
    this.feedLoading.set(true);
    this.feedResolver.mergeMemberTimelines(ids).subscribe({
      next: (merged) => {
        this.feed.set(merged.statuses);
        this.feedLoading.set(false);
      },
      error: () => this.feedLoading.set(false),
    });
  }

  // ------------------------------------------------------------- preview

  /** Sample sizes offered on a preview. Each member costs one request. */
  protected readonly sampleSizes = [5, 10, 25] as const;

  /** How many members to sample posts from. Small by default: this costs N calls. */
  protected sampleSize = signal(5);

  /** True once a preview sample has been asked for, so the empty state can differ. */
  protected sampled = signal(false);

  protected setSampleSize(value: string): void {
    this.sampleSize.set(Number(value) || 5);
  }

  /**
   * Load a sample of posts from a shipped collection's members.
   *
   * A preview of a curated list is nearly useless without seeing what these
   * people actually post — but the members live on other instances, so there is
   * no single timeline to fetch and it costs one request per member. Hence the
   * explicit size and an explicit button: the reader decides how much this is
   * worth, rather than the page spending 24 requests on their behalf.
   *
   * Members are shuffled before sampling, so pressing it again on a large
   * collection surfaces different people rather than the same first five.
   */
  /**
   * How many members to sample without being asked.
   *
   * Three, not the control's default of five: this is spent on the reader's
   * behalf, so it buys the smallest thing that reads as a preview.
   */
  private static readonly AUTO_SAMPLE_SIZE = 3;

  /**
   * Show a few posts on arrival, rather than a control panel.
   *
   * The explicit button was the right instinct — each member costs a request,
   * so the size is the reader's choice — but it left a first-time visitor
   * looking at a size dropdown and a "Show me posts" button where they expected
   * a preview. The page's own reasoning says a list of names says little about
   * whether you want these people in your timeline; that is an argument for
   * loading a *small* sample by default, not for loading none.
   *
   * Three requests on a page someone deliberately opened is proportionate, and
   * the size control and "Sample again" still gate anything larger.
   *
   * Guarded so it fires once: `sampled` is set by `loadSample` itself, so a tab
   * switch back to Posts will not re-spend the requests, and it cannot run
   * before members exist because there would be nobody to sample.
   */
  private autoSample(): void {
    if (this.sampled() || this.feedLoading() || !this.shipped()) {
      return;
    }
    if (!this.members().some((m) => m.state === 'accepted')) {
      return;
    }
    this.sampleSize.set(CollectionPage.AUTO_SAMPLE_SIZE);
    this.loadSample();
  }

  protected loadSample(): void {
    const accepted = this.members().filter((m) => m.state === 'accepted');
    if (!accepted.length || this.feedLoading()) {
      return;
    }
    const shuffled = [...accepted];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picked = shuffled.slice(0, this.sampleSize()).map((m) => m.account);
    this.sampled.set(true);
    this.feedLoading.set(true);

    // Shipped members live on *their* instances, so their ids mean nothing to the
    // home server — asking it produces a 404 per member and an empty sample. Each
    // one is fetched from its own origin instead, the same public read the
    // profile page makes.
    forkJoin(
      picked.map((account) => {
        const ref = this.shipped() ? publicRefFor(account) : null;
        const request = ref
          ? this.anonymousApi.getAccountStatuses(ref, { excludeReplies: true, limit: 20 })
          : this.api.getAccountStatuses(account.id, { excludeReplies: true, limit: 20 });
        return request.pipe(catchError(() => of([] as Status[])));
      }),
    ).subscribe({
      next: (lists) => {
        this.feed.set(
          lists
            .flat()
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 60),
        );
        this.feedLoading.set(false);
      },
      error: () => this.feedLoading.set(false),
    });
  }

  onChanged(index: number, updated: Status): void {
    this.feed.update((list) => list.map((s, i) => (i === index ? updated : s)));
  }

  onDeleted(removed: Status): void {
    this.feed.update((list) => list.filter((s) => s.id !== removed.id));
  }

  search(): void {
    const q = this.query().trim();
    if (!q) {
      return;
    }
    this.searching.set(true);
    this.api.search(q, 'accounts', { resolve: true, limit: 5 }).subscribe({
      next: (r) => {
        this.results.set(r.accounts);
        this.searching.set(false);
      },
      error: () => this.searching.set(false),
    });
  }

  addMember(account: Account): void {
    const d = this.data();
    if (!d) {
      return;
    }
    this.api.addCollectionAccount(d.collection.id, account.id).subscribe(() => {
      this.results.update((r) => r.filter((a) => a.id !== account.id));
      this.query.set('');
      // Re-fetch: the server assigns the item id/state we need for later removal.
      this.reload();
    });
  }

  removeMember(member: Member): void {
    const d = this.data();
    this.memberToRemove.set(null);
    if (!d) {
      return;
    }
    this.api.removeCollectionItem(d.collection.id, member.itemId).subscribe(() => this.reload());
  }

  /** Remove myself from someone else's collection. */
  revokeSelf(): void {
    const d = this.data();
    const mine = this.myItem();
    if (!d || !mine) {
      return;
    }
    this.api.revokeCollectionItem(d.collection.id, mine.itemId).subscribe(() => this.reload());
  }

  remove(): void {
    const d = this.data();
    this.showDeleteConfirm.set(false);
    if (!d) {
      return;
    }
    this.api.deleteCollection(d.collection.id).subscribe(() => this.router.navigate(['/feeds']));
  }

  /** Re-fetch the collection after a bulk add (the server assigns item ids). */
  onBulkAdded(): void {
    this.showBulk.set(false);
    this.reload();
  }

  convertToList(): void {
    const d = this.data();
    if (!d || this.converting()) {
      return;
    }
    this.converting.set(true);
    this.conversionMessage.set('');
    this.converter.convertCollectionToList(d).subscribe({
      next: (result) => {
        this.converting.set(false);
        const parts = [
          this.transloco.translate<string>('pages.collection.convertPartAdded', {
            count: result.added,
          }),
        ];
        if (result.existing) {
          parts.push(
            this.transloco.translate<string>('pages.collection.convertPartExisting', {
              count: result.existing,
            }),
          );
        }
        if (result.failed) {
          parts.push(
            this.transloco.translate<string>('pages.collection.convertPartFailed', {
              count: result.failed,
            }),
          );
        }
        // The common failure, and the one that made this look broken: most
        // servers only keep accounts you follow in a list, so a collection of
        // strangers converts to an empty one. Name the cause and the fix — the
        // button that does it is directly above this message.
        const hint = result.needsFollow
          ? ' ' + this.transloco.translate<string>('pages.collection.convertNeedsFollowHint')
          : '';
        this.conversionMessage.set(
          this.transloco.translate<string>('pages.collection.convertedSummary', {
            parts: parts.join(', '),
            hint,
          }),
        );
      },
      error: () => {
        this.converting.set(false);
        this.conversionMessage.set(
          this.transloco.translate<string>('pages.collection.convertFailed'),
        );
      },
    });
  }

  private reload(): void {
    const d = this.data();
    if (d) {
      this.load(d.collection.id);
    }
  }
}
