import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../design-system/button/button';
import { MbDisclosure } from '../design-system/disclosure/disclosure';
import { MbIdentityRow } from '../design-system/identity/identity-row';
import { MbSpinner } from '../design-system/identity/spinner';
import { MbContentLink, MbMetadata } from '../design-system/metadata/metadata';
import { MbNotice } from '../design-system/notice/notice';
import { MbProgress } from '../design-system/progress/progress';
import { MbToolbar, MbToolbarButton } from '../design-system/toolbar/toolbar';
import { Api } from '../platform/api/api';
import { Server } from '../platform/http/server';
import { MastodonMe } from '../connections/mastodon/mastodon-me';
import { saveCsv } from '../settings/import-export/save-csv';
import { twitterArchiveCsv } from '../settings/import-export/twitter-archive';
import type { UnbirdPerson } from './unbird-archive';
import { PUBLIC_SEARCH_SERVER, SearchVia, UnbirdMatcher } from './unbird-matcher';
import { StoredMatch } from './unbird-store';

// i18n unbird.people.found.one: {{count}} of your people is on Mastodon
// i18n unbird.people.found.other: {{count}} of your people are on Mastodon
// i18n unbird.people.foundNone: Looking for your people on Mastodon
// i18n unbird.people.progress: Checked {{searched}} of {{total}}, closest first
// i18n unbird.people.progressLabel: Search progress
// i18n unbird.people.searchingVia: Searching {{server}}…
// i18n unbird.people.searchingHome: Searching your server…
// i18n unbird.people.keepLooking: Keep looking ({{count}} left)
// i18n unbird.people.start: Find my people
// i18n unbird.people.stop: Pause
// i18n unbird.people.rateLimited: The server asked us to slow down. Wait a few minutes, then keep looking; nothing is lost.
// i18n unbird.people.allChecked: Everyone with a known handle has been checked.
// i18n unbird.people.noHandle: {{count}} accounts you followed never appear by name in your tweets, so the archive has no handle to search for. They may still be on Mastodon.
// i18n unbird.people.active: Show
// i18n unbird.people.active.year: Active this year
// i18n unbird.people.active.twoYears: Active in 2 years
// i18n unbird.people.active.all: Everyone
// i18n unbird.people.quiet: {{count}} more found who have not posted in that time.
// i18n unbird.people.chip.mutual: Twitter mutual
// i18n unbird.people.chip.friend: Twitter friend
// i18n unbird.people.chip.talked: Talked {{count}} times
// i18n unbird.people.maybe: Maybe
// i18n unbird.people.bot: Bot
// i18n unbird.people.follow: Follow
// i18n unbird.people.following: Following
// i18n unbird.people.followFailed: Could not follow. Try again, or open their profile.
// i18n unbird.people.followAll: Follow all {{count}} likely matches
// i18n unbird.people.already: Already following on Mastodon ({{count}})
// i18n unbird.people.csv: Download the list (CSV)

/** How recently a match must have posted to be shown. */
export type ActiveWithin = 'year' | 'twoYears' | 'all';

const DAY_MS = 24 * 60 * 60 * 1000;
const WITHIN_DAYS: Record<ActiveWithin, number> = { year: 365, twoYears: 730, all: Infinity };
/** Following-list pages read at most (80 each), to know who is already followed. */
const FOLLOWING_PAGES = 60;

/**
 * Whether a match posted recently enough. Many accounts made in the 2022–23
 * wave were abandoned within weeks, so the default hides anyone quiet for a
 * year. `last_status_at` comes with every search result: no extra request.
 * A match that never posted, or whose server did not say, is shown only
 * under "Everyone".
 */
export function activeWithin(match: StoredMatch, within: ActiveWithin, now = Date.now()): boolean {
  if (within === 'all') return true;
  const last = Date.parse(match.lastStatusAt ?? '');
  return Number.isFinite(last) && now - last <= WITHIN_DAYS[within] * DAY_MS;
}

/**
 * Who from the archive is on Mastodon, closest first.
 *
 * Every follow is a button the reader presses, and "Follow all" covers only
 * likely matches. People the reader already follows on Mastodon are set
 * aside, and the reader's own account never appears. A wrong follow is cheap
 * to undo; that is why following is offered and blocking is not.
 */
@Component({
  selector: 'app-unbird-people',
  imports: [
    RouterLink,
    MbButton,
    MbContentLink,
    MbDisclosure,
    MbIdentityRow,
    MbMetadata,
    MbNotice,
    MbProgress,
    MbSpinner,
    MbToolbar,
    MbToolbarButton,
    TranslocoPipe,
  ],
  templateUrl: './unbird-people.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './unbird-people.css',
})
export class UnbirdPeople {
  protected readonly matcher = inject(UnbirdMatcher);
  private readonly api = inject(Api, { optional: true });
  private readonly mastodonMe = inject(MastodonMe, { optional: true });
  private readonly server = inject(Server, { optional: true });
  protected readonly publicServer = PUBLIC_SEARCH_SERVER;

  /** `public` before sign-in (view only); `account` once signed in to Mastodon (follow). */
  readonly via = input<SearchVia>('public');

  protected readonly within = signal<ActiveWithin>('year');
  protected readonly withinChoices: ActiveWithin[] = ['year', 'twoYears', 'all'];
  protected readonly follows = signal<ReadonlyMap<string, 'busy' | 'done' | 'failed'>>(new Map());
  /** Full handles the reader follows on Mastodon, lower-cased. */
  protected readonly alreadyFollowing = signal<ReadonlySet<string>>(new Set());
  /** The reader's own Mastodon handle, lower-cased, so they are never offered themselves. */
  protected readonly self = signal<string | null>(null);

  private readonly allFound = computed(() =>
    this.matcher
      .searchable()
      .map((person) => ({ person, match: this.matcher.row(person)?.matches[0] ?? null }))
      .filter((entry): entry is { person: UnbirdPerson; match: StoredMatch } => !!entry.match)
      .filter((entry) => entry.match.acct.toLowerCase() !== this.self()),
  );
  /** Matches to offer: not followed yet, and active within the chosen time. */
  protected readonly found = computed(() =>
    this.allFound().filter(
      (entry) => !this.isFollowing(entry.match.acct) && activeWithin(entry.match, this.within()),
    ),
  );
  protected readonly counts = computed(
    () =>
      Object.fromEntries(
        this.withinChoices.map((within) => [
          within,
          this.allFound().filter(
            (entry) => !this.isFollowing(entry.match.acct) && activeWithin(entry.match, within),
          ).length,
        ]),
      ) as Record<ActiveWithin, number>,
  );
  protected readonly quiet = computed(
    () =>
      this.allFound().filter(
        (entry) => !this.isFollowing(entry.match.acct) && !activeWithin(entry.match, this.within()),
      ).length,
  );
  protected readonly followed = computed(() =>
    this.allFound().filter((entry) => this.isFollowing(entry.match.acct)),
  );
  protected readonly unfollowedLikely = computed(() =>
    this.found().filter(
      (entry) => entry.match.confidence === 'likely' && !this.follows().has(entry.match.acct),
    ),
  );
  /** Followed accounts the archive never names: no handle to search. */
  protected readonly noHandle = computed(
    () =>
      (this.matcher.archive()?.people ?? []).filter(
        (person) => person.currently_following && !person.twitter_handle,
      ).length,
  );

  constructor() {
    effect(() => {
      const me = this.mastodonMe?.account();
      const server = this.server?.baseUrl();
      this.alreadyFollowing.set(new Set());
      this.self.set(null);
      if (this.via() !== 'account' || !me || !server) return;
      untracked(() => void this.loadFollowing());
    });
  }

  protected fmt(count: number): string {
    return count.toLocaleString();
  }

  protected talked(person: UnbirdPerson): number {
    return person.reply_count + person.mention_count;
  }

  protected search(): void {
    void this.matcher.search(this.via());
  }

  protected downloadCsv(): void {
    const archive = this.matcher.archive();
    if (archive) saveCsv(twitterArchiveCsv(archive.people), 'twitter-people.csv');
  }

  /** Followed before this visit; a follow made here stays in the list, marked Following. */
  private isFollowing(acct: string): boolean {
    return this.alreadyFollowing().has(acct.toLowerCase());
  }

  /**
   * Who the reader already follows, read once from their own following list
   * (80 a page) rather than one relationship lookup per match.
   */
  private async loadFollowing(): Promise<void> {
    const me = this.mastodonMe?.account();
    if (!this.api || !me) return;
    const host = hostOf(this.server?.baseUrl() ?? '');
    const full = (acct: string) => (acct.includes('@') ? acct : `${acct}@${host}`).toLowerCase();
    this.self.set(full(me.acct));
    const accts = new Set<string>();
    let maxId: string | undefined;
    for (let page = 0; page < FOLLOWING_PAGES; page++) {
      try {
        const result = await firstValueFrom(this.api.accountFollowingPage(me.id, maxId));
        if (
          this.mastodonMe?.account()?.id !== me.id ||
          hostOf(this.server?.baseUrl() ?? '') !== host
        )
          return;
        for (const account of result.accounts) accts.add(full(account.acct));
        this.alreadyFollowing.set(new Set(accts));
        if (!result.nextMaxId) break;
        maxId = result.nextMaxId;
      } catch {
        break;
      }
    }
  }

  /** Resolve the handle on the reader's own server, then follow it there. */
  protected async follow(acct: string): Promise<void> {
    if (!this.api || this.follows().get(acct) === 'busy' || this.follows().get(acct) === 'done')
      return;
    this.setFollow(acct, 'busy');
    try {
      const result = await firstValueFrom(
        this.api.search(acct, 'accounts', { resolve: true, limit: 5 }),
      );
      const target = (result.accounts ?? []).find(
        (account) => sameAcct(account.acct, acct) || sameAcct(account.url, acct),
      );
      if (!target) throw new Error('not found');
      await firstValueFrom(this.api.follow(target.id));
      this.setFollow(acct, 'done');
    } catch {
      this.setFollow(acct, 'failed');
    }
  }

  protected async followAll(): Promise<void> {
    for (const entry of this.unfollowedLikely()) {
      await this.follow(entry.match.acct);
    }
  }

  private setFollow(acct: string, state: 'busy' | 'done' | 'failed'): void {
    this.follows.update((follows) => new Map(follows).set(acct, state));
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * `bob@host` against a search result's full handle or profile URL. A bare local
 * `bob` is not enough: it is only the same person when the reader's server is
 * `host`, and then the profile URL says so.
 */
export function sameAcct(candidate: string, acct: string): boolean {
  const [user, host] = acct.toLowerCase().split('@');
  const value = candidate.toLowerCase();
  return value === `${user}@${host}` || value === `https://${host}/@${user}`;
}
