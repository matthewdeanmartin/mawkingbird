import { afterNextRender, Component, DestroyRef, ElementRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { RadioPlayer } from './radio-player';
import { ExternalPlayer } from '../../audio-embeds/external-player';

@Component({
  selector: 'app-radio-dock',
  imports: [RouterLink, TranslocoPipe, MbButton, ExternalPlayer],
  template: `
    @if (player.current(); as track) {
      <aside [attr.aria-label]="'radio.title' | transloco">
        <a routerLink="/radio"
          >{{ 'radio.openPlayer' | transloco }} ·
          {{ track.post.account.display_name || track.post.account.acct }}</a
        >
        @if (player.hidden()) {
          <span role="status">{{ 'radio.hidden' | transloco }}</span>
        }
        <div class="actions">
          <button
            mbButton
            size="small"
            type="button"
            [disabled]="player.hidden() || (!!track.external && !player.externalReady())"
            (click)="player.toggle()"
          >
            {{ (player.playing() || player.waiting() ? 'radio.pause' : 'radio.play') | transloco }}
          </button>
          <button mbButton size="small" variant="outline" type="button" (click)="player.next()">
            {{ 'radio.next' | transloco }}
          </button>
          <button mbButton size="small" variant="outline" type="button" (click)="player.stop()">
            {{ 'radio.stop' | transloco }}
          </button>
        </div>
        @if (player.blocked()) {
          <span role="alert">{{ 'radio.blocked' | transloco }}</span>
        }
        @if (!player.hidden() && track.external; as source) {
          @for (key of [track.key]; track key) {
            <app-external-player-controls
              [source]="source"
              [managed]="true"
              [activate]="player.externalAllowed().has(source.provider)"
              (ready)="player.attachWidget(key, $event)"
              (state)="player.widgetState(key, $event)"
              (closed)="player.closeWidget()"
            />
          }
        }
      </aside>
    }
  `,
  styles: `
    :host {
      position: fixed;
      bottom: 16px;
      inset-inline: 16px;
      z-index: 30;
      margin-inline: auto;
      max-width: 720px;
    }
    aside {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--col-bg);
      color: var(--text);
      box-shadow: 0 2px 12px var(--ds-overlay-shadow);
    }
    a {
      flex: 1 1 180px;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    app-external-player-controls {
      flex: 1 1 100%;
      max-height: 45vh;
      overflow: auto;
    }
    @media (max-width: 720px) {
      :host {
        bottom: calc(66px + env(safe-area-inset-bottom));
        inset-inline: 8px;
      }
    }
  `,
})
export class RadioDock {
  readonly player = inject(RadioPlayer);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    let observer: ResizeObserver | undefined;
    afterNextRender(() => {
      observer = new ResizeObserver(() =>
        document.documentElement.style.setProperty(
          '--radio-dock-space',
          `${this.host.nativeElement.getBoundingClientRect().height + 110}px`,
        ),
      );
      observer.observe(this.host.nativeElement);
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      document.documentElement.style.removeProperty('--radio-dock-space');
    });
  }
}
