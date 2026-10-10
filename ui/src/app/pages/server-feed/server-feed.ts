import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, Subscription } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Account, Status, TrendLink } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { authorsOf, ServerFeedKind } from '../../lists/list-source';
import { serverFeedDef } from '../../lists/server-feeds';
import { JustMyServer } from '../../just-my-server';
import { MbButton } from '../../design-system/button/button';
import { RecentFeeds } from '../../recent-feeds';
import { otherServerHost } from '../../other-server-url';
import { OtherServerFeeds } from '../../providers/other-server-feeds';
import { anonymousAccountRouteRef } from '../../providers/anonymous/anonymous-route-ref';

// i18n pagesServerFeed.shortcuts.serverFriends: 👥 Server Friends
// i18n pagesServerFeed.loading: Loading…
// i18n pagesServerFeed.back: ← Server feeds
// i18n pagesServerFeed.remoteRestricted: {{server}} requires its own account or does not offer this public feed.
// i18n pagesServerFeed.retry: Try again
// i18n pagesServerFeed.pinFull: All recent feed slots are pinned. Unpin a feed in Feeds to make room.
// i18n pagesServerFeed.news.empty: No trending news right now.
// i18n pagesServerFeed.tabs.posts: Posts
// i18n pagesServerFeed.tabs.members: Members
// i18n pagesServerFeed.posts.empty: Nothing here right now.
// i18n pagesServerFeed.posts.loading: Loading…
// i18n pagesServerFeed.posts.loadMore: Load more
// i18n pagesServerFeed.members.empty: No authors yet — load some posts first.
// i18n pagesServerFeed.members.summary.one: Members are the {{count}} distinct author of the posts loaded so far. Load more posts to discover more.
// i18n pagesServerFeed.members.summary.other: Members are the {{count}} distinct authors of the posts loaded so far. Load more posts to discover more.
// i18n pagesServerFeed.title.fallback: Feed
// i18n pagesServerFeed.notice.newsLoadError: Could not load news links.
// i18n pagesServerFeed.notice.signInRequired: Sign in to view this timeline. Anonymous sessions can only browse Trending and News.
// i18n pagesServerFeed.notice.loadError: Could not load this feed.

/**
 * A built-in server feed presented as a list. Two content shapes:
 *  - posts (Fediverse / Local / Trending): a feed of statuses plus a Members
 *    tab of the distinct authors of the loaded posts, computed lazily on first
 *    open (see sprint/lists-0-overview.md).
 *  - links (News): trending preview cards; no members (there are no authors).
 *
 * Federated/local timelines 422 anonymously on mastodon.social and are disabled
 * outright on some instances; the Lists page probes them and only links here
 * when they return data, so this page rarely hits an empty timeline.
 */
@Component({
  selector: 'app-server-feed',
  imports: [RouterLink, StatusCard, TranslocoPipe, MbButton],
  templateUrl: './server-feed.html',
  styleUrl: './server-feed.css',
})
export class ServerFeed implements OnInit {
  private api = inject(Api);
  private remoteFeeds = inject(OtherServerFeeds);
  private recent = inject(RecentFeeds);
  private destroyRef = inject(DestroyRef);
  private pageSub?: Subscription;
  protected remoteHost = signal<string | null>(null);
  protected remoteRoute = false;
  protected pinNotice = signal('');
  protected feedUrl = computed(() =>
    this.remoteHost()
      ? `/feeds/servers/${encodeURIComponent(this.remoteHost()!)}/${this.feed()}`
      : `/feeds/${this.feed()}`,
  );
  protected pinned = computed(() =>
    this.recent.entries().some((entry) => entry.url === this.feedUrl() && entry.pinned),
  );
  private route = inject(ActivatedRoute);
  private transloco = inject(TranslocoService);
  protected auth = inject(Auth);
  protected justMyServer = inject(JustMyServer);

  protected feed = signal<ServerFeedKind>('trending');
  protected statuses = signal<Status[]>([]);
  protected links = signal<TrendLink[]>([]);
  protected loading = signal(true);
  protected loadingMore = signal(false);
  protected exhausted = signal(false);
  protected notice = signal('');
  protected tab = signal<'posts' | 'members'>('posts');

  protected def = computed(() => serverFeedDef(this.feed()));
  protected title = computed(
    () =>
      (this.def()?.title ?? this.transloco.translate('pagesServerFeed.title.fallback')) +
      (this.remoteHost() ? ` · ${this.remoteHost()}` : ''),
  );
  protected isLinks = computed(() => this.def()?.content === 'links');
  protected showServerFriendsShortcut = computed(
    () => !this.remoteHost() && this.feed() === 'local' && this.justMyServer.effectiveEnabled(),
  );

  // Synthetic members are computed lazily: only once the Members tab is opened,
  // and memoized against the statuses snapshot it was computed from.
  private membersComputedFor: Status[] | null = null;
  protected members = signal<Account[]>([]);

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.pageSub?.unsubscribe());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.remoteRoute = params.has('server');
      this.remoteHost.set(otherServerHost(params.get('server')));
      const raw = params.get('feed');
      const feed: ServerFeedKind =
        raw === 'federated' || raw === 'local' || raw === 'trending' || raw === 'news'
          ? raw
          : 'trending';
      this.feed.set(feed);
      this.tab.set('posts');
      this.membersComputedFor = null;
      this.members.set([]);
      this.load();
    });
  }

  protected togglePin(): void {
    if (this.remoteRoute && !this.remoteHost()) return;
    this.recent.visit({ url: this.feedUrl(), label: this.title() });
    if (!this.recent.entries().some((entry) => entry.url === this.feedUrl())) {
      this.pinNotice.set(this.transloco.translate('pagesServerFeed.pinFull'));
      return;
    }
    this.recent.togglePin(this.feedUrl());
    this.pinNotice.set('');
  }

  protected memberLink(account: Account): string[] {
    const host = this.remoteHost();
    return [
      '/accounts',
      host
        ? anonymousAccountRouteRef({
            server: `https://${host}`,
            id: account.id,
            originalUrl: account.url || undefined,
          })
        : account.id,
    ];
  }

  private feedError(error: HttpErrorResponse, fallback: string): void {
    this.loading.set(false);
    this.loadingMore.set(false);
    this.notice.set(
      this.remoteHost() && [401, 403, 422].includes(error.status)
        ? this.transloco.translate('pagesServerFeed.remoteRestricted', {
            server: this.remoteHost(),
          })
        : this.transloco.translate(fallback),
    );
  }

  private request(maxId?: string): Observable<Status[]> {
    const remote = this.remoteHost();
    if (remote) return this.remoteFeeds.statuses(remote, this.feed(), maxId);
    switch (this.feed()) {
      case 'federated':
        return this.api.publicTimeline(false, maxId);
      case 'local':
        return this.api.publicTimeline(true, maxId);
      case 'trending':
      case 'news': // unused for news (handled in load), but keeps the switch total
        return this.api.trendingStatuses();
    }
  }

  load(): void {
    this.pageSub?.unsubscribe();
    this.loadingMore.set(false);
    this.pinNotice.set('');
    this.membersComputedFor = null;
    this.members.set([]);
    this.statuses.set([]);
    this.links.set([]);
    this.notice.set('');
    if (this.remoteRoute && !this.remoteHost()) {
      this.loading.set(false);
      this.exhausted.set(true);
      this.notice.set(this.transloco.translate('otherServers.invalid'));
      return;
    }
    this.recent.visit({ url: this.feedUrl(), label: this.title() });

    if (this.isLinks()) {
      this.exhausted.set(true);
      this.loading.set(true);
      const request = this.remoteHost()
        ? this.remoteFeeds.news(this.remoteHost()!)
        : this.api.trendingLinks();
      this.pageSub = request.subscribe({
        next: (l) => {
          this.links.set(l);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) =>
          this.feedError(error, 'pagesServerFeed.notice.newsLoadError'),
      });
      return;
    }

    // Trending is a single non-paged snapshot; the timelines page.
    this.exhausted.set(this.feed() === 'trending');
    if (!this.remoteHost() && this.def()?.authRequired && this.auth.isAnonymous) {
      this.loading.set(false);
      this.notice.set(this.transloco.translate('pagesServerFeed.notice.signInRequired'));
      return;
    }
    this.loading.set(true);
    this.pageSub = this.request().subscribe({
      next: (s) => {
        this.statuses.set(s);
        this.loading.set(false);
        this.exhausted.set(this.feed() === 'trending' || !s.length);
      },
      error: (error: HttpErrorResponse) =>
        this.feedError(error, 'pagesServerFeed.notice.loadError'),
    });
  }

  loadMore(): void {
    if (this.loading() || this.loadingMore() || this.exhausted() || !this.statuses().length) {
      return;
    }
    const last = this.statuses().at(-1);
    const ref = last?.providerRef as { statusId?: string } | undefined;
    const maxId = ref?.statusId ?? last?.id;
    this.loadingMore.set(true);
    this.notice.set('');
    this.pageSub = this.request(maxId).subscribe({
      next: (s) => {
        this.statuses.update((cur) => {
          const seen = new Set(cur.map((status) => status.id));
          return [...cur, ...s.filter((status) => !seen.has(status.id))];
        });
        this.loadingMore.set(false);
        this.exhausted.set(!s.length);
        // A larger post set may add authors; recompute if members are on screen.
        if (this.tab() === 'members') {
          this.computeMembers();
        }
      },
      error: (error: HttpErrorResponse) =>
        this.feedError(error, 'pagesServerFeed.notice.loadError'),
    });
  }

  setTab(tab: 'posts' | 'members'): void {
    this.tab.set(tab);
    if (tab === 'members') {
      this.computeMembers();
    }
  }

  /** Lazily derive synthetic members from the loaded posts, memoized against
   *  the exact statuses snapshot so repeated tab switches don't rework it. */
  private computeMembers(): void {
    const snapshot = this.statuses();
    if (this.membersComputedFor === snapshot) {
      return;
    }
    this.membersComputedFor = snapshot;
    this.members.set(authorsOf(snapshot));
  }

  onChanged(index: number, updated: Status): void {
    this.statuses.update((list) => list.map((s, i) => (i === index ? updated : s)));
  }

  onDeleted(removed: Status): void {
    this.statuses.update((list) => list.filter((s) => s.id !== removed.id));
  }
}
