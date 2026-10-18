import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { webSearchUrl } from '../search/web-query-serializer';

// i18n videoSearch.title: Search video
// i18n videoSearch.query: Search for
// i18n videoSearch.google: Search YouTube on Google
// i18n videoSearch.posts: Search posts instead
// i18n videoSearch.stubTitle: Video results are coming
// i18n videoSearch.stubBody: For now this hands your search to Google, limited to YouTube, in a new tab. Remove the site: part to search the whole web for video. Mawkingbird will show fediverse and YouTube video results here in a later release.
// i18n videoSearch.postsHint: Search posts looks through the fediverse with the regular search page, without the site: part.

/** Where a video search starts: Google, restricted to YouTube. */
export const VIDEO_SEARCH_PREFIX = 'site:youtube.com ';

/** The query without `site:` operators, for engines that do not understand them. */
export function withoutSiteOperators(query: string): string {
  return query
    .replace(/(^|\s)-?site:\S*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A video-only search, stubbed: Google with `site:youtube.com` prefilled, and a
 * hand-off to the regular post search. Sprint 3 of spec/top_level_menu.md puts
 * real results in the main column; the URL (`/videos/search?q=`) stays.
 *
 * Laid out on the header's tracks like /rss and /videos: the form sits in the
 * rail column under the brand, results take the centre and right columns.
 */
@Component({
  selector: 'app-video-search-page',
  imports: [FormsModule, RouterLink, TranslocoPipe, MbButton, MbField, MbControl],
  template: `
    <div class="video-search">
      <aside class="search-rail">
        <h1>{{ 'videoSearch.title' | transloco }}</h1>
        <form (ngSubmit)="searchGoogle()">
          <mb-field [label]="'videoSearch.query' | transloco">
            <input
              mbControl
              name="q"
              type="search"
              autocomplete="off"
              maxlength="500"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
            />
          </mb-field>
          <button mbButton type="submit" [disabled]="!searchable()">
            {{ 'videoSearch.google' | transloco }}
          </button>
        </form>
        <a
          mbButton
          variant="outline"
          routerLink="/search"
          [queryParams]="{ q: postQuery() || null }"
          >{{ 'videoSearch.posts' | transloco }}</a
        >
        <p class="muted small">{{ 'videoSearch.postsHint' | transloco }}</p>
      </aside>
      <section class="search-results" aria-live="polite">
        <h2>{{ 'videoSearch.stubTitle' | transloco }}</h2>
        <p>{{ 'videoSearch.stubBody' | transloco }}</p>
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .video-search {
      display: grid;
      /* The header's first track and gap, as on /rss and /videos. */
      grid-template-columns: 290px minmax(0, 1fr);
      gap: 16px;
      padding: 16px 0;
      align-items: start;
    }
    .search-rail,
    .search-results {
      padding: 1.2rem;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--col-bg);
    }
    .search-rail {
      display: grid;
      gap: 0.75rem;
      position: sticky;
      top: 12px;
    }
    form {
      display: grid;
      gap: 0.75rem;
    }
    h1 {
      font-size: 1.4rem;
      margin: 0;
    }
    h2 {
      font-size: 1.1rem;
      margin: 0 0 0.5rem;
    }
    p {
      margin: 0;
    }
    @media (max-width: 1000px) {
      .video-search {
        grid-template-columns: minmax(0, 1fr);
        padding-inline: 12px;
      }
      .search-rail {
        position: static;
      }
    }
  `,
})
export class VideoSearchPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly query = signal(
    this.route.snapshot.queryParamMap.get('q') ?? VIDEO_SEARCH_PREFIX,
  );
  /** Something to search for beyond the prefilled operator. */
  protected readonly searchable = computed(() => withoutSiteOperators(this.query()).length > 0);
  protected readonly postQuery = computed(() => withoutSiteOperators(this.query()));

  protected searchGoogle(): void {
    const query = this.query().trim();
    if (!this.searchable()) return;
    // Kept in the URL so Back and reload return to the same search.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: query },
      replaceUrl: true,
    });
    window.open(webSearchUrl('google', query), '_blank', 'noopener');
  }
}
