import { DOCUMENT } from '@angular/common';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  InjectionToken,
  signal,
  Type,
} from '@angular/core';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { MediaFeedScan } from '../../media-feed-scan';
import { MediaAttachment, Status } from '../../models';
import { TrustedAccounts } from '../../trusted-accounts';
import { FollowTrust } from '../../follow-trust';
import { Playback, PlaybackHandle } from '../../video-player/playback';
import { RadioOutlet } from '../../radio-outlet';

export const RADIO_AUDIO = new InjectionToken<() => HTMLAudioElement>('Radio audio factory', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.createElement('audio');
  },
});
export interface RadioTrack {
  key: string;
  post: Status;
  media: MediaAttachment;
}

/** Tab-lived audio and queue. Route components are only views of this session. */
@Injectable({ providedIn: 'root' })
export class RadioPlayer {
  readonly scan = new MediaFeedScan();
  readonly source = signal<'account' | 'home' | 'list'>('account');
  readonly handle = signal('');
  readonly listId = signal('');
  readonly started = signal(false);
  readonly scanReady = signal(false);
  readonly active = signal(false);
  readonly playing = signal(false);
  readonly waiting = signal(false);
  readonly blocked = signal(false);
  readonly skipped = signal(0);
  readonly time = signal(0);
  readonly duration = signal(0);
  readonly volume = signal(1);
  readonly selected = signal(-1);
  readonly queue = computed<RadioTrack[]>(() =>
    this.scan
      .posts()
      .flatMap((post) =>
        post.media_attachments
          .filter((media) => media.type === 'audio' && /^https?:\/\//i.test(media.url))
          .map((media, index) => ({ key: `${post.id}:${media.id || index}`, post, media })),
      ),
  );
  readonly current = computed(() => this.queue()[this.selected()]);
  private readonly trusted = inject(TrustedAccounts);
  private readonly follows = inject(FollowTrust);
  private readonly revealed = signal<ReadonlySet<string>>(new Set());
  readonly hidden = computed(() => {
    const post = this.current()?.post;
    this.follows.revision();
    return (
      !!post &&
      !this.revealed().has(post.id) &&
      (post.spoiler_text
        ? !this.trusted.cwExpanded(post.account)
        : !!post.sensitive && !this.trusted.sensitiveShown(post.account))
    );
  });
  private readonly document = inject(DOCUMENT);
  private readonly createAudio = inject(RADIO_AUDIO);
  private readonly outlet = inject(RadioOutlet);
  private readonly playback = inject(Playback);
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  private audio?: HTMLAudioElement;
  private dock?: Type<unknown>;
  private generation = 0;
  private prefetchTail = '';
  private more?: Promise<void>;
  private failures = 0;
  private wantsPlay = false;
  private readonly failedAudio = new WeakSet<HTMLAudioElement>();
  private readonly playbackHandle: PlaybackHandle = {
    pause: () => this.pause(),
    position: () => ({ time: this.time(), volume: this.volume(), muted: false, rate: 1 }),
  };

  constructor() {
    const unregister = this.playback.register(this.playbackHandle);
    const otherStarted = (event: Event) => {
      if (event.target !== this.audio && (event.target as Element)?.matches?.('audio, video'))
        this.pause();
    };
    this.document.addEventListener('play', otherStarted, true);
    let identity = this.identity();
    effect(() => {
      const next = this.identity();
      if (identity !== next) {
        identity = next;
        this.stop();
        this.scan.clear();
        this.started.set(false);
        this.scanReady.set(false);
        this.handle.set('');
        this.listId.set('');
      }
    });
    effect(() => {
      if (this.hidden() && this.playing()) this.pause();
    });
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      this.scan.cancel();
      unregister();
      this.document.removeEventListener('play', otherStarted, true);
    });
  }
  private identity(): string {
    return `${this.auth.kind()}:${this.auth.token()}:${this.server.baseUrl()}`;
  }

  select(index: number): void {
    if (!this.queue()[index]) return;
    this.failures = 0;
    this.activate(index);
  }
  installDock(component: Type<unknown>): void {
    this.dock = component;
  }
  private activate(index: number): void {
    this.releaseAudio();
    this.selected.set(index);
    this.active.set(true);
    this.blocked.set(false);
    this.time.set(0);
    this.duration.set(0);
    this.outlet.component.set(this.dock ?? null);
    if (!this.hidden()) this.play();
  }
  reveal(): void {
    const post = this.current()?.post;
    if (!post) return;
    this.revealed.update((items) => new Set([...items, post.id]));
    this.play();
  }
  play(): void {
    const track = this.current();
    if (!track || this.hidden()) return;
    this.blocked.set(false);
    this.waiting.set(false);
    if (!this.audio) {
      const audio = this.createAudio();
      this.audio = audio;
      audio.hidden = true;
      audio.dataset['radio'] = 'true';
      audio.preload = 'metadata';
      audio.volume = this.volume();
      const current = () => this.audio === audio;
      audio.addEventListener('timeupdate', () => {
        if (current()) this.time.set(audio.currentTime);
      });
      audio.addEventListener('loadedmetadata', () => {
        if (current()) this.duration.set(Number.isFinite(audio.duration) ? audio.duration : 0);
      });
      audio.addEventListener('playing', () => {
        if (!current()) return;
        if (!this.wantsPlay) {
          audio.pause();
          return;
        }
        this.playing.set(true);
        this.waiting.set(false);
        this.failures = 0;
        this.playback.started(this.playbackHandle);
        void this.prefetch();
      });
      audio.addEventListener('pause', () => {
        if (current()) this.playing.set(false);
      });
      audio.addEventListener('waiting', () => {
        if (current() && this.wantsPlay) this.waiting.set(true);
      });
      audio.addEventListener('ended', () => {
        if (current() && this.wantsPlay) void this.advance();
      });
      audio.addEventListener('error', () => {
        this.unavailable(audio);
      });
      this.document.body.append(audio);
      audio.src = track.media.url;
    }
    const audio = this.audio;
    this.failedAudio.delete(audio);
    const generation = ++this.generation;
    this.wantsPlay = true;
    this.waiting.set(true);
    this.playback.started(this.playbackHandle);
    this.document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((other) => {
      if (other !== audio && !other.paused) other.pause();
    });
    void audio.play().catch((error: unknown) => {
      if (generation !== this.generation || this.audio !== audio) return;
      // Autoplay rejection needs a fresh user gesture, not a skipped valid track.
      if ((error as { name?: string }).name === 'NotSupportedError') {
        this.unavailable(audio);
      } else {
        this.wantsPlay = false;
        this.playing.set(false);
        this.waiting.set(false);
        this.blocked.set(true);
      }
    });
  }
  private unavailable(audio: HTMLAudioElement): void {
    if (this.audio !== audio || this.failedAudio.has(audio)) return;
    this.failedAudio.add(audio);
    this.skipped.update((count) => count + 1);
    if (!this.wantsPlay || ++this.failures >= 3) {
      this.pause();
      this.blocked.set(true);
    } else void this.advance();
  }
  pause(): void {
    this.generation++;
    this.wantsPlay = false;
    this.audio?.pause();
    this.playing.set(false);
    this.waiting.set(false);
  }
  toggle(): void {
    if (this.playing() || this.waiting()) this.pause();
    else this.play();
  }
  previous(): void {
    if (this.selected() > 0) this.select(this.selected() - 1);
  }
  next(): void {
    this.failures = 0;
    void this.advance();
  }
  private async advance(): Promise<void> {
    this.pause();
    const generation = this.generation;
    const index = this.selected() + 1;
    if (!this.queue()[index]) {
      this.waiting.set(true);
      await this.prefetch();
      if (generation !== this.generation) return;
      this.waiting.set(false);
    }
    if (this.queue()[index]) this.activate(index);
  }
  private prefetch(): Promise<void> {
    if (this.more) return this.more;
    if (this.scan.loading()) return this.scan.whenIdle();
    const queue = this.queue();
    const tail = queue.at(-1)?.key ?? '';
    if (
      queue.length - this.selected() > 3 ||
      this.scan.exhausted() ||
      this.scan.failed() ||
      this.scan.loading() ||
      this.prefetchTail === tail
    )
      return Promise.resolve();
    this.prefetchTail = tail;
    this.more = this.scan.more().finally(() => {
      this.more = undefined;
    });
    return this.more;
  }
  seek(value: number): void {
    if (this.audio && Number.isFinite(value) && this.duration() > 0) {
      this.audio.currentTime = Math.max(0, Math.min(this.duration(), value));
      this.time.set(this.audio.currentTime);
    }
  }
  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    this.volume.set(Math.max(0, Math.min(1, value)));
    if (this.audio) this.audio.volume = this.volume();
  }
  stop(): void {
    this.releaseAudio();
    if (this.more) this.scan.cancel();
    this.active.set(false);
    this.selected.set(-1);
    this.blocked.set(false);
    this.skipped.set(0);
    this.revealed.set(new Set());
    this.prefetchTail = '';
    this.outlet.component.set(null);
  }
  private releaseAudio(): void {
    const audio = this.audio;
    this.audio = undefined;
    this.pause();
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.remove();
    }
  }
}
