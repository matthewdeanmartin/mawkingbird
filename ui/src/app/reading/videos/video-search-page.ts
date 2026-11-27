import { YoutubeExtensionAccess } from './youtube-extension-access';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { MbAddBox } from '../../design-system/add-box/add-box';
import { MbIcon } from '../../design-system/icon/icon';
import { MbItemAction, MbItemActions } from '../../design-system/item-actions/item-actions';
import { MbPageHeader } from '../../design-system/page-header/page-header';
import { MbPagePanel, MbRailPage, MbRailPanel } from '../../design-system/rail-page/rail-page';
import { translatedComputed } from '../../i18n/translated';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { Status } from '../../platform/api/models';
import { VideoSearch, withoutSiteOperators } from './video-search';
import { VideoSubscriptions } from './video-subscriptions';
import { queueEntry, WatchQueue } from './watch-queue';
import { YoutubeFeeds, YoutubeSearchItem } from './youtube-feeds';
import { StatusCard } from '../../posts/status-card/status-card';
import { VideoSource, youtubeSource } from '../video-player/media-source';
import { VideoPlayer } from '../video-player/video-player';
import { webSearchUrl } from '../../discovery/search/web-query-serializer';

// i18n videoSearch.title: Search video
// i18n videoSearch.query: Search for
// i18n videoSearch.submit: Search
// i18n videoSearch.youtubeType: YouTube results
// i18n videoSearch.elsewhere: Search elsewhere
// i18n videoSearch.allPosts: All posts, not only ones with video
// i18n videoSearch.googleYoutube: YouTube, on Google ↗
// i18n videoSearch.tagsNote: Fediverse video comes from the hashtags {{tags}}, plus your server's post search when you are signed in. Only posts with a video are kept.
// i18n videoSearch.postsHeading: Fediverse posts
// i18n videoSearch.youtubeHeading: YouTube
// i18n videoSearch.searching: Searching…
// i18n videoSearch.noPosts: No fediverse posts with video matched. Try a single word, which is searched as a hashtag.
// i18n videoSearch.noYoutube: No YouTube results.
// i18n videoSearch.youtubeFailed: Couldn't search YouTube. Try again later.
// i18n videoSearch.start: Search fediverse posts and YouTube for video
// i18n videoSearch.startHintNative: Words are searched as hashtags across the fediverse. YouTube search is in the Mawkingbird app.
// i18n videoSearch.startHintYoutube: Words are searched as hashtags across the fediverse and on YouTube.
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
    YoutubeExtensionAccess,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbAddBox,
    MbButton,
    MbContentState,
    MbIcon,
    MbItemActions,
    MbPageHeader,
    MbPagePanel,
    MbRailPage,
    MbRailPanel,
    MbField,
    MbControl,
    StatusCard,
    VideoPlayer,
  ],
  template: `
    <app-youtube-extension-access />
    <mb-rail-page>
      <aside mbRailPanel>
        <mb-page-header embedded [title]="'videoSearch.title' | transloco" />
        <form mbAddBox (ngSubmit)="submit()">
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
          <button
            mbButton
            type="submit"
            [attr.aria-label]="'videoSearch.submit' | transloco"
            [title]="'videoSearch.submit' | transloco"
          >
            <mb-icon name="find" />
          </button>
        </form>
        @if (canSearch()) {
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
        <!-- Hand-offs to other searches, not alternatives to the Search button. -->
        <nav class="elsewhere" [attr.aria-label]="'videoSearch.elsewhere' | transloco">
          <h2>{{ 'videoSearch.elsewhere' | transloco }}</h2>
          <ul>
            <li>
              <a routerLink="/search" [queryParams]="{ q: draftWords() || null }">{{
                'videoSearch.allPosts' | transloco
              }}</a>
            </li>
            <li>
              <button
                mbButton
                variant="link"
                type="button"
                [disabled]="!draftSearchable()"
                (click)="searchGoogle()"
              >
                {{ 'videoSearch.googleYoutube' | transloco }}
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <div class="search-results">
        @if (!query()) {
          <mb-content-state
            [title]="'videoSearch.start' | transloco"
            [description]="
              (canSearch() ? 'videoSearch.startHintYoutube' : 'videoSearch.startHintNative')
                | transloco
            "
          />
        } @else {
          <section
            mbPagePanel
            [attr.aria-label]="'videoSearch.postsHeading' | transloco"
            aria-live="polite"
          >
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

          <section
            mbPagePanel
            [attr.aria-label]="'videoSearch.youtubeHeading' | transloco"
            aria-live="polite"
          >
            <h2>{{ 'videoSearch.youtubeHeading' | transloco }}</h2>
            @if (!canSearch()) {
              <p>{{ 'videos.nativeSearch' | transloco }}</p>
              <a mbButton variant="outline" routerLink="/settings/app">{{
                'videos.installNative' | transloco
              }}</a>
            } @else if (youtubeLoading()) {
              <p role="status">{{ 'videoSearch.searching' | transloco }}</p>
            } @else if (youtubeFailed()) {
              <p role="alert">{{ 'videoSearch.youtubeFailed' | transloco }}</p>
            } @else {
              @for (card of youtubeCards(); track card.item.id) {
                @let item = card.item;
                <article class="video-result">
                  <h3>{{ item.title }}</h3>
                  <p class="muted small">
                    @if (item.channelId) {
                      <a [routerLink]="['/videos/channel', item.channelId]">{{
                        item.channelTitle
                      }}</a>
                    } @else {
                      {{ item.channelTitle }}
                    }
                  </p>
                  @if (card.source; as source) {
                    <app-video-player-controls
                      [source]="source"
                      [inline]="true"
                      [showLinks]="false"
                      [showTitle]="false"
                    />
                  }
                  <mb-item-actions iconsWhenNarrow [actions]="card.actions" [label]="item.title" />
                </article>
              } @empty {
                <p class="muted">{{ 'videoSearch.noYoutube' | transloco }}</p>
              }
            }
          </section>
        }
      </div>
    </mb-rail-page>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
    }
    .elsewhere h2 {
      color: var(--muted);
      font-size: 0.85rem;
      font-weight: 600;
      margin: 0.5rem 0 0.25rem;
    }
    .elsewhere ul {
      display: grid;
      gap: 0.25rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .search-results {
      display: grid;
      gap: 16px;
      min-width: 0;
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
  `,
})
export class VideoSearchPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly search = inject(VideoSearch);
  private readonly youtubeFeeds = inject(YoutubeFeeds);
  /** Native searches YouTube directly; browsers need Plus. */
  protected readonly canSearch = () => this.youtubeFeeds.canSearch();
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

  private readonly queue = inject(WatchQueue);
  private readonly transloco = inject(TranslocoService);
  /** YouTube results with everything there is to do with each. */
  protected readonly youtubeCards = translatedComputed(() =>
    this.youtube().map((item) => {
      const source = this.sourceFor(item);
      return { item, source, actions: this.actionsFor(item, source) };
    }),
  );

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

  private actionsFor(item: YoutubeSearchItem, source: VideoSource | null): MbItemAction[] {
    const t = (key: string) => this.transloco.translate(key);
    const out: MbItemAction[] = [];
    if (item.videoId)
      out.push({
        id: 'watch',
        icon: 'play',
        label: t('videoSearch.watch'),
        link: '/watch',
        queryParams: { youtube: item.videoId },
      });
    const entry = source && queueEntry(source, null);
    if (entry) {
      const queued = this.queue.has(entry.key);
      const full = !queued && this.queue.full();
      out.push({
        id: 'queue',
        icon: 'queue',
        label: t(
          full ? 'videoQueue.full' : queued ? 'watch.panel.queueRemove' : 'watch.panel.queueAdd',
        ),
        pressed: queued,
        disabled: full,
        run: () => (queued ? this.queue.remove(entry.key) : this.queue.add(entry)),
      });
    }
    const channelId = item.channelId;
    if (channelId) {
      const subscribed = this.subs.has(channelId);
      out.push({
        id: 'subscribe',
        icon: subscribed ? 'check' : 'rss',
        label: t(subscribed ? 'videoSearch.subscribed' : 'videoSearch.subscribe'),
        disabled: subscribed,
        run: () => this.subs.add(channelId, item.channelTitle),
      });
    }
    if (source)
      out.push({ id: 'open', icon: 'open', label: t('videoPlayer.openYoutube'), href: source.url });
    return out;
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
    if (!this.youtubeFeeds.canSearch()) return;
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
