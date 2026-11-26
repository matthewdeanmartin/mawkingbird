import { AccountName } from '../../accounts/account-name';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { segmentAt, SponsorBlock, SponsorSegment, SponsorSegments } from '../videos/sponsor-block';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { MbButton } from '../../design-system/button/button';
import { MbHelp } from '../../design-system/help/help';
import { QueuedVideo, WatchQueue } from '../videos/watch-queue';
import { translatedComputed } from '../../i18n/translated';
import { Terminology } from '../../i18n/terminology';
import { MbItemAction, MbItemActions } from '../../design-system/item-actions/item-actions';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbDisclosure } from '../../design-system/disclosure/disclosure';
import { Compose } from '../../publishing/compose/compose';
import { stripHtml } from '../../feeds/sentiment';
import { VideoSource, watchParams } from '../video-player/media-source';
import { YoutubeFeeds } from '../videos/youtube-feeds';
import { VideoSubscriptions } from '../videos/video-subscriptions';
import { channelInput } from '../videos/youtube-channel';
import { qualifiedHandle } from '../../accounts/account-handle';
import { accountRoutePath } from '../../accounts/account-route';
import { VideoPostFinder } from '../videos/video-post-finder';
import { YoutubeComment, YoutubeVideoDetails } from '../videos/youtube-details';
import { CreatorLink, CreatorLinks } from '../videos/creator-links';
import { PeerTubeVideo } from '../videos/peertube';
import { Status } from '../../platform/api/models';

// i18n watch.panel.label: Video actions
// i18n watch.panel.like: Like
// i18n watch.panel.liked: Liked
// i18n watch.panel.likeTitle: Like the post this video came from.
// i18n watch.panel.postedBy: Video posted by {{name}}
// i18n watch.panel.postedByTitle: See who posted it. They may be the creator or a fan; follow them from their profile.
// i18n watch.panel.postedByCreator: Video posted by its creator, {{name}}
// i18n watch.panel.creator: Creator: {{acct}}
// i18n watch.panel.creatorKnown.confirmed: Their profile links this channel. Opens their profile.
// i18n watch.panel.creatorKnown.kit: Listed with this channel in our YouTubers on Mastodon kits. Opens their profile.
// i18n watch.panel.creatorKnown.kitName: A channel of this name is in our YouTubers on Mastodon kits. Check their profile to see it's the same one.
// i18n watch.panel.creatorKnown.linked: Linked from their channel or Wikidata, not yet from their profile. Opens their profile.
// i18n watch.panel.peertubeChannel: PeerTube channel: {{name}}
// i18n watch.panel.peertubeChannelTitle: Follow it from its profile and new videos arrive in Home.
// i18n watch.panel.subscribeRss: Subscribe (RSS)
// i18n watch.panel.subscribedRss: Subscribed (RSS)
// i18n watch.panel.subscribeYoutube: Subscribe on YouTube
// i18n watch.panel.subscribeYoutubeTitle: Opens the channel on YouTube, which asks you to confirm.
// i18n watch.panel.queueAdd: Add to queue
// i18n watch.panel.queueRemove: In queue
// i18n watch.panel.subscribeTitle: New videos from this channel appear in Videos, from its public feed. No YouTube account needed.
// i18n watch.panel.subscribeFailed: Couldn't find this channel's feed.
// i18n watch.panel.share: Share
// i18n watch.panel.channel: Channel
// i18n watch.panel.shareTitle: Share this video
// i18n watch.panel.shareClose: Cancel
// i18n watch.panel.quoteAuthor: — {{author}}, on YouTube
// i18n watch.panel.find: Find posts about this video
// i18n watch.panel.finding: Looking for posts…
// i18n watch.panel.found: Posts sharing this video
// i18n watch.panel.foundNone: No posts about this video turned up on your server.
// i18n watch.panel.openReplies: Watch with its replies
// i18n watch.panel.about: About this video
// i18n watch.panel.duration: Length {{time}}
// i18n watch.panel.live: Live or premiere
// i18n watch.panel.notFamilySafe: YouTube marks this video as not suitable for all ages.
// i18n watch.panel.chapters: Chapters
// i18n watch.panel.chaptersCount: Chapters ({{count}})
// i18n watch.panel.chapterSource.creator: by the creator
// i18n watch.panel.chapterSource.auto: made automatically by YouTube
// i18n watch.panel.chapterSource.description: from timestamps in the description
// i18n watch.panel.cueTitle: Go to this point; a paused video stays paused.
// i18n watch.sponsor.label: SponsorBlock
// i18n watch.sponsor.summaryOne: SponsorBlock: 1 part to skip.
// i18n watch.sponsor.summaryMany: SponsorBlock: {{count}} parts to skip.
// i18n watch.sponsor.skip: Skip {{what}} ({{time}})
// i18n watch.sponsor.category.sponsor: sponsor
// i18n watch.sponsor.category.selfpromo: self-promotion
// i18n watch.sponsor.category.interaction: subscribe reminder
// i18n watch.sponsor.category.intro: intro
// i18n watch.sponsor.category.outro: outro

/** What the row needs from the source post's card (StatusCard provides it). */
export interface WatchPost {
  readonly display: Status;
  readonly caps: { favourite: boolean };
  readonly accountLink: (string | number)[] | null;
  readonly actionError: () => string | null;
  hasRepostControl(): boolean;
  toggleFavourite(event: Event): void;
  openRepost(event: Event): void;
  promptSignIn(action: 'like', event: Event): void;
}

/** `h:mm:ss` or `m:ss`. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

/** The YouTube link a post should carry, at the cue when there is one. */
export function shareUrl(videoId: string, start?: number): string {
  return `https://youtu.be/${videoId}${start ? `?t=${start}` : ''}`;
}

/** Composer text for sharing a video, optionally quoting a YouTube comment. */
export function shareText(options: {
  title: string;
  url: string;
  tag?: string | null;
  quote?: { text: string; attribution: string };
}): string {
  const parts = [
    options.quote
      ? `“${options.quote.text.trim()}” ${options.quote.attribution}`
      : options.title.trim(),
    options.url,
    options.tag ? `#${options.tag}` : '',
  ];
  return parts.filter(Boolean).join('\n\n');
}

/**
 * The video-specific actions under the Watch player (spec/youtube-client.md, S2):
 * subscribe to the channel's RSS, share (a prefilled composer, not a new
 * one), find posts that share a bare video, and on Native the video's details
 * with chapters that re-cue the embed. Like and Boost act through the source
 * post's own card, which Watch shows beneath, often off screen.
 */
@Component({
  selector: 'app-watch-video-panel',
  imports: [
    AccountName,
    TranslocoPipe,
    MbButton,
    MbHelp,
    MbItemActions,
    MbDialog,
    MbDisclosure,
    Compose,
    RouterLink,
  ],
  template: `
    <mb-item-actions [actions]="actions()" [label]="'watch.panel.label' | transloco">
      @if (source().kind === 'youtube') {
        <mb-help [label]="'videoPlayer.help' | transloco">
          <p>{{ 'videoPlayer.external' | transloco }}</p>
          <p>{{ 'videoPlayer.positionUnavailable' | transloco }}</p>
          <p>{{ 'videoPlayer.youtubeStopped' | transloco }}</p>
        </mb-help>
      }
    </mb-item-actions>
    @if (postError(); as message) {
      <p role="alert">{{ message }}</p>
    }
    @if (subscribeFailed()) {
      <p role="alert">{{ 'watch.panel.subscribeFailed' | transloco }}</p>
    }

    @if (finding()) {
      <p role="status" class="muted">{{ 'watch.panel.finding' | transloco }}</p>
    } @else if (found(); as posts) {
      <section class="found" [attr.aria-label]="'watch.panel.found' | transloco">
        @if (posts.length) {
          <h2>{{ 'watch.panel.found' | transloco }}</h2>
          <ul>
            @for (post of posts; track post.id) {
              <li>
                <strong><app-account-name [account]="post.account" /></strong>
                <span class="muted">&#64;{{ post.account.acct }}</span>
                <p class="excerpt">{{ excerpt(post) }}</p>
                <a routerLink="/watch" [queryParams]="repliesParams(post)">{{
                  'watch.panel.openReplies' | transloco
                }}</a>
              </li>
            }
          </ul>
        } @else {
          <p class="muted">{{ 'watch.panel.foundNone' | transloco }}</p>
        }
      </section>
    }

    @if (sponsor().segments.length) {
      <!-- SponsorBlock: marked, never skipped by itself. -->
      <section class="sponsor" [attr.aria-label]="'watch.sponsor.label' | transloco">
        @if (sponsorDuration(); as total) {
          <div class="strip" aria-hidden="true">
            @for (segment of sponsor().segments; track segment.start) {
              <span
                class="segment"
                [attr.data-category]="segment.category"
                [style.left.%]="(segment.start / total) * 100"
                [style.width.%]="((segment.end - segment.start) / total) * 100"
              ></span>
            }
          </div>
        }
        <p class="muted small">
          {{
            (sponsor().segments.length === 1
              ? 'watch.sponsor.summaryOne'
              : 'watch.sponsor.summaryMany'
            ) | transloco: { count: sponsor().segments.length }
          }}
        </p>
        @if (activeSegment(); as segment) {
          <button mbButton type="button" size="small" (click)="skip(segment)">
            {{
              'watch.sponsor.skip'
                | transloco
                  : {
                      what: 'watch.sponsor.category.' + segment.category | transloco,
                      time: clockOf(segment.end - segment.start),
                    }
            }}
          </button>
        }
      </section>
    }

    @if (details(); as info) {
      @if (info.chapters.length) {
        <!-- Chapters are a way into the video, so they show without opening anything. -->
        <section class="chapters" [attr.aria-label]="'watch.panel.chapters' | transloco">
          <h2>
            {{ 'watch.panel.chaptersCount' | transloco: { count: info.chapters.length } }}
            <span class="muted">{{
              'watch.panel.chapterSource.' + info.chapterSource | transloco
            }}</span>
          </h2>
          <ol>
            @for (chapter of info.chapters; track chapter.seconds; let i = $index) {
              <li [class.current]="i === currentChapter()">
                <button
                  type="button"
                  class="chapter"
                  [attr.aria-current]="i === currentChapter() ? 'true' : null"
                  [title]="'watch.panel.cueTitle' | transloco"
                  (click)="cue(chapter.seconds)"
                >
                  <span class="time">{{ clockOf(chapter.seconds) }}</span> {{ chapter.title }}
                </button>
              </li>
            }
          </ol>
        </section>
      }
      <mb-disclosure class="about" [label]="'watch.panel.about' | transloco">
        <p class="facts">
          @if (info.durationSeconds && !info.live) {
            <span>{{
              'watch.panel.duration' | transloco: { time: clockOf(info.durationSeconds) }
            }}</span>
          }
          @if (info.live) {
            <span>{{ 'watch.panel.live' | transloco }}</span>
          }
        </p>
        @if (info.familySafe === false) {
          <p role="note">{{ 'watch.panel.notFamilySafe' | transloco }}</p>
        }
        @if (info.description) {
          <p class="description">{{ info.description }}</p>
        }
      </mb-disclosure>
    }

    @if (sharing(); as text) {
      <mb-dialog
        size="wide"
        [title]="'watch.panel.shareTitle' | transloco"
        [closeLabel]="'watch.panel.shareClose' | transloco"
        (dismissed)="sharing.set(null)"
      >
        <app-compose
          [compact]="false"
          [draftContext]="'video-share:' + source().key"
          [initialText]="text"
          [initialTarget]="target()"
          initialVisibility="public"
          (posted)="sharing.set(null)"
        />
      </mb-dialog>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
      margin-block: 0.5rem;
    }
    .muted {
      color: var(--muted);
    }
    .chapters ol {
      list-style: none;
      margin: 0.25rem 0;
      max-height: 14rem;
      overflow-y: auto;
      overscroll-behavior-y: contain;
      padding: 0;
    }
    .chapters li {
      border-radius: 4px;
      padding: 0.15rem 0.35rem;
    }
    .chapter {
      background: none;
      border: 0;
      color: inherit;
      cursor: pointer;
      font: inherit;
      padding: 0;
      text-align: start;
      width: 100%;
    }
    .chapter:focus-visible {
      outline: 2px solid var(--accent, currentColor);
    }
    .sponsor {
      margin-block: 0.5rem;
    }
    .strip {
      background: var(--hover);
      border-radius: 3px;
      height: 6px;
      position: relative;
    }
    .segment {
      background: #00b85c;
      border-radius: 3px;
      height: 100%;
      position: absolute;
    }
    .segment[data-category='selfpromo'] {
      background: #d6a400;
    }
    .segment[data-category='interaction'] {
      background: #b04cd9;
    }
    .segment[data-category='intro'],
    .segment[data-category='outro'] {
      background: #2a8cf0;
    }
    .small {
      font-size: 0.85rem;
      margin: 0.25rem 0;
    }
    .chapters li.current {
      background: var(--hover);
      font-weight: 600;
    }
    .chapters .time {
      display: inline-block;
      font-variant-numeric: tabular-nums;
      min-width: 4.5ch;
    }
    .chapters h2 .muted {
      font-size: 0.85em;
      font-weight: normal;
      margin-inline-start: 0.5rem;
    }
    .found ul {
      margin: 0.25rem 0;
      padding-inline-start: 1.25rem;
    }
    .found li {
      margin-block: 0.5rem;
    }
    .excerpt {
      margin: 0.25rem 0;
      overflow-wrap: anywhere;
    }
    .about {
      margin-block-start: 0.75rem;
    }
    .facts {
      display: flex;
      gap: 1rem;
      margin: 0.5rem 0;
    }
    .description {
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
    h2,
    h3 {
      font-size: 1rem;
      margin: 0.5rem 0 0.25rem;
    }
  `,
})
export class WatchVideoPanel {
  readonly source = input.required<VideoSource>();
  /** The post the video came from; `null` for a bare video link. */
  readonly status = input<Status | null>(null);
  /** The party hashtag to carry into a shared post, when watching with one. */
  readonly partyTag = input<string | null>(null);
  /** Seconds into the video, when the player reports it. */
  readonly playhead = input<number | null>(null);
  /**
   * Moves the loaded player without reloading; false when no player is loaded,
   * in which case a chapter cues the embed through `?t=` instead.
   */
  readonly seeker = input<((seconds: number) => boolean) | null>(null);
  /** A PeerTube video's details, for following its channel from Mastodon. */
  readonly peertube = input<PeerTubeVideo | null>(null);

  /** The source post's card, which carries out Like and Boost. */
  readonly post = input<WatchPost | null>(null);
  /** This video as a queue entry; null while it can't be queued. */
  readonly entry = input<Omit<QueuedVideo, 'addedAt'> | null>(null);

  protected readonly postError = computed(() => this.post()?.actionError() ?? null);
  private readonly queue = inject(WatchQueue);
  private readonly words = inject(Terminology).words;
  protected readonly finder = inject(VideoPostFinder);
  private readonly youtube = inject(YoutubeFeeds);
  private readonly subs = inject(VideoSubscriptions);
  private readonly server = inject(Server);
  private readonly auth = inject(Auth);
  private readonly bsky = inject(BlueskySession);
  private readonly transloco = inject(TranslocoService);
  private readonly creators = inject(CreatorLinks);
  private readonly sponsorBlock = inject(SponsorBlock);
  private readonly router = inject(Router);
  protected readonly sponsor = signal<SponsorSegments>({ segments: [], duration: null });
  protected readonly sponsorDuration = computed(
    () => this.sponsor().duration ?? this.details()?.durationSeconds ?? null,
  );
  /** The SponsorBlock segment playing now, offering Skip. */
  protected readonly activeSegment = computed(() => {
    const at = this.playhead();
    return at === null ? null : segmentAt(this.sponsor().segments, at);
  });
  /** The creator's Mastodon account, once a channel is known (spec/youtube-client.md, S3). */
  protected readonly creator = signal<CreatorLink | null>(null);

  protected readonly details = signal<YoutubeVideoDetails | null>(null);
  protected readonly finding = signal(false);
  protected readonly found = signal<Status[] | null>(null);
  protected readonly sharing = signal<string | null>(null);
  protected readonly resolving = signal(false);
  protected readonly subscribeFailed = signal(false);
  /** A channel resolved from the post's link card on the first Subscribe. */
  private readonly resolved = signal<{ id: string; title: string } | null>(null);
  private find$?: Subscription;
  private generation = 0;

  protected readonly target = computed(() =>
    this.auth.isBlueskyPrimary || (this.auth.isAnonymous && this.bsky.linked())
      ? ('bsky' as const)
      : ('fedi' as const),
  );

  /**
   * The channel to subscribe to: Native's video details name it; otherwise the
   * post's link card names its author (Mastodon fetched YouTube's oEmbed), and
   * the channel ID is resolved from that page when the reader asks.
   */
  protected readonly channel = computed<{ id: string | null; title: string; url?: string } | null>(
    () => {
      const info = this.details();
      if (info?.channelId) return { id: info.channelId, title: info.channelTitle };
      const resolved = this.resolved();
      if (resolved) return resolved;
      const card = this.status()?.card;
      if (this.source().kind === 'youtube' && card?.author_url && card.author_name) {
        try {
          const url = new URL(card.author_url);
          if (url.protocol === 'https:' && /(^|\.)youtube\.com$/.test(url.hostname)) {
            // A /channel/UC… address already is the ID; an @handle takes a request to resolve.
            const known = channelInput(url.href);
            return {
              id: known && 'id' in known ? known.id : null,
              title: card.author_name,
              url: url.href,
            };
          }
        } catch {
          // Not a channel link.
        }
      }
      return null;
    },
  );
  protected readonly subscribed = computed(() => {
    const id = this.channel()?.id;
    return !!id && this.subs.feeds().some((feed) => feed.id === id);
  });

  constructor() {
    effect(() => {
      const videoId = this.source().kind === 'youtube' ? this.source().videoId : undefined;
      untracked(() => {
        const generation = ++this.generation;
        this.details.set(null);
        this.found.set(null);
        this.resolved.set(null);
        this.creator.set(null);
        this.sponsor.set({ segments: [], duration: null });
        this.subscribeFailed.set(false);
        this.find$?.unsubscribe();
        this.finding.set(false);
        if (videoId)
          this.sponsorBlock
            .segments(videoId)
            .then((found) => {
              if (generation === this.generation) this.sponsor.set(found);
            })
            .catch(() => undefined);
        if (!videoId || !this.youtube.canReadDetails()) return;
        // Details are an extra: Watch works the same without them.
        this.youtube
          .details(videoId)
          .then((info) => {
            if (generation === this.generation) this.details.set(info);
          })
          .catch(() => undefined);
      });
    });
    // Once the channel is known, look for its creator on Mastodon.
    effect(() => {
      const channel = this.channel();
      untracked(() => {
        if (!channel) return;
        const id = channel.id;
        const generation = this.generation;
        if (!id) {
          // Only its name is known: the bundled kits may settle it without a request.
          this.creators
            .lookupName(channel.title)
            .then((link) => {
              if (link && generation === this.generation && !this.channel()?.id)
                this.creator.set(link);
            })
            .catch(() => undefined);
          return;
        }
        this.creators
          .lookupChannel(id)
          .then((link) => {
            // The ID outranks a match by name, including when it says there is none.
            if (generation === this.generation && this.channel()?.id === id) this.creator.set(link);
          })
          .catch(() => undefined);
      });
    });
  }

  /** Everything to do with this video and its post, in row order. */
  protected readonly actions = translatedComputed((): MbItemAction[] => [
    ...this.postActions(),
    ...this.videoActions(),
  ]);

  private t(key: string, params: Record<string, unknown> = {}): string {
    return this.transloco.translate(key, params);
  }

  private postActions(): MbItemAction[] {
    const card = this.post();
    if (!card) return [];
    const post = card.display;
    const anonymous = this.auth.isAnonymous && post.provider !== 'bluesky';
    const out: MbItemAction[] = [];
    if (card.caps.favourite || anonymous)
      out.push({
        id: 'like',
        icon: 'like',
        label: this.t(post.favourited ? 'watch.panel.liked' : 'watch.panel.like'),
        title: this.t('watch.panel.likeTitle'),
        pressed: anonymous ? undefined : post.favourited,
        run: (event) =>
          anonymous ? card.promptSignIn('like', event) : card.toggleFavourite(event),
      });
    if (card.hasRepostControl())
      out.push({
        id: 'boost',
        icon: 'boost',
        label: post.reblogged ? this.words().Boosted : this.words().Boost,
        run: (event) => card.openRepost(event),
      });
    const link = card.accountLink;
    if (link)
      out.push({
        id: 'poster',
        icon: 'person',
        label: this.t(
          this.postedByCreator() ? 'watch.panel.postedByCreator' : 'watch.panel.postedBy',
          { name: post.account.display_name?.replace(/:\w+:/g, '').trim() || post.account.acct },
        ),
        title: this.postedByCreator()
          ? this.creatorTitle(this.creator()!)
          : this.t('watch.panel.postedByTitle'),
        link,
      });
    return out;
  }

  /** Whether the post's author is the account known for this channel. */
  private readonly postedByCreator = computed(() => {
    const creator = this.creator()?.acct.toLowerCase();
    const card = this.post();
    return !!creator && !!card && qualifiedHandle(card.display.account)?.toLowerCase() === creator;
  });

  /** How the creator is known, said where the link is. */
  private creatorTitle(link: CreatorLink): string {
    const known = link.confirmed
      ? 'confirmed'
      : link.sources.includes('kit')
        ? 'kit'
        : link.sources.includes('kitName')
          ? 'kitName'
          : 'linked';
    return this.t(`watch.panel.creatorKnown.${known}`);
  }

  private videoActions(): MbItemAction[] {
    const out: MbItemAction[] = [];
    const creator = this.creator();
    if (creator && !this.postedByCreator())
      out.push({
        id: 'creator',
        icon: 'creator',
        label: this.t('watch.panel.creator', { acct: `@${creator.acct}` }),
        title: this.creatorTitle(creator),
        link: accountRoutePath({ handle: creator.acct }),
      });
    const peertube = this.peertube();
    if (peertube?.channel)
      out.push({
        id: 'peertube',
        icon: 'creator',
        label: this.t('watch.panel.peertubeChannel', {
          name: peertube.channelName || peertube.channel,
        }),
        title: this.t('watch.panel.peertubeChannelTitle'),
        link: accountRoutePath({ handle: peertube.channel }),
      });
    const channel = this.channel();
    const youtube = this.youtubeSubscribeUrl();
    if (channel)
      out.push({
        id: 'rss',
        icon: 'rss',
        label: this.t(this.subscribed() ? 'watch.panel.subscribedRss' : 'watch.panel.subscribeRss'),
        title: `${channel.title}: ${this.t('watch.panel.subscribeTitle')}`,
        pressed: this.subscribed(),
        disabled: this.resolving(),
        run: () => void this.toggleSubscribe(),
      });
    if (youtube)
      out.push({
        id: 'youtube',
        icon: 'bell',
        label: this.t('watch.panel.subscribeYoutube'),
        title: this.t('watch.panel.subscribeYoutubeTitle'),
        href: youtube,
      });
    if (channel?.id)
      out.push({
        id: 'channel',
        icon: 'channel',
        label: this.t('watch.panel.channel'),
        title: channel.title,
        link: ['/videos/channel', channel.id],
      });
    out.push({
      id: 'share',
      icon: 'share',
      label: this.t('watch.panel.share'),
      run: () => this.openShare(),
    });
    const entry = this.entry();
    if (entry) {
      const queued = this.queue.has(entry.key);
      const full = !queued && this.queue.full();
      out.push({
        id: 'queue',
        icon: 'queue',
        label: this.t(
          full ? 'videoQueue.full' : queued ? 'watch.panel.queueRemove' : 'watch.panel.queueAdd',
        ),
        pressed: queued,
        disabled: full,
        run: () => (queued ? this.queue.remove(entry.key) : this.queue.add(entry)),
      });
    }
    out.push({
      id: 'open',
      icon: 'open',
      label: this.t(
        this.source().kind === 'youtube' ? 'videoPlayer.openYoutube' : 'videoPlayer.openOriginal',
      ),
      href: this.source().url,
    });
    if (!this.status() && this.source().videoId && this.finder.available())
      out.push({
        id: 'find',
        icon: 'find',
        label: this.t('watch.panel.find'),
        disabled: this.finding(),
        run: () => this.findPosts(),
      });
    return out;
  }

  /** The channel's page with YouTube's own "confirm subscription" prompt. */
  private youtubeSubscribeUrl(): string | null {
    if (this.source().kind !== 'youtube') return null;
    const channel = this.channel();
    if (!channel) return null;
    // `channel.url` was checked to be an https youtube.com address.
    const page = channel.id
      ? `https://www.youtube.com/channel/${encodeURIComponent(channel.id)}`
      : channel.url;
    if (!page) return null;
    const url = new URL(page);
    url.searchParams.set('sub_confirmation', '1');
    return url.href;
  }

  /** The chapter the player is cued in, from the `t` cue (the playhead itself is not readable). */
  protected readonly currentChapter = computed(() => {
    const chapters = this.details()?.chapters ?? [];
    const at = this.playhead() ?? this.source().start ?? 0;
    let current = -1;
    chapters.forEach((chapter, index) => {
      if (chapter.seconds <= at) current = index;
    });
    return current;
  });

  /** Go to a chapter: seek the loaded player, else cue the embed there (paused). */
  protected cue(seconds: number): void {
    if (this.seeker()?.(seconds)) return;
    void this.router.navigate(['/watch'], {
      queryParams: { t: seconds },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected skip(segment: SponsorSegment): void {
    this.seeker()?.(segment.end);
  }

  protected clockOf(seconds: number): string {
    return clock(seconds);
  }

  protected excerpt(post: Status): string {
    const text = stripHtml(post.content ?? '');
    return text.length > 160 ? `${text.slice(0, 159)}…` : text;
  }

  protected repliesParams(post: Status): Record<string, string> {
    return watchParams(post, this.source(), this.server.baseUrl());
  }

  protected async toggleSubscribe(): Promise<void> {
    const channel = this.channel();
    if (!channel || this.resolving()) return;
    this.subscribeFailed.set(false);
    if (channel.id) {
      if (this.subscribed()) this.subs.remove(channel.id);
      else this.subs.add(channel.id, channel.title);
      return;
    }
    if (!channel.url) return;
    this.resolving.set(true);
    try {
      const found = await this.youtube.resolve(channel.url);
      this.resolved.set({ id: found.id, title: channel.title || found.title });
      this.subs.add(found.id, channel.title || found.title);
    } catch {
      this.subscribeFailed.set(true);
    } finally {
      this.resolving.set(false);
    }
  }

  protected findPosts(): void {
    const videoId = this.source().videoId;
    if (!videoId) return;
    this.find$?.unsubscribe();
    this.finding.set(true);
    this.find$ = this.finder.find(videoId).subscribe((posts) => {
      this.found.set(posts);
      this.finding.set(false);
    });
  }

  /** The link a shared post carries: the YouTube video at its cue, or the post itself. */
  private link(): string {
    const source = this.source();
    if (source.kind === 'youtube' && source.videoId) return shareUrl(source.videoId, source.start);
    if (source.kind === 'peertube') return source.url;
    return this.status()?.url ?? source.url;
  }

  private title(): string {
    const title = this.details()?.title || this.peertube()?.title || this.source().title;
    return title === 'YouTube' || title === 'PeerTube' ? '' : title;
  }

  protected openShare(): void {
    this.sharing.set(shareText({ title: this.title(), url: this.link(), tag: this.partyTag() }));
  }

  /** Quote a YouTube comment into the share sheet. */
  quote(comment: YoutubeComment): void {
    const attribution = this.transloco.translate('watch.panel.quoteAuthor', {
      author: comment.author,
    });
    this.sharing.set(
      shareText({
        title: this.title(),
        url: this.link(),
        tag: this.partyTag(),
        quote: { text: comment.text, attribution },
      }),
    );
  }
}
