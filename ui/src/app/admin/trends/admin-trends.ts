import { MbButton } from '../../design-system/button/button';
import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { AdminApi, AdminLinkPublisher, AdminTrendLink } from '../admin-api';
import { Status, TrendingTag } from '../../models';
import { StatusCard } from '../../status-card/status-card';

// i18n adminTrends.hashtags: Trending hashtags
// i18n adminTrends.emptyTags: No trending tags.
// i18n adminTrends.uses.one: {{count}} use
// i18n adminTrends.uses.other: {{count}} uses
// i18n adminTrends.approve: Approve
// i18n adminTrends.reject: Reject
// i18n adminTrends.posts: Trending posts
// i18n adminTrends.loading: Loading…
// i18n adminTrends.emptyPosts: No trending posts.

/** Read-only trends viewer: trending hashtags and most-favourited statuses. */
@Component({
  selector: 'app-admin-trends',
  imports: [MbButton, RouterLink, StatusCard, TranslocoPipe],
  templateUrl: './admin-trends.html',
  styleUrl: './admin-trends.css',
})
export class AdminTrends implements OnInit {
  private api = inject(AdminApi);

  protected tags = signal<TrendingTag[]>([]);
  protected statuses = signal<Status[]>([]);
  protected loading = signal(true);

  /** Ids that have been approved/rejected this session, for transient feedback. */
  protected moderated = signal<Record<string, 'approved' | 'rejected'>>({});

  // i18n adminTrends.links: Links
  // i18n adminTrends.emptyLinks: No links are waiting for review.
  // i18n adminTrends.publishers: Publishers
  // i18n adminTrends.publishersHint: Sites whose links may trend once approved.
  // i18n adminTrends.emptyPublishers: No publishers are waiting for review.
  protected links = signal<AdminTrendLink[]>([]);
  protected publishers = signal<AdminLinkPublisher[]>([]);

  reviewLink(link: AdminTrendLink, approve: boolean): void {
    this.api
      .reviewTrendingLink(link.id, approve)
      .subscribe(() => this.mark('link-' + link.id, approve ? 'approved' : 'rejected'));
  }

  reviewPublisher(publisher: AdminLinkPublisher, approve: boolean): void {
    this.api
      .reviewLinkPublisher(publisher.id, approve)
      .subscribe(() => this.mark('publisher-' + publisher.id, approve ? 'approved' : 'rejected'));
  }

  ngOnInit(): void {
    // Older servers or limited roles may refuse these; the sections then stay empty.
    this.api.trendingLinks().subscribe({ next: (l) => this.links.set(l), error: () => undefined });
    this.api
      .linkPublishers()
      .subscribe({ next: (p) => this.publishers.set(p), error: () => undefined });
    this.api.trendingTags().subscribe((t) => this.tags.set(t));
    this.api.trendingStatuses().subscribe({
      next: (s) => {
        this.statuses.set(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Total uses across the tag's 7-day history (counts are strings in the API). */
  uses(tag: TrendingTag): number {
    return tag.history.reduce((sum, h) => sum + Number(h.uses), 0);
  }

  private mark(id: string, state: 'approved' | 'rejected'): void {
    this.moderated.update((m) => ({ ...m, [id]: state }));
  }

  approveTag(tag: TrendingTag): void {
    this.api.approveTrendingTag(tag.id).subscribe(() => this.mark('tag-' + tag.id, 'approved'));
  }

  rejectTag(tag: TrendingTag): void {
    this.api.rejectTrendingTag(tag.id).subscribe(() => this.mark('tag-' + tag.id, 'rejected'));
  }

  approveStatus(status: Status): void {
    this.api
      .approveTrendingStatus(status.id)
      .subscribe(() => this.mark('status-' + status.id, 'approved'));
  }

  rejectStatus(status: Status): void {
    this.api
      .rejectTrendingStatus(status.id)
      .subscribe(() => this.mark('status-' + status.id, 'rejected'));
  }
}
