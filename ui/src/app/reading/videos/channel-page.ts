import { YoutubeExtensionAccess } from './youtube-extension-access';
import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { youtubeSource } from '../video-player/media-source';
import { TranslocoPipe } from '@jsverse/transloco';
import { Account } from '../../platform/api/models';
import { AccountName } from '../../accounts/account-name';
import { MbButton } from '../../design-system/button/button';
import { MbPageHeader } from '../../design-system/page-header/page-header';
import { FollowButton } from '../../accounts/follow-button/follow-button';
import { accountRoutePath } from '../../accounts/account-route';
import { ParsedFeed } from '../../../lib/rss/rss-parser';
import { YoutubeFeeds } from './youtube-feeds';
import { VideoSubscriptions, CHANNEL_ID } from './video-subscriptions';
import { CreatorLink, CreatorLinks } from './creator-links';
import { YoutubeChannelInfo, YoutubeChannelVideo, YoutubeVideoPage } from './youtube-details';

// i18n videoChannel.title: Channel
// i18n videoChannel.invalid: This isn't a YouTube channel link.
// i18n videoChannel.loading: Loading the channel…
// i18n videoChannel.failed: Couldn't load this channel's videos.
// i18n videoChannel.subscribe: Subscribe
// i18n videoChannel.subscribed: Subscribed
// i18n videoChannel.subscribeHint: New videos appear in Videos, from the channel's public feed. No YouTube account needed.
// i18n videoChannel.openYoutube: Open on YouTube
// i18n videoChannel.onMastodon: On Mastodon
// i18n videoChannel.openProfile: Open profile
// i18n videoChannel.finding: Looking for this creator on Mastodon…
// i18n videoChannel.notFound: No Mastodon account is linked to this channel yet.
// i18n videoChannel.source.confirmed: Linked both ways: their profile links this channel.
// i18n videoChannel.source.channel: Linked from their YouTube channel.
// i18n videoChannel.source.wikidata: Listed on Wikidata.
// i18n videoChannel.source.kit: Listed with this channel in our YouTubers on Mastodon kits.
// i18n videoChannel.source.channelAndWikidata: Linked from their YouTube channel and listed on Wikidata.
// i18n videoChannel.unverifiedHint: Their profile doesn't link back to this channel, so check it's really them.
// i18n videoChannel.signInToFollow: Sign in to follow.
// i18n videoChannel.uploads: Uploads
// i18n videoChannel.watch: Watch
// i18n videoChannel.more: Older videos
// i18n videoChannel.links: Links

/** One upload, from RSS (with a date) or from the channel page (relative age). */
interface Upload {
  videoId: string;
  title: string;
  published: string | null;
  age: string;
  duration: string;
}

export function feedUploads(feed: ParsedFeed): Upload[] {
  return feed.items.flatMap((item) => {
    const videoId = item.link ? youtubeSource(item.link)?.videoId : undefined;
    return videoId
      ? [{ videoId, title: item.title, published: item.publishedAt, age: '', duration: '' }]
      : [];
  });
}

function pageUploads(videos: YoutubeChannelVideo[]): Upload[] {
  return videos.map((video) => ({
    videoId: video.videoId,
    title: video.title,
    published: null,
    age: video.age,
    duration: video.duration,
  }));
}

/**
 * A YouTube channel inside Mawkingbird (spec/youtube-client.md, S3): its
 * uploads from the public RSS feed (anyone, including visitors without an
 * account), more of them and its About links on Native, and the double
 * subscribe — the channel's feed here, and the creator's Mastodon account,
 * with where that link came from.
 */
@Component({
  selector: 'app-channel-page',
  imports: [
    AccountName,
    TranslocoPipe,
    RouterLink,
    DatePipe,
    MbButton,
    MbPageHeader,
    FollowButton,
    YoutubeExtensionAccess,
  ],
  template: `
    <app-youtube-extension-access (allowed)="reload()" />
    @if (!valid()) {
      <mb-page-header [title]="'videoChannel.title' | transloco" />
      <p role="alert">{{ 'videoChannel.invalid' | transloco }}</p>
    } @else {
      <mb-page-header
        [title]="title() || ('videoChannel.title' | transloco)"
        [description]="subtitle()"
      />
      <div class="actions">
        <button
          mbButton
          type="button"
          [variant]="subscribed() ? 'outline' : 'solid'"
          [attr.aria-pressed]="subscribed()"
          [title]="'videoChannel.subscribeHint' | transloco"
          (click)="toggleSubscribe()"
        >
          {{ (subscribed() ? 'videoChannel.subscribed' : 'videoChannel.subscribe') | transloco }}
        </button>
        <a
          mbButton
          variant="outline"
          [href]="youtubeUrl()"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ 'videoChannel.openYoutube' | transloco }}
        </a>
      </div>

      <section class="creator" [attr.aria-label]="'videoChannel.onMastodon' | transloco">
        <h2>{{ 'videoChannel.onMastodon' | transloco }}</h2>
        @if (creatorLoading()) {
          <p role="status" class="muted">{{ 'videoChannel.finding' | transloco }}</p>
        } @else if (creator(); as link) {
          <p class="who">
            @if (link.account?.avatar) {
              <img [src]="link.account!.avatar" alt="" width="40" height="40" />
            }
            <span>
              <strong>
                @if (link.account; as account) {
                  <app-account-name [account]="account" [fallback]="link.acct" />
                } @else {
                  {{ link.acct }}
                }
              </strong>
              <span class="muted">&#64;{{ link.acct }}</span>
            </span>
          </p>
          <p class="source">{{ sourceKey(link) | transloco }}</p>
          @if (!link.confirmed) {
            <p class="muted">{{ 'videoChannel.unverifiedHint' | transloco }}</p>
          }
          <p class="actions">
            <app-follow-button
              [accountId]="'creator:' + link.acct"
              [handle]="link.acct"
              [foreign]="foreignAccount(link)"
            />
            <a mbButton variant="outline" size="small" [routerLink]="profileRoute(link)">{{
              'videoChannel.openProfile' | transloco
            }}</a>
          </p>
        } @else {
          <p class="muted">{{ 'videoChannel.notFound' | transloco }}</p>
        }
      </section>

      @if (info()?.links?.length) {
        <section [attr.aria-label]="'videoChannel.links' | transloco">
          <h2>{{ 'videoChannel.links' | transloco }}</h2>
          <ul class="links">
            @for (link of info()!.links; track link.url) {
              <li>
                <a [href]="link.url" target="_blank" rel="noopener noreferrer nofollow">{{
                  link.title || link.url
                }}</a>
              </li>
            }
          </ul>
        </section>
      }

      <section [attr.aria-label]="'videoChannel.uploads' | transloco">
        <h2>{{ 'videoChannel.uploads' | transloco }}</h2>
        @if (loading() && !uploads().length) {
          <p role="status" class="muted">{{ 'videoChannel.loading' | transloco }}</p>
        } @else if (failed() && !uploads().length) {
          <p role="alert">{{ 'videoChannel.failed' | transloco }}</p>
        }
        <ul class="uploads">
          @for (upload of uploads(); track upload.videoId) {
            <li>
              <a class="thumb" routerLink="/watch" [queryParams]="{ youtube: upload.videoId }">
                <img
                  [src]="'https://i.ytimg.com/vi/' + upload.videoId + '/mqdefault.jpg'"
                  alt=""
                  loading="lazy"
                  width="320"
                  height="180"
                />
                @if (upload.duration) {
                  <span class="duration">{{ upload.duration }}</span>
                }
              </a>
              <a class="name" routerLink="/watch" [queryParams]="{ youtube: upload.videoId }">{{
                upload.title
              }}</a>
              <span class="muted">
                @if (upload.published) {
                  <time [attr.datetime]="upload.published">{{
                    upload.published | date: 'mediumDate'
                  }}</time>
                } @else {
                  {{ upload.age }}
                }
              </span>
            </li>
          }
        </ul>
        @if (more()) {
          <button
            mbButton
            type="button"
            variant="outline"
            [disabled]="loading()"
            (click)="loadMore()"
          >
            {{ 'videoChannel.more' | transloco }}
          </button>
        }
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
      max-width: 72rem;
      padding: 1rem;
    }
    .actions {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .muted {
      color: var(--muted);
    }
    h2 {
      font-size: 1.1rem;
      margin: 1.25rem 0 0.5rem;
    }
    .who {
      align-items: center;
      display: flex;
      gap: 0.75rem;
      margin: 0;
    }
    .who img {
      border-radius: 8px;
    }
    .who span {
      display: flex;
      flex-direction: column;
    }
    .source {
      margin: 0.5rem 0 0.25rem;
    }
    .links {
      margin: 0;
      padding-inline-start: 1.25rem;
    }
    .uploads {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
      list-style: none;
      margin: 0 0 1rem;
      padding: 0;
    }
    .uploads li {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }
    .thumb {
      position: relative;
    }
    .thumb img {
      aspect-ratio: 16 / 9;
      border-radius: 8px;
      height: auto;
      object-fit: cover;
      width: 100%;
    }
    .duration {
      background: rgb(0 0 0 / 0.8);
      border-radius: 4px;
      bottom: 0.4rem;
      color: #fff;
      font-size: 0.8rem;
      padding: 0 0.3rem;
      position: absolute;
      right: 0.4rem;
    }
    .name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
  `,
})
export class ChannelPage {
  /** Route param `/videos/channel/:channelId`. */
  protected readonly channelId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('channelId') ?? '')),
    { initialValue: '' },
  );

  private readonly youtube = inject(YoutubeFeeds);
  private readonly subs = inject(VideoSubscriptions);
  private readonly creators = inject(CreatorLinks);

  protected readonly valid = computed(() => CHANNEL_ID.test(this.channelId()));
  protected readonly feedTitle = signal('');
  protected readonly info = signal<YoutubeChannelInfo | null>(null);
  protected readonly uploads = signal<Upload[]>([]);
  protected readonly more = signal<YoutubeVideoPage['more']>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly creator = signal<CreatorLink | null>(null);
  protected readonly creatorLoading = signal(false);
  private generation = 0;

  protected readonly title = computed(() => this.info()?.title || this.feedTitle());
  protected readonly subtitle = computed(() =>
    [this.info()?.handle, this.info()?.subscribers].filter(Boolean).join(' · '),
  );
  protected readonly subscribed = computed(() =>
    this.subs.feeds().some((feed) => feed.id === this.channelId()),
  );
  protected readonly youtubeUrl = computed(
    () => `https://www.youtube.com/channel/${this.channelId()}`,
  );

  constructor() {
    effect(() => {
      const id = this.channelId();
      untracked(() => void this.load(id));
    });
  }

  /** YouTube was just allowed for Mawkingbird for Firefox: read the channel again. */
  protected reload(): void {
    void this.load(this.channelId());
  }

  private async load(id: string): Promise<void> {
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    this.feedTitle.set('');
    this.info.set(null);
    this.uploads.set([]);
    this.more.set(null);
    this.failed.set(false);
    this.creator.set(null);
    if (!CHANNEL_ID.test(id)) return;
    this.loading.set(true);
    this.creatorLoading.set(true);
    // RSS answers everywhere; the channel page (Native) adds older uploads and links.
    const [feed, info] = await Promise.all([
      this.youtube.feed(id).catch(() => null),
      this.youtube.canReadDetails() ? this.youtube.channel(id).catch(() => null) : null,
    ]);
    if (!current()) return;
    if (feed) this.feedTitle.set(feed.title);
    this.info.set(info);
    const fromPage = info ? pageUploads(info.uploads.videos) : [];
    this.uploads.set(fromPage.length ? fromPage : feed ? feedUploads(feed) : []);
    this.more.set(info?.uploads.more ?? null);
    this.failed.set(!feed && !fromPage.length);
    this.loading.set(false);
    const link = await this.creators.forChannel({
      id,
      handle: info?.handle ?? null,
      links: info?.links ?? [],
    });
    if (!current()) return;
    this.creator.set(link);
    this.creatorLoading.set(false);
  }

  protected async loadMore(): Promise<void> {
    const next = this.more();
    if (!next || this.loading()) return;
    const generation = this.generation;
    this.loading.set(true);
    try {
      const page = await next();
      if (generation !== this.generation) return;
      const seen = new Set(this.uploads().map((upload) => upload.videoId));
      this.uploads.update((held) => [
        ...held,
        ...pageUploads(page.videos).filter((upload) => !seen.has(upload.videoId)),
      ]);
      this.more.set(page.more);
    } catch {
      this.more.set(null);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  protected toggleSubscribe(): void {
    const id = this.channelId();
    if (this.subscribed()) this.subs.remove(id);
    else this.subs.add(id, this.title() || id);
  }

  protected sourceKey(link: CreatorLink): string {
    if (link.confirmed) return 'videoChannel.source.confirmed';
    const channel = link.sources.includes('channel');
    const wikidata = link.sources.includes('wikidata');
    if (channel && wikidata) return 'videoChannel.source.channelAndWikidata';
    if (channel) return 'videoChannel.source.channel';
    return wikidata ? 'videoChannel.source.wikidata' : 'videoChannel.source.kit';
  }

  /** Follow resolves the handle on the reader's own server when clicked. */
  protected foreignAccount(link: CreatorLink): Account {
    const [username, host] = link.acct.split('@');
    return {
      ...(link.account ?? {}),
      id: `creator:${link.acct}`,
      acct: link.acct,
      username,
      url: link.account?.url ?? `https://${host}/@${username}`,
    } as Account;
  }

  protected profileRoute(link: CreatorLink): (string | number)[] {
    return accountRoutePath({ handle: link.acct });
  }
}
