import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Api } from '../../platform/api/api';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { Status } from '../../platform/api/models';
import { StatusCard } from '../../posts/status-card/status-card';

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

/** `/link?url=…`: posts sharing one trending link, from the signed-in server. */
@Component({
  selector: 'app-link-timeline',
  imports: [MbButton, MbContentState, StatusCard, TranslocoPipe],
  templateUrl: './link-timeline.html',
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
    this.notice.set('');
    if (!/^https?:\/\//i.test(this.url())) {
      this.notice.set(this.transloco.translate('pages.linkTimeline.missingUrl'));
      return;
    }
    this.loading.set(true);
    this.sub = this.api.linkTimeline(this.url()).subscribe({
      next: (page) => {
        this.statuses.set(page);
        this.hasMore.set(page.length > 0);
        this.loading.set(false);
      },
      error: (error: unknown) => this.fail(error),
    });
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

  onDeleted(removed: Status): void {
    this.statuses.update((list) => list.filter((s) => s.id !== removed.id));
  }

  private fail(error: unknown): void {
    this.loading.set(false);
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    // 404 is both "not trending here" (4.3+) and "no such endpoint" (older);
    // a 404 whose body names the record is the former.
    if (status === 404) {
      const body = error instanceof HttpErrorResponse ? JSON.stringify(error.error ?? '') : '';
      this.notice.set(
        this.transloco.translate(
          /record not found/i.test(body)
            ? 'pages.linkTimeline.notTrending'
            : 'pages.linkTimeline.unsupported',
        ),
      );
      return;
    }
    this.failed.set(true);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
