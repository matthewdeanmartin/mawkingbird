import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../api';
import { Auth } from '../auth';
import { AuthorRow, feedAuthors, pct } from '../feed-metrics';
import { FeedSource, isSupplied, sampleFeed } from '../feed-sample';
import { FollowButton } from '../follow-button/follow-button';
import { FollowState, RELATIONSHIP_BATCH } from '../follow-state';
import { Status } from '../models';
import { Terminology } from '../terminology';

/** Sample sizes the user can pick between on a paged feed. */
export const SAMPLE_CHOICES = [50, 100, 200] as const;
/** Default sample: 100 posts, three requests at Mastodon's 40-post page cap. */
export const DEFAULT_SAMPLE = 100;
/**
 * How many of the sampled authors to resolve follow state for. The list is
 * sorted most-prolific-first, so this is the top of it; resolving hundreds of
 * one-post authors would spend requests on rows nobody scrolls to.
 */
const MAX_RESOLVED_AUTHORS = 80;

/**
 * "Who is in this feed", for feeds that have no membership list of their own.
 *
 * A Mastodon list has real members you can add and remove. A hashtag doesn't,
 * and neither does a merged synthetic feed — so their membership is *emergent*:
 * whoever showed up in a sample of recent posts. That distinction is stated in
 * the UI rather than papered over, because "members" here can change every time
 * you look.
 *
 * Shares the sampling machinery with `FeedAnalytics`, so opening both tabs on
 * one feed costs two independent samples — deliberate, since each tab is
 * lazily mounted and neither should depend on the other having been opened.
 */
// i18n feedMembers.loading: Looking at who's posting…
// i18n feedMembers.error: Couldn't sample this feed — try again later.
// i18n feedMembers.empty: Nobody has posted here yet.
// i18n feedMembers.summary.one: The {{accountCount}} account that wrote the {{postCount}} {{posts}} sampled from this feed. There's no membership list for a feed like this — these are just the people posting in it right now.
// i18n feedMembers.summary.other: The {{accountCount}} accounts that wrote the {{postCount}} {{posts}} sampled from this feed. There's no membership list for a feed like this — these are just the people posting in it right now.
// i18n feedMembers.sample.sizeAria: Sample size
// i18n feedMembers.sample.label: Sample:
// i18n feedMembers.sample.optionTitle: Sample {{count}} {{posts}}
// i18n feedMembers.sample.refresh: Look again
// i18n feedMembers.botTag.title: This account is marked as automated
// i18n feedMembers.botTag.label: bot
// i18n feedMembers.share.title: {{pct}}% of the sampled posts
// i18n feedMembers.postCount.one: {{count}} {{posts}}
// i18n feedMembers.postCount.other: {{count}} {{posts}}
@Component({
  selector: 'app-feed-members',
  imports: [RouterLink, FollowButton, TranslocoPipe],
  templateUrl: './feed-members.html',
  styleUrl: './feed-members.css',
})
export class FeedMembers {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private api = inject(Api);
  private auth = inject(Auth);
  protected follows = inject(FollowState);

  /** The feed whose authors to list. Changing it restarts collection. */
  readonly source = input.required<FeedSource>();

  protected readonly sampleChoices = SAMPLE_CHOICES;
  protected sampleSize = signal<number>(DEFAULT_SAMPLE);

  protected loading = signal(true);
  protected error = signal(false);
  protected posts = signal<Status[]>([]);
  protected apiCalls = signal(0);
  /** True once the batched relationships call has come back. */
  protected followsResolved = signal(false);

  constructor() {
    effect(() => {
      const source = this.source();
      const size = this.sampleSize();
      untracked(() => this.collect(source, size));
    });
  }

  private collect(source: FeedSource, size: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.posts.set([]);
    this.apiCalls.set(0);
    this.followsResolved.set(false);
    sampleFeed(source, size).subscribe((sample) => {
      this.posts.set(sample.posts);
      this.apiCalls.set(sample.apiCalls);
      this.error.set(sample.failed);
      this.loading.set(false);
      this.resolveFollows(sample.posts);
    });
  }

  /**
   * Resolve follow state for the sampled authors, so each row can offer Follow.
   *
   * Delegated to {@link FollowState} rather than kept here: a follow made from
   * this list, from a collection page, or from a profile is the same fact, and
   * three components caching it separately meant a button that had just been
   * clicked elsewhere still said "Follow". The shared service also fixed the
   * batch size — this file asked for 80 ids, over Mastodon's documented cap of
   * 40, and everything past the cap came back missing and read as "not
   * followed".
   */
  private resolveFollows(posts: Status[]): void {
    if (this.auth.isAnonymous || !posts.length) {
      return;
    }
    const ids = this.authors()
      .slice(0, MAX_RESOLVED_AUTHORS)
      .map((row) => row.account.id);
    void this.follows.resolve(ids).then(() => {
      this.apiCalls.update((n) => n + Math.ceil(ids.length / RELATIONSHIP_BATCH));
      this.followsResolved.set(true);
    });
  }

  /** Synthetic feeds are handed over whole, so there is no sample size to pick. */
  protected paged = computed(() => !isSupplied(this.source()));

  /** The people in the feed, most prolific first. */
  protected authors = computed<AuthorRow[]>(() => feedAuthors(this.posts()));

  /** True once relationships resolved and this account is followed. */
  isFollowed(row: AuthorRow): boolean {
    return this.follows.status(row.account.id) === 'following';
  }

  /** Whether follow state is known at all (it never is for anonymous viewers). */
  protected knowsFollows = computed(() => this.followsResolved());

  setSampleSize(size: number): void {
    if (size !== this.sampleSize()) {
      this.sampleSize.set(size);
    }
  }

  /** Re-collect against the same feed, for a fresh look at who's posting. */
  refresh(): void {
    this.collect(this.source(), this.sampleSize());
  }

  pct = pct;
}
