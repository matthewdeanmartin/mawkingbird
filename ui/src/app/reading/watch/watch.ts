import { StatusReplacement, replaceStatus } from '../../feeds/reconcile-status';
import { translatedComputed } from '../../i18n/translated';
import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ReadingBack } from '../../shell/reading-back';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Location } from '@angular/common';
import { Api } from '../../platform/api/api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThreadLoader } from '../read/thread-loader';
import { VideoPlayer } from '../video-player/video-player';
import {
  attachmentSource,
  cueSeconds,
  statusVideo,
  youtubeSource,
} from '../video-player/media-source';
import { StatusCard } from '../../posts/status-card/status-card';
import { StatusVisibility } from '../../moderation/status-visibility';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { FollowTrust } from '../../accounts/follow-trust';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { ReadingZen } from '../reading-zen';
import { MbButton } from '../../design-system/button/button';
import {
  anonymousStatusRouteRef,
  parseAnonymousStatusRouteRef,
} from '../../accounts/anonymous/anonymous-route-ref';
import { Status } from '../../platform/api/models';
import { postLoadTarget } from '../../posts/copy-link/deep-links';
import { PartyConversation } from './party-conversation';
import { WatchPost, WatchVideoPanel } from './watch-video-panel';
import { PeerTubeVideo, PeerTubeVideos } from '../videos/peertube';
import { YoutubeComment } from '../videos/youtube-details';
import {
  pickWatchParams,
  QueuedVideo,
  queueKey,
  validWatchParams,
  WatchQueue,
} from '../videos/watch-queue';

// i18n watch.title: Watch
// i18n watch.loading: Opening video…
// i18n watch.unavailable: This video is unavailable or you don't have access to its post.
// i18n watch.browseVideos: Browse videos
// i18n watch.reveal: Show video
// i18n watch.hiddenMedia: Media is hidden by your reading preferences. You can open this video without changing them.
// i18n watch.warning: This post has a content warning or sensitive media.
// i18n watch.filterWarning: This post matched a content filter.
// i18n watch.conversation: Conversation
// i18n watch.noComments: No comments yet.
// i18n watch.thread: Open full thread
// i18n watch.queue.next: Next: {{title}}
// i18n watch.queue.nextUntitled: Next in queue
// i18n watch.queue.nextShort: Next
// i18n watch.queue.previous: Previous
// i18n watch.queue.previousTitle: The video you watched before this one
// i18n watch.queue.open: Queue ({{count}})
// i18n watch.peertube.loading: Opening the PeerTube video…
// i18n watch.peertube.failed: This PeerTube server didn't hand over the video.
// i18n watch.peertube.open: Open it on {{host}}
@Component({
  selector: 'app-watch',
  imports: [
    VideoPlayer,
    StatusCard,
    TranslocoPipe,
    MbButton,
    PartyConversation,
    ReadingBack,
    RouterLink,
    WatchVideoPanel,
  ],
  providers: [ThreadLoader],
  templateUrl: './watch.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './watch.css',
})
export class Watch {
  protected party = viewChild(PartyConversation);
  /** The source post's card: Like and Boost in the row go through it. */
  private postCard = viewChild<WatchPost>('postCard');
  /** Set after rendering: the card exists a moment before its inputs do. */
  protected readonly renderedCard = signal<WatchPost | null>(null);
  private panel = viewChild<{ quote(comment: YoutubeComment): void }>('panel');
  private player = viewChild<{
    seekTo(seconds: number): boolean;
    playhead: () => number | null;
  }>('player');
  /** The loaded player's time, for chapters and SponsorBlock. */
  protected readonly playhead = computed(() => this.player()?.playhead() ?? null);
  private peertubeVideos = inject(PeerTubeVideos);
  /** A PeerTube link's video, resolved from its instance (spec/youtube-client.md, S4). */
  protected readonly peertube = signal<PeerTubeVideo | null>(null);
  protected readonly peertubeFailed = signal(false);
  /** What the player plays: the source itself, or a PeerTube link's resolved stream. */
  protected readonly playable = computed(() => {
    const source = this.source();
    if (source?.kind !== 'peertube') return source;
    return this.peertube()?.playable ?? null;
  });
  /** Lets the panel move the loaded player (chapters, SponsorBlock Skip). */
  protected readonly seeker = (seconds: number): boolean => this.player()?.seekTo(seconds) ?? false;
  protected partySession = computed(() => JSON.stringify(this.params()));
  protected loader = inject(ThreadLoader);
  private route = inject(ActivatedRoute);
  private server = inject(Server);
  private auth = inject(Auth);
  private visibility = inject(StatusVisibility);
  private trusted = inject(TrustedAccounts);
  private followTrust = inject(FollowTrust);
  private prefs = inject(ClientPrefs);
  private router = inject(Router);
  private location = inject(Location);
  private api = inject(Api);
  private destroyRef = inject(DestroyRef);
  protected params = signal<Record<string, string>>({});
  protected error = signal('');
  /** The id handed to the loader: the link's own, or a public ref for another server's post. */
  private readonly target = signal('');
  private address: ParamMap | null = null;
  protected direct = signal(false);
  protected revealed = linkedSignal({ source: this.params, computation: () => false });
  protected hidden = computed(() => {
    const status = this.loader.status();
    return status ? this.visibility.rendersNothing(status, 'thread') : false;
  });
  protected warning = computed(() => {
    const status = this.loader.status();
    if (!status) return false;
    this.trusted.entries();
    this.followTrust.revision();
    return (
      (!!status.spoiler_text && !this.trusted.cwExpanded(status.account)) ||
      (status.sensitive && !this.trusted.sensitiveShown(status.account)) ||
      // A video its PeerTube instance marks NSFW waits like sensitive media.
      (!!this.peertube()?.sensitive && !this.trusted.sensitiveShown(status.account))
    );
  });
  protected filterWarning = translatedComputed(() => {
    const status = this.loader.status();
    return status
      ? this.visibility
          .activeFilters(status, 'thread')
          .some((filter) => filter.filter.filter_action === 'warn')
      : false;
  });
  protected textOnly = computed(() => !this.prefs.showImages() || this.prefs.feedReader());
  protected gated = computed(
    () => !this.revealed() && (this.warning() || this.filterWarning() || this.textOnly()),
  );
  protected source = computed(() => {
    const params = this.params();
    const status = this.loader.status();
    if (this.error() || this.hidden()) return null;
    // `t` cues the embed (a chapter, a shared moment); playback still waits for the reader.
    const cue = cueSeconds(params['t']);
    if (this.direct())
      return youtubeSource(
        `https://youtu.be/${params['youtube'] ?? ''}${cue !== undefined ? `?t=${cue}` : ''}`,
      );
    if (!status) return null;
    if (params['attachment']) {
      const media =
        status.media_attachments.find((item) => item.id === params['attachment']) ??
        this.onlyVideoOfForeignPost(status);
      return media ? attachmentSource(media) : null;
    }
    const video = statusVideo(status);
    if (video?.kind === 'peertube')
      return params['peertube'] && video.peertube?.id === params['peertube'] ? video : null;
    if (!video || video.videoId !== params['youtube']) return null;
    return cue !== undefined ? { ...video, start: cue } : video;
  });

  constructor() {
    afterRenderEffect(() => this.renderedCard.set(this.postCard() ?? null));
    // Resolve a PeerTube link once per video; the player waits for the stream.
    let peertubeKey = '';
    effect(() => {
      const source = this.source();
      const key = source?.kind === 'peertube' ? source.key : '';
      if (key === peertubeKey) return;
      peertubeKey = key;
      untracked(() => {
        this.peertube.set(null);
        this.peertubeFailed.set(false);
        if (!source || !key) return;
        this.peertubeVideos
          .get(source)
          .then((video) => {
            if (peertubeKey !== key) return;
            this.peertube.set(video);
            if (!video.playable) this.peertubeFailed.set(true);
          })
          .catch(() => {
            if (peertubeKey === key) this.peertubeFailed.set(true);
          });
      });
    });
    const release = inject(ReadingZen).hold('full');
    this.destroyRef.onDestroy(() => {
      this.loader.destroy();
      release();
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.open(params));
    // Another account: stop the player and find the post again as that account sees it.
    let identity: string | undefined;
    effect(() => {
      const kind = this.auth.kind();
      const next = `${kind}:${this.auth.token() ?? ''}:${kind === 'bluesky' ? (this.auth.account()?.id ?? '') : ''}:${this.server.baseUrl()}`;
      if (identity !== undefined && identity !== next) {
        untracked(() => this.address && this.open(this.address));
      }
      identity = next;
    });
  }

  /** Load what the address names, for whoever is reading now. */
  private open(params: ParamMap): void {
    this.address = params;
    this.loader.destroy();
    this.loader.status.set(null);
    this.loader.descendants.set([]);
    this.loader.loadError.set(null);
    this.loader.publicContextUnavailable.set(false);
    this.params.set(Object.fromEntries(params.keys.map((key) => [key, params.get(key) ?? ''])));
    this.error.set('');
    this.partyRoot.set(null);
    this.partyReplies.set([]);
    const post = params.get('post');
    this.direct.set(!post);
    this.target.set('');
    if (!post) {
      this.loader.loading.set(false);
      if (!this.source()) this.error.set('watch.unavailable');
      return;
    }
    // A shared link names its post by the sharer's server-local id; the loader
    // finds this reader's copy, whatever account or server they read from.
    const target = postLoadTarget(this.params(), this.server.baseUrl() || location.origin);
    if (!target) {
      this.error.set('watch.unavailable');
      return;
    }
    this.target.set(target);
    this.loader.load(target);
  }

  /** The chat box can reply to the video post only when it lives on the signed-in server. */
  protected readonly canReply = computed(() => {
    const status = this.loader.status();
    return (
      !!status &&
      this.auth.kind() === 'mastodon' &&
      !this.auth.isAnonymous &&
      !this.loader.isAnonymousPublic() &&
      !this.loader.isTwitter() &&
      !this.loader.isRss() &&
      !this.loader.isMessageStatus() &&
      (!status.provider || status.provider === 'mastodon') &&
      /^[A-Za-z0-9_-]+$/.test(status.id)
    );
  });

  /**
   * Where signing in from here comes back to.
   *
   * A shared link names the post by the sharer's server-local id, which another
   * account's server can't read. The post's public address is already known by
   * now, so the way back carries that and the reader's own server looks it up.
   */
  protected readonly signInNext = computed(() => {
    const params = { ...this.params() };
    const status = this.loader.status();
    const id = params['post'] ?? '';
    if (this.auth.kind() !== 'mastodon' && status?.url && /^\d+$/.test(id) && params['server']) {
      params['post'] = anonymousStatusRouteRef({
        server: params['server'],
        id,
        originalUrl: status.url,
      });
      delete params['server'];
    }
    const query = new URLSearchParams(params).toString();
    return query ? `/watch?${query}` : '/watch';
  });

  /**
   * The video of a post looked up through another server: the copy there has
   * its own attachment ids, so the link's id can't match. Only when there is
   * exactly one video, so the wrong one is never played.
   */
  private onlyVideoOfForeignPost(status: Status) {
    if (!parseAnonymousStatusRouteRef(this.target())) return undefined;
    const videos = status.media_attachments.filter((item) => item.type === 'video');
    return videos.length === 1 ? videos[0] : undefined;
  }

  /** `?tags=a,b`: hashtags a party opened from the finder starts with. */
  protected readonly partyTags = computed(() =>
    (this.params()['tags'] ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8),
  );

  protected readonly queue = inject(WatchQueue);

  /** This video's place in the queue, whether or not it is queued or loads. */
  protected readonly currentKey = computed(() => {
    const params = pickWatchParams(this.params());
    return validWatchParams(params) ? queueKey(params) : null;
  });

  /** The current video as a queue entry, once there is a source to name it. */
  protected readonly currentEntry = computed<Omit<QueuedVideo, 'addedAt'> | null>(() => {
    const key = this.currentKey();
    const source = this.source();
    if (!key || !source) return null;
    return {
      key,
      title: source.title && source.title !== 'YouTube' ? source.title : '',
      ...(source.poster ? { poster: source.poster } : {}),
      params: pickWatchParams(this.params()),
    };
  });

  protected readonly upNext = computed(() => this.queue.next(this.currentKey()));

  /** The video on screen, for the playlist; titled only once it has loaded. */
  private readonly playing = computed<Omit<QueuedVideo, 'addedAt'> | null>(() => {
    const key = this.currentKey();
    return (
      this.currentEntry() ??
      (key ? { key, title: '', params: pickWatchParams(this.params()) } : null)
    );
  });

  /**
   * Play the next queued video, retiring this one from the queue.
   *
   * Explicit rather than on `ended`: the player never advances by itself (see
   * video-player.spec.ts), and Watch keeps that promise.
   */
  protected playNext(): void {
    this.play(this.queue.advance(this.playing()));
  }

  protected playPrevious(): void {
    this.play(this.queue.goBack(this.playing()));
  }

  /** Replaces the address, so Back leaves Watch and is not a tour of the playlist. */
  private play(video: QueuedVideo | null): void {
    if (!video) return;
    void this.router.navigate(['/watch'], { queryParams: video.params, replaceUrl: true });
  }

  /** The YouTube video ID, for read-only YouTube comments. */
  protected readonly youtubeVideoId = computed(() => {
    const source = this.source();
    return source?.kind === 'youtube' ? (source.videoId ?? null) : null;
  });

  protected onQuoted(comment: YoutubeComment): void {
    this.panel()?.quote(comment);
  }

  /**
   * A bare YouTube video's party has no post to gather replies under, so the
   * first chat message shares the video (see PartyConversation.shareLink).
   */
  protected readonly shareLink = computed(() => {
    const id = this.youtubeVideoId();
    return this.direct() && id ? `https://www.youtube.com/watch?v=${id}` : null;
  });
  /** The share post a party started here: the chat's root from then on. */
  protected readonly partyRoot = signal<Status | null>(null);
  protected readonly partyReplies = signal<Status[]>([]);

  /**
   * Adopt the share post without reloading the player: the address gains the
   * post so it is the party's link, but the router is not told, so the video
   * keeps playing.
   */
  protected onStarted(status: Status): void {
    this.partyRoot.set(status);
    const query = new URLSearchParams({
      ...this.params(),
      post: status.id,
      server: this.server.baseUrl() || location.origin,
    });
    this.location.replaceState('/watch', query.toString());
  }

  protected refreshPartyReplies(): void {
    const root = this.partyRoot();
    if (!root) return;
    this.api
      .getContext(root.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (context) => {
          if (this.partyRoot()?.id === root.id) this.partyReplies.set(context.descendants);
        },
        error: () => undefined,
      });
  }

  protected onPartyReply(reply: Status): void {
    this.partyReplies.update((replies) => [...replies, reply]);
  }

  protected onReply(reply: Status): void {
    this.loader.descendants.update((replies) => [...replies, reply]);
  }
  protected onCommentChanged(status: Status): void {
    this.loader.descendants.update((items) =>
      items.map((item) => (item.id === status.id ? status : item)),
    );
  }
  protected onCommentReplaced(change: StatusReplacement): void {
    this.loader.descendants.update((items) => replaceStatus(items, change));
  }
  protected onCommentDeleted(status: Status): void {
    this.loader.descendants.update((items) => items.filter((item) => item.id !== status.id));
  }
}
