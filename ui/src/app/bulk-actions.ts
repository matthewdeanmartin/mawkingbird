import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { Account, Relationship } from './models';
import { RateLimitCoordinator } from './rate-limit.interceptor';

/**
 * Bulk relationship operations: turn boosts on or off for everyone you follow,
 * "amnesty" — unmute or unblock everyone at once — and following or unfollowing
 * every member of one of your lists.
 *
 * ## Why this is a service and not a component
 *
 * These jobs are minutes long. Mastodon has no bulk endpoint for any of them, so
 * a 300-friend change is 300 POSTs, spaced out and occasionally paused by the
 * server's rate limiter. Owning the job here (root-injected, like
 * {@link ImportFollows}) means navigating away from Settings doesn't abandon it
 * halfway — which for an amnesty would leave the user with a half-unblocked
 * list and no idea where it stopped. Only one job runs at a time.
 *
 * Nothing is persisted: a reload ends the job. That is a deliberate limit rather
 * than an oversight — resuming would mean trusting a stored queue that the
 * server may have moved on from.
 *
 * ## Doing as little as possible
 *
 * The expensive part of a bulk write is the writes, so the planning pass exists
 * to avoid them. For the boost actions we page the follow list, ask
 * `/accounts/relationships` in batches of {@link RELATIONSHIP_BATCH}, and keep
 * only the accounts whose `showing_reblogs` is actually wrong. Turning boosts
 * off when they are already off for 280 of 300 friends should cost 20 writes,
 * not 300 — and the confirmation dialog can then state the real number.
 *
 * ## Rate limits
 *
 * Writes are spaced by {@link BulkActions.delayMs}. A 429 is not a failure here:
 * the runner reads the cooldown from the response (`Retry-After` /
 * `X-RateLimit-Reset`, via the same coordinator the interceptor uses), reports
 * itself as paused with a countdown, waits, and retries the same account. The
 * progress UI shows that state explicitly, because a job that has gone quiet for
 * four minutes otherwise looks broken.
 */

/** The operations offered. */
export type BulkActionId =
  | 'reblogs-off'
  | 'reblogs-on'
  | 'mute-amnesty'
  | 'block-amnesty'
  | 'list-follow'
  | 'list-unfollow';

/**
 * The list a list-scoped action applies to.
 *
 * Everything else here operates on a set the account already implies — your
 * follows, your mutes, your blocks. The list actions need to be told *which*
 * list, and the title travels with the id so the dialog and the progress panel
 * can name it rather than saying "this list" to someone who started the job on
 * a different page ten minutes ago.
 */
export interface BulkTarget {
  listId: string;
  listTitle: string;
  /**
   * Where the members come from.
   *
   * A collection is the same job with a different read: a curated set of
   * accounts, followed or unfollowed in bulk. Only {@link fetchListMembers}
   * cares which, so this rides along rather than doubling the action list.
   * Defaults to `list` so every existing caller is unchanged.
   */
  kind?: 'list' | 'collection';
}

/** True for the actions that require a {@link BulkTarget}. */
export function needsList(action: BulkActionId): boolean {
  return action === 'list-follow' || action === 'list-unfollow';
}

/** Static description of one operation, shared by the tab and the dialog. */
export interface BulkActionSpec {
  id: BulkActionId;
  /**
   * Translation keys, not English.
   *
   * The strings a reader sees live in the `// i18n` declarations above
   * {@link BULK_ACTIONS}, which `scripts/extract-i18n.mjs` reads into
   * `public/i18n/en.json`. Holding English here would put every word of the
   * confirm dialog — the screen that says what is about to happen to hundreds of
   * accounts — outside the translation pipeline.
   */
  /** Menu/button label, e.g. "Turn off retweets for all friends". */
  labelKey: string;
  /** One line under the label on the action card. */
  blurbKey: string;
  /** Dialog title. */
  titleKey: string;
  /** Bullet points spelling out exactly what will happen. */
  effectKeys: string[];
  confirmLabelKey: string;
  /** Destructive: red confirm button, and a backup offer. */
  danger: boolean;
  /** Which CSV export backs this list up, when one applies. */
  backup?: 'mutes' | 'blocks';
  /** Translation key for the plural noun in counts ("friends", "muted accounts"). */
  unitKey: string;
}

/** English for every bulk action string; see scripts/extract-i18n.mjs. */
// i18n bulk.reblogsOff.label: Turn off retweets for all friends
// i18n bulk.reblogsOff.blurb: Keep following everyone, but stop their boosts from reaching your home timeline.
// i18n bulk.reblogsOff.title: Turn off retweets for everyone you follow?
// i18n bulk.reblogsOff.effect1: You keep following everyone — nobody is unfollowed.
// i18n bulk.reblogsOff.effect2: Their own posts still appear in your home timeline.
// i18n bulk.reblogsOff.effect3: Boosts they make stop appearing there.
// i18n bulk.reblogsOff.effect4: You can turn retweets back on for everyone, or per account on their profile.
// i18n bulk.reblogsOff.confirmLabel: Turn off retweets
// i18n bulk.reblogsOn.label: Turn on retweets for all friends
// i18n bulk.reblogsOn.blurb: Let boosts from everyone you follow back into your home timeline.
// i18n bulk.reblogsOn.title: Turn on retweets for everyone you follow?
// i18n bulk.reblogsOn.effect1: Boosts from everyone you follow start appearing in your home timeline again.
// i18n bulk.reblogsOn.effect2: This includes accounts you had individually silenced boosts for.
// i18n bulk.reblogsOn.effect3: Nothing else about who you follow changes.
// i18n bulk.reblogsOn.confirmLabel: Turn on retweets
// i18n bulk.muteAmnesty.label: Mute amnesty — unmute everyone
// i18n bulk.muteAmnesty.blurb: Clear your mute list completely and start over.
// i18n bulk.muteAmnesty.title: Unmute every account you have muted?
// i18n bulk.muteAmnesty.effect1: Every account on your mute list is unmuted.
// i18n bulk.muteAmnesty.effect2: Their posts and notifications start reaching you again.
// i18n bulk.muteAmnesty.effect3: Muted words and filters are not affected — this is only accounts.
// i18n bulk.muteAmnesty.effect4: This can only be undone if you backed up your mute list first.
// i18n bulk.muteAmnesty.confirmLabel: Unmute everyone
// i18n bulk.blockAmnesty.label: Block amnesty — unblock everyone
// i18n bulk.blockAmnesty.blurb: Clear your block list completely and start over.
// i18n bulk.blockAmnesty.title: Unblock every account you have blocked?
// i18n bulk.blockAmnesty.effect1: Every account on your block list is unblocked.
// i18n bulk.blockAmnesty.effect2: They can follow you, see your posts and interact with you again.
// i18n bulk.blockAmnesty.effect3: They are not notified that you blocked them, or that you stopped.
// i18n bulk.blockAmnesty.effect4: This can only be undone if you backed up your block list first.
// i18n bulk.blockAmnesty.confirmLabel: Unblock everyone
// i18n bulk.listFollow.label: Follow everyone on a list
// i18n bulk.listFollow.blurb: Follow every account in one of your lists that you are not following yet.
// i18n bulk.listFollow.title: Follow everyone on this {{source}}?
// i18n bulk.listFollow.effect1: Every member of the list you are not already following gets followed.
// i18n bulk.listFollow.effect2: Accounts that require approval get a follow request instead, which they can decline.
// i18n bulk.listFollow.effect3: Their posts start appearing in your home timeline as well as the list.
// i18n bulk.listFollow.effect4: Accounts you already follow are left exactly as they are.
// i18n bulk.listFollow.confirmLabel: Follow everyone
// i18n bulk.listUnfollow.label: Unfollow everyone on a list
// i18n bulk.listUnfollow.blurb: Stop following every account in one of your lists.
// i18n bulk.listUnfollow.title: Unfollow everyone on this {{source}}?
// i18n bulk.listUnfollow.effect1: Every member of the list you currently follow gets unfollowed.
// i18n bulk.listUnfollow.effect2: Any pending follow requests to members are withdrawn.
// i18n bulk.listUnfollow.effect3: Most servers only keep accounts you follow in a list, so the list may end up empty. The list itself is never deleted.
// i18n bulk.listUnfollow.effect4: Nobody is blocked or muted, and nobody is told.
// i18n bulk.listUnfollow.confirmLabel: Unfollow everyone
// i18n bulk.unit.friends: friends
// i18n bulk.unit.mutedAccounts: muted accounts
// i18n bulk.unit.blockedAccounts: blocked accounts
// i18n bulk.unit.listMembers: list members
// i18n bulk.source.list: list
// i18n bulk.source.collection: collection
// i18n bulk.processed: {{unit}} processed
export const BULK_ACTIONS: readonly BulkActionSpec[] = [
  {
    id: 'reblogs-off',
    labelKey: 'bulk.reblogsOff.label',
    blurbKey: 'bulk.reblogsOff.blurb',
    titleKey: 'bulk.reblogsOff.title',
    effectKeys: [
      'bulk.reblogsOff.effect1',
      'bulk.reblogsOff.effect2',
      'bulk.reblogsOff.effect3',
      'bulk.reblogsOff.effect4',
    ],
    confirmLabelKey: 'bulk.reblogsOff.confirmLabel',
    danger: false,
    unitKey: 'bulk.unit.friends',
  },
  {
    id: 'reblogs-on',
    labelKey: 'bulk.reblogsOn.label',
    blurbKey: 'bulk.reblogsOn.blurb',
    titleKey: 'bulk.reblogsOn.title',
    effectKeys: ['bulk.reblogsOn.effect1', 'bulk.reblogsOn.effect2', 'bulk.reblogsOn.effect3'],
    confirmLabelKey: 'bulk.reblogsOn.confirmLabel',
    danger: false,
    unitKey: 'bulk.unit.friends',
  },
  {
    id: 'mute-amnesty',
    labelKey: 'bulk.muteAmnesty.label',
    blurbKey: 'bulk.muteAmnesty.blurb',
    titleKey: 'bulk.muteAmnesty.title',
    effectKeys: [
      'bulk.muteAmnesty.effect1',
      'bulk.muteAmnesty.effect2',
      'bulk.muteAmnesty.effect3',
      'bulk.muteAmnesty.effect4',
    ],
    confirmLabelKey: 'bulk.muteAmnesty.confirmLabel',
    danger: true,
    backup: 'mutes',
    unitKey: 'bulk.unit.mutedAccounts',
  },
  {
    id: 'block-amnesty',
    labelKey: 'bulk.blockAmnesty.label',
    blurbKey: 'bulk.blockAmnesty.blurb',
    titleKey: 'bulk.blockAmnesty.title',
    effectKeys: [
      'bulk.blockAmnesty.effect1',
      'bulk.blockAmnesty.effect2',
      'bulk.blockAmnesty.effect3',
      'bulk.blockAmnesty.effect4',
    ],
    confirmLabelKey: 'bulk.blockAmnesty.confirmLabel',
    danger: true,
    backup: 'blocks',
    unitKey: 'bulk.unit.blockedAccounts',
  },
  {
    id: 'list-follow',
    labelKey: 'bulk.listFollow.label',
    blurbKey: 'bulk.listFollow.blurb',
    titleKey: 'bulk.listFollow.title',
    effectKeys: [
      'bulk.listFollow.effect1',
      'bulk.listFollow.effect2',
      'bulk.listFollow.effect3',
      'bulk.listFollow.effect4',
    ],
    confirmLabelKey: 'bulk.listFollow.confirmLabel',
    danger: false,
    unitKey: 'bulk.unit.listMembers',
  },
  {
    id: 'list-unfollow',
    labelKey: 'bulk.listUnfollow.label',
    blurbKey: 'bulk.listUnfollow.blurb',
    titleKey: 'bulk.listUnfollow.title',
    effectKeys: [
      'bulk.listUnfollow.effect1',
      'bulk.listUnfollow.effect2',
      // Mastodon enforces "list members must be follows" and drops them on
      // unfollow; our mock server keeps them. Hedged deliberately — claiming the
      // list empties and then watching it not empty reads as a bug, and so does
      // the reverse. The one thing true everywhere is that the list survives.
      'bulk.listUnfollow.effect3',
      'bulk.listUnfollow.effect4',
    ],
    confirmLabelKey: 'bulk.listUnfollow.confirmLabel',
    danger: true,
    unitKey: 'bulk.unit.listMembers',
  },
];

export function bulkAction(id: BulkActionId): BulkActionSpec {
  return BULK_ACTIONS.find((a) => a.id === id) ?? BULK_ACTIONS[0];
}

/** Where a job is in its life. */
export type BulkPhase = 'planning' | 'running' | 'paused' | 'done' | 'cancelled' | 'failed';

export interface BulkJob {
  action: BulkActionId;
  /** Name of the thing being operated on, when the action needs one (a list). */
  targetLabel?: string;
  phase: BulkPhase;
  /**
   * How many accounts the job will touch, or null while the planning pass is
   * still counting. The progress bar goes indeterminate rather than guessing: a
   * confident-looking wrong number is worse than an honest "still counting".
   */
  total: number | null;
  /** Writes attempted (succeeded + failed). Drives the percentage. */
  done: number;
  /** Writes that succeeded. */
  changed: number;
  /** Accounts skipped because they were already in the requested state. */
  skipped: number;
  failed: number;
  startedAt: number;
  /** When the current rate-limit pause ends; null unless `phase` is 'paused'. */
  pausedUntil: number | null;
  /** Set when the job stopped early. */
  error?: string;
}

/**
 * Live progress of the planning pass, for the dialog to show while it counts.
 *
 * Deliberately separate from {@link BulkJob}: nothing has been written yet, and
 * showing this in the job panel would imply something had.
 */
export interface BulkPlanProgress {
  /** Which stage the read is in, so the wording can say what it is doing. */
  stage: 'reading' | 'checking';
  /** Accounts read so far. */
  accounts: number;
  /** Requests issued so far — the number that keeps moving on a slow read. */
  apiCalls: number;
}

/** What the confirmation dialog needs to state the real consequences. */
export interface BulkPreview {
  action: BulkActionId;
  /** Accounts that will actually be written to. */
  targets: number;
  /** Accounts inspected but already correct (boost actions only). */
  alreadyCorrect: number;
  /** True when `targets` is a floor rather than the exact number. */
  approximate: boolean;
  /**
   * The user stopped the count. No plan was produced and the numbers here mean
   * nothing — the dialog offers to start over rather than showing a total.
   */
  cancelled?: boolean;
  /** Set when the preview itself failed; the dialog shows it and offers retry. */
  error?: string;
}

/** Mastodon caps `/accounts/relationships` at 40 ids per request. */
export const RELATIONSHIP_BATCH = 40;
/** Mastodon caps the follow-list page size at 80. */
const FOLLOWING_PAGE = 80;
/**
 * Ceiling on follow-list pages walked (80 × 60 = 4,800 accounts). A limit exists
 * so a pathological account can't spin forever; it is set well past any real
 * following count so it never silently truncates a normal user's job.
 */
const MAX_FOLLOWING_PAGES = 60;
/**
 * Ceiling on drain passes for an amnesty. Each pass clears up to a page, so this
 * covers thousands of accounts; it is a guard against a server that accepts an
 * unmute and keeps listing the account anyway, which would otherwise loop.
 */
const MAX_DRAIN_PASSES = 200;
/** Longest single rate-limit wait we will sit through before giving up. */
const MAX_WAIT_MS = 5 * 60_000;
/** Page size asked for when reading the mute/block list (Mastodon caps at 80). */
const LIST_PAGE = 80;
/** Ceiling on mute/block list pages read (80 × 40 = 3,200 accounts). */
const MAX_LIST_PAGES = 40;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable({ providedIn: 'root' })
export class BulkActions {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly rateLimits = inject(RateLimitCoordinator);

  /** The current or most recent job; null before anything has been run. */
  readonly job = signal<BulkJob | null>(null);

  /**
   * What the planning pass is doing right now, or null when none is running.
   *
   * The count is minutes of work on a large account — paging a 50,000-follow
   * list is hundreds of requests — and it used to happen behind a single static
   * "Checking how many accounts this affects…", with no numbers, no way to tell
   * it apart from a hang, and no button to stop it. The only place the activity
   * was visible at all was the browser's network tab.
   *
   * `accounts` is the honest headline (it is what the user thinks in), with
   * `apiCalls` alongside it because for the amnesty reads the account count
   * arrives in bursts and a request counter is the thing that keeps moving.
   */
  readonly planning = signal<BulkPlanProgress | null>(null);

  /** Spacing between writes. Tests set this to 0. */
  delayMs = 250;
  /** Longest rate-limit wait honoured. Tests set this low. */
  maxWaitMs = MAX_WAIT_MS;

  private cancelRequested = false;
  /**
   * The plan produced by the last {@link preview}, reused by {@link start} so
   * confirming doesn't repeat a walk of the whole follow list.
   */
  private plan: {
    action: BulkActionId;
    /** Which list the plan was built for; a plan for list A must not run on B. */
    listId: string | null;
    accounts: Account[];
    alreadyCorrect: number;
  } | null = null;

  // -------------------------------------------------------------------- views

  readonly running = computed(() => {
    const phase = this.job()?.phase;
    return phase === 'planning' || phase === 'running' || phase === 'paused';
  });

  /** 0–1, or null while the total is unknown (an amnesty still being counted). */
  readonly percent = computed<number | null>(() => {
    const job = this.job();
    if (!job || job.total === null || job.total === 0) {
      return job?.phase === 'done' ? 1 : null;
    }
    return Math.min(1, job.done / job.total);
  });

  /**
   * Estimated milliseconds remaining, or null when it can't be said honestly —
   * no total yet, or not enough writes done to extrapolate from. Derived from
   * observed throughput rather than the configured delay, so rate-limit pauses
   * are already priced in.
   */
  readonly etaMs = computed<number | null>(() => {
    const job = this.job();
    if (!job || job.total === null || job.done < 2 || job.phase === 'done') {
      return null;
    }
    const elapsed = Date.now() - job.startedAt;
    const remaining = Math.max(0, job.total - job.done);
    return remaining === 0 ? 0 : Math.round((elapsed / job.done) * remaining);
  });

  // ----------------------------------------------------------------- preview

  /**
   * Work out what the action would actually do, for the confirmation dialog.
   *
   * This is the expensive half of the job (paging the follow list, checking
   * relationships), done before the user commits so the dialog can say "47 of
   * your 312 friends" instead of a vague warning — and so confirming is
   * immediate.
   */
  async preview(action: BulkActionId, target?: BulkTarget): Promise<BulkPreview> {
    this.plan = null;
    // A previous cancel must not kill this pass before it starts — the reads
    // below all check this flag, and it survives the dialog being reopened.
    this.cancelRequested = false;
    this.planning.set({ stage: 'reading', accounts: 0, apiCalls: 0 });
    try {
      const result = await this.plannedPreview(action, target);
      // Every read loop breaks on cancel, which means a cancelled pass returns
      // a *partial* count. Presenting that as the plan would be the worst
      // outcome here: the user stops the count and is then shown a confident
      // "this will change 84 accounts" that is simply the point they stopped at.
      if (this.cancelRequested) {
        this.plan = null;
        return { action, targets: 0, alreadyCorrect: 0, approximate: false, cancelled: true };
      }
      return result;
    } catch (error) {
      return {
        action,
        targets: 0,
        alreadyCorrect: 0,
        approximate: false,
        error: describeError(error),
      };
    } finally {
      this.planning.set(null);
    }
  }

  /** The read itself. Wrapped by {@link preview}, which owns cancel and errors. */
  private async plannedPreview(action: BulkActionId, target?: BulkTarget): Promise<BulkPreview> {
    {
      if (needsList(action)) {
        if (!target) {
          throw new Error('No list chosen.');
        }
        const members = await this.fetchMembers(target);
        const wantFollowing = action === 'list-follow';
        const targets = await this.needingFollowChange(members, wantFollowing);
        const alreadyCorrect = members.length - targets.length;
        this.plan = { action, listId: target.listId, accounts: targets, alreadyCorrect };
        return { action, targets: targets.length, alreadyCorrect, approximate: false };
      }
      if (action === 'mute-amnesty' || action === 'block-amnesty') {
        const list = await this.fetchList(action);
        this.plan = { action, listId: null, accounts: list.accounts, alreadyCorrect: 0 };
        return {
          action,
          targets: list.accounts.length,
          alreadyCorrect: 0,
          // Only when the page ceiling cut the read short is the count a floor.
          approximate: list.truncated,
        };
      }
      const wanted = action === 'reblogs-on';
      const following = await this.fetchAllFollowing();
      const targets = await this.needingReblogChange(following, wanted);
      const alreadyCorrect = following.length - targets.length;
      this.plan = { action, listId: null, accounts: targets, alreadyCorrect };
      return {
        action,
        targets: targets.length,
        alreadyCorrect,
        approximate: false,
      };
    }
  }

  /**
   * Stop the planning pass.
   *
   * Distinct from {@link cancel}, which stops a running job: nothing has been
   * written yet, so this is free to abandon. It exists because the count itself
   * is the long part on a large account, and "wait however long this takes"
   * was not a choice the user was being offered.
   */
  cancelPlanning(): void {
    this.cancelRequested = true;
  }

  /** Note progress during a planning read. No-op once the pass has ended. */
  private notePlan(changes: Partial<BulkPlanProgress>): void {
    this.planning.update((current) => (current ? { ...current, ...changes } : current));
  }

  /** One more request issued during planning. */
  private countPlanCall(accountsRead = 0): void {
    this.planning.update((current) =>
      current
        ? {
            ...current,
            apiCalls: current.apiCalls + 1,
            accounts: current.accounts + accountsRead,
          }
        : current,
    );
  }

  // ------------------------------------------------------------------- runner

  /** Run an action. Resolves when the job finishes, is cancelled, or fails. */
  async start(action: BulkActionId, target?: BulkTarget): Promise<void> {
    if (this.running()) {
      return;
    }
    this.cancelRequested = false;
    this.job.set({
      action,
      targetLabel: target?.listTitle,
      phase: 'planning',
      total: null,
      done: 0,
      changed: 0,
      skipped: 0,
      failed: 0,
      startedAt: Date.now(),
      pausedUntil: null,
    });

    try {
      if (needsList(action)) {
        await this.runListFollows(action, target);
      } else if (action === 'mute-amnesty' || action === 'block-amnesty') {
        await this.runAmnesty(action);
      } else {
        await this.runReblogs(action);
      }
      this.patch({ phase: this.cancelRequested ? 'cancelled' : 'done', pausedUntil: null });
    } catch (error) {
      this.patch({ phase: 'failed', error: describeError(error), pausedUntil: null });
    } finally {
      this.plan = null;
    }
  }

  cancel(): void {
    this.cancelRequested = true;
  }

  /** Clear a finished job from the UI. Refuses while one is still running. */
  dismiss(): void {
    if (!this.running()) {
      this.job.set(null);
    }
  }

  /**
   * Turn boosts on or off for every follow that needs it.
   *
   * `POST /accounts/:id/follow` with `reblogs` is the only way to set this — it
   * is not a separate endpoint, and calling it on someone you already follow
   * updates the flag rather than re-following them.
   */
  private async runReblogs(action: BulkActionId): Promise<void> {
    const wanted = action === 'reblogs-on';
    // The dialog's preview already did this walk; reuse its result rather than
    // paging the whole follow list a second time between "yes" and the writes.
    const planned = this.plan?.action === action ? this.plan : null;
    let targets = planned?.accounts ?? null;
    let alreadyCorrect = planned?.alreadyCorrect ?? 0;
    if (!targets) {
      const following = await this.fetchAllFollowing();
      targets = await this.needingReblogChange(following, wanted);
      alreadyCorrect = following.length - targets.length;
    }
    this.patch({ phase: 'running', total: targets.length, skipped: alreadyCorrect });

    for (const account of targets) {
      if (this.cancelRequested) {
        return;
      }
      await this.write(() => firstValueFrom(this.api.follow(account.id, { reblogs: wanted })));
      await this.pace();
    }
  }

  /**
   * Follow or unfollow every member of one list.
   *
   * The list is read in full first (members, then relationships) so the writes
   * are only the accounts that need one — following a list of 40 where you
   * already follow 38 should cost two requests.
   */
  private async runListFollows(action: BulkActionId, target?: BulkTarget): Promise<void> {
    if (!target) {
      throw new Error('No list chosen.');
    }
    const wantFollowing = action === 'list-follow';
    // Reuse the dialog's plan, but only if it was built for *this* list.
    const planned =
      this.plan?.action === action && this.plan.listId === target.listId ? this.plan : null;
    let targets = planned?.accounts ?? null;
    let alreadyCorrect = planned?.alreadyCorrect ?? 0;
    if (!targets) {
      const members = await this.fetchMembers(target);
      targets = await this.needingFollowChange(members, wantFollowing);
      alreadyCorrect = members.length - targets.length;
    }
    this.patch({ phase: 'running', total: targets.length, skipped: alreadyCorrect });

    for (const account of targets) {
      if (this.cancelRequested) {
        return;
      }
      await this.write(() =>
        firstValueFrom(wantFollowing ? this.api.follow(account.id) : this.api.unfollow(account.id)),
      );
      await this.pace();
    }
  }

  /**
   * Empty the mute or block list by draining it: clear what the server shows,
   * ask again, repeat until it comes back empty.
   *
   * Draining rather than paging because Mastodon paginates these lists by
   * *relationship* id — a value that isn't in the account objects it returns, so
   * a client can only follow it from the `Link` header. Since every entry is
   * being removed anyway, re-reading page one is equivalent, simpler, and can't
   * skip anyone when the list shifts under us mid-run.
   *
   * A pass that changes nothing ends the loop: without that, a server that
   * accepts the unmute and keeps listing the account would spin forever.
   */
  private async runAmnesty(action: BulkActionId): Promise<void> {
    const kind = action === 'mute-amnesty' ? 'mutes' : 'blocks';
    let accounts = this.plan?.action === action ? this.plan.accounts : null;

    for (let pass = 0; pass < MAX_DRAIN_PASSES; pass++) {
      if (!accounts) {
        accounts = (await this.fetchList(action)).accounts;
      }
      if (!accounts.length) {
        // Nothing left: the total is now exactly what we have processed.
        this.patch({ total: this.job()?.done ?? 0 });
        return;
      }
      // The list read is complete, so the total is exact: what we have already
      // processed plus what this pass holds.
      this.patch({ phase: 'running', total: (this.job()?.done ?? 0) + accounts.length });

      const before = this.job()?.changed ?? 0;
      for (const account of accounts) {
        if (this.cancelRequested) {
          return;
        }
        await this.write(() =>
          firstValueFrom(
            kind === 'mutes'
              ? this.api.unmuteAccount(account.id)
              : this.api.unblockAccount(account.id),
          ),
        );
        await this.pace();
      }
      if ((this.job()?.changed ?? 0) === before) {
        // A whole pass and nothing actually changed — stop rather than loop.
        return;
      }
      accounts = null;
    }
  }

  /**
   * Perform one write, counting the result and absorbing rate limits.
   *
   * A 429 is not counted as a failure: the job pauses for the cooldown the
   * server asked for and tries the same account again. Anything else is recorded
   * and the job moves on — one suspended account must not strand the other 299.
   */
  private async write(request: () => Promise<Relationship>): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await request();
        this.patch({
          done: (this.job()?.done ?? 0) + 1,
          changed: (this.job()?.changed ?? 0) + 1,
          phase: 'running',
          pausedUntil: null,
        });
        return;
      } catch (error) {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status === 429 && attempt < 4 && !this.cancelRequested) {
          await this.pauseForRateLimit(error as HttpErrorResponse, attempt);
          continue;
        }
        this.patch({
          done: (this.job()?.done ?? 0) + 1,
          failed: (this.job()?.failed ?? 0) + 1,
          error: describeError(error),
          phase: 'running',
          pausedUntil: null,
        });
        return;
      }
    }
  }

  /** Sit out a rate-limit cooldown, with the end time visible to the UI. */
  private async pauseForRateLimit(error: HttpErrorResponse, attempt: number): Promise<void> {
    const waitMs = this.waitMsFor(error, attempt);
    this.patch({ phase: 'paused', pausedUntil: Date.now() + waitMs });
    await sleep(waitMs);
    this.patch({ phase: 'running', pausedUntil: null });
  }

  /**
   * How long to wait: what the server said, else exponential backoff. The
   * coordinator has already parsed the headers for the interceptor, so ask it
   * rather than parsing them a second time.
   */
  private waitMsFor(error: HttpErrorResponse, attempt: number): number {
    const fromHeaders = error.headers ? this.rateLimits.retryDelayMs(error.headers) : 0;
    const wait = fromHeaders > 0 ? fromHeaders + 1_000 : 5_000 * 2 ** attempt;
    return Math.min(wait, this.maxWaitMs);
  }

  /** Space out writes, and reflect any cooldown the coordinator is enforcing. */
  private async pace(): Promise<void> {
    if (this.delayMs) {
      await sleep(this.delayMs);
    }
  }

  // ------------------------------------------------------------------ reading

  /**
   * The whole mute or block list, following `Link` cursors to the end.
   *
   * Reading all of it up front (rather than a page at a time) is what lets the
   * dialog state a real number and the backup be complete — a partial backup
   * offered before an irreversible action would be worse than none.
   */
  private async fetchList(
    action: BulkActionId,
  ): Promise<{ accounts: Account[]; truncated: boolean }> {
    const kind = action === 'mute-amnesty' ? 'mutes' : 'blocks';
    const all: Account[] = [];
    let maxId: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      if (this.cancelRequested) {
        break;
      }
      const { accounts, nextMaxId } = await firstValueFrom(
        this.api.accountListPage(kind, maxId, LIST_PAGE),
      );
      all.push(...accounts);
      this.countPlanCall(accounts.length);
      if (!nextMaxId || !accounts.length) {
        return { accounts: all, truncated: false };
      }
      maxId = nextMaxId;
    }
    // Hit the ceiling with a cursor still outstanding: say so rather than
    // implying the list is this long.
    return { accounts: all, truncated: true };
  }

  /**
   * The list as a Mastodon-compatible CSV, for the dialog's backup button.
   *
   * Built here rather than from `/api/v1/_mock/export` because that endpoint
   * only exists on the mock, and a backup that silently doesn't work against a
   * real server is exactly the backup someone would rely on. Column headers
   * match Mastodon's own exports so the file can be fed straight back into
   * Import.
   */
  async backupCsv(action: BulkActionId): Promise<{ csv: string; count: number }> {
    const { accounts } = await this.fetchList(action);
    const header =
      action === 'mute-amnesty' ? 'Account address,Hide notifications' : 'Account address';
    const rows = accounts.map((a) =>
      action === 'mute-amnesty' ? `${csvCell(a.acct)},true` : csvCell(a.acct),
    );
    return { csv: [header, ...rows].join('\n'), count: accounts.length };
  }

  /**
   * Every member of one list or collection.
   *
   * A collection comes back whole from a single GET — it has no cursor and no
   * page endpoint — so it is read and returned rather than walked.
   */
  private async fetchMembers(target: BulkTarget): Promise<Account[]> {
    if (target.kind === 'collection') {
      const data = await firstValueFrom(this.api.getCollection(target.listId));
      const ids = new Set(
        data.collection.items
          .filter((item) => item.state === 'accepted')
          .map((item) => item.account_id)
          .filter((id): id is string => !!id),
      );
      return data.accounts.filter((account) => ids.has(account.id));
    }
    return this.fetchListMembers(target.listId);
  }

  /** Every member of one list, following `Link` cursors to the end. */
  private async fetchListMembers(listId: string): Promise<Account[]> {
    const all: Account[] = [];
    let maxId: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      if (this.cancelRequested) {
        break;
      }
      const { accounts, nextMaxId } = await firstValueFrom(
        this.api.listAccountsPage(listId, maxId, LIST_PAGE),
      );
      all.push(...accounts);
      this.countPlanCall(accounts.length);
      if (!nextMaxId || !accounts.length) {
        break;
      }
      maxId = nextMaxId;
    }
    return all;
  }

  /**
   * Of these accounts, which need following (or unfollowing).
   *
   * A pending follow request counts as "already following" for the follow
   * direction — re-sending it achieves nothing — and as work for the unfollow
   * direction, where `unfollow` is also how you withdraw one.
   */
  private async needingFollowChange(
    accounts: Account[],
    wantFollowing: boolean,
  ): Promise<Account[]> {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const targets: Account[] = [];
    this.notePlan({ stage: 'checking' });
    for (let i = 0; i < accounts.length; i += RELATIONSHIP_BATCH) {
      if (this.cancelRequested) {
        break;
      }
      const slice = accounts.slice(i, i + RELATIONSHIP_BATCH);
      const rels = await firstValueFrom(this.api.relationships(slice.map((a) => a.id)));
      this.countPlanCall();
      for (const rel of rels) {
        const account = byId.get(rel.id);
        const connected = rel.following || rel.requested;
        if (account && connected !== wantFollowing) {
          targets.push(account);
        }
      }
    }
    return targets;
  }

  /** Every account the signed-in user follows, paged to the ceiling. */
  private async fetchAllFollowing(): Promise<Account[]> {
    const me = this.auth.account();
    if (!me) {
      throw new Error('Not signed in.');
    }
    const all: Account[] = [];
    let maxId: string | undefined;
    for (let page = 0; page < MAX_FOLLOWING_PAGES; page++) {
      if (this.cancelRequested) {
        break;
      }
      const batch = await firstValueFrom(this.api.accountFollowing(me.id, maxId, FOLLOWING_PAGE));
      all.push(...batch);
      this.countPlanCall(batch.length);
      if (batch.length < FOLLOWING_PAGE) {
        break;
      }
      maxId = batch[batch.length - 1]?.id;
      if (!maxId) {
        break;
      }
    }
    return all;
  }

  /**
   * Of these follows, which actually need their boost setting changed.
   *
   * `showing_reblogs` is absent on some servers' relationship payloads; an
   * unknown value is treated as "currently on", matching Mastodon's default, so
   * turning boosts off still reaches those accounts and turning them on skips
   * them. Erring the other way would make "turn off" silently do nothing.
   */
  private async needingReblogChange(following: Account[], wanted: boolean): Promise<Account[]> {
    const byId = new Map(following.map((a) => [a.id, a]));
    const targets: Account[] = [];
    this.notePlan({ stage: 'checking' });
    for (let i = 0; i < following.length; i += RELATIONSHIP_BATCH) {
      if (this.cancelRequested) {
        break;
      }
      const slice = following.slice(i, i + RELATIONSHIP_BATCH);
      const rels = await firstValueFrom(this.api.relationships(slice.map((a) => a.id)));
      this.countPlanCall();
      for (const rel of rels) {
        const account = byId.get(rel.id);
        if (account && (rel.showing_reblogs ?? true) !== wanted) {
          targets.push(account);
        }
      }
    }
    return targets;
  }

  private patch(changes: Partial<BulkJob>): void {
    this.job.update((job) => (job ? { ...job, ...changes } : job));
  }
}

/** A short, user-facing description of whatever went wrong. */
export function describeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const detail =
      typeof error.error?.error === 'string' ? error.error.error : error.statusText || '';
    return error.status ? `HTTP ${error.status}${detail ? `: ${detail}` : ''}` : 'Network error';
  }
  return error instanceof Error ? error.message : String(error);
}

/** "about 2m 30s" / "about 45s" — deliberately vague, because it is an estimate. */
export function formatEta(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) {
    return `about ${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `about ${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  }
  return `about ${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Quote a CSV cell if it could otherwise break the row. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
