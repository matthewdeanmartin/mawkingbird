import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { RadioPlayer } from '../reading/radio/radio-player';
import { RadioPlaylists } from '../reading/radio/radio-playlists';
import { VideoPlayerHost } from '../reading/video-player/video-player-host';
import { VideoSource, youtubeSource } from '../reading/video-player/media-source';
import { QueuedVideo, WatchQueue } from '../reading/videos/watch-queue';

// i18n lite.radio: Radio
// i18n lite.radio.intro: Your saved playlists. To build or change playlists, use Radio in the full app.
// i18n lite.radio.none: You have no saved playlists yet.
// i18n lite.radio.tracks: {{count}} tracks
// i18n lite.radio.play: Play
// i18n lite.radio.nowPlaying: Now playing
// i18n lite.radio.pause: Pause
// i18n lite.radio.resume: Play
// i18n lite.radio.next: Next
// i18n lite.radio.stop: Stop
// i18n lite.videos: Videos
// i18n lite.videos.intro: Your watch queue. Videos play only when you press Play.
// i18n lite.videos.none: Your watch queue is empty.
// i18n lite.videos.play: Play
// i18n lite.videos.openPost: Open the post

/**
 * Radio, reduced to a player and the playlists already saved (owner decision 7):
 * no scanning, catalogue search or playlist builder, which are what make
 * full Radio expensive. Uses the same RadioPlayer, so a playlist started here
 * keeps playing in the full app and the reverse.
 */
@Component({
  selector: 'app-lite-radio',
  imports: [MbButton, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.radio' | transloco }}</h1>
    <p class="muted lite-intro">{{ 'lite.radio.intro' | transloco }}</p>
    @if (player.current(); as track) {
      <section class="now" aria-live="polite">
        <p class="muted">{{ 'lite.radio.nowPlaying' | transloco }}</p>
        <p class="track">{{ player.title(track) }}</p>
        <div class="controls">
          <button mbButton size="small" type="button" (click)="player.toggle()">
            {{ (player.playing() ? 'lite.radio.pause' : 'lite.radio.resume') | transloco }}
          </button>
          <button mbButton variant="outline" size="small" type="button" (click)="player.next()">
            {{ 'lite.radio.next' | transloco }}
          </button>
          <button mbButton variant="link" size="small" type="button" (click)="player.stop()">
            {{ 'lite.radio.stop' | transloco }}
          </button>
        </div>
      </section>
    }
    <ul class="lite-rows">
      @for (playlist of playlists.saved(); track playlist.id) {
        <li class="row">
          <span>
            {{ playlist.name }}
            <span class="muted">
              · {{ 'lite.radio.tracks' | transloco: { count: playlist.tracks.length } }}</span
            >
          </span>
          <button
            mbButton
            variant="outline"
            size="small"
            type="button"
            [disabled]="!playlist.tracks.length"
            (click)="player.playTracks(playlist.tracks)"
          >
            {{ 'lite.radio.play' | transloco }}
          </button>
        </li>
      } @empty {
        <li class="muted">{{ 'lite.radio.none' | transloco }}</li>
      }
    </ul>`,
  styles: `
    .now {
      margin: 0 16px 16px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .now p {
      margin: 0 0 6px;
    }
    .track {
      font-weight: 700;
    }
    .controls,
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .row {
      justify-content: space-between;
    }
  `,
})
export class LiteRadio {
  protected readonly player = inject(RadioPlayer);
  protected readonly playlists = inject(RadioPlaylists);

  constructor() {
    this.playlists.refresh();
  }
}

/**
 * Videos, reduced to the watch queue and a player. Nothing loads until Play:
 * a list of titles costs almost nothing, a player costs a lot. YouTube entries
 * play here; entries that come from a post open that post in Lite, whose card
 * has the player.
 */
@Component({
  selector: 'app-lite-videos',
  imports: [MbButton, RouterLink, TranslocoPipe, VideoPlayerHost],
  template: `<h1 class="lite-title">{{ 'lite.videos' | transloco }}</h1>
    <p class="muted lite-intro">{{ 'lite.videos.intro' | transloco }}</p>
    @if (playing(); as source) {
      <div class="player">
        <app-video-player [source]="source" [inline]="true" />
      </div>
    }
    <ul class="lite-rows">
      @for (item of queue.items(); track item.key) {
        <li class="row">
          <span>{{ item.title }}</span>
          @if (sourceFor(item); as source) {
            <button
              mbButton
              variant="outline"
              size="small"
              type="button"
              (click)="playing.set(source)"
            >
              {{ 'lite.videos.play' | transloco }}
            </button>
          } @else if (item.params['post']) {
            <a
              mbButton
              variant="link"
              size="small"
              [routerLink]="['/m/statuses', item.params['post']]"
            >
              {{ 'lite.videos.openPost' | transloco }}
            </a>
          }
        </li>
      } @empty {
        <li class="muted">{{ 'lite.videos.none' | transloco }}</li>
      }
    </ul>`,
  styles: `
    .player {
      margin: 0 16px 16px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
  `,
})
export class LiteVideos {
  protected readonly queue = inject(WatchQueue);
  protected readonly playing = signal<VideoSource | null>(null);

  protected sourceFor(item: QueuedVideo): VideoSource | null {
    const id = item.params['youtube'];
    return id && !item.params['post']
      ? youtubeSource(`https://www.youtube.com/watch?v=${id}`)
      : null;
  }
}
