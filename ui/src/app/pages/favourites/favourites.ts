import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { BlueskyApi } from '../../providers/bluesky/bluesky-api';
import { adaptFeedItem } from '../../providers/bluesky/bluesky-adapter';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { StatusCard } from '../../status-card/status-card';

// i18n favourites.loading: Loading…
// i18n favourites.empty: You haven't liked anything yet.
// i18n favourites.loadMore: Load more

@Component({
  selector: 'app-favourites',
  imports: [StatusCard, TranslocoPipe],
  templateUrl: './favourites.html',
})
export class Favourites implements OnInit {
  private api = inject(Api);
  protected auth = inject(Auth);
  private blueskyApi = inject(BlueskyApi);
  private blueskySession = inject(BlueskySession);

  protected statuses = signal<Status[]>([]);
  protected loading = signal(true);
  protected loadingMore = signal(false);
  protected cursor = signal<string | null>(null);
  protected error = signal<string | null>(null);

  ngOnInit(): void {
    if (this.auth.isBlueskyPrimary) {
      this.loadBluesky(null);
      return;
    }
    this.api.favourites().subscribe({
      next: (s) => {
        this.statuses.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set("Couldn't load Mastodon favourites.");
      },
    });
  }

  protected loadMore(): void {
    const cursor = this.cursor();
    if (!cursor || this.loadingMore()) return;
    this.loadBluesky(cursor);
  }

  private loadBluesky(cursor: string | null): void {
    const did = this.blueskySession.session()?.did;
    if (!did) {
      this.loading.set(false);
      this.error.set(
        "Couldn't load Bluesky likes — your link may have expired. Re-link in Settings → Connections.",
      );
      return;
    }
    this.loadingMore.set(cursor !== null);
    this.error.set(null);
    this.blueskyApi.getActorLikes(did, cursor).subscribe({
      next: (page) => {
        const incoming = page.feed.map((item) => ({
          ...adaptFeedItem(item),
          favourited: true,
        }));
        this.statuses.update((current) => {
          const seen = new Set(current.map((status) => status.id));
          return [...current, ...incoming.filter((status) => !seen.has(status.id))];
        });
        this.cursor.set(page.cursor ?? null);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.error.set(
          "Couldn't load Bluesky likes — your link may have expired. Re-link in Settings → Connections.",
        );
      },
    });
  }

  onChanged(index: number, updated: Status): void {
    if (!updated.favourited) {
      this.statuses.update((list) => list.filter((_, i) => i !== index));
      return;
    }
    this.statuses.update((list) => list.map((s, i) => (i === index ? updated : s)));
  }

  onDeleted(removed: Status): void {
    this.statuses.update((list) => list.filter((s) => s.id !== removed.id));
  }
}
