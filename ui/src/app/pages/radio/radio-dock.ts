import { Component, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { RadioControls } from './radio-controls';
import { RadioIcon } from './radio-icon';
import { RadioPlayer } from './radio-player';
import { ExternalPlayer } from '../../audio-embeds/external-player';

// i18n radio.allow: Allow {{provider}} in Radio
// i18n radio.allowHint: Radio can load and start {{provider}} players for you. Posts in feeds still load only when you choose.
// i18n radio.showPlayer: Show {{provider}} player
// i18n radio.hidePlayer: Hide {{provider}} player

/**
 * Persistent now-playing bar. It sits in the middle column's flow, sticky at its
 * bottom edge, so it never covers posts the way a floating overlay did.
 */
@Component({
  selector: 'app-radio-dock',
  imports: [
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbToolbar,
    MbToolbarButton,
    ExternalPlayer,
    RadioControls,
    RadioIcon,
  ],
  host: { '[class.full-view]': 'player.fullView()' },
  template: `
    @if (player.current(); as track) {
      @if (player.fullView()) {
        <app-radio-controls [externalPlayer]="external()" />
      }
      <aside
        [class.empty]="player.fullView() && (!track.external || player.hidden())"
        [attr.aria-label]="'radio.title' | transloco"
      >
        @if (!player.fullView()) {
          <div class="bar">
            @if (track.media.preview_url && !player.hidden()) {
              <img class="thumb" [src]="track.media.preview_url" alt="" />
            }
            <a
              class="now"
              routerLink="/radio"
              [queryParams]="{ view: 'radio' }"
              [title]="'radio.openPlayer' | transloco"
            >
              <span class="title">{{
                player.hidden() ? ('radio.hidden' | transloco) : player.title(track)
              }}</span>
              <span class="author">{{
                track.post.account.display_name || track.post.account.acct
              }}</span>
            </a>
            <mb-toolbar
              class="transport"
              density="compact"
              embedded
              [label]="'radio.title' | transloco"
            >
              @let label =
                (player.playing() || player.waiting() ? 'radio.pause' : 'radio.play') | transloco;
              <button
                mbToolbarButton
                class="primary"
                type="button"
                [attr.aria-label]="label"
                [title]="label"
                [disabled]="player.hidden() || (!!track.external && !player.externalReady())"
                (click)="player.toggle()"
              >
                <app-radio-icon [name]="player.playing() || player.waiting() ? 'pause' : 'play'" />
              </button>
              <button
                mbToolbarButton
                type="button"
                [attr.aria-label]="'radio.next' | transloco"
                [title]="'radio.next' | transloco"
                (click)="player.next()"
              >
                <app-radio-icon name="next" />
              </button>
              @if (!player.hidden() && track.external && external()?.activated()) {
                @let frameLabel =
                  (frameOpen() ? 'radio.hidePlayer' : 'radio.showPlayer')
                    | transloco: { provider: track.external.label };
                <button
                  mbToolbarButton
                  type="button"
                  [attr.aria-label]="frameLabel"
                  [title]="frameLabel"
                  [attr.aria-expanded]="frameOpen()"
                  (click)="frameOpen.set(!frameOpen())"
                >
                  <app-radio-icon [name]="frameOpen() ? 'down' : 'expand'" />
                </button>
              }
              <button
                mbToolbarButton
                type="button"
                [attr.aria-label]="'radio.stop' | transloco"
                [title]="'radio.stop' | transloco"
                (click)="player.stop()"
              >
                <app-radio-icon name="stop" />
              </button>
            </mb-toolbar>
          </div>
        }
        @if (player.blocked()) {
          <p class="note" role="alert">{{ 'radio.blocked' | transloco }}</p>
        }
        @if (!player.hidden() && track.external; as source) {
          @if (!player.externalAllowed().has(source.provider)) {
            <div class="consent">
              <p class="note">{{ 'radio.allowHint' | transloco: { provider: source.label } }}</p>
              <button mbButton type="button" (click)="player.allowProvider(source.provider)">
                {{ 'radio.allow' | transloco: { provider: source.label } }}
              </button>
              <a [href]="source.url" target="_blank" rel="noopener noreferrer">{{
                'external.open' | transloco: { provider: source.label }
              }}</a>
            </div>
          } @else if (!player.fullView() && !external()?.activated()) {
            <button mbButton variant="outline" type="button" (click)="loadExternal()">
              {{ 'external.load' | transloco: { provider: source.label } }}
            </button>
          }
          @for (key of [track.key]; track key) {
            <div
              class="frame"
              [class.collapsed]="!player.fullView() && !frameOpen() && !player.blocked()"
            >
              <app-external-player-controls
                [source]="source"
                [managed]="true"
                [hideActions]="true"
                [activate]="player.externalAllowed().has(source.provider)"
                (ready)="player.attachWidget(key, $event)"
                (state)="player.widgetState(key, $event)"
                (closed)="player.closeWidget()"
              />
            </div>
          }
        }
      </aside>
    }
  `,
  styles: `
    :host {
      position: sticky;
      bottom: 0;
      z-index: 5;
      display: block;
    }
    :host.full-view {
      position: static;
      margin: 16px;
    }
    aside {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 12px;
      border-top: 1px solid var(--border);
      background: var(--col-bg);
      color: var(--text);
    }
    :host.full-view aside {
      padding: 0;
      border: 0;
    }
    aside.empty {
      display: none;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .thumb {
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 6px;
      object-fit: cover;
    }
    .now {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
      color: inherit;
      text-decoration: none;
    }
    .now:hover .title,
    .now:focus-visible .title {
      text-decoration: underline;
    }
    .title,
    .author {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .title {
      font-weight: 600;
    }
    .author {
      color: var(--muted);
      font-size: 13px;
    }
    .transport {
      flex: none;
    }
    .transport button {
      min-width: 36px;
      border-radius: 999px;
    }
    .transport button.primary {
      background: var(--accent-soft);
      color: var(--ds-action-text);
    }
    .note {
      margin: 0;
      font-size: 13px;
    }
    .consent {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
    }
    .consent .note {
      flex: 1 1 100%;
    }
    .frame {
      max-height: 45vh;
      overflow: auto;
    }
    /* The frame stays loaded so playback continues; it is only folded away. */
    .frame.collapsed {
      height: 0;
      overflow: hidden;
    }
    @media (max-width: 720px) {
      :host {
        bottom: calc(58px + env(safe-area-inset-bottom));
      }
    }
  `,
})
export class RadioDock {
  readonly player = inject(RadioPlayer);
  readonly external = viewChild(ExternalPlayer);
  readonly frameOpen = signal(false);
  loadExternal(): void {
    const external = this.external();
    if (external) external.activated.set(true);
  }
}
