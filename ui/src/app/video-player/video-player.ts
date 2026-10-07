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
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { MbHelp } from '../design-system/help/help';
import { Playback, PlaybackHandle, PlaybackPosition } from './playback';
import { VideoSource } from './media-source';

// i18n videoPlayer.video: Video
// i18n videoPlayer.audio: Audio
// i18n videoPlayer.loadYoutube: Load YouTube player
// i18n videoPlayer.external: Loading this player connects to YouTube. Playback starts only when you press Play.
// i18n videoPlayer.openWatch: Open Watch
// i18n videoPlayer.openOriginal: Open original
// i18n videoPlayer.openYoutube: Open on YouTube
// i18n videoPlayer.failed: Couldn't play this video. Try again or open the original.
// i18n videoPlayer.retry: Retry
// i18n videoPlayer.speed: Playback speed
// i18n videoPlayer.loading: Loading player…
// i18n videoPlayer.help: About YouTube playback
// i18n videoPlayer.positionUnavailable: YouTube opens paused at the link's start time. Your current playback position doesn't transfer between views.
// i18n videoPlayer.youtubeStopped: This YouTube player closes when another video starts or it scrolls out of view. Reload it to watch again.
@Component({
  selector: 'app-video-player-controls',
  imports: [TranslocoPipe, RouterLink, MbButton, MbHelp],
  templateUrl: './video-player.html',
  styleUrl: './video-player.css',
  host: { '(click)': '$event.stopPropagation()' },
})
export class VideoPlayer implements OnDestroy {
  readonly source = input.required<VideoSource>();
  readonly watch = input<Record<string, string> | null>(null);
  readonly inline = input(false);
  readonly compact = input(false);
  private playback = inject(Playback);
  private sanitizer = inject(DomSanitizer);
  private element = inject<ElementRef<HTMLElement>>(ElementRef);
  private native = viewChild<ElementRef<HTMLVideoElement>>('native');
  private frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private identity = computed(() => `${this.source().key}:${this.source().start ?? 0}`);
  protected activated = linkedSignal({ source: this.identity, computation: () => false });
  protected failed = linkedSignal({ source: this.identity, computation: () => false });
  protected ready = signal(false);
  protected rate = signal(1);
  protected restoring = signal(false);
  private saved?: PlaybackPosition;
  private youtubeHandle?: PlaybackHandle;

  protected title = computed(() => this.source().title || '');
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
    });
    effect((onCleanup) => {
      this.identity();
      const video = this.native()?.nativeElement;
      if (!video) return;
      const handle = this.nativeHandle(video);
      const unregister = this.playback.register(handle);
      const started = () => this.playback.started(handle);
      video.addEventListener('play', started);
      onCleanup(() => {
        video.removeEventListener('play', started);
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
      const unregister = this.playback.register(handle);
      // Loading an external player pauses all other media before the user can
      // play it. Starting another native player closes this iframe entirely.
      this.playback.started(handle);
      onCleanup(() => {
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
    else this.native()?.nativeElement.load();
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
