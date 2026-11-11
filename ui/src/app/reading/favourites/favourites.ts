import { Component, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { Status } from '../../platform/api/models';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { adaptFeedItem } from '../../connections/bluesky/bluesky-adapter';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { StatusCard } from '../../posts/status-card/status-card';
import { MbButton } from '../../design-system/button/button';

// i18n favourites.loading: Loading…
// i18n favourites.empty: You haven't liked anything yet.
// i18n favourites.loadMore: Load more

const PAGE_SIZE = 20;

/** Append a page, skipping posts already listed. */
function appendNew(current: Status[], incoming: Status[]): Status[] {
  const seen = new Set(current.map((status) => status.id));
  return [...current, ...incoming.filter((status) => !seen.has(status.id))];
}

@Component({
  selector: 'app-favourites',
  imports: [StatusCard, TranslocoPipe, MbButton],
  templateUrl: './favourites.html',
  styles: `
    .more {
      display: flex;
      justify-content: center;
      padding: 1rem;
    }
  `,
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
    if (this.auth.isMisskeyPrimary) {
      // Misskey reactions and favourites are not read yet (roadmap M2/M3), and
      // the Mastodon path has no token here: show the empty list, not a 401.
      this.loading.set(false);
      return;
    }
    if (this.auth.isBlueskyPrimary) {
      this.loadBluesky(null);
      return;
    }
    this.loadMastodon(null);
  }

  protected loadMore(): void {
    const cursor = this.cursor();
    if (!cursor || this.loadingMore() || this.auth.isMisskeyPrimary) return;
    if (this.auth.isBlueskyPrimary) this.loadBluesky(cursor);
    else this.loadMastodon(cursor);
  }

  /**
   * Favourites page by an internal favourite id that only the `Link` header
   * carries, so the cursor comes from there rather than the last post's id.
   */
  private loadMastodon(cursor: string | null): void {
    this.loadingMore.set(cursor !== null);
    this.api.favouritesPage(cursor ?? undefined, PAGE_SIZE).subscribe({
      next: ({ statuses, nextMaxId }) => {
        this.statuses.update((current) => appendNew(current, statuses));
        this.cursor.set(statuses.length ? nextMaxId : null);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.error.set("Couldn't load Mastodon favourites.");
      },
    });
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
        this.statuses.update((current) => appendNew(current, incoming));
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
