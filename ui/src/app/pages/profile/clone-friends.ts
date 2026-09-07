import { Account } from '../../models';
import { QualitySignal, rejectionReason } from '../../follow-quality';

/**
 * Which of an account's follows are worth adopting?
 *
 * Pure, and separated from the fetching on purpose: the interesting decisions here
 * are all arithmetic — dedupe, quality-gate, respect the slot cap, decide whether
 * another page is worth requesting — and none of them need HTTP to test.
 *
 * The paging is the part that surprises people, so: **filtering is why this pages.**
 * `/api/v1/accounts/:id/following` caps `limit` at 80, and the quality gate can
 * easily reject most of a page, so one request often yields fewer than the twenty
 * keepers we want. See `sprint/anonymous-great-2-clone-friends.md`.
 */

/** How many accounts to adopt by default. */
export const CLONE_TARGET = 20;

/**
 * Where an account's follow list is actually complete.
 *
 * **This is the difference between the feature working and the feature lying.**
 * `/api/v1/accounts/:id/following` asked of server X about an account that lives on
 * server Y returns only the follows X has federated — an arbitrary, usually tiny
 * subset. Read kolectiva.social about an account with 800 follows and you get the
 * handful of them kolectiva happens to know, which is why the dialog reported
 * "1 to follow, 4 too quiet" for an account with hundreds of live friends.
 *
 * The account's own server has the whole list, so that is who we ask. Derived from
 * `account.url`, which is the canonical profile URL, falling back to the host in
 * `acct` and finally to the server we already read through.
 *
 * (Considered and rejected: querying the biggest few instances and merging. It costs
 * N times as many requests, still returns a union of partial views rather than the
 * real list, and needs every one of those servers to be unblocked. Asking the
 * authoritative source is two calls and is *correct* rather than merely bigger.)
 */
export function homeServerFor(account: Account, fallbackServer: string): string {
  try {
    if (account.url) {
      return new URL(account.url).origin;
    }
  } catch {
    // Fall through to the handle.
  }
  const acct = typeof account.acct === 'string' ? account.acct : '';
  const host = acct.includes('@') ? acct.split('@').at(-1) : null;
  if (host) {
    return `https://${host.toLowerCase()}`;
  }
  return fallbackServer;
}

/**
 * Did the server tell us this account's follows are none of our business?
 *
 * Mastodon's `hide_collections` makes `/following` return an empty array while the
 * profile keeps advertising `following_count`. That is a *refusal*, not an absence,
 * and reporting it as "nothing new to follow" is the wrong statement — the user's
 * complaint. The signature: the account claims follows, and a first page came back
 * with literally nothing in it.
 */
export function followsAreHidden(account: Account, fetched: number, pagesFetched: number): boolean {
  return pagesFetched > 0 && fetched === 0 && (account.following_count ?? 0) > 0;
}

/**
 * Hard ceiling on pages fetched.
 *
 * An account following 5,000 people is not worth a 60-page walk, and the app's
 * search page has already established that read budgets are named constants rather
 * than a loop that runs until it feels done.
 */
export const CLONE_MAX_PAGES = 3;

/** Mastodon's own cap on `/following?limit=`. Asking for more is silently clamped. */
export const CLONE_PAGE_SIZE = 80;

export interface SkippedCandidate {
  account: Account;
  /** Reads after the handle: "@bob hasn't posted in 8 months". */
  reason: string;
}

export interface CloneSelection {
  /** Accounts to follow, in the order the server returned them. */
  adopt: Account[];
  /** Everyone filtered out, with why — the dialog shows this rather than hiding it. */
  skipped: SkippedCandidate[];
  /** Already followed, so neither adopted nor reported as skipped. */
  alreadyFollowing: number;
  /**
   * Whether another page is worth fetching: we still want more, the last page was
   * full (so there probably is more), and we haven't hit the page ceiling.
   */
  wantsAnotherPage: boolean;
  /** True when the slot cap, not the target, is what limited the result. */
  limitedBySlots: boolean;
}

export interface CloneOptions {
  /** Everyone the viewed account follows, across every page fetched so far. */
  candidates: Account[];
  /** How many pages produced `candidates`. Drives the ceiling check. */
  pagesFetched: number;
  /** True when the last page came back full, i.e. there is probably more. */
  lastPageFull: boolean;
  /** Is this account already followed? Usually `AnonymousFollows.isFollowing`. */
  isFollowing: (account: Account) => boolean;
  /** Follow slots left under `ANONYMOUS_FOLLOW_LIMIT`. */
  remainingSlots: number;
  /** The viewer, so cloning a list you are in doesn't try to follow you. */
  viewerId?: string;
  /** How many to adopt. Defaults to {@link CLONE_TARGET}. */
  target?: number;
  /**
   * The quality bar. Defaults to the shipped {@link QUALITY_SIGNALS}; the copy
   * dialog passes tuned signals so the user can decide how much gets skipped.
   * An empty array adopts everyone who isn't already followed.
   */
  signals?: readonly QualitySignal[];
  /** Page ceiling. Defaults to {@link CLONE_MAX_PAGES}. */
  maxPages?: number;
  /** Injected for testable date boundaries in the quality signals. */
  now?: number;
}

/**
 * Decide who gets adopted from the candidates gathered so far.
 *
 * Called after every page, which is what makes the paging decision cheap: the
 * caller fetches, asks, and either stops or fetches again.
 */
export function selectCloneCandidates(options: CloneOptions): CloneSelection {
  const target = options.target ?? CLONE_TARGET;
  const now = options.now ?? Date.now();
  // Never let cloning be the thing that silently hits the follow cap.
  const allowed = Math.max(0, Math.min(target, options.remainingSlots));

  const adopt: Account[] = [];
  const skipped: SkippedCandidate[] = [];
  const seen = new Set<string>();
  let alreadyFollowing = 0;

  for (const account of options.candidates) {
    // The same account can appear twice across pages when the remote list shifts
    // under us between requests.
    if (!account?.id || seen.has(account.id)) {
      continue;
    }
    seen.add(account.id);

    if (options.viewerId && account.id === options.viewerId) {
      continue;
    }
    if (options.isFollowing(account)) {
      alreadyFollowing += 1;
      continue;
    }
    // Quality is judged before the cap so `skipped` is a complete account of what
    // was rejected and why, not just of the part we happened to reach.
    const reason = rejectionReason(account, now, options.signals);
    if (reason) {
      skipped.push({ account, reason });
      continue;
    }
    if (adopt.length < allowed) {
      adopt.push(account);
    }
  }

  const wantsMore = adopt.length < allowed;
  const maxPages = options.maxPages ?? CLONE_MAX_PAGES;
  return {
    adopt,
    skipped,
    alreadyFollowing,
    wantsAnotherPage: wantsMore && options.lastPageFull && options.pagesFetched < maxPages,
    limitedBySlots: options.remainingSlots < target,
  };
}

/**
 * The sentence above the confirm button.
 *
 * Bulk actions get told to you before they happen, including what was filtered —
 * a silent "followed 6 of 63" invites the reasonable question "why only 6?".
 */
export function describeSelection(selection: CloneSelection, handle: string): string {
  const { adopt, skipped, alreadyFollowing } = selection;
  if (!adopt.length) {
    if (selection.limitedBySlots) {
      return 'You have no follow slots left, so nothing can be added.';
    }
    if (skipped.length && !alreadyFollowing) {
      return `None of the accounts ${handle} follows look active enough to be worth a slot.`;
    }
    if (alreadyFollowing && !skipped.length) {
      return `You already follow everyone ${handle} does.`;
    }
    return `Nothing new to follow from ${handle}'s list.`;
  }

  const parts = [
    `Follow ${adopt.length} account${adopt.length === 1 ? '' : 's'} ${handle} follows`,
  ];
  const notes: string[] = [];
  if (skipped.length) {
    notes.push(`${skipped.length} skipped as dormant or too quiet`);
  }
  if (alreadyFollowing) {
    notes.push(`${alreadyFollowing} already followed`);
  }
  return notes.length ? `${parts[0]} — ${notes.join(', ')}.` : `${parts[0]}?`;
}
