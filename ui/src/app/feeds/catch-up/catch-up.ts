import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { FeedAggregator } from '../feed-aggregator';
import { AlgoViewTabs } from '../algo/algo-view-tabs';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { scopedKey } from '../../platform/session/account-scope';
import { Terminology } from '../../i18n/terminology';
import { StatusCard } from '../../posts/status-card/status-card';
import { StatusVisibility } from '../../moderation/status-visibility';
import { Wellness } from '../../wellness/wellness';
import { CalmVerdicts } from '../calm-verdicts';
import {
  AuthorGroup,
  CATCH_UP_KINDS,
  CATCH_UP_MAX_POSTS,
  CATCH_UP_RANGES,
  CatchUpKind,
  CatchUpRange,
  CatchUpSession,
  CatchUpSort,
  groupByAuthor,
  matchesKind,
  normalizeHistory,
  overlapping,
  rangeStart,
  recordSession,
} from './catch-up-model';

/** Account-scoped: one persona's catch-up history is not another's. */
export const CATCH_UP_KEY_BASE = 'mockingbird_catch_up';

/** English source strings; see scripts/extract-i18n.mjs. */
// i18n pages.catchUp.title: Catch-up
// i18n pages.catchUp.intro: Everything the people you follow posted since a point in time, grouped by person, with an end. Finish it and the next catch-up starts from there.
// i18n pages.catchUp.range: Since
// i18n pages.catchUp.range.last: Last catch-up
// i18n pages.catchUp.range.hours: {{count}} hours ago
// i18n pages.catchUp.range.hour: 1 hour ago
// i18n pages.catchUp.start: Catch up
// i18n pages.catchUp.startingAt: Starts from {{time}}.
// i18n pages.catchUp.firstTime: Your first catch-up covers the last 12 hours.
// i18n pages.catchUp.overlap: You already caught up on part of this, up to {{time}}.
// i18n pages.catchUp.loading: Gathering {{posts}}… {{count}} so far.
// i18n pages.catchUp.error: Catch-up couldn't load. Nothing was recorded; try again.
// i18n pages.catchUp.summary: {{count}} {{posts}} from {{people}} people since {{time}}.
// i18n pages.catchUp.capped: That's the most one catch-up loads ({{max}}). Older {{posts}} in this range were skipped.
// i18n pages.catchUp.kind.all: Everything
// i18n pages.catchUp.kind.originals: Originals
// i18n pages.catchUp.kind.replies: Replies
// i18n pages.catchUp.kind.boosts: Boosts
// i18n pages.catchUp.kind.links: Links
// i18n pages.catchUp.kind.media: Pictures and video
// i18n pages.catchUp.kinds: Show
// i18n pages.catchUp.sort: Order
// i18n pages.catchUp.sort.people: Most active first
// i18n pages.catchUp.sort.recent: Most recent first
// i18n pages.catchUp.personCount: {{count}} {{posts}}
// i18n pages.catchUp.noneOfKind: Nothing of that kind in this catch-up.
// i18n pages.catchUp.empty: Nothing new since {{time}}. That's a good place to be.
// i18n pages.catchUp.end.title: That's everyone.
// i18n pages.catchUp.end.body: You've reached the end of this catch-up. Finish it to start the next one from here.
// i18n pages.catchUp.finish: Finish catch-up
// i18n pages.catchUp.finished: Caught up. See you next time.
// i18n pages.catchUp.again: Start another
// i18n pages.catchUp.history: Earlier catch-ups
// i18n pages.catchUp.historyRow: {{from}} – {{to}}: {{count}} {{posts}} from {{people}} people
// i18n pages.catchUp.signedOut: Catch-up reads the people you follow, so it needs a signed-in account.

type Phase = 'start' | 'loading' | 'ready' | 'error' | 'finished';

/**
 * Algo → Catch-up: a bounded, finishable session over followed accounts.
 *
 * Loads through its **own** {@link FeedAggregator} (component-scoped provider),
 * so every network Home merges is here too, while Home's paging state is left
 * alone. The aggregator's explicit cutoff stops it at the session boundary.
 */
@Component({
  selector: 'app-catch-up',
  imports: [AlgoViewTabs, DatePipe, StatusCard, TranslocoPipe],
  providers: [FeedAggregator],
  templateUrl: './catch-up.html',
  styleUrl: './catch-up.css',
})
export class CatchUp implements OnDestroy {
  protected auth = inject(Auth);
  private aggregator = inject(FeedAggregator);
  private visibility = inject(StatusVisibility);
  private calm = inject(CalmVerdicts);
  private wellness = inject(Wellness);
  protected words = inject(Terminology).words;

  protected readonly ranges = CATCH_UP_RANGES;
  protected readonly kinds = CATCH_UP_KINDS;
  protected readonly maxPosts = CATCH_UP_MAX_POSTS;

  protected phase = signal<Phase>('start');
  protected range = signal<CatchUpRange>('last');
  protected kind = signal<CatchUpKind>('all');
  protected sort = signal<CatchUpSort>('people');
  protected history = signal<CatchUpSession[]>(this.loadHistory());
  protected posts = signal<Status[]>([]);
  protected capped = signal(false);
  /** Which people are expanded; collapsed by default so 60 people is 60 rows. */
  protected open = signal<ReadonlySet<string>>(new Set());
  /** The boundaries of the session on screen, fixed when it was loaded. */
  protected session = signal<{ from: number; to: number } | null>(null);
  private cancelled = false;

  protected readonly signedIn = computed(() => !this.auth.isAnonymous);

  protected readonly start = computed(() =>
    rangeStart(this.range(), Date.now(), this.history()[0] ?? null),
  );
  protected readonly overlap = computed(() =>
    this.range() === 'last' ? null : overlapping(this.start(), this.history()),
  );

  /** What the reader would actually see: moderation and Calm applied. */
  private readonly readable = computed(() =>
    this.posts().filter(
      (status) =>
        !this.visibility.rendersNothing(status) &&
        !(this.wellness.calm() && this.calm.hidden(status)),
    ),
  );

  protected readonly allGroups = computed(() => groupByAuthor(this.readable(), this.sort()));
  protected readonly groups = computed(() =>
    groupByAuthor(
      this.readable().filter((status) => matchesKind(status, this.kind())),
      this.sort(),
    ),
  );

  protected rangeLabel(range: CatchUpRange): string {
    return range === 'last'
      ? 'pages.catchUp.range.last'
      : range === 1
        ? 'pages.catchUp.range.hour'
        : 'pages.catchUp.range.hours';
  }

  protected chooseRange(value: string): void {
    const range = CATCH_UP_RANGES.find((option) => String(option) === value);
    if (range !== undefined) this.range.set(range);
  }

  protected groupKey(group: AuthorGroup): string {
    return `${group.posts[0]?.provider ?? 'mastodon'}:${group.account.id}`;
  }

  protected toggle(group: AuthorGroup): void {
    const key = this.groupKey(group);
    this.open.update((open) => {
      const next = new Set(open);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected isOpen(group: AuthorGroup): boolean {
    return this.open().has(this.groupKey(group));
  }

  async begin(): Promise<void> {
    const from = this.start();
    const to = Date.now();
    this.session.set({ from, to });
    this.posts.set([]);
    this.capped.set(false);
    this.open.set(new Set());
    this.kind.set('all');
    this.phase.set('loading');
    this.cancelled = false;
    try {
      this.aggregator.reset(from);
      let collected: Status[] = [];
      while (!this.cancelled && this.aggregator.hasMore()) {
        const page = await firstValueFrom(this.aggregator.nextPage());
        // Posts newer than the moment we started belong to the next catch-up.
        collected = [...collected, ...page.filter((status) => Date.parse(status.created_at) <= to)];
        this.posts.set(collected);
        if (collected.length >= CATCH_UP_MAX_POSTS) {
          this.capped.set(this.aggregator.hasMore() || collected.length > CATCH_UP_MAX_POSTS);
          collected = collected.slice(0, CATCH_UP_MAX_POSTS);
          this.posts.set(collected);
          break;
        }
        if (!page.length && !this.aggregator.hasMore()) break;
      }
      if (!this.cancelled) this.phase.set('ready');
    } catch {
      if (!this.cancelled) this.phase.set('error');
    }
  }

  finish(): void {
    const session = this.session();
    if (!session) return;
    const next = recordSession(this.history(), {
      from: session.from,
      to: session.to,
      posts: this.readable().length,
      people: this.allGroups().length,
    });
    this.history.set(next);
    try {
      localStorage.setItem(scopedKey(CATCH_UP_KEY_BASE), JSON.stringify(next));
    } catch {
      // Storage full or blocked: the session still ended; the next one will
      // just start from the previous boundary.
    }
    this.phase.set('finished');
    window.scrollTo?.({ top: 0 });
  }

  again(): void {
    this.range.set('last');
    this.phase.set('start');
  }

  private loadHistory(): CatchUpSession[] {
    try {
      return normalizeHistory(
        JSON.parse(localStorage.getItem(scopedKey(CATCH_UP_KEY_BASE)) ?? '[]'),
      );
    } catch {
      return [];
    }
  }

  ngOnDestroy(): void {
    this.cancelled = true;
  }
}
