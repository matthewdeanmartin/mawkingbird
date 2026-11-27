import { StatusReplacement, replaceStatus } from '../reconcile-status';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { Api } from '../../platform/api/api';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { Status } from '../../platform/api/models';
import { StatusCard } from '../../posts/status-card/status-card';
import { searchPostsForLink } from './link-search';

// i18n pages.linkTimeline.title: Posts about this link
// i18n pages.linkTimeline.open: Open the link
// i18n pages.linkTimeline.loading: Loading…
// i18n pages.linkTimeline.loadMore: Load more
// i18n pages.linkTimeline.empty: Nobody has shared this link in a post your server can see yet.
// i18n pages.linkTimeline.notTrending: Your server keeps a list of posts only for links that are trending there now, and this one isn't.
// i18n pages.linkTimeline.unsupported: Your server doesn't offer posts-about-a-link lists (it needs Mastodon 4.3 or newer).
// i18n pages.linkTimeline.failed: Could not load posts about this link. Try again.
// i18n pages.linkTimeline.retry: Retry
// i18n pages.linkTimeline.missingUrl: No link was given.
// i18n pages.linkTimeline.fromSearch: This link isn't trending on your server, so these are posts found by searching for it.
// i18n pages.linkTimeline.searchSite: Search posts mentioning {{host}}

/**
 * `/link?url=…`: posts sharing one link, from the signed-in server.
 *
 * Mastodon's link timeline (4.3+) only knows links trending on that server
 * right now, which is almost none of them. When it has nothing, the page falls
 * back to post search for the link (full URL, then without the scheme), one or
 * two calls and only then. When search finds nothing either, it offers a
 * search for the site's name, which is usually what finds something.
 */
@Component({
  selector: 'app-link-timeline',
  imports: [MbButton, MbContentState, RouterLink, StatusCard, TranslocoPipe],
  templateUrl: './link-timeline.html',
  styleUrl: './link-timeline.css',
})
export class LinkTimeline implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private transloco = inject(TranslocoService);
  private destroyRef = inject(DestroyRef);
  private sub: Subscription | null = null;

  protected url = signal('');
  protected host = signal('');
  protected statuses = signal<Status[]>([]);
  protected loading = signal(false);
  protected loadingMore = signal(false);
  protected hasMore = signal(false);
  /** A plain explanation instead of a feed (not trending, unsupported, no URL). */
  protected notice = signal('');
  protected failed = signal(false);
  /** The list came from post search, not the server's link timeline. */
  protected fromSearch = signal(false);

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.sub?.unsubscribe());
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const url = (params.get('url') ?? '').trim();
      this.url.set(url);
      this.host.set(hostOf(url));
      this.load();
    });
  }

  load(): void {
    this.sub?.unsubscribe();
    this.statuses.set([]);
    this.hasMore.set(false);
    this.failed.set(false);
    this.fromSearch.set(false);
    this.notice.set('');
    if (!/^https?:\/\//i.test(this.url())) {
      this.notice.set(this.transloco.translate('pages.linkTimeline.missingUrl'));
      return;
    }
    this.loading.set(true);
    this.sub = this.api
      .linkTimeline(this.url())
      .pipe(
        map((page): Status[] | null => (page.length ? page : null)),
        catchError((error: unknown) => {
          // Not trending, or a server without link timelines: try search. Any
          // other failure is a real one.
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.rememberNotTrending(error);
            return of(null);
          }
          throw error;
        }),
        switchMap((page) => (page ? of({ page, searched: false }) : this.searchForLink())),
      )
      .subscribe({
        next: ({ page, searched }) => {
          this.statuses.set(page);
          this.fromSearch.set(searched && page.length > 0);
          this.hasMore.set(!searched && page.length > 0);
          if (page.length) this.notice.set('');
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  /** The site's name, for "Search posts mentioning …" when nothing else found it. */
  protected siteSearchParams(): { q: string; type: string } {
    return { q: this.host(), type: 'statuses' };
  }

  loadMore(): void {
    const last = this.statuses().at(-1);
    if (!last || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.sub = this.api.linkTimeline(this.url(), last.id).subscribe({
      next: (page) => {
        this.statuses.update((list) => [...list, ...page]);
        this.hasMore.set(page.length > 0);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loadingMore.set(false);
        this.hasMore.set(false);
      },
    });
  }

  onChanged(index: number, updated: Status): void {
    this.statuses.update((list) => list.map((s, i) => (i === index ? updated : s)));
  }

  protected onReplaced(change: StatusReplacement): void {
    this.statuses.update((list) => replaceStatus(list, change));
  }

  onDeleted(removed: Status): void {
    this.statuses.update((list) => list.filter((s) => s.id !== removed.id));
  }

  /** Keeps the not-trending or unsupported sentence, shown only if search finds nothing. */
  private rememberNotTrending(error: HttpErrorResponse): void {
    // 404 is both "not trending here" (4.3+) and "no such endpoint" (older);
    // a 404 whose body names the record is the former.
    const body = JSON.stringify(error.error ?? '');
    this.notice.set(
      this.transloco.translate(
        /record not found/i.test(body)
          ? 'pages.linkTimeline.notTrending'
          : 'pages.linkTimeline.unsupported',
      ),
    );
  }

  private searchForLink(): Observable<{ page: Status[]; searched: boolean }> {
    return searchPostsForLink(this.api, this.url()).pipe(map((page) => ({ page, searched: true })));
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
