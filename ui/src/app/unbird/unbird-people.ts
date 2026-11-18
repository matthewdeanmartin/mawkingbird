import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../design-system/button/button';
import { Api } from '../platform/api/api';
import { saveCsv } from '../settings/import-export/save-csv';
import { twitterArchiveCsv } from '../settings/import-export/twitter-archive';
import type { UnbirdPerson } from './unbird-archive';
import { FIRST_PASS, PUBLIC_SEARCH_SERVER, SearchVia, UnbirdMatcher } from './unbird-matcher';
import { StoredMatch } from './unbird-store';

// i18n unbird.people.found.one: {{count}} of your people is on Mastodon
// i18n unbird.people.found.other: {{count}} of your people are on Mastodon
// i18n unbird.people.foundNone: Looking for your people on Mastodon
// i18n unbird.people.progress: Checked {{searched}} of {{total}}, closest first
// i18n unbird.people.searchingVia: Searching {{server}}…
// i18n unbird.people.searchingHome: Searching your server…
// i18n unbird.people.keepLooking: Keep looking ({{count}} more)
// i18n unbird.people.start: Find my people
// i18n unbird.people.stop: Pause
// i18n unbird.people.rateLimited: The server asked us to slow down. Wait a few minutes, then keep looking; nothing is lost.
// i18n unbird.people.allChecked: Everyone with a known handle has been checked.
// i18n unbird.people.noHandle: {{count}} accounts you followed never appear by name in your tweets, so the archive has no handle to search for. They may still be on Mastodon.
// i18n unbird.people.chip.following: You followed
// i18n unbird.people.chip.mutual: Followed you back
// i18n unbird.people.chip.replies: {{count}} replies
// i18n unbird.people.chip.mentions: {{count}} mentions
// i18n unbird.people.maybe: Maybe
// i18n unbird.people.bot: Bot
// i18n unbird.people.follow: Follow
// i18n unbird.people.following: Following
// i18n unbird.people.followFailed: Could not follow. Try again, or open their profile.
// i18n unbird.people.view: View
// i18n unbird.people.followAll: Follow all {{count}} likely matches
// i18n unbird.people.csv: Download the list (CSV)
// i18n unbird.people.signals: Why we think so

/**
 * Who from the archive is on Mastodon, closest first.
 *
 * Every follow is a button the reader presses, and "Follow all" covers only
 * likely matches (username or profile link equals the Twitter handle). A wrong
 * follow is cheap to undo; that is why following is offered and blocking is not.
 */
@Component({
  selector: 'app-unbird-people',
  imports: [MbButton, TranslocoPipe],
  templateUrl: './unbird-people.html',
  styleUrl: './unbird-people.css',
})
export class UnbirdPeople {
  protected readonly matcher = inject(UnbirdMatcher);
  private readonly api = inject(Api, { optional: true });
  protected readonly publicServer = PUBLIC_SEARCH_SERVER;

  /** `public` before sign-in (view only); `account` once signed in to Mastodon (follow). */
  readonly via = input<SearchVia>('public');

  protected readonly follows = signal<ReadonlyMap<string, 'busy' | 'done' | 'failed'>>(new Map());
  protected readonly firstPass = FIRST_PASS;

  protected readonly found = computed(() =>
    this.matcher
      .searchable()
      .map((person) => ({ person, match: this.matcher.row(person)?.matches[0] ?? null }))
      .filter((entry): entry is { person: UnbirdPerson; match: StoredMatch } => !!entry.match),
  );
  protected readonly likely = computed(() =>
    this.found().filter((entry) => entry.match.confidence === 'likely'),
  );
  protected readonly unfollowedLikely = computed(() =>
    this.likely().filter((entry) => !this.follows().has(entry.match.acct)),
  );
  /** Followed accounts the archive never names: no handle to search. */
  protected readonly noHandle = computed(
    () =>
      (this.matcher.archive()?.people ?? []).filter(
        (person) => person.currently_following && !person.twitter_handle,
      ).length,
  );

  protected fmt(count: number): string {
    return count.toLocaleString();
  }

  protected search(): void {
    void this.matcher.search(this.via(), FIRST_PASS);
  }

  protected downloadCsv(): void {
    const archive = this.matcher.archive();
    if (archive) saveCsv(twitterArchiveCsv(archive.people), 'twitter-people.csv');
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
