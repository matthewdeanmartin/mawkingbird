import {
  Component,
  HostListener,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Account } from '../../../models';
import { Auth } from '../../../auth';
import { AnonymousAccount } from '../../../providers/anonymous/anonymous-account';
import { AnonymousPublicApi } from '../../../providers/anonymous/anonymous-public-api';
import {
  ANONYMOUS_FOLLOW_LIMIT,
  AnonymousFollows,
} from '../../../providers/anonymous/anonymous-follows';
import { AnonymousPublicRef } from '../../../providers/anonymous/anonymous-route-ref';
import {
  CLONE_MAX_PAGES,
  CLONE_PAGE_SIZE,
  CLONE_TARGET,
  CloneSelection,
  followsAreHidden,
  homeServerFor,
  selectCloneCandidates,
} from '../clone-friends';
import { DEFAULT_THRESHOLDS, thresholdSignals } from '../../../follow-quality';
import { CollectionPlan, planCollectionCopy, selectCollections } from '../copy-collections';
import { AnonymousLists } from '../../../providers/anonymous/anonymous-lists';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

type Phase = 'loading' | 'confirm' | 'following' | 'done' | 'error' | 'hidden';

/**
 * "Copy account" — adopt who this profile follows, and their collections.
 *
 * The dialog owns the whole flow (page, filter, confirm, follow, report) so the
 * profile page only has to open it. That is worth the size: the interesting rules
 * live in `clone-friends.ts`, `copy-collections.ts` and `follow-quality.ts`, all
 * pure and all tested without any of this.
 *
 * Three things are deliberate and should survive refactoring:
 *
 *  - **Every follow here is a local write.** `AnonymousFollows.follow` puts a row in
 *    localStorage; nothing is sent to anyone's server. That is the only reason
 *    following twenty accounts at once is a safe thing to offer, and it is why the
 *    profile page hides this entry entirely when signed in.
 *  - **The filtering is shown, not hidden.** "Followed 6 of 63" invites "why only
 *    6?", so the answer is on screen before the user commits — per collection too.
 *  - **The follows never wait on the collections.** Collections are the bonus half,
 *    absent for most accounts and unimplemented before Mastodon 4.6, so they load
 *    after the confirm screen is already up rather than in front of it.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n pages.profile.copyAccount.closeAriaLabel: Close
// i18n pages.profile.copyAccount.title: Copy {{handle}}
// i18n pages.profile.copyAccount.readingFrom: Reading who {{handle}} follows, and their collections, from {{host}}…
// i18n pages.profile.copyAccount.reading: Reading who {{handle}} follows, and their collections…
// i18n pages.profile.copyAccount.pageOfMax: page {{page}} of up to {{max}}
// i18n pages.profile.copyAccount.loadingNote: Accounts that stopped posting are skipped — following one costs an API call every time your feed refreshes.
// i18n pages.profile.copyAccount.close: Close
// i18n pages.profile.copyAccount.doesntShareFollows: {{handle}} doesn't share who they follow.
// i18n pages.profile.copyAccount.hiddenExplain: Their profile lists {{count}} follows, but {{host}} returns none of them — Mastodon lets an account keep its follow list private. There is nothing to clone here.
// i18n pages.profile.copyAccount.theirServer: their server
// i18n pages.profile.copyAccount.partialList: Couldn't reach {{handle}}'s own server, so this list comes from {{host}} and shows only the follows that server knows about. The real list is probably longer.
// i18n pages.profile.copyAccount.readFrom: Read from {{host}}, where the full list lives.
// i18n pages.profile.copyAccount.whatToCopy: What to copy
// i18n pages.profile.copyAccount.adoptUpTo: Adopt up to
// i18n pages.profile.copyAccount.accountsUnit: accounts
// i18n pages.profile.copyAccount.skipIfSilentOver: Skip if silent over
// i18n pages.profile.copyAccount.daysUnit: days (0 = don't skip)
// i18n pages.profile.copyAccount.skipIfFewerThan: Skip if fewer than
// i18n pages.profile.copyAccount.postsUnit: posts (0 = don't skip)
// i18n pages.profile.copyAccount.noQualityFiltering: No quality filtering — everyone they follow is a candidate, oldest accounts included.
// i18n pages.profile.copyAccount.readingAnotherPage: Reading another page…
// i18n pages.profile.copyAccount.readSoFar.one: Read {{count}} page so far. There are more to read if this isn't enough people.
// i18n pages.profile.copyAccount.readSoFar.other: Read {{count}} pages so far. There are more to read if this isn't enough people.
// i18n pages.profile.copyAccount.readAnotherPage: Read another page
// i18n pages.profile.copyAccount.limitedBySlots: You have {{remaining}} of {{limit}} follow slots left, so only {{willAdd}} will be added.
// i18n pages.profile.copyAccount.skipped.one: {{count}} skipped
// i18n pages.profile.copyAccount.skipped.other: {{count}} skipped
// i18n pages.profile.copyAccount.checkingCollections: Checking for collections to copy as local lists…
// i18n pages.profile.copyAccount.andCollections.one: …and {{count}} collection as local lists
// i18n pages.profile.copyAccount.andCollections.other: …and {{count}} collections as local lists
// i18n pages.profile.copyAccount.listMembersFollowed: List members are followed too — that is how a local list builds its timeline — so they use the same follow slots.
// i18n pages.profile.copyAccount.copyFollowsAndLists: Copy {{follows}} follows &amp; {{lists}} lists
// i18n pages.profile.copyAccount.copyLists.one: Copy {{count}} list
// i18n pages.profile.copyAccount.copyLists.other: Copy {{count}} lists
// i18n pages.profile.copyAccount.followCount: Follow {{count}}
// i18n pages.profile.copyAccount.cancel: Cancel
// i18n pages.profile.copyAccount.followingProgress: Following… {{progress}} of {{total}}
// i18n pages.profile.copyAccount.doneWithLists.oneOne: Followed {{accounts}} account, and made {{lists}} local list.
// i18n pages.profile.copyAccount.doneWithLists.oneOther: Followed {{accounts}} account, and made {{lists}} local lists.
// i18n pages.profile.copyAccount.doneWithLists.otherOne: Followed {{accounts}} accounts, and made {{lists}} local list.
// i18n pages.profile.copyAccount.doneWithLists.otherOther: Followed {{accounts}} accounts, and made {{lists}} local lists.
// i18n pages.profile.copyAccount.followedAccounts.one: Followed {{count}} account.
// i18n pages.profile.copyAccount.followedAccounts.other: Followed {{count}} accounts.
// i18n pages.profile.copyAccount.homeWillRebuild: Your home feed will rebuild the next time you open it.
// i18n pages.profile.copyAccount.goToHome: Go to Home
// i18n pages.profile.copyAccount.summary.noSlots: You have no follow slots left, so nothing can be added.
// i18n pages.profile.copyAccount.summary.noneActive: None of the accounts {{handle}} follows look active enough to be worth a slot.
// i18n pages.profile.copyAccount.summary.alreadyFollowing: You already follow everyone {{handle}} does.
// i18n pages.profile.copyAccount.summary.noneNew: Nothing new to follow from {{handle}}'s list.
// i18n pages.profile.copyAccount.summary.follow: Follow {{count}} account {{handle}} follows?
// i18n pages.profile.copyAccount.summary.followPlural: Follow {{count}} accounts {{handle}} follows?
// i18n pages.profile.copyAccount.summary.withSkipped.one: Follow {{count}} account {{handle}} follows — {{skipped}} skipped as dormant or too quiet.
// i18n pages.profile.copyAccount.summary.withSkipped.other: Follow {{count}} accounts {{handle}} follows — {{skipped}} skipped as dormant or too quiet.
// i18n pages.profile.copyAccount.summary.withAlready.one: Follow {{count}} account {{handle}} follows — {{already}} already followed.
// i18n pages.profile.copyAccount.summary.withAlready.other: Follow {{count}} accounts {{handle}} follows — {{already}} already followed.
// i18n pages.profile.copyAccount.summary.withBoth.one: Follow {{count}} account {{handle}} follows — {{skipped}} skipped as dormant or too quiet, {{already}} already followed.
// i18n pages.profile.copyAccount.summary.withBoth.other: Follow {{count}} accounts {{handle}} follows — {{skipped}} skipped as dormant or too quiet, {{already}} already followed.
// i18n pages.profile.copyAccount.collectionSummary.complete: {{adopted}} of {{total}}
// i18n pages.profile.copyAccount.collectionSummary.withSkipped: {{adopted}} of {{total}} · {{skipped}} too quiet
// i18n pages.profile.copyAccount.reason.neverPosted: has never posted
// i18n pages.profile.copyAccount.reason.noDate: has no readable last-post date
// i18n pages.profile.copyAccount.reason.dormant: hasn't posted in {{age}}
// i18n pages.profile.copyAccount.reason.posts.one: has only {{count}} post
// i18n pages.profile.copyAccount.reason.posts.other: has only {{count}} posts
// i18n pages.profile.copyAccount.errors.load: Couldn't load the accounts {{handle}} follows.
// i18n pages.profile.copyAccount.errors.noSource: No readable source for this account.
@Component({
  selector: 'app-copy-account-dialog',
  imports: [RouterLink, FormsModule, TranslocoPipe],
  templateUrl: './copy-account-dialog.html',
  styleUrl: './copy-account-dialog.css',
})
export class CopyAccountDialog implements OnInit {
  private transloco = inject(TranslocoService);
  private auth = inject(Auth);
  private anonymous = inject(AnonymousAccount);
  private anonymousPublic = inject(AnonymousPublicApi);
  private follows = inject(AnonymousFollows);
  private lists = inject(AnonymousLists);

  /** The profile whose follows are being cloned. */
  readonly account = input.required<Account>();
  /** Set when the profile was reached as a public (cross-instance) reference. */
  readonly publicRef = input<AnonymousPublicRef | null>(null);

  readonly closed = output<void>();
  /** Emitted after a successful clone, so the profile can refresh its own state. */
  readonly cloned = output<number>();

  protected phase = signal<Phase>('loading');
  protected error = signal<string | null>(null);
  protected selection = signal<CloneSelection | null>(null);
  /** The server the list was read from — named, because which one it was matters. */
  protected sourceHost = signal('');
  /** True when we fell back to a relay's partial view of the follow graph. */
  protected partial = signal(false);
  /** The resolved read source; candidate ids belong to this server's namespace. */
  private source = signal<AnonymousPublicRef | null>(null);
  /** Pages fetched, shown while loading so a three-page walk doesn't look stuck. */
  protected pages = signal(0);
  /** How many have been followed so far, during the `following` phase. */
  protected progress = signal(0);
  protected showSkipped = signal(false);

  /**
   * The collections half: what each of their published collections becomes locally.
   *
   * Empty is the normal case — most accounts have none, and a server older than
   * Mastodon 4.6 has no collections endpoint at all. Neither is an error, so a
   * failure here never fails the dialog; the follows half is the feature.
   */
  protected collectionPlans = signal<CollectionPlan[]>([]);
  /**
   * Collections are still being read while the follows are already on screen.
   *
   * Only used to hold the confirm button for the moment it takes: a user who clicks
   * "Copy" the instant the dialog paints must not get the follows *without* the
   * lists, silently, because their timing was good.
   */
  protected loadingCollections = signal(false);
  /** Lists actually created, reported after the copy. */
  protected listsCreated = signal(0);
  protected describeCollection = (plan: CollectionPlan): string => {
    const total = plan.adopt.length + plan.skipped.length;
    return plan.skipped.length
      ? this.transloco.translate<string>(
          'pages.profile.copyAccount.collectionSummary.withSkipped',
          {
            adopted: plan.adopt.length,
            total,
            skipped: plan.skipped.length,
          },
        )
      : this.transloco.translate<string>('pages.profile.copyAccount.collectionSummary.complete', {
          adopted: plan.adopt.length,
          total,
        });
  };

  /** Members to be added across every planned list, for the confirm button's count. */
  protected collectionMemberCount = computed(() =>
    this.collectionPlans().reduce((total, plan) => total + plan.adopt.length, 0),
  );

  protected readonly maxPages = CLONE_MAX_PAGES;
  protected readonly followLimit = ANONYMOUS_FOLLOW_LIMIT;

  // --- tunable parameters ---------------------------------------------------
  //
  // The gate used to be four constants with no way to argue with them, and on
  // some follow lists it skipped most of the list — "18 of 240" reads as broken
  // even when every rejection was defensible. These are the same defaults,
  // exposed.

  /** How many accounts to adopt. */
  protected target = signal<number>(CLONE_TARGET);
  /** Silent longer than this many days is skipped. 0 turns the check off. */
  protected dormantAfterDays = signal<number>(DEFAULT_THRESHOLDS.dormantAfterDays);
  /** Fewer posts than this is skipped. 0 turns the check off. */
  protected minPosts = signal<number>(DEFAULT_THRESHOLDS.minPosts);
  /** How many pages of the follow list to read. */
  protected pageBudget = signal<number>(CLONE_MAX_PAGES);

  /** Everything fetched so far, kept so re-filtering costs no requests. */
  private candidates = signal<Account[]>([]);

  /** True while a read is in flight — see {@link settingsLocked}. */
  protected reading = signal(false);

  /**
   * Whether the controls are disabled.
   *
   * Parameters must not change under a fetch that is already running: the pages
   * arriving were requested under the old settings, and re-deciding halfway
   * through produces a selection that matches neither. So the controls lock for
   * the duration of a read and the recompute happens against a settled corpus.
   */
  protected settingsLocked = computed(
    () => this.reading() || this.phase() === 'following' || this.phase() === 'done',
  );

  /** The quality bar as the pure selector wants it. */
  private signals = computed(() =>
    thresholdSignals({
      dormantAfterDays: this.dormantAfterDays(),
      minPosts: this.minPosts(),
    }),
  );

  /** True when both quality checks are off, so nothing is skipped for quality. */
  protected gateOff = computed(() => this.dormantAfterDays() === 0 && this.minPosts() === 0);

  /**
   * Re-run the selection over the pages already held.
   *
   * Free — no requests — which is what makes the controls safe to fiddle with.
   * Refuses while a read is in flight, per {@link settingsLocked}.
   */
  protected recompute(): void {
    if (this.reading()) {
      return;
    }
    const ref = this.source();
    if (!ref) {
      return;
    }
    this.selection.set(
      selectCloneCandidates({
        candidates: this.candidates(),
        pagesFetched: this.pages(),
        // Already-read pages: this only decides whether *more* would help, and
        // `readAnotherPage` is the button that acts on it.
        lastPageFull: this.lastPageFull,
        isFollowing: (account) => this.follows.isFollowing(account, ref.server),
        remainingSlots: this.remainingSlots(),
        viewerId: this.auth.account()?.id,
        target: this.target(),
        signals: this.signals(),
        maxPages: this.pageBudget(),
      }),
    );
  }

  /** Whether reading further pages could still add anyone. */
  protected canReadMore = computed(
    () =>
      !this.settingsLocked() &&
      this.lastPageFull &&
      this.pages() < this.pageBudget() &&
      this.phase() === 'confirm',
  );

  /** Whether the last page came back full, i.e. there is probably more. */
  private lastPageFull = false;

  /**
   * Fetch one more page on demand.
   *
   * Explicit rather than automatic: loosening a threshold should not silently
   * spend requests, and the user asked for parameters they control, not
   * parameters that spend on their behalf.
   */
  protected async readAnotherPage(): Promise<void> {
    const ref = this.source();
    if (!ref || this.reading() || !this.canReadMore()) {
      return;
    }
    this.reading.set(true);
    try {
      const batch = await this.fetchPage(ref, this.candidates().at(-1)?.id);
      this.candidates.update((all) => [...all, ...batch]);
      this.lastPageFull = batch.length >= CLONE_PAGE_SIZE;
      this.pages.update((n) => n + 1);
    } catch {
      // A failed extra page is not a failed dialog — keep what we have.
      this.lastPageFull = false;
    } finally {
      this.reading.set(false);
    }
    this.recompute();
  }

  protected handle = computed(() => `@${this.account().acct || this.account().username}`);

  protected remainingSlots = computed(() =>
    Math.max(0, ANONYMOUS_FOLLOW_LIMIT - this.follows.count()),
  );

  protected summary = computed(() => {
    const selection = this.selection();
    if (!selection) {
      return '';
    }
    const handle = this.handle();
    if (!selection.adopt.length) {
      if (selection.limitedBySlots) {
        return this.transloco.translate<string>('pages.profile.copyAccount.summary.noSlots');
      }
      if (selection.skipped.length && !selection.alreadyFollowing) {
        return this.transloco.translate<string>('pages.profile.copyAccount.summary.noneActive', {
          handle,
        });
      }
      if (selection.alreadyFollowing && !selection.skipped.length) {
        return this.transloco.translate<string>(
          'pages.profile.copyAccount.summary.alreadyFollowing',
          { handle },
        );
      }
      return this.transloco.translate<string>('pages.profile.copyAccount.summary.noneNew', {
        handle,
      });
    }
    const count = selection.adopt.length;
    const hasSkipped = selection.skipped.length > 0;
    const hasAlready = selection.alreadyFollowing > 0;
    if (hasSkipped && hasAlready) {
      return this.transloco.translate<string>(
        `pages.profile.copyAccount.summary.withBoth.${count === 1 ? 'one' : 'other'}`,
        {
          count,
          handle,
          skipped: selection.skipped.length,
          already: selection.alreadyFollowing,
        },
      );
    }
    if (hasSkipped) {
      return this.transloco.translate<string>(
        `pages.profile.copyAccount.summary.withSkipped.${count === 1 ? 'one' : 'other'}`,
        { count, handle, skipped: selection.skipped.length },
      );
    }
    if (hasAlready) {
      return this.transloco.translate<string>(
        `pages.profile.copyAccount.summary.withAlready.${count === 1 ? 'one' : 'other'}`,
        { count, handle, already: selection.alreadyFollowing },
      );
    }
    return this.transloco.translate<string>(
      count === 1
        ? 'pages.profile.copyAccount.summary.follow'
        : 'pages.profile.copyAccount.summary.followPlural',
      { count, handle },
    );
  });

  protected reasonText(reason: string): string {
    if (reason === 'has never posted') {
      return this.transloco.translate<string>('pages.profile.copyAccount.reason.neverPosted');
    }
    if (reason === 'has no readable last-post date') {
      return this.transloco.translate<string>('pages.profile.copyAccount.reason.noDate');
    }
    const dormant = /^hasn't posted in (.+)$/.exec(reason);
    if (dormant) {
      return this.transloco.translate<string>('pages.profile.copyAccount.reason.dormant', {
        age: dormant[1],
      });
    }
    const posts = /^has only (\d+) posts?$/.exec(reason);
    if (posts) {
      return this.transloco.translate<string>(
        Number(posts[1]) === 1
          ? 'pages.profile.copyAccount.reason.posts.one'
          : 'pages.profile.copyAccount.reason.posts.other',
        { count: Number(posts[1]) },
      );
    }
    return reason;
  }

  /**
   * Load on init, not in the constructor: a required `input()` is not populated
   * until after construction, so reading `account()` there throws NG0950.
   */
  ngOnInit(): void {
    void this.load();
  }

  /**
   * Walk `/following` until there are enough survivors, or the pages run out.
   *
   * Paging is driven by `selectCloneCandidates`: it sees everything fetched so far
   * and says whether another request is worth making. The quality gate is why this
   * is a loop at all — one page of eighty follows often yields fewer than twenty
   * accounts worth a feed call.
   */
  private async load(): Promise<void> {
    const target = this.account();
    const candidates: Account[] = [];
    this.reading.set(true);
    try {
      const source = await this.resolveSource(target);
      this.source.set(source.ref);
      this.sourceHost.set(source.host);
      this.partial.set(source.partial);

      for (let page = 0; page < this.pageBudget(); page += 1) {
        const batch = await this.fetchPage(source.ref, candidates.at(-1)?.id);
        candidates.push(...batch);
        this.pages.set(page + 1);
        this.lastPageFull = batch.length >= CLONE_PAGE_SIZE;
        // Kept so the controls can re-filter without re-fetching.
        this.candidates.set([...candidates]);

        const selection = selectCloneCandidates({
          candidates,
          pagesFetched: page + 1,
          lastPageFull: this.lastPageFull,
          isFollowing: (account) => this.follows.isFollowing(account, source.ref.server),
          remainingSlots: this.remainingSlots(),
          viewerId: this.auth.account()?.id,
          target: this.target(),
          signals: this.signals(),
          maxPages: this.pageBudget(),
        });
        this.selection.set(selection);
        if (!selection.wantsAnotherPage) {
          break;
        }
      }

      // An account that advertises follows but hands back an empty list is refusing,
      // not empty. Saying "nothing new to follow" there is simply false.
      if (followsAreHidden(target, candidates.length, this.pages())) {
        this.phase.set('hidden');
        return;
      }

      // Show the follows as soon as they are ready. Collections are a bonus half
      // that most accounts do not have, and blocking the thing the user actually
      // clicked for behind an extra round trip (or a slow one, or a 404 from a
      // pre-4.6 server) would be paying for the rare case in every case.
      this.phase.set('confirm');
      void this.loadCollections(source.ref);
    } catch {
      this.error.set(
        this.transloco.translate<string>('pages.profile.copyAccount.errors.load', {
          handle: this.handle(),
        }),
      );
      this.phase.set('error');
    } finally {
      // Unlocks the parameter controls; never leave them disabled after a
      // failure, or the dialog is stuck with no way to retune and retry.
      this.reading.set(false);
    }
  }

  /**
   * Plan the collections half: read their published collections, then the members
   * of the biggest few.
   *
   * **Never fails the dialog.** Most accounts have no collections, and any server
   * older than Mastodon 4.6 does not implement the endpoint at all — both come back
   * as errors or empty arrays and both mean "there is nothing to copy here", which
   * is not a reason to deny the user the follows they came for. One request for the
   * list, then one per collection under {@link selectCollections}' budget.
   */
  private async loadCollections(ref: AnonymousPublicRef): Promise<void> {
    this.loadingCollections.set(true);
    try {
      await this.planCollections(ref);
    } finally {
      this.loadingCollections.set(false);
    }
  }

  private async planCollections(ref: AnonymousPublicRef): Promise<void> {
    let collections;
    try {
      collections = selectCollections(
        await firstValueFrom(this.anonymousPublic.getAccountCollections(ref)),
      );
    } catch {
      return;
    }

    const plans: CollectionPlan[] = [];
    // Titles accumulate across the run: two collections named the same thing must
    // still become two distinct lists.
    const taken = this.lists.lists().map((list) => list.title);
    for (const collection of collections) {
      try {
        const members = await firstValueFrom(
          this.anonymousPublic.getCollectionAccounts({ server: ref.server, id: collection.id }),
        );
        const plan = planCollectionCopy({
          collection,
          members,
          isFollowing: (account) => this.follows.isFollowing(account, ref.server),
          takenTitles: [...taken, ...plans.map((p) => p.title)],
          viewerId: this.auth.account()?.id,
        });
        // A collection whose members were all filtered out would become an empty
        // list. Report it in the summary rather than creating one.
        if (plan.adopt.length) {
          plans.push(plan);
        }
      } catch {
        // One unreadable collection should not cost the others.
        continue;
      }
    }
    this.collectionPlans.set(plans);
  }

  /**
   * Find the server that holds the authoritative follow list, and resolve the
   * account's id *there*.
   *
   * Two calls in the cross-instance case (lookup, then the list), and worth every
   * bit of the second one: read through a relay and you get only the slice of the
   * graph that relay federated, which made the whole feature look broken.
   *
   * If the home server can't be reached — blocked, down, CORS — we fall back to the
   * partial view rather than failing outright, and set {@link partial} so the dialog
   * says the list is incomplete instead of implying it is the truth.
   */
  private async resolveSource(
    target: Account,
  ): Promise<{ ref: AnonymousPublicRef; host: string; partial: boolean }> {
    const current = this.publicRef();
    const currentServer = current?.server ?? this.anonymous.server();
    const home = homeServerFor(target, currentServer);
    const bare = (value: string) => value.replace(/^https?:\/\//, '').toLowerCase();

    // Already reading the account's own server: nothing to resolve.
    if (bare(home) === bare(currentServer) && current) {
      return { ref: current, host: bare(home), partial: false };
    }

    try {
      const canonical = await firstValueFrom(
        this.anonymousPublic.lookupAccount(home, target.username),
      );
      return {
        ref: { server: home, id: canonical.id },
        host: bare(home),
        partial: false,
      };
    } catch {
      if (!current) {
        throw new Error(
          this.transloco.translate<string>('pages.profile.copyAccount.errors.noSource'),
        );
      }
      return { ref: current, host: bare(currentServer), partial: true };
    }
  }

  private fetchPage(ref: AnonymousPublicRef, maxId?: string): Promise<Account[]> {
    return firstValueFrom(this.anonymousPublic.getAccountFollowing(ref, maxId));
  }

  /**
   * Adopt them. No network: each follow is a localStorage write, which is what
   * makes doing twenty of them at once reasonable.
   */
  async confirm(): Promise<void> {
    const selection = this.selection();
    const hasWork = !!selection?.adopt.length || !!this.collectionPlans().length;
    // `loadingCollections` is also enforced here, not just via [disabled]: copying
    // half the feature because the click landed a moment early is the kind of thing
    // that looks like data loss to the user.
    if (!hasWork || this.loadingCollections() || this.phase() === 'following') {
      return;
    }
    this.phase.set('following');
    this.progress.set(0);
    // The server these ids came from, not the browsing server: AnonymousFollows
    // stores it as the read-ref it will later fetch each feed through, and an id
    // from one instance does not resolve on another.
    const server = this.source()?.server ?? this.anonymous.server();
    let followed = 0;
    for (const account of selection?.adopt ?? []) {
      const result = this.follows.follow(account, server);
      if (!result.ok) {
        // Hitting the cap mid-batch is not an error worth throwing away the rest
        // of the work for — report what landed.
        this.error.set(result.error);
        break;
      }
      followed += 1;
      this.progress.set(followed);
    }

    this.copyCollections(server);
    this.phase.set('done');
    this.cloned.emit(followed);
  }

  /**
   * Turn the planned collections into browser-local lists.
   *
   * **A list member has to be a follow.** `AnonymousLists` stores follow keys, and
   * the key is minted by `AnonymousFollows.follow` — which is also the thing that
   * enforces `ANONYMOUS_FOLLOW_LIMIT`. So copying a collection spends follow slots
   * exactly like copying the friends list does, and a list is not a cheaper way to
   * keep accounts around. That is the same recurring per-member feed cost the
   * quality gate exists for; see `copy-collections.ts`.
   *
   * Running out of slots mid-copy leaves a shorter list rather than no list. A
   * partial list is still useful and the counts in the report say what happened.
   */
  private copyCollections(server: string): void {
    let created = 0;
    for (const plan of this.collectionPlans()) {
      const members: string[] = [];
      for (const account of plan.adopt) {
        const result = this.follows.follow(account, server);
        if (!result.ok) {
          this.error.set(result.error);
          break;
        }
        const key = this.follows.find(account, server)?.key;
        if (key) {
          members.push(key);
        }
      }
      // Don't leave an empty list behind when the cap bit before the first member.
      if (!members.length) {
        continue;
      }
      const list = this.lists.create(plan.title);
      for (const key of members) {
        this.lists.setMember(list.id, key, true);
      }
      created += 1;
    }
    this.listsCreated.set(created);
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
