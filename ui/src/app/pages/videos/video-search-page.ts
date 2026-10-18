import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { Status } from '../../models';
import { SupporterStatus } from '../../providers/account/supporter-status';
import { VideoSearch, withoutSiteOperators } from '../../providers/videos/video-search';
import { VideoSubscriptions } from '../../providers/videos/video-subscriptions';
import { YoutubeFeeds, YoutubeSearchItem } from '../../providers/videos/youtube-feeds';
import { StatusCard } from '../../status-card/status-card';
import { VideoSource, youtubeSource } from '../../video-player/media-source';
import { VideoPlayer } from '../../video-player/video-player';
import { webSearchUrl } from '../search/web-query-serializer';

// i18n videoSearch.title: Search video
// i18n videoSearch.query: Search for
// i18n videoSearch.submit: Search
// i18n videoSearch.youtubeType: YouTube results
// i18n videoSearch.google: Search YouTube on Google ↗
// i18n videoSearch.posts: Search all posts
// i18n videoSearch.tagsNote: Fediverse video comes from the hashtags {{tags}}, plus your server's post search when you are signed in. Only posts with a video are kept.
// i18n videoSearch.postsHeading: Fediverse posts
// i18n videoSearch.youtubeHeading: YouTube
// i18n videoSearch.searching: Searching…
// i18n videoSearch.noPosts: No fediverse posts with video matched. Try a single word, which is searched as a hashtag.
// i18n videoSearch.noYoutube: No YouTube results.
// i18n videoSearch.youtubeFailed: Couldn't search YouTube. Try again later.
// i18n videoSearch.start: Search fediverse posts and YouTube for video
// i18n videoSearch.startHint: Words are searched as hashtags across the fediverse; YouTube search comes with Mawkingbird Plus.
// i18n videoSearch.watch: Watch
// i18n videoSearch.subscribe: Subscribe
// i18n videoSearch.subscribed: Subscribed

/**
 * Video-only search: fediverse posts that carry video, and YouTube.
 *
 * Laid out on the header's tracks like /rss and /videos: the form sits in the
 * rail column under the brand, results take the centre and right columns. The
 * query lives in `?q=`, so Back, reload and shared links repeat the search.
 * See spec/top_level_menu.md, Sprint 3.
 */
@Component({
  selector: 'app-video-search-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbContentState,
    MbField,
    MbControl,
    StatusCard,
    VideoPlayer,
  ],
  template: `
    <div class="video-search">
      <aside class="search-rail">
        <h1>{{ 'videoSearch.title' | transloco }}</h1>
        <form (ngSubmit)="submit()">
          <mb-field [label]="'videoSearch.query' | transloco">
            <input
              mbControl
              name="q"
              type="search"
              autocomplete="off"
              maxlength="200"
              [ngModel]="draft()"
              (ngModelChange)="draft.set($event)"
            />
          </mb-field>
          @if (supporter.isSupporter()) {
            <mb-field [label]="'videoSearch.youtubeType' | transloco">
              <select
                mbControl
                name="type"
                [ngModel]="youtubeType()"
                (ngModelChange)="youtubeType.set($event)"
              >
                <option value="video">{{ 'videos.videoResults' | transloco }}</option>
                <option value="channel">{{ 'videos.channelResults' | transloco }}</option>
              </select>
            </mb-field>
          }
          <button mbButton type="submit" [disabled]="!draftSearchable()">
            {{ 'videoSearch.submit' | transloco }}
          </button>
        </form>
        <a
          mbButton
          variant="outline"
          routerLink="/search"
          [queryParams]="{ q: draftWords() || null }"
          >{{ 'videoSearch.posts' | transloco }}</a
        >
        <button
          mbButton
          variant="outline"
          type="button"
          [disabled]="!draftSearchable()"
          (click)="searchGoogle()"
        >
          {{ 'videoSearch.google' | transloco }}
        </button>
      </aside>

      <div class="search-results">
        @if (!query()) {
          <mb-content-state
            [title]="'videoSearch.start' | transloco"
            [description]="'videoSearch.startHint' | transloco"
          />
        } @else {
          <section [attr.aria-label]="'videoSearch.postsHeading' | transloco" aria-live="polite">
            <h2>{{ 'videoSearch.postsHeading' | transloco }}</h2>
            @if (tags().length) {
              <p class="muted small">
                {{ 'videoSearch.tagsNote' | transloco: { tags: tagList() } }}
              </p>
            }
            @if (postsLoading()) {
              <p role="status">{{ 'videoSearch.searching' | transloco }}</p>
            } @else {
              @for (status of posts(); track status.id) {
                <app-status-card [status]="status" (changed)="replace($event)" />
              } @empty {
                <p class="muted">{{ 'videoSearch.noPosts' | transloco }}</p>
              }
            }
          </section>

          <section [attr.aria-label]="'videoSearch.youtubeHeading' | transloco" aria-live="polite">
            <h2>{{ 'videoSearch.youtubeHeading' | transloco }}</h2>
            @if (!supporter.isSupporter()) {
              <p>{{ 'videos.plusSearch' | transloco }}</p>
              <a routerLink="/settings/mawkingbird-plus">{{ 'videos.plus' | transloco }}</a>
            } @else if (youtubeLoading()) {
              <p role="status">{{ 'videoSearch.searching' | transloco }}</p>
            } @else if (youtubeFailed()) {
              <p role="alert">{{ 'videoSearch.youtubeFailed' | transloco }}</p>
            } @else {
              @for (item of youtube(); track item.id) {
                <article class="video-result">
                  <h3>{{ item.title }}</h3>
                  <p class="muted small">{{ item.channelTitle }}</p>
                  @if (sourceFor(item); as source) {
                    <app-video-player-controls [source]="source" [inline]="true" />
                  }
                  <footer>
                    @if (item.videoId) {
                      <a
                        mbButton
                        variant="outline"
                        size="small"
                        routerLink="/watch"
                        [queryParams]="{ youtube: item.videoId }"
                        >{{ 'videoSearch.watch' | transloco }}</a
                      >
                    }
                    @if (item.channelId; as id) {
                      <button
                        mbButton
                        variant="outline"
                        size="small"
                        type="button"
                        [disabled]="subs.has(id)"
                        (click)="subs.add(id, item.channelTitle)"
                      >
                        {{
                          (subs.has(id) ? 'videoSearch.subscribed' : 'videoSearch.subscribe')
                            | transloco
                        }}
                      </button>
                    }
                  </footer>
                </article>
              } @empty {
                <p class="muted">{{ 'videoSearch.noYoutube' | transloco }}</p>
              }
            }
          </section>
        }
      </div>
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
    .search-results section {
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
    .search-results {
      display: grid;
      gap: 16px;
      min-width: 0;
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
    .video-result {
      padding: 0.75rem 0;
      border-top: 1px solid var(--border);
    }
    .video-result h3 {
      font-size: 1rem;
      margin: 0 0 0.25rem;
    }
    .video-result footer {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.5rem;
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
  private readonly search = inject(VideoSearch);
  private readonly youtubeFeeds = inject(YoutubeFeeds);
  protected readonly supporter = inject(SupporterStatus);
  protected readonly subs = inject(VideoSubscriptions);

  /** What the box holds; `query` is what was last searched (the URL's). */
  protected readonly draft = signal('');
  protected readonly query = signal('');
  protected readonly youtubeType = signal<'video' | 'channel'>('video');

  protected readonly draftWords = computed(() => withoutSiteOperators(this.draft()));
  protected readonly draftSearchable = computed(() => this.draftWords().length > 0);
  protected readonly tags = computed(() => this.search.tagsFor(this.query()));
  protected readonly tagList = computed(() =>
    this.tags()
      .map((tag) => `#${tag}`)
      .join(', '),
  );

  protected readonly posts = signal<Status[]>([]);
  protected readonly postsLoading = signal(false);
  protected readonly youtube = signal<YoutubeSearchItem[]>([]);
  protected readonly youtubeLoading = signal(false);
  protected readonly youtubeFailed = signal(false);

  private postsRequest?: Subscription;
  private generation = 0;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const q = (params.get('q') ?? '').slice(0, 200);
      this.draft.set(q);
      this.run(q);
    });
    inject(DestroyRef).onDestroy(() => this.postsRequest?.unsubscribe());
  }

  protected submit(): void {
    if (!this.draftSearchable()) return;
    const q = this.draft().trim();
    if (q === this.query()) {
      this.run(q, true);
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q } });
  }

  protected searchGoogle(): void {
    const words = this.draftWords();
    if (!words) return;
    window.open(webSearchUrl('google', `site:youtube.com ${words}`), '_blank', 'noopener');
  }

  protected sourceFor(item: YoutubeSearchItem): VideoSource | null {
    const source = item.videoId
      ? youtubeSource(`https://www.youtube.com/watch?v=${item.videoId}`)
      : null;
    return source
      ? {
          ...source,
          title: item.title,
          poster: `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`,
        }
      : null;
  }

  protected replace(updated: Status): void {
    this.posts.update((posts) => posts.map((post) => (post.id === updated.id ? updated : post)));
  }

  /** Both sources at once; a newer search discards whatever an older one returns. */
  private run(q: string, force = false): void {
    if (!force && q === this.query()) return;
    this.query.set(q);
    const generation = ++this.generation;
    this.postsRequest?.unsubscribe();
    this.posts.set([]);
    this.youtube.set([]);
    this.youtubeFailed.set(false);
    if (!withoutSiteOperators(q)) {
      this.postsLoading.set(false);
      this.youtubeLoading.set(false);
      return;
    }
    this.postsLoading.set(true);
    this.postsRequest = this.search.posts(q).subscribe((posts) => {
      if (generation !== this.generation) return;
      this.posts.set(posts);
      this.postsLoading.set(false);
    });
    if (!this.supporter.isSupporter()) return;
    this.youtubeLoading.set(true);
    this.youtubeFeeds
      .search(withoutSiteOperators(q), this.youtubeType())
      .then((items) => {
        if (generation === this.generation) this.youtube.set(items);
      })
      .catch(() => {
        if (generation === this.generation) this.youtubeFailed.set(true);
      })
      .finally(() => {
        if (generation === this.generation) this.youtubeLoading.set(false);
      });
  }
}
