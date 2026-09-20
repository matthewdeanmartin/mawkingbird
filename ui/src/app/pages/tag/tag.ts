import { TagMedia } from './tag-media';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TagActions } from '../../tag-actions/tag-actions';
import { Component, computed, inject, DestroyRef, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api';
import { Status, Tag as TagEntity } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { FeedAnalytics } from '../../feed-analytics/feed-analytics';
import { FeedMembers } from '../../feed-members/feed-members';
import { FeedSource } from '../../feed-sample';
import { Auth } from '../../auth';
import { AnonymousTags } from '../../providers/anonymous/anonymous-tags';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { AnonymousProviderRef } from '../../providers/anonymous/anonymous-mastodon-provider';
import { Observable } from 'rxjs';
import { Terminology } from '../../terminology';

/** Posts per request when sampling the tag — Mastodon's cap. */
const SAMPLE_PAGE_SIZE = 40;

// i18n pages.tag.following: Following
// i18n pages.tag.follow: Follow
// i18n pages.tag.featured: Featured
// i18n pages.tag.feature: Feature
// i18n pages.tag.inBundles.one: In {{count}} bundle
// i18n pages.tag.inBundles.other: In {{count}} bundles
// i18n pages.tag.addToBundle: Add to bundle
// i18n pages.tag.full: · full
// i18n pages.tag.noBundlesYet: No bundles yet — name one below.
// i18n pages.tag.newBundleName: New bundle name
// i18n pages.tag.createAndAdd: Create & add
// i18n pages.tag.tabs.media: Media
// i18n pages.tag.tabs.feed: Feed
// i18n pages.tag.tabs.members: Members
// i18n pages.tag.tabs.analytics: Analytics
// i18n pages.tag.loading: Loading…
// i18n pages.tag.noStatuses: No statuses tagged #{{tag}}.
// i18n pages.tag.myPosts: My {{posts}}
// i18n pages.tag.mine.summary: {{visible}} of the {{total}} loaded {{posts}}. Load more to search further back.
// i18n pages.tag.mine.none: None of the {{total}} loaded {{posts}} are yours.
// i18n pages.tag.loadMore: Load more
@Component({
  selector: 'app-tag',
  imports: [TagMedia, TagActions, StatusCard, FeedAnalytics, FeedMembers, TranslocoPipe],
  templateUrl: './tag.html',
  styleUrl: './tag.css',
})
export class Tag implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  protected mediaVisited = signal(false);
  protected auth = inject(Auth);
  private anonymousTags = inject(AnonymousTags);
  private anonymous = inject(AnonymousAccount);
  private anonymousPublic = inject(AnonymousPublicApi);

  /** post/tweet/florp, per the Blue setting. */
  protected words = inject(Terminology).words;

  protected tag = signal('');
  protected tagInfo = signal<TagEntity | null>(null);
  protected statuses = signal<Status[]>([]);
  protected loading = signal(true);
  protected loadingMore = signal(false);
  protected exhausted = signal(false);
  protected tab = signal<'posts' | 'media' | 'members' | 'analytics'>('posts');

  /**
   * The feed the Members and Analytics tabs sample. Rebuilt whenever the tag
   * changes so both restart; pages at Mastodon's 40-post cap, so 100 posts
   * costs three calls rather than five. Both tabs are only rendered once
   * opened, so building this signal doesn't fetch anything on its own.
   */
  protected feedSource = computed<FeedSource>(() => {
    const tag = this.tag();
    return {
      type: 'hashtag',
      query: '#' + tag,
      pageSize: SAMPLE_PAGE_SIZE,
      fetch: (after: Status | null) =>
        this.getTimeline(tag, after ? this.nativeStatusId(after) : undefined, SAMPLE_PAGE_SIZE),
    };
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const tag = params.get('tag');
      if (tag) {
        this.tag.set(tag);
        this.mediaVisited.set(false);
        this.tab.set('posts');
        this.load(tag);
      }
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const tab = params.get('tab');
      this.tab.set(tab === 'media' || tab === 'members' || tab === 'analytics' ? tab : 'posts');
      if (tab === 'media') this.mediaVisited.set(true);
    });
  }

  setTab(tab: 'posts' | 'media' | 'members' | 'analytics'): void {
    this.tab.set(tab);
    if (tab === 'media') this.mediaVisited.set(true);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'posts' ? null : tab, photo: null },
      queryParamsHandling: 'merge',
    });
  }

  // ------------------------------------------------------------- "My posts"

  /** Whether the feed is narrowed to the signed-in user's own posts. */
  protected mineOnly = signal(false);

  /**
   * Offered only when there is a "me" to filter by.
   *
   * Anonymous sessions have no own-posts to find, so the control is hidden
   * rather than shown returning nothing.
   */
  protected canFilterMine = computed(() => !this.auth.isAnonymous && !!this.auth.account());

  protected toggleMine(): void {
    this.mineOnly.update((on) => !on);
  }

  /**
   * The posts to render: everything loaded, or only mine.
   *
   * Filtered client-side over what has been loaded rather than re-queried as
   * `#tag from:me`. The search DSL does support `from:` — it is verified
   * working on mastodon.social — but post search needs an index that most
   * servers do not have and anonymous callers never get, so a search-backed
   * version would work here and silently return nothing there. Filtering what
   * we already hold works everywhere.
   *
   * The cost is that this searches the loaded window, not all of history, which
   * is why the UI says so rather than implying completeness.
   */
  protected visibleStatuses = computed(() => {
    if (!this.mineOnly()) {
      return this.statuses();
    }
    const me = this.auth.account()?.id;
    if (!me) {
      return this.statuses();
    }
    // Compare against the *original* author for boosts: a post of mine that
    // someone else boosted is still mine.
    return this.statuses().filter((status) => (status.reblog ?? status).account?.id === me);
  });

  load(tag: string): void {
    this.loading.set(true);
    this.statuses.set([]);
    this.exhausted.set(false);
    this.getTag(tag).subscribe({
      next: (info) =>
        this.tagInfo.set({
          ...info,
          following: this.auth.isAnonymous ? this.anonymousTags.has(info.name) : info.following,
        }),
      error: () => {
        if (this.auth.isAnonymous) {
          this.tagInfo.set({
            id: tag,
            name: tag,
            url: '',
            history: [],
            following: this.anonymousTags.has(tag),
            featuring: false,
          });
        }
      },
    });
    this.getTimeline(tag).subscribe({
      next: (s) => {
        this.statuses.set(s);
        this.exhausted.set(s.length < 20);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadMore(): void {
    const last = this.statuses().at(-1);
    if (!last || this.loadingMore() || this.exhausted()) return;
    this.loadingMore.set(true);
    this.getTimeline(this.tag(), this.nativeStatusId(last)).subscribe({
      next: (statuses) => {
        const seen = new Set(this.statuses().map((status) => status.id));
        this.statuses.update((current) => [
          ...current,
          ...statuses.filter((status) => !seen.has(status.id)),
        ]);
        this.exhausted.set(statuses.length < 20);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  private getTag(name: string): Observable<TagEntity> {
    return this.auth.isAnonymous
      ? this.anonymousPublic.getTag(this.anonymous.server(), name)
      : this.api.getTag(name);
  }

  private getTimeline(name: string, maxId?: string, limit?: number): Observable<Status[]> {
    return this.auth.isAnonymous
      ? this.anonymousPublic.getTagTimeline(this.anonymous.server(), name, maxId, limit)
      : this.api.tagTimeline(name, maxId, limit);
  }

  private nativeStatusId(status: Status): string {
    const ref = status.providerRef as Partial<AnonymousProviderRef> | undefined;
    return status.provider === 'anonymous-mastodon' && typeof ref?.statusId === 'string'
      ? ref.statusId
      : status.id;
  }

  /**
   * Replace a post by id rather than by row index.
   *
   * The rendered list can be a *filtered* view ("My posts"), so a card's index
   * on screen is not its index in `statuses()` — updating by position would
   * write the change onto whichever unrelated post happened to sit there.
   */
  onChanged(updated: Status): void {
    this.statuses.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  onDeleted(removed: Status): void {
    this.statuses.update((list) => list.filter((s) => s.id !== removed.id));
  }
}
