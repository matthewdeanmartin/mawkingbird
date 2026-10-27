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
import { ExternalMedia, postExternalMedia } from '../../audio-embeds/providers';
import type { WidgetController, WidgetState } from '../../audio-embeds/widget-api';
import { accountScopeSuffix } from '../../account-scope';
import { trackTitle } from './track-title';

const PROVIDERS_KEY = 'mockingbird_radio_providers';
const SETTINGS_KEY = 'mockingbird_radio_settings';

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
  external?: ExternalMedia;
}

/** Tab-lived audio and queue. Route components are only views of this session. */
@Injectable({ providedIn: 'root' })
export class RadioPlayer {
  readonly nativeOnly = signal(false);
  readonly fullView = signal(false);
  readonly playlist = signal<RadioTrack[] | null>(null);
  readonly scan = new MediaFeedScan(
    ['audio'],
    (post) =>
      post.media_attachments.some((media) => media.type === 'audio') ||
      (!this.nativeOnly() &&
        postExternalMedia(post).some((source) => !!source.embed && source.type !== 'video')),
  );
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
  /** Advance to the next track when one ends; off stops after each recording. */
  readonly continuous = signal(true);
  readonly selected = signal(-1);
  private readonly alternatives = signal<ReadonlyMap<string, string>>(new Map());
  /** Providers this account allowed to load and autoplay inside Radio. */
  readonly externalAllowed = signal<ReadonlySet<string>>(new Set());
  private widget?: WidgetController;
  private autoExternalPlay = false;
  readonly externalReady = signal(false);
  readonly queue = computed<RadioTrack[]>(
    () =>
      this.playlist() ??
      this.scan.posts().flatMap((post) => {
        const native = post.media_attachments
          .filter((media) => media.type === 'audio' && /^https?:\/\//i.test(media.url))
          .map((media, index) => ({ key: `${post.id}:${media.id || index}`, post, media }));
        const candidates = this.radioSources(post);
        const chosen = candidates.find((s) => s.key === this.alternatives().get(post.id));
        if (native.length && !chosen) return native;
        const external = chosen ?? candidates[0];
        return external
          ? [
              {
                key: `${post.id}:${external.key}`,
                post,
                external,
                media: {
                  id: external.key,
                  type: 'audio',
                  url: '',
                  preview_url: '',
                  description: external.label,
                } as MediaAttachment,
              },
            ]
          : native;
      }),
  );
  readonly current = computed(() => this.queue()[this.selected()]);
  /** Titles reported by loaded provider widgets, by track key; memory only. */
  private readonly reported = signal<ReadonlyMap<string, string>>(new Map());
  title(track: RadioTrack): string {
    return trackTitle(track, this.reported().get(track.key));
  }
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
    this.loadAllowed();
    this.loadSettings();
    effect(() => {
      const next = this.identity();
      if (identity !== next) {
        identity = next;
        this.loadAllowed();
        this.loadSettings();
        this.stop();
        this.scan.clear();
        this.playlist.set(null);
        this.started.set(false);
        this.scanReady.set(false);
        this.nativeOnly.set(false);
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

  /** Freeze the current queue before discovery changes its source. */
  editPlaylist(): void {
    if (this.playlist() === null) this.playlist.set([...this.queue()]);
  }
  tracks(post: Status): RadioTrack[] {
    const native = post.media_attachments
      .filter((m) => m.type === 'audio' && /^https?:\/\//i.test(m.url))
      .map((media, index) => ({ key: `${post.id}:${media.id || index}`, post, media }));
    return [
      ...native,
      ...this.radioSources(post).map((external) => ({
        key: `${post.id}:${external.key}`,
        post,
        external,
        media: {
          id: external.key,
          type: 'audio',
          url: '',
          preview_url: '',
          description: external.label,
        } as MediaAttachment,
      })),
    ];
  }
  addTracks(tracks: RadioTrack[]): void {
    this.editPlaylist();
    this.playlist.update((items) => {
      const keys = new Set(items!.map((item) => item.key));
      return [...items!, ...tracks.filter((item) => !keys.has(item.key) && !!keys.add(item.key))];
    });
  }
  replacePlaylist(tracks: RadioTrack[]): void {
    this.stop();
    this.playlist.set([...tracks]);
  }
  moveTrack(index: number, offset: number): void {
    this.editPlaylist();
    const items = [...this.queue()];
    const next = index + offset;
    if (!items[index] || !items[next]) return;
    const current = this.current()?.key;
    [items[index], items[next]] = [items[next], items[index]];
    this.playlist.set(items);
    this.selected.set(items.findIndex((item) => item.key === current));
  }
  removeTrack(index: number): void {
    this.editPlaylist();
    const current = this.current()?.key;
    if (this.queue()[index]?.key === current) this.stop();
    this.playlist.set(this.queue().filter((_, i) => i !== index));
    this.selected.set(this.queue().findIndex((item) => item.key === current));
  }
  select(index: number): void {
    if (!this.queue()[index]) return;
    this.failures = 0;
    this.activate(index);
  }
  radioSources(post: Status): ExternalMedia[] {
    return postExternalMedia(post).filter((s) => s.type === 'audio' && s.controllable && s.embed);
  }
  chooseExternal(post: Status, source: ExternalMedia): void {
    if (!this.radioSources(post).some((s) => s.key === source.key)) return;
    if (this.playlist() !== null) {
      const track = this.tracks(post).find((item) => item.external?.key === source.key);
      if (track) this.addTracks([track]);
      this.select(
        this.queue().findIndex(
          (item) => item.external?.key === source.key && item.post.id === post.id,
        ),
      );
      return;
    }
    this.alternatives.update((values) => new Map([...values, [post.id, source.key]]));
    this.select(this.queue().findIndex((track) => track.post.id === post.id));
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
    // Selecting or advancing is the request to listen; an allowed widget plays on load.
    this.autoExternalPlay = true;
    if (!this.hidden() && !this.current()?.external) this.play();
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
    if (track.external) {
      if (!this.widget) return;
      this.wantsPlay = true;
      this.waiting.set(true);
      this.playback.started(this.playbackHandle);
      this.document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((other) => {
        if (!other.paused) other.pause();
      });
      this.widget.play();
      return;
    }
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
        if (current() && this.wantsPlay) this.ended();
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
    this.autoExternalPlay = false;
    this.wantsPlay = false;
    this.audio?.pause();
    this.widget?.pause();
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
    if (this.playlist() !== null) return Promise.resolve();
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
    if (this.widget && Number.isFinite(value) && this.duration() > 0) {
      this.widget.seek(Math.max(0, Math.min(this.duration(), value)));
      return;
    }
    if (this.audio && Number.isFinite(value) && this.duration() > 0) {
      this.audio.currentTime = Math.max(0, Math.min(this.duration(), value));
      this.time.set(this.audio.currentTime);
    }
  }
  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    this.volume.set(Math.max(0, Math.min(1, value)));
    if (this.audio) this.audio.volume = this.volume();
    this.widget?.volume(this.volume());
    this.saveSettings();
  }
  setContinuous(value: boolean): void {
    this.continuous.set(value);
    this.saveSettings();
  }
  private ended(): void {
    if (this.continuous()) void this.advance();
    else this.pause();
  }
  private loadSettings(): void {
    let data: { continuous?: unknown; volume?: unknown } | null;
    try {
      data = JSON.parse(localStorage.getItem(SETTINGS_KEY + accountScopeSuffix()) ?? 'null');
    } catch {
      data = null;
    }
    this.continuous.set(data?.continuous !== false);
    const volume = typeof data?.volume === 'number' ? data.volume : 1;
    this.volume.set(Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1);
  }
  private saveSettings(): void {
    try {
      localStorage.setItem(
        SETTINGS_KEY + accountScopeSuffix(),
        JSON.stringify({ continuous: this.continuous(), volume: this.volume() }),
      );
    } catch {
      /* Settings still apply for this tab. */
    }
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
    this.alternatives.set(new Map());
    this.outlet.component.set(null);
  }
  private releaseAudio(): void {
    const audio = this.audio;
    this.audio = undefined;
    this.pause();
    this.widget = undefined;
    this.externalReady.set(false);
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.remove();
    }
  }

  attachWidget(key: string, controller: WidgetController): void {
    if (key !== this.current()?.key || this.hidden()) {
      controller.destroy();
      return;
    }
    this.widget = controller;
    this.externalReady.set(true);
    controller.volume(this.volume());
    if (this.autoExternalPlay && this.externalAllowed().has(this.current()!.external!.provider))
      this.play();
  }
  /** Remember consent for a provider and start the current track from this click. */
  allowProvider(provider: string): void {
    this.saveAllowed(new Set([...this.externalAllowed(), provider]));
    if (this.current()?.external?.provider === provider) this.autoExternalPlay = true;
  }
  forgetProvider(provider: string): void {
    this.saveAllowed(new Set([...this.externalAllowed()].filter((p) => p !== provider)));
    if (this.current()?.external?.provider === provider) this.closeWidget();
  }
  private loadAllowed(): void {
    try {
      const data: unknown = JSON.parse(
        localStorage.getItem(PROVIDERS_KEY + accountScopeSuffix()) ?? '[]',
      );
      this.externalAllowed.set(
        new Set(Array.isArray(data) ? data.filter((p) => typeof p === 'string') : []),
      );
    } catch {
      this.externalAllowed.set(new Set());
    }
  }
  private saveAllowed(values: ReadonlySet<string>): void {
    this.externalAllowed.set(values);
    try {
      localStorage.setItem(PROVIDERS_KEY + accountScopeSuffix(), JSON.stringify([...values]));
    } catch {
      /* Consent still applies for this tab. */
    }
  }
  widgetState(key: string, state: WidgetState): void {
    if (key !== this.current()?.key || this.hidden()) return;
    if (state.title) {
      const title = state.title;
      this.reported.update((titles) => new Map([...titles, [key, title]]));
    }
    if (state.error) {
      this.pause();
      this.blocked.set(true);
      return;
    }
    if (typeof state.time === 'number' && Number.isFinite(state.time))
      this.time.set(Math.max(0, state.time));
    if (typeof state.duration === 'number' && Number.isFinite(state.duration))
      this.duration.set(Math.max(0, state.duration));
    if (state.ended && this.wantsPlay) {
      this.ended();
      return;
    }
    if (state.playing !== undefined) {
      this.playing.set(state.playing);
      this.waiting.set(false);
      if (state.playing) {
        this.wantsPlay = true;
        this.playback.started(this.playbackHandle);
        void this.prefetch();
      } else this.wantsPlay = false;
    }
  }
  /** Closing unloads this track's frame; the provider stays allowed. */
  closeWidget(): void {
    this.pause();
    this.widget = undefined;
    this.externalReady.set(false);
  }
}
