import { Injectable, computed, inject, signal } from '@angular/core';
import { scopedKey } from './account-scope';
import { FollowTrust } from './follow-trust';
import { accountKey } from './local-moderation';
import { Account } from './models';

const BASE_KEY = 'mockingbird_trusted_accounts';
const STATE_VERSION = 2;

/**
 * How far trust extends, as one exclusive choice.
 *
 * A radio rather than a set of stacking switches because the levels are not
 * independent: "trust nobody" has to beat everything else, and two checkboxes
 * that disagree about the same post is a worse thing to explain than one list
 * you pick a rung on.
 *
 * - `none` — global revocation. Nothing is trusted, whoever it is.
 * - `individuals` — only the accounts on the list. The long-standing behaviour,
 *   and the default.
 * - `follows` — everyone you follow, including people you follow in future,
 *   plus the list.
 * - `follows-boosts` — as `follows`, and also whatever those people boost.
 */
export type TrustLevel = 'none' | 'individuals' | 'follows' | 'follows-boosts';

export const TRUST_LEVELS: readonly TrustLevel[] = [
  'none',
  'individuals',
  'follows',
  'follows-boosts',
];

/** One trusted account. */
export interface Entry {
  /** Display handle, so the management list can name who is trusted. */
  acct: string;
  /** When they were trusted, epoch-ms — lets the list sort by most recent. */
  since: number;
}

interface StoredState {
  version: typeof STATE_VERSION;
  /** account key (see {@link accountKey}) → entry */
  entries: Record<string, Entry>;
  /** Expand every content warning, from anyone. */
  expandAllCw: boolean;
  /** Show every sensitive image, from anyone. */
  showAllSensitive: boolean;
  /** How far trust reaches beyond the named list. */
  level: TrustLevel;
}

/**
 * The flipside of block and mute: people whose posts don't need hiding.
 *
 * Content warnings and sensitive flags are the author's judgement about *their*
 * audience, not about you. For accounts you read constantly, clicking through
 * the same CW twenty times a day is friction with no safety benefit — you
 * already know what you are going to get. Trusting an account means its posts
 * render as though they carried no CW and no sensitive flag.
 *
 * ## What trust does *not* do
 *
 * It never overrides a *filter*. A word filter or a server-side `hide` is the
 * viewer's own rule or the server's, and one person being trusted is not a
 * reason to break it — {@link ../status-card} keeps its filter handling ahead of
 * this. Trust only relaxes the two flags that are the author's call.
 *
 * ## Storage
 *
 * Client-side and per-Mastodon-account, via {@link scopedKey}: who you trust is
 * a personal reading preference, it needs to work anonymously and against any
 * instance (Mastodon has no such concept to sync with), and switching accounts
 * must not carry one identity's trust list into another's.
 *
 * Deliberately **not** timed, unlike a mute: trust is a standing judgement about
 * a person, and one that silently expired would restore the blur without ever
 * saying why.
 *
 * ## Levels
 *
 * Beyond the named list there is a {@link TrustLevel}, so "everyone I follow"
 * can be said once instead of a thousand times. The broader levels are resolved
 * live through {@link FollowTrust} rather than by copying the follow list in:
 * they mean *now and in future*, and a snapshot would silently stop covering
 * people you followed afterwards.
 *
 * The named list survives every level change. Someone who moves from trusting
 * five people to trusting everyone they follow, and later moves back, should
 * find their five people still there — so `none` suppresses the list rather than
 * reading it, and only {@link clearAll} ever empties it.
 */
@Injectable({ providedIn: 'root' })
export class TrustedAccounts {
  private state = signal<StoredState>(load());
  private follows = inject(FollowTrust);

  /** Live view of the entries, so cards re-evaluate when trust changes. */
  readonly entries = computed(() => this.state().entries);

  /**
   * Every trusted account, newest first, for the management list.
   *
   * Ties break alphabetically rather than being left to insertion order: two
   * accounts trusted in the same millisecond is entirely possible (a couple of
   * quick clicks), and a list that reshuffles between renders is worse than one
   * whose ordering is occasionally arbitrary but always the same.
   */
  readonly list = computed(() =>
    Object.entries(this.entries())
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) => b.since - a.since || a.acct.localeCompare(b.acct)),
  );

  readonly count = computed(() => Object.keys(this.entries()).length);

  /**
   * Expand every CW regardless of author.
   *
   * Forced off at `none`: global revocation has to beat the account-wide
   * switches too, or "trust no one" would leave every warning open.
   */
  readonly expandAllCw = computed(() => this.level() !== 'none' && this.state().expandAllCw);
  /** Show every sensitive image regardless of author. Same override as CWs. */
  readonly showAllSensitive = computed(
    () => this.level() !== 'none' && this.state().showAllSensitive,
  );

  /** The stored switch positions, for the settings UI to render unmodified. */
  readonly expandAllCwSetting = computed(() => this.state().expandAllCw);
  readonly showAllSensitiveSetting = computed(() => this.state().showAllSensitive);

  /** How far trust currently reaches. */
  readonly level = computed(() => this.state().level);

  /** True when the level takes in everyone the viewer follows. */
  readonly trustsFollows = computed(
    () => this.level() === 'follows' || this.level() === 'follows-boosts',
  );

  /** True when a boost by a followed account carries trust to what it boosted. */
  readonly trustsBoosts = computed(() => this.level() === 'follows-boosts');

  /**
   * True when this specific account is on the named list.
   *
   * Only ever the list — the follow-derived levels are resolved in
   * {@link trusts}, so the settings UI can still show who is explicitly named
   * while a broader level is active.
   */
  isTrusted(account: Pick<Account, 'acct' | 'url' | 'id'>): boolean {
    return accountKey(account) in this.entries();
  }

  /**
   * The real question a card asks: is this author trusted, at the current level?
   *
   * At `none`, nobody is, including the named list. Otherwise the list always
   * counts, and the follow-derived levels add to it.
   */
  trusts(account: Pick<Account, 'acct' | 'url' | 'id'> | null | undefined): boolean {
    if (!account || this.level() === 'none') {
      return false;
    }
    if (this.isTrusted(account)) {
      return true;
    }
    return this.trustsFollows() && this.follows.isFollowing(account);
  }

  /**
   * Does a boost carry trust from the booster to the boosted post?
   *
   * Only at `follows-boosts`, and only when the *booster* is someone the rule
   * covers. Everywhere else a boost is someone else's content passing through a
   * friend, and gets judged on its own author.
   */
  private boostCarriesTrust(booster: Pick<Account, 'acct' | 'url' | 'id'> | null | undefined) {
    return this.trustsBoosts() && !!booster && this.trusts(booster);
  }

  /**
   * Should this post's content warning render already open?
   *
   * True when the account-wide switch is on, or the author is trusted at the
   * current level. `account` is the *displayed* account (a boost's target, not
   * the booster) — trusting someone is about what they write, and a boost is
   * someone else's content passing through.
   *
   * `booster` is that passer-through, and matters only at `follows-boosts`,
   * where the point of the level is precisely that a friend's boost vouches for
   * what it carries.
   */
  cwExpanded(
    account: Pick<Account, 'acct' | 'url' | 'id'> | null | undefined,
    booster?: Pick<Account, 'acct' | 'url' | 'id'> | null,
  ): boolean {
    return this.expandAllCw() || this.trusts(account) || this.boostCarriesTrust(booster);
  }

  /** Should this post's sensitive media render unblurred? Same rule as CWs. */
  sensitiveShown(
    account: Pick<Account, 'acct' | 'url' | 'id'> | null | undefined,
    booster?: Pick<Account, 'acct' | 'url' | 'id'> | null,
  ): boolean {
    return this.showAllSensitive() || this.trusts(account) || this.boostCarriesTrust(booster);
  }

  trust(account: Pick<Account, 'acct' | 'url' | 'id'>): void {
    const key = accountKey(account);
    const entry: Entry = {
      acct: account.acct || account.url || account.id,
      since: Date.now(),
    };
    this.state.update((prev) =>
      this.persist({ ...prev, entries: { ...prev.entries, [key]: entry } }),
    );
  }

  /** Withdraw trust. Accepts a raw key so the settings list can remove by row. */
  untrust(account: Pick<Account, 'acct' | 'url' | 'id'> | string): void {
    const key = typeof account === 'string' ? account : accountKey(account);
    this.state.update((prev) => {
      if (!(key in prev.entries)) {
        return prev;
      }
      const entries = { ...prev.entries };
      delete entries[key];
      return this.persist({ ...prev, entries });
    });
  }

  /** Flip trust for one account, returning the state it landed in. */
  toggle(account: Pick<Account, 'acct' | 'url' | 'id'>): boolean {
    const trusted = this.isTrusted(account);
    if (trusted) {
      this.untrust(account);
    } else {
      this.trust(account);
    }
    return !trusted;
  }

  /**
   * Replace the whole list with one reconciled against the account.
   *
   * Needed because {@link trust} stamps `since` with the current time, which is
   * right for a fresh judgement and wrong for one being restored — adopting a
   * stored list through it would re-date every entry to the moment of adoption
   * and destroy the ordering the settings list sorts by.
   *
   * Takes the level and flags too, because they arrive from the same document
   * and applying them in two writes would persist twice and briefly show a list
   * under the wrong level.
   */
  adoptAll(
    entries: Record<string, Entry>,
    settings?: { level: TrustLevel; expandAllCw: boolean; showAllSensitive: boolean },
  ): void {
    this.state.update((prev) =>
      this.persist({
        ...prev,
        entries: { ...entries },
        ...(settings
          ? {
              level: settings.level,
              expandAllCw: settings.expandAllCw,
              showAllSensitive: settings.showAllSensitive,
            }
          : {}),
      }),
    );
  }

  setExpandAllCw(on: boolean): void {
    this.state.update((prev) => this.persist({ ...prev, expandAllCw: on }));
  }

  setShowAllSensitive(on: boolean): void {
    this.state.update((prev) => this.persist({ ...prev, showAllSensitive: on }));
  }

  /**
   * Move to a trust level.
   *
   * Never touches the named list, in either direction: going up to "everyone I
   * follow" does not absorb the list into itself (nothing is materialised — see
   * {@link FollowTrust}), and coming back down finds it as it was.
   *
   * `none` is the exception only in that it is worth confirming first, since
   * {@link revokeAll} pairs it with a wipe.
   */
  setLevel(level: TrustLevel): void {
    this.state.update((prev) => this.persist({ ...prev, level }));
  }

  /**
   * Global trust revocation: drop to `none` *and* forget everyone.
   *
   * The destructive half is the point. "Trust no one" as a reversible override
   * would leave the list sitting there intact, which is not what someone reaches
   * for this button to achieve — they want the trust gone, not parked. Callers
   * confirm before invoking.
   */
  revokeAll(): void {
    this.state.update((prev) =>
      this.persist({
        ...prev,
        entries: {},
        level: 'none',
        expandAllCw: false,
        showAllSensitive: false,
      }),
    );
  }

  /** Forget every trusted account. The switches and level are left alone. */
  clearAll(): void {
    this.state.update((prev) => this.persist({ ...prev, entries: {} }));
  }

  private persist(next: StoredState): StoredState {
    try {
      localStorage.setItem(scopedKey(BASE_KEY), JSON.stringify(next));
    } catch {
      // A full or blocked localStorage must not break rendering — the in-memory
      // signal is still updated, so trust works for this session either way.
    }
    return next;
  }
}

function load(): StoredState {
  const empty: StoredState = {
    version: STATE_VERSION,
    entries: {},
    expandAllCw: false,
    showAllSensitive: false,
    level: 'individuals',
  };
  try {
    const parsed = JSON.parse(
      localStorage.getItem(scopedKey(BASE_KEY)) ?? 'null',
    ) as Partial<StoredState> | null;
    // v1 had no `level`, and behaved exactly as `individuals` does — so it is
    // read rather than discarded, and existing trust lists survive the upgrade.
    const version = parsed?.version;
    if (
      (version !== STATE_VERSION && version !== 1) ||
      typeof parsed?.entries !== 'object' ||
      !parsed.entries
    ) {
      return empty;
    }
    const entries: Record<string, Entry> = {};
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (entry && typeof entry === 'object') {
        entries[key] = {
          acct: typeof entry.acct === 'string' ? entry.acct : key,
          since: typeof entry.since === 'number' ? entry.since : 0,
        };
      }
    }
    return {
      version: STATE_VERSION,
      entries,
      expandAllCw: parsed.expandAllCw === true,
      showAllSensitive: parsed.showAllSensitive === true,
      level: TRUST_LEVELS.includes(parsed.level as TrustLevel)
        ? (parsed.level as TrustLevel)
        : 'individuals',
    };
  } catch {
    return empty;
  }
}
