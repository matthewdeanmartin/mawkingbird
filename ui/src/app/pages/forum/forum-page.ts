import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, of } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { MbBadge } from '../../design-system/badge/badge';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbPageHeader } from '../../design-system/page-header/page-header';
import {
  compareSummaries,
  DiscussionSummary,
  filterSummaries,
  FORUM_FILTERS,
  ForumFilter,
  ForumSort,
  Participant,
  personKey,
} from '../../forum/discussion';
import {
  DEEPER_STEPS,
  ForumScan,
  ForumSource,
  MAX_SCAN_CALLS,
  parseSource,
  sourceParam,
} from '../../forum/forum-scan';
import { HumanTimePipe } from '../../human-time.pipe';
import { UserList } from '../../models';
import { StatusCard } from '../../status-card/status-card';

// i18n forum.title: Forum
// i18n forum.intro.talk: Conversations in your feed, traced back to where they started.
// i18n forum.intro.asked: Discussions that start with a question.
// i18n forum.intro.friends: Discussions started by people you follow.
// i18n forum.intro.mine: Discussions you started.
// i18n forum.intro.joined: Discussions you replied to.
// i18n forum.source.label: Look in
// i18n forum.source.home: Home timeline
// i18n forum.source.me: My posts and mentions
// i18n forum.source.tag: A hashtag
// i18n forum.source.list: List: {{title}}
// i18n forum.source.tagLabel: Hashtag
// i18n forum.source.scan: Scan
// i18n forum.sort.label: Sort
// i18n forum.sort.recent: Recent
// i18n forum.sort.popular: Popular
// i18n forum.progress: {{posts}} posts read · {{discussions}} discussions · {{calls}} of {{allowance}} calls
// i18n forum.scanning: Looking for discussions…
// i18n forum.stop: Stop
// i18n forum.deeper: Scan deeper (+{{count}} calls)
// i18n forum.deeperTitle: Spend up to {{count}} more calls on this feed. A scan stops at {{max}}.
// i18n forum.state.stopped: Stopped. Showing what was found so far.
// i18n forum.state.spent: Calls used up for now.
// i18n forum.state.ceiling: This scan has used its {{max}} calls.
// i18n forum.state.exhausted: Nothing more to find in this feed.
// i18n forum.state.rateLimited: Your server asked to slow down. Showing what was found so far.
// i18n forum.state.failed: Couldn't read this feed.
// i18n forum.resort: Sort the list again
// i18n forum.empty.title: No discussions here yet
// i18n forum.empty.description: A discussion needs at least two people. Scanning deeper reads more of the feed.
// i18n forum.empty.filtered: None of the discussions found so far fit this tab.
// i18n forum.mastodonOnly: Forum needs a Mastodon account: it follows replies across servers.
// i18n forum.card.question: Question
// i18n forum.card.partial: Partial thread
// i18n forum.card.partialTitle: The start of this conversation could not be reached.
// i18n forum.card.stats: {{replies}} replies · {{people}} people
// i18n forum.card.friends: {{count}} friends replied
// i18n forum.card.latest: Latest {{time}}
// i18n forum.card.open: Open discussion
// i18n forum.card.participants: People in this discussion

const SORTS: readonly ForumSort[] = ['recent', 'popular'];

function asFilter(value: string | null): ForumFilter {
  return FORUM_FILTERS.includes(value as ForumFilter) ? (value as ForumFilter) : 'talk';
}

function asSort(value: string | null): ForumSort {
  return SORTS.includes(value as ForumSort) ? (value as ForumSort) : 'recent';
}

/**
 * Forum mode's list: discussions found by a budgeted scan of one feed. The
 * tabs in the mode nav are this page's filters (`?filter=`). See spec/forum.md.
 */
@Component({
  selector: 'app-forum-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbBadge,
    MbButton,
    MbContentState,
    MbControl,
    MbField,
    MbPageHeader,
    HumanTimePipe,
    StatusCard,
  ],
  templateUrl: './forum-page.html',
  styleUrl: './forum-page.css',
})
export class ForumPage {
  protected scan = inject(ForumScan);
  protected auth = inject(Auth);
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected readonly maxCalls = MAX_SCAN_CALLS;
  protected readonly sorts = SORTS;

  private params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected filter = computed(() => asFilter(this.params().get('filter')));
  protected sort = computed(() => asSort(this.params().get('sort')));
  private source = computed(() => parseSource(this.params().get('source')));

  /** The picker's draft, applied by Scan. */
  protected draftKind = signal<'home' | 'tag' | string>('home');
  protected draftTag = signal('');
  protected lists = toSignal(this.api.lists().pipe(catchError(() => of([] as UserList[]))), {
    initialValue: [] as UserList[],
  });

  /** Every discussion in this tab, in its ideal order. */
  private ideal = computed(() =>
    filterSummaries(this.scan.summaries(), this.filter()).sort(compareSummaries(this.sort())),
  );
  /**
   * The order on screen. Results land while the reader is looking, so rows
   * already shown keep their place and new ones join at the end; "Sort the
   * list again" restores the ideal order (spec/forum.md, Budget).
   */
  private order = signal<string[]>([]);
  protected shown = computed(() => {
    const byKey = new Map(this.ideal().map((summary) => [summary.discussion.key, summary]));
    return this.order()
      .map((key) => byKey.get(key))
      .filter((summary): summary is DiscussionSummary => !!summary);
  });
  protected unsorted = computed(() => {
    const ideal = this.ideal().map((summary) => summary.discussion.key);
    const order = this.order();
    return ideal.length === order.length && ideal.some((key, index) => key !== order[index]);
  });

  /** Scan deeper's choices, each capped by what the ceiling leaves; no repeats. */
  protected deeperOptions = computed(() => [
    ...new Set(DEEPER_STEPS.map((step) => Math.min(step, this.scan.headroom()))),
  ]);

  protected stateMessage = computed(() => {
    switch (this.scan.state()) {
      case 'stopped':
        return 'forum.state.stopped';
      case 'spent':
        return this.scan.headroom() > 0 ? 'forum.state.spent' : 'forum.state.ceiling';
      case 'exhausted':
        return 'forum.state.exhausted';
      case 'rateLimited':
        return 'forum.state.rateLimited';
      case 'failed':
        return 'forum.state.failed';
      default:
        return null;
    }
  });

  constructor() {
    // Back from a discussion returns here: remember the query, and put the
    // reader back where they were once the router's scroll-to-top has run.
    effect(() => {
      const params = this.params();
      untracked(() => {
        this.scan.listParams = Object.fromEntries(
          params.keys.map((key) => [key, params.get(key) ?? '']),
        );
      });
    });
    const returnTo = this.scan.listScroll;
    afterNextRender(() => {
      if (returnTo) requestAnimationFrame(() => window.scrollTo(0, returnTo));
    });
    inject(DestroyRef).onDestroy(() => (this.scan.listScroll = window.scrollY));
    // The scan outlives the page: switching tabs or coming back is free. Only
    // a different source starts over.
    effect(() => {
      const source = this.source();
      untracked(() => {
        this.syncDraft(source);
        const current = this.scan.source();
        if (this.auth.lacksMastodonToken) return;
        if (!current || sourceParam(current) !== sourceParam(source)) this.scan.start(source);
      });
    });
    // Tab or sort changed: show the ideal order.
    effect(() => {
      this.filter();
      this.sort();
      this.scan.source();
      untracked(() => this.resort());
    });
    // New results: keep what is shown in place, append the rest.
    effect(() => {
      const ideal = this.ideal().map((summary) => summary.discussion.key);
      untracked(() => {
        const present = new Set(ideal);
        const kept = this.order().filter((key) => present.has(key));
        const keptSet = new Set(kept);
        this.order.set([...kept, ...ideal.filter((key) => !keptSet.has(key))]);
      });
    });
  }

  protected resort(): void {
    this.order.set(this.ideal().map((summary) => summary.discussion.key));
  }

  private syncDraft(source: ForumSource): void {
    if (source.kind === 'tag') {
      this.draftKind.set('tag');
      this.draftTag.set(source.name);
    } else {
      this.draftKind.set(sourceParam(source));
    }
  }

  protected applySource(): void {
    const kind = this.draftKind();
    const tag = this.draftTag().trim().replace(/^#/, '');
    const source: ForumSource =
      kind === 'tag' && tag
        ? { kind: 'tag', name: tag }
        : parseSource(kind === 'tag' ? 'home' : kind);
    const param = sourceParam(source);
    if (
      param === this.params().get('source') ||
      (!this.params().get('source') && param === 'home')
    ) {
      // Same source asked for again: a fresh scan, as the button promises.
      this.scan.start(source);
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { source: param === 'home' ? null : param },
      queryParamsHandling: 'merge',
    });
  }

  protected setSort(sort: ForumSort): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: sort === 'recent' ? null : sort },
      queryParamsHandling: 'merge',
    });
  }

  /** Up to five faces, people I follow first. */
  protected faces(summary: DiscussionSummary): Participant[] {
    const following = this.scan.following();
    return [...summary.participants]
      .sort(
        (left, right) =>
          Number(following.has(personKey(right.account))) -
          Number(following.has(personKey(left.account))),
      )
      .slice(0, 5);
  }
}
