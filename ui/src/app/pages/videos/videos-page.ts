import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbField, MbControl } from '../../design-system/field/field';
import { MbDialog } from '../../design-system/dialog/dialog';
import { Compose } from '../../compose/compose';
import { ClientPrefs } from '../../client-prefs';
import { Auth } from '../../auth';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { MbButton } from '../../design-system/button/button';
import { SupporterStatus } from '../../providers/account/supporter-status';
import { RssReadState } from '../../providers/rss/rss-read-state';
import { VideoSubscriptions } from '../../providers/videos/video-subscriptions';
import { YoutubeFeeds, YoutubeSearchItem } from '../../providers/videos/youtube-feeds';
import { VideoPlayer } from '../../video-player/video-player';
import { youtubeSource } from '../../video-player/media-source';
import { VideoSubscriptionsPanel } from './video-subscriptions-panel';
import { FeatureFlags } from '../../feature-flags';
import {
  feedVideos,
  newestVideos,
  sortVideos,
  videoResponseText,
  VideoItem,
  VideoSort,
} from './video-items';

// i18n videos.fedi: Fedi videos
// i18n videos.queue: Watch queue
// i18n videos.main: Main feed
// i18n videos.customize: Customize
// i18n videos.autoLoadWatch: Automatically load YouTube players on Watch
// i18n videos.autoLoadWatchHint: Connect to YouTube when opening Watch. Videos still start paused; feed previews load only when clicked.
// i18n videos.feedSettings: Feed and cache settings
// i18n videos.sort: Sort videos
// i18n videos.oldest: Oldest first
// i18n videos.titleSort: Title A–Z
// i18n videos.channelSort: Channel A–Z
// i18n videos.response: Post Response
// i18n videos.watchParty: Watch Party
// i18n videos.cancel: Cancel
// i18n videos.newest: Newest first
// i18n videos.refresh: Refresh
// i18n videos.loading: Loading videos…
// i18n videos.empty: No videos to show yet. Subscribe to a channel to see its latest uploads.
// i18n videos.failedFeeds: Couldn't refresh: {{channels}}. Your subscriptions and saved videos are still here.
// i18n videos.search: Search YouTube
// i18n videos.searchQuery: Search videos or channels
// i18n videos.searchType: Search result type
// i18n videos.videoResults: Videos
// i18n videos.channelResults: Channels
// i18n videos.searching: Searching…
// i18n videos.searchFailed: Couldn't search YouTube. Check your Plus account or try again later.
// i18n videos.noResults: No results found.
// i18n videos.back: Back to subscriptions
// i18n videos.plusSearch: YouTube search is included with Mawkingbird Plus. Pasting channel links and reading video feeds is free.
// i18n videos.plus: Explore Mawkingbird Plus
// i18n videos.original: Open on YouTube
// i18n videos.saved: Saved videos
// i18n videos.save: Save for later
// i18n videos.unsave: Remove from saved
// i18n videos.read: Mark watched
// i18n videos.unread: Mark unwatched
// i18n videos.subscribed: Subscribed
// i18n videos.proxyNote: Public channel information is retrieved through the Mawkingbird proxy. No YouTube account is needed.
@Component({
  selector: 'app-videos-page',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbField,
    MbControl,
    MbDialog,
    Compose,
    VideoPlayer,
    VideoSubscriptionsPanel,
  ],
  templateUrl: './videos-page.html',
  styleUrl: './videos-page.css',
})
export class VideosPage {
  protected prefs = inject(ClientPrefs);
  protected customizing = signal(false);
  protected subs = inject(VideoSubscriptions);
  protected supporter = inject(SupporterStatus);
  protected reads = inject(RssReadState);
  private youtube = inject(YoutubeFeeds);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(Auth);
  private bsky = inject(BlueskySession);
  private featureFlags = inject(FeatureFlags);
  /** The app-mode menu has Fedi videos and Queue tabs; without it they are linked here. */
  protected readonly modeNav = computed(() => this.featureFlags.enabled('mode-nav'));
  protected responseTarget = computed(() =>
    this.auth.isBlueskyPrimary || (this.auth.isAnonymous && this.bsky.linked())
      ? ('bsky' as const)
      : ('fedi' as const),
  );
  protected response = signal<{ id: string; text: string } | null>(null);
  protected sort = signal<VideoSort>('newest');
  protected readonly sortOptions: VideoSort[] = ['newest', 'oldest', 'title', 'channel'];
  protected readonly sortLabels = {
    newest: 'videos.newest',
    oldest: 'videos.oldest',
    title: 'videos.titleSort',
    channel: 'videos.channelSort',
  };

  private generation = 0;
  protected selected = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('channel'))),
    { initialValue: null },
  );
  protected items = signal<VideoItem[]>([]);
  protected loading = signal(false);
  protected failed = signal<string[]>([]);
  protected savedOnly = signal(false);
  protected query = '';
  protected searchType: 'video' | 'channel' = 'video';
  protected searching = signal(false);
  protected searchError = signal(false);
  protected results = signal<YoutubeSearchItem[] | null>(null);
  protected visible = computed(() =>
    sortVideos(
      this.items().filter(
        (item) =>
          (!this.selected() || item.channelId === this.selected()) &&
          (!this.savedOnly() || this.reads.isStarred(item.id)),
      ),
      this.sort(),
    ),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
    });
    effect(() => {
      this.subs.enabled();
      untracked(() => {
        void this.load();
      });
    });
  }

  protected mainFeed(saved = false): void {
    this.results.set(null);
    this.searchError.set(false);
    this.savedOnly.set(saved);
    void this.router.navigate(['/videos']);
  }

  protected postResponse(item: Pick<VideoItem, 'id' | 'title' | 'channelTitle' | 'source'>): void {
    this.response.set({ id: item.id, text: videoResponseText(item) });
  }

  protected async load(refresh = false): Promise<void> {
    const generation = ++this.generation;
    const channels = this.subs.enabled();
    this.loading.set(true);
    const items: VideoItem[] = [],
      failed: string[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, channels.length) }, async () => {
        while (cursor < channels.length) {
          const channel = channels[cursor++];
          try {
            items.push(...feedVideos(await this.youtube.feed(channel.id, refresh), channel));
          } catch {
            failed.push(channel.title);
          }
        }
      }),
    );
    if (generation !== this.generation) return;
    this.items.set(newestVideos(items));
    this.failed.set(failed);
    this.loading.set(false);
  }

  protected async search(): Promise<void> {
    if (this.searching() || !this.supporter.isSupporter()) return;
    this.searching.set(true);
    this.searchError.set(false);
    try {
      this.results.set(await this.youtube.search(this.query, this.searchType));
    } catch {
      this.searchError.set(true);
    } finally {
      this.searching.set(false);
    }
  }
  protected subscribe(item: YoutubeSearchItem): void {
    if (item.channelId) this.subs.add(item.channelId, item.channelTitle);
  }
  protected searchSource(item: YoutubeSearchItem) {
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
  protected toggleRead(id: string): void {
    if (this.reads.isRead(id)) this.reads.markUnread(id);
    else this.reads.markRead(id);
  }
}
