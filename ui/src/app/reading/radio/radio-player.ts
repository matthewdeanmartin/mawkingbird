import { DOCUMENT } from '@angular/common';
import {
  computed,
  DestroyRef,
  untracked,
  effect,
  inject,
  Injectable,
  InjectionToken,
  signal,
  Type,
} from '@angular/core';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { MediaFeedScan } from '../media-feed-scan';
import { MediaAttachment, Status } from '../../platform/api/models';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { FollowTrust } from '../../accounts/follow-trust';
import { Playback, PlaybackHandle } from '../video-player/playback';
import { RadioOutlet } from '../../shell/radio-outlet';
import { ExternalMedia, postExternalMedia } from '../audio-embeds/providers';
import { youtubeMusic } from '../audio-embeds/youtube-music';
import type { WidgetController, WidgetState } from '../audio-embeds/widget-api';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { ProviderConsent } from '../audio-embeds/provider-consent';
import { ProviderPreferences } from '../audio-embeds/provider-preferences';
import { trackTitle } from './track-title';
import { LinkedAudioResolver } from './linked-audio-resolver';

const SETTINGS_KEY = 'mockingbird_radio_settings';
const POSITIONS_KEY = 'mockingbird_radio_positions';
/** Recordings at least this long (seconds) remember where listening stopped. */
export const RESUME_MINIMUM = 600;
const POSITION_LIMIT = 100;
interface SavedPosition {
  time: number;
  duration: number;
  at: number;
}

export const RADIO_AUDIO = new InjectionToken<() => HTMLAudioElement>('Radio audio factory', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.createElement('audio');
  },
});
/** Feeds and hashtags scan posts; `saved` runs a main-Search saved search; `catalogue` searches public catalogues; `links` opens pasted links. */
export type RadioSource = 'account' | 'home' | 'list' | 'tag' | 'saved' | 'catalogue' | 'links';
/** `#robotmusic`, `robotmusic` or a pasted tag URL → `robotmusic`; null if not a tag. */
export function radioTag(raw: string): string | null {
  const value = raw
    .trim()
    .replace(/^https?:\/\/[^/]+\/tags\//i, '')
    .replace(/^#/, '');
  return /^[\p{L}\p{N}_]{1,100}$/u.test(value) ? value : null;
}
export interface RadioTrack {
  key: string;
  post: Status;
  media: MediaAttachment;
  external?: ExternalMedia;
  /** A title the listener gave this playlist entry. */
  title?: string;
}

/**
 * Whether a track can join a queue: it plays here and reports its end. Other
 * players (Spotify, Bandcamp, Apple Music…) are Singles that play on their own page.
 */
export function isContinuous(track: RadioTrack): boolean {
  return !track.external || track.external.controllable;
}

/**
 * What a track plays, whichever copy of a post carried it: the audio file, or
 * the provider's track. Two keys can name one recording (a post read from your
 * server and from its origin have different ids); this never does.
 */
export function recordingId(track: RadioTrack): string {
  return track.external ? `player:${track.external.key}` : `file:${track.media.url}`;
}

/** Tab-lived audio and queue. Route components are only views of this session. */
@Injectable({ providedIn: 'root' })
export class RadioPlayer {
  readonly nativeOnly = signal(false);
  readonly fullView = signal(false);
  /** The tracks playing, set only by a play action. */
  private readonly list = signal<RadioTrack[]>([]);
  /**
   * "Play all" on a feed scan: the queue is the scan's tracks and grows as the
   * scan reads further. Off, scans never change what is playing.
   */
  readonly following = signal(false);
  private readonly linked = inject(LinkedAudioResolver);
  private readonly services = inject(ProviderPreferences);
  readonly scan = new MediaFeedScan(
    ['audio'],
    (post) =>
      post.media_attachments.some((media) => media.type === 'audio') ||
      (!this.nativeOnly() &&
        (this.linked.candidate(post) ||
          this.services
            .arrange(postExternalMedia(post))
            .some((source) => !!source.embed && source.type !== 'video') ||
          // Most music on Mastodon is a YouTube link on a post about music.
          youtubeMusic(post).length > 0)),
  );
  readonly source = signal<RadioSource>('account');
  readonly tag = signal('');
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
  /** A page showing its own controls for the current recording hides the dock. */
  readonly dockSuppressed = signal(false);
  /** Where long recordings were left off, by track key, for this account. */
  readonly positions = signal<ReadonlyMap<string, SavedPosition>>(new Map());
  private pendingSeek = 0;
  private positionSavedAt = 0;
  readonly selected = signal(-1);
  /** Providers this account allowed to load and autoplay inside Radio. */
  private readonly consent = inject(ProviderConsent);
  readonly externalAllowed = this.consent.allowed.asReadonly();
  private widget?: WidgetController;
  private autoExternalPlay = false;
  readonly externalReady = signal(false);
  /** One entry per scanned post: its own audio, else its preferred continuous player. */
  readonly resultTracks = computed<RadioTrack[]>(() =>
    this.scan.posts().flatMap((post) => {
      const native = this.nativeTracks(post);
      if (native.length) return native;
      const external = this.radioSources(post)[0];
      return external ? [this.externalTrack(post, external)] : [];
    }),
  );
  readonly queue = computed<RadioTrack[]>(() =>
    this.following() ? this.resultTracks() : this.list(),
  );
  readonly current = computed(() => this.queue()[this.selected()]);
  /** Titles reported by loaded provider widgets, by track key; memory only. */
  private readonly reported = signal<ReadonlyMap<string, string>>(new Map());
  title(track: RadioTrack): string {
    return trackTitle(
      track,
      this.reported().get(track.key) ??
        (track.external ? undefined : this.linked.tags(track.media.url)?.title),
    );
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
    this.loadSettings();
    this.loadPositions();
    effect(() => {
      const next = this.identity();
      if (identity !== next) {
        identity = next;
        this.loadSettings();
        this.loadPositions();
        this.stop();
        this.scan.clear();
        this.list.set([]);
        this.following.set(false);
        this.started.set(false);
        this.scanReady.set(false);
        this.nativeOnly.set(false);
        this.handle.set('');
        this.listId.set('');
        this.tag.set('');
      }
    });
    effect(() => {
      if (this.hidden() && this.playing()) this.pause();
    });
    // Library of Congress links need a metadata lookup before they can play.
    effect(() => {
      const posts = [...this.scan.posts(), ...this.list().map((track) => track.post)];
      untracked(() => this.linked.resolve(posts));
    });
    // Titles from ID3 tags: the current track and the next few, one small range each.
    effect(() => {
      const queue = this.queue();
      const start = Math.max(0, this.selected());
      for (const track of queue.slice(start, start + 4))
        if (!track.external && !this.hidden())
          untracked(() => this.linked.readTags(track.media.url));
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

  /** Stop following a scan: the queue keeps the tracks it has. */
  private freeze(): void {
    if (!this.following()) return;
    this.list.set([...this.resultTracks()]);
    this.following.set(false);
  }
  private externalTrack(post: Status, external: ExternalMedia): RadioTrack {
    return {
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
    };
  }
  /**
   * Attachments plus linked files the audio element can play directly. A linked
   * track carries its file in its post copy, so saved playlists keep it.
   */
  private nativeTracks(post: Status): RadioTrack[] {
    const own = post.media_attachments.filter(
      (media) => media.type === 'audio' && /^https?:\/\//i.test(media.url),
    );
    const ids = new Set(own.map((media) => media.id));
    return [
      ...own.map((media, index) => ({ key: `${post.id}:${media.id || index}`, post, media })),
      ...this.linked
        .attachments(post)
        .filter((media) => !ids.has(media.id) && !!ids.add(media.id))
        .map((media) => ({
          key: `${post.id}:${media.id}`,
          post: { ...post, media_attachments: [...post.media_attachments, media] },
          media,
        })),
    ];
  }
  /**
   * Every track a post offers. Preferences do not apply here: a hidden service's
   * track that was saved in a playlist on purpose stays playable.
   */
  tracks(post: Status): RadioTrack[] {
    const native = this.nativeTracks(post);
    return [
      ...native,
      ...this.allRadioSources(post).map((external) => this.externalTrack(post, external)),
    ];
  }
  /** Play these tracks from `start`, replacing whatever was playing. */
  playTracks(tracks: readonly RadioTrack[], start = 0, at = 0): void {
    // Players that only play on their own page are skipped; start at the next one that plays here.
    const first = tracks.slice(start).find(isContinuous);
    if (!first) return;
    this.stop();
    this.following.set(false);
    const keys = new Set<string>();
    this.list.set(
      tracks.filter(
        (track) => isContinuous(track) && !keys.has(track.key) && !!keys.add(track.key),
      ),
    );
    this.select(this.list().findIndex((track) => track.key === first.key));
    this.pendingSeek = at > 0 && first === tracks[start] ? at : 0;
  }
  /**
   * A Single takes over the queue as a one-track playlist; what was playing is
   * not resumed afterwards. `at` resumes a long recording.
   */
  playSingle(track: RadioTrack, at = 0): void {
    this.playTracks([track], 0, at);
  }
  /** "Play all": the scan's results from `index`, continuing as the scan reads more. */
  playResults(index = 0): void {
    if (!this.resultTracks()[index]) return;
    this.stop();
    this.list.set([]);
    this.following.set(true);
    this.select(index);
  }
  select(index: number): void {
    if (!this.queue()[index]) return;
    this.failures = 0;
    this.pendingSeek = 0;
    this.activate(index);
  }
  /** Queue recordings right after the current track; ones already queued move there. */
  playNext(tracks: RadioTrack[]): void {
    this.freeze();
    const keys = new Set(tracks.map((track) => track.key));
    const current = this.current()?.key;
    const rest = this.queue().filter((item) => !keys.has(item.key) || item.key === current);
    const at = rest.findIndex((item) => item.key === current) + 1;
    const inserted = tracks.filter((track) => track.key !== current);
    this.list.set([...rest.slice(0, at), ...inserted, ...rest.slice(at)]);
    this.selected.set(this.queue().findIndex((item) => item.key === current));
  }
  /** Seek the current track by an offset, e.g. back 15 or ahead 30 seconds. */
  skip(seconds: number): void {
    this.seek(this.time() + seconds);
  }
  private remember(time: number, final = false): void {
    const track = this.current();
    const duration = this.duration();
    if (!track || duration < RESUME_MINIMUM) return;
    if (!final && Date.now() - this.positionSavedAt < 15_000) return;
    this.positionSavedAt = Date.now();
    const next = new Map(this.positions());
    next.delete(track.key);
    // Near the end counts as finished: there is nothing left to resume.
    if (time > 5 && time < duration - 30) next.set(track.key, { time, duration, at: Date.now() });
    while (next.size > POSITION_LIMIT) next.delete(next.keys().next().value!);
    this.positions.set(next);
    try {
      localStorage.setItem(POSITIONS_KEY + accountScopeSuffix(), JSON.stringify([...next]));
    } catch {
      /* Resume still works for this tab. */
    }
  }
  private loadPositions(): void {
    try {
      const data: unknown = JSON.parse(
        localStorage.getItem(POSITIONS_KEY + accountScopeSuffix()) ?? '[]',
      );
      this.positions.set(
        new Map(
          (Array.isArray(data) ? data : []).filter(
            (row): row is [string, SavedPosition] =>
              Array.isArray(row) &&
              typeof row[0] === 'string' &&
              Number.isFinite(row[1]?.time) &&
              Number.isFinite(row[1]?.duration),
          ),
        ),
      );
    } catch {
      this.positions.set(new Map());
    }
  }
  /** Every continuous provider source a post links, regardless of preferences. */
  private allRadioSources(post: Status): ExternalMedia[] {
    const sources = postExternalMedia(post).filter(
      (s) => s.type === 'audio' && s.controllable && s.embed,
    );
    const keys = new Set(sources.map((source) => source.key));
    // A music post's YouTube links play here as audio; elsewhere they stay videos.
    return [...sources, ...youtubeMusic(post).filter((source) => !keys.has(source.key))];
  }
  /** The sources to offer, ordered and pruned by the listener's service preferences. */
  radioSources(post: Status): ExternalMedia[] {
    return this.services.arrange(this.allRadioSources(post));
  }
  /**
   * Every Single a post offers, regardless of preferences: its continuous tracks
   * plus players that only play on their own page. Used to validate saved Singles.
   */
  singleTracks(post: Status): RadioTrack[] {
    const tracks = this.tracks(post);
    const keys = new Set(tracks.map((track) => track.key));
    return [
      ...tracks,
      ...postExternalMedia(post)
        .filter((source) => source.type === 'audio' && !!source.embed && !source.controllable)
        .map((source) => this.externalTrack(post, source))
        .filter((track) => !keys.has(track.key) && !!keys.add(track.key)),
    ];
  }
  /**
   * The Singles to keep from a post: each recording it carries, else its
   * preferred player — continuous first, then one that plays on its own page.
   */
  singlesOf(post: Status): RadioTrack[] {
    const native = this.nativeTracks(post);
    if (native.length) return native;
    const external =
      this.radioSources(post)[0] ??
      this.services
        .arrange(postExternalMedia(post))
        .find((source) => source.type === 'audio' && !!source.embed && !source.controllable);
    return external ? [this.externalTrack(post, external)] : [];
  }
  /** Play one of a post's continuous players as a Single. */
  chooseExternal(post: Status, source: ExternalMedia): void {
    if (!this.radioSources(post).some((s) => s.key === source.key)) return;
    this.playSingle(this.externalTrack(post, source));
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
        if (!current()) return;
        this.time.set(audio.currentTime);
        this.remember(audio.currentTime);
      });
      audio.addEventListener('loadedmetadata', () => {
        if (!current()) return;
        this.duration.set(Number.isFinite(audio.duration) ? audio.duration : 0);
        if (this.pendingSeek && this.pendingSeek < this.duration()) {
          audio.currentTime = this.pendingSeek;
          this.time.set(audio.currentTime);
        }
        this.pendingSeek = 0;
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
    if (this.wantsPlay) this.remember(this.time(), true);
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
    if (!this.following()) return Promise.resolve();
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
    this.remember(this.duration(), true);
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
    this.consent.allow(provider);
    if (this.current()?.external?.provider === provider) this.autoExternalPlay = true;
  }
  forgetProvider(provider: string): void {
    this.consent.forget(provider);
    if (this.current()?.external?.provider === provider) this.closeWidget();
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
    if (typeof state.time === 'number' && Number.isFinite(state.time)) {
      this.time.set(Math.max(0, state.time));
      this.remember(this.time());
    }
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
