import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
  untracked,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbHelp } from '../../design-system/help/help';
import { Playback, PlaybackHandle, PlaybackPosition } from './playback';
import { VideoSource } from './media-source';
import { queueEntry } from '../videos/watch-queue';
import { QueueButton } from './queue-button';
import { ClientPrefs } from '../../platform/storage/client-prefs';

// i18n videoPlayer.video: Video
// i18n videoPlayer.audio: Audio
// i18n videoPlayer.loadYoutube: Load YouTube player
// i18n videoPlayer.external: Loading this player connects to YouTube. Playback starts only when you press Play.
// i18n videoPlayer.openWatch: Open Watch
// i18n videoPlayer.openOriginal: Open original
// i18n videoPlayer.peertube: PeerTube video on {{host}}. Open Watch to play it here.
// i18n videoPlayer.openYoutube: Open on YouTube
// i18n videoPlayer.failed: Couldn't play this video. Try again or open the original.
// i18n videoPlayer.retry: Retry
// i18n videoPlayer.speed: Playback speed
// i18n videoPlayer.loading: Loading player…
// i18n videoPlayer.help: About YouTube playback
// i18n videoPlayer.positionUnavailable: YouTube opens paused at the link's start time. Your current playback position doesn't transfer between views.
// i18n videoPlayer.youtubeStopped: This YouTube player closes when another video starts or it scrolls out of view. Reload it to watch again.
const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

/** The playback time in a YouTube embed message, or null for anything else. */
export function embedTime(data: unknown): number | null {
  let message: unknown = data;
  if (typeof data === 'string') {
    if (data.length > 100_000) return null;
    try {
      message = JSON.parse(data);
    } catch {
      return null;
    }
  }
  const info = (message as { event?: unknown; info?: { currentTime?: unknown } } | null)?.info;
  const event = (message as { event?: unknown } | null)?.event;
  if (event !== 'infoDelivery' && event !== 'initialDelivery') return null;
  const time = info?.currentTime;
  return typeof time === 'number' && Number.isFinite(time) && time >= 0 ? time : null;
}

@Component({
  selector: 'app-video-player-controls',
  imports: [TranslocoPipe, RouterLink, MbButton, MbHelp, QueueButton],
  templateUrl: './video-player.html',
  styleUrl: './video-player.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { '(click)': '$event.stopPropagation()' },
})
export class VideoPlayer implements OnDestroy {
  readonly source = input.required<VideoSource>();
  readonly watch = input<Record<string, string> | null>(null);
  readonly inline = input(false);
  readonly compact = input(false);
  /** Off on Watch, whose own row has these links. */
  readonly showLinks = input(true);
  /** Off where the page already shows the title beside the player. */
  readonly showTitle = input(true);
  private playback = inject(Playback);
  private prefs = inject(ClientPrefs);
  private sanitizer = inject(DomSanitizer);
  private element = inject<ElementRef<HTMLElement>>(ElementRef);
  private native = viewChild<ElementRef<HTMLVideoElement>>('native');
  private frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private identity = computed(() => `${this.source().key}:${this.source().start ?? 0}`);
  protected activated = linkedSignal({
    source: () => ({
      identity: this.identity(),
      automatic: !this.inline() && this.prefs.autoLoadYoutubeWatch(),
    }),
    computation: ({ automatic }) => automatic,
  });
  protected failed = linkedSignal({ source: this.identity, computation: () => false });
  private retryVersion = signal(0);
  protected ready = signal(false);
  protected rate = signal(1);
  protected restoring = signal(false);
  private saved?: PlaybackPosition;
  private youtubeHandle?: PlaybackHandle;

  protected title = computed(() => this.source().title || '');
  /**
   * Seconds into the video, when the player reports it: a native video's
   * `timeupdate`, or the YouTube embed's `infoDelivery` messages. Null until
   * known. Read by Watch for chapters and SponsorBlock.
   */
  readonly playhead = signal<number | null>(null);
  /**
   * Inline players offer Queue beside Open Watch. Watch itself has its own
   * queue controls in the header, so the stage player does not repeat them.
   */
  protected queueItem = computed(() =>
    this.inline() ? queueEntry(this.source(), this.watch()) : null,
  );
  protected duration = computed(() => {
    const seconds = this.source().duration;
    if (!seconds) return '';
    return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0')}`;
  });
  protected embed = computed(() => {
    this.identity();
    const source = untracked(this.source);
    if (source.kind !== 'youtube' || !this.activated()) return null;
    const params = new URLSearchParams({
      autoplay: '0',
      loop: '0',
      playsinline: '1',
      controls: '1',
      start: String(source.start ?? 0),
      // postMessage only: lets Watch read the time and seek. No Google script
      // runs in this document (see the iframe effect below).
      enablejsapi: '1',
      origin: location.origin,
    });
    // Only a validated video ID from the source classifier reaches this constructed URL.
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${source.videoId}?${params}`,
    );
  });

  constructor() {
    effect(() => {
      this.identity();
      this.saved = this.playback.take(untracked(this.source).key);
      this.restoring.set(!!this.saved && untracked(this.source).kind === 'native');
      this.ready.set(false);
      this.rate.set(this.saved?.rate ?? 1);
      this.playhead.set(null);
    });
    effect((onCleanup) => {
      this.identity();
      const video = this.native()?.nativeElement;
      if (!video) return;
      this.retryVersion();
      const source = untracked(this.source);
      let disposed = false;
      let hls: import('hls.js').default | undefined;
      const startStreaming = () => hls?.startLoad();
      if (
        /\.m3u8(?:[?#]|$)/i.test(source.url) &&
        !video.canPlayType('application/vnd.apple.mpegurl')
      ) {
        void import('hls.js')
          .then(({ default: Hls }) => {
            if (disposed) return;
            if (!Hls.isSupported()) {
              this.failed.set(true);
              return;
            }
            hls = new Hls({ autoStartLoad: false });
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (data.fatal) this.failed.set(true);
            });
            hls.loadSource(source.url);
            hls.attachMedia(video);
            video.addEventListener('play', startStreaming);
            if (!video.paused || this.saved) hls.startLoad();
          })
          .catch(() => {
            if (!disposed) this.failed.set(true);
          });
      } else {
        video.src = source.url;
      }
      const handle = this.nativeHandle(video);
      const unregister = this.playback.register(handle);
      const started = () => this.playback.started(handle);
      const tick = () => this.playhead.set(video.currentTime);
      video.addEventListener('play', started);
      video.addEventListener('timeupdate', tick);
      onCleanup(() => {
        disposed = true;
        video.removeEventListener('play', startStreaming);
        hls?.destroy();
        video.removeEventListener('play', started);
        video.removeEventListener('timeupdate', tick);
        unregister();
        video.removeAttribute('src');
        video.load();
      });
    });
    effect((onCleanup) => {
      const iframe = this.frame()?.nativeElement;
      if (!iframe) return;
      // The official player stays in its cross-origin iframe. No Google script
      // executes in our document, where authentication tokens are stored.
      const handle: PlaybackHandle = {
        pause: () => {
          iframe.removeAttribute('src');
          this.activated.set(false);
        },
        position: () => ({ time: 0, volume: 1, muted: false, rate: 1 }),
      };
      this.youtubeHandle = handle;
      // The embed's postMessage channel: we ask it to report, and read only
      // numeric times from that exact frame on YouTube's embed origin.
      const listen = () =>
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
          YOUTUBE_EMBED_ORIGIN,
        );
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== YOUTUBE_EMBED_ORIGIN || event.source !== iframe.contentWindow) return;
        const time = embedTime(event.data);
        if (time !== null) this.playhead.set(time);
      };
      window.addEventListener('message', onMessage);
      iframe.addEventListener('load', listen);
      const unregister = this.playback.register(handle);
      // Loading an external player pauses all other media before the user can
      // play it. Starting another native player closes this iframe entirely.
      this.playback.started(handle);
      onCleanup(() => {
        window.removeEventListener('message', onMessage);
        iframe.removeEventListener('load', listen);
        unregister();
        this.youtubeHandle = undefined;
      });
    });
    afterNextRender(() => {
      if (!this.inline() || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => !entry.isIntersecting)) this.pause();
      });
      observer.observe(this.element.nativeElement);
      // The observer lives exactly as long as this component.
      this.observer = observer;
    });
  }

  private observer?: IntersectionObserver;

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.pause();
  }

  /**
   * Move playback to `seconds` without reloading: the native element, or the
   * loaded YouTube embed by postMessage. A paused video stays paused. False
   * when there is no loaded player to seek (the caller can cue a reload).
   */
  seekTo(seconds: number): boolean {
    const at = Math.max(0, seconds);
    const video = this.native()?.nativeElement;
    if (video) {
      video.currentTime = at;
      this.playhead.set(at);
      return true;
    }
    const frame = this.frame()?.nativeElement;
    if (!frame?.contentWindow || !this.ready()) return false;
    frame.contentWindow.postMessage(
      JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [at, true],
        id: 1,
        channel: 'widget',
      }),
      YOUTUBE_EMBED_ORIGIN,
    );
    this.playhead.set(at);
    return true;
  }

  private nativeHandle(video: HTMLVideoElement): PlaybackHandle {
    return {
      pause: () => {
        if (!video.paused) video.pause();
      },
      position: () => ({
        time: video.currentTime,
        volume: video.volume,
        muted: video.muted,
        rate: video.playbackRate,
      }),
    };
  }

  private pause(): void {
    const video = this.native()?.nativeElement;
    if (video && !video.paused) video.pause();
    this.youtubeHandle?.pause();
  }

  protected loaded(): void {
    const video = this.native()?.nativeElement;
    if (!video) return;
    if (this.saved) {
      video.currentTime = Math.max(
        0,
        Math.min(
          this.saved.time,
          Number.isFinite(video.duration) ? video.duration : this.saved.time,
        ),
      );
      video.volume = Math.max(0, Math.min(1, this.saved.volume));
      video.muted = this.saved.muted;
      video.playbackRate = this.saved.rate;
      this.saved = undefined;
      // Keep metadata preload for this element instead of reconfiguring its
      // loading behavior while the restored seek is pending.
    }
    this.ready.set(true);
  }

  protected prepareWatch(): void {
    const video = this.native()?.nativeElement;
    if (video) this.playback.handoff(this.source().key, this.nativeHandle(video));
    else this.pause();
  }

  protected retry(): void {
    this.failed.set(false);
    this.ready.set(false);
    if (this.source().kind === 'youtube') this.activated.set(false);
    else this.retryVersion.update((value) => value + 1);
  }

  protected setRate(event: Event): void {
    const rate = Number((event.target as HTMLSelectElement).value);
    this.rate.set(rate);
    const video = this.native()?.nativeElement;
    if (video) video.playbackRate = rate;
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    // Native controls, selects, and forms own their keyboard semantics.
    if (target !== event.currentTarget) {
      if (event.key !== 'Escape') event.stopPropagation();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const video = this.native()?.nativeElement;
    if (!video) return;
    switch (event.key.toLowerCase()) {
      case 'k':
      case ' ':
        if (video.paused) void video.play().catch(() => this.failed.set(true));
        else video.pause();
        break;
      case 'j':
      case 'l':
        video.currentTime = Math.max(
          0,
          Math.min(
            Number.isFinite(video.duration) ? video.duration : video.currentTime + 10,
            video.currentTime + (event.key.toLowerCase() === 'j' ? -10 : 10),
          ),
        );
        break;
      case 'm':
        video.muted = !video.muted;
        break;
      case 'f':
        if (document.fullscreenElement) void document.exitFullscreen();
        else void video.requestFullscreen?.().catch(() => undefined);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
}
