import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { RadioPlayer } from './radio-player';
import { ExternalPlayer } from '../../audio-embeds/external-player';

@Component({
  selector: 'app-radio-dock',
  imports: [RouterLink, TranslocoPipe, MbToolbar, MbToolbarButton, ExternalPlayer],
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
        <mb-toolbar density="compact" embedded [label]="'radio.title' | transloco">
          <button
            mbToolbarButton
            type="button"
            [disabled]="player.hidden() || (!!track.external && !player.externalReady())"
            (click)="player.toggle()"
          >
            {{ (player.playing() || player.waiting() ? 'radio.pause' : 'radio.play') | transloco }}
          </button>
          <button mbToolbarButton type="button" (click)="player.next()">
            {{ 'radio.next' | transloco }}
          </button>
          <button mbToolbarButton type="button" (click)="player.stop()">
            {{ 'radio.stop' | transloco }}
          </button>
          @if (!player.hidden() && track.external; as source) {
            @if (external()?.activated()) {
              <button mbToolbarButton type="button" (click)="external()?.close()">
                {{ 'external.close' | transloco }}
              </button>
            } @else {
              <button mbToolbarButton type="button" (click)="loadExternal()">
                {{ 'external.load' | transloco: { provider: source.label } }}
              </button>
            }
            <button mbToolbarButton type="button" (click)="external()?.openOriginal()">
              {{ 'external.open' | transloco: { provider: source.label } }}
            </button>
          }
        </mb-toolbar>
        @if (player.blocked()) {
          <span role="alert">{{ 'radio.blocked' | transloco }}</span>
        }
        @if (!player.hidden() && track.external; as source) {
          @for (key of [track.key]; track key) {
            <app-external-player-controls
              [source]="source"
              [managed]="true"
              [hideActions]="true"
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
      left: 16px;
      width: calc(100% - 32px);
      z-index: 30;
      box-sizing: border-box;
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
    mb-toolbar {
      flex: 1 1 100%;
      min-width: 0;
    }
    app-external-player-controls {
      flex: 1 1 100%;
      max-height: 45vh;
      overflow: auto;
    }
    @media (max-width: 720px) {
      :host {
        bottom: calc(66px + env(safe-area-inset-bottom));
      }
    }
  `,
})
export class RadioDock {
  readonly player = inject(RadioPlayer);
  readonly external = viewChild(ExternalPlayer);
  loadExternal(): void {
    const external = this.external();
    if (external) external.activated.set(true);
  }
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    let observer: ResizeObserver | undefined;
    let frame = 0;
    const align = () => {
      const main = document.getElementById('main');
      if (!main) return;
      const bounds = main.getBoundingClientRect();
      this.host.nativeElement.style.left = `${bounds.left}px`;
      this.host.nativeElement.style.width = `${bounds.width}px`;
      document.documentElement.style.setProperty(
        '--radio-dock-space',
        `${this.host.nativeElement.getBoundingClientRect().height + 110}px`,
      );
    };
    const scheduleAlign = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          align();
        });
    };
    afterNextRender(() => {
      observer = new ResizeObserver(scheduleAlign);
      observer.observe(this.host.nativeElement);
      const main = document.getElementById('main');
      if (main) {
        observer.observe(main);
        if (main.parentElement) observer.observe(main.parentElement);
      }
      window.addEventListener('resize', scheduleAlign);
      align();
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleAlign);
      cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty('--radio-dock-space');
    });
  }
}
