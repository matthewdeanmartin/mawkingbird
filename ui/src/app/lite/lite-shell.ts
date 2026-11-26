import {
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { Auth } from '../platform/session/auth';
import { ConnectionChip } from '../shell/connection-chip/connection-chip';
import { LiteMode } from './lite-mode';
import { LiteBar } from './lite-bar';
import { LitePrefs } from './lite-prefs';
import { MediaPolicy } from '../platform/network/media-policy';
import { OutboxSummary } from '../platform/offline/outbox-summary';
import { LiteStore } from './lite-store';

// i18n lite.brand: Mawkingbird Lite
// i18n lite.fullApp: Full app
// i18n lite.refresh: Refresh
// i18n lite.refreshing: Loading…
// i18n lite.nav.label: Lite
// i18n lite.mastodonOnly: Lite works with a signed-in Mastodon account for now. Your other accounts work in the full app.

/** Lite's destinations, labelled with the full app's existing short names. */
export const LITE_NAV: readonly { path: string; label: string }[] = [
  { path: '/m/home', label: 'shell.nav.home' },
  { path: '/m/notifications', label: 'shell.nav.inbox' },
  { path: '/m/conversations', label: 'shell.nav.chat' },
  { path: '/m/search', label: 'shell.nav.search' },
  { path: '/m/write', label: 'shell.menu.write' },
  { path: '/m/lists', label: 'listDialog.lists' },
  { path: '/m/bookmarks', label: 'pages.bookmarks.tab.bookmarks' },
  { path: '/m/radio', label: 'shell.modeNav.mode.radio' },
  { path: '/m/videos', label: 'shell.nav.videos' },
];

/**
 * The `/m/` shell (spec/low-bandwidth-offline.md, Sprint 6): no rails, no
 * widgets, no big menus, nothing that polls. Every screen is held in memory
 * for the visit (LiteStore); the top bar's Refresh is the only reload. Every
 * screen inside is a thin
 * page around the full app's own building blocks (the status card, the
 * composer, the API client, the offline read cache), so Lite gets their
 * improvements without inheriting the full pages' extra requests.
 *
 * The offline banner, connection meter and Outbox live in the app root and so
 * work here unchanged.
 */
@Component({
  selector: 'app-lite-shell',
  imports: [
    ConnectionChip,
    LiteBar,
    MbButton,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
  ],
  encapsulation: ViewEncapsulation.None,
  template: `
    @let reading = prefs.value();
    <div
      class="lite-shell"
      [attr.data-text]="reading.textSize"
      [attr.data-width]="reading.width"
      [attr.data-contrast]="reading.highContrast ? 'high' : null"
    >
      <header class="lite-bar">
        <a class="lite-brand" routerLink="/m/home">{{ 'lite.brand' | transloco }}</a>
        <span class="lite-bar-end">
          <app-connection-chip />
          <button mbButton variant="outline" size="small" type="button" (click)="store.refresh()">
            {{ (store.busy() ? 'lite.refreshing' : 'lite.refresh') | transloco }}
          </button>
          <button mbButton variant="link" size="small" type="button" (click)="leave()">
            {{ 'lite.fullApp' | transloco }}
          </button>
        </span>
      </header>
      <nav class="lite-nav" [attr.aria-label]="'lite.nav.label' | transloco">
        <!-- The full app's own short names and keys (shell.nav.*, chosen to fit
             its width budget and already translated), so Lite and the full
             app say the same thing in every language. No icons here, so every
             destination fits as a word and there is no More menu. -->
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active">{{ item.label | transloco }}</a>
        }
        <!-- Shown only while something is waiting to be sent or reviewed. -->
        @if (outbox.waiting() + outbox.held(); as queued) {
          <a routerLink="/m/outbox" routerLinkActive="active"
            >{{ 'outbox.title' | transloco }} ({{ queued }})</a
          >
        }
      </nav>
      <app-lite-bar />
      <main class="lite-main" id="main" tabindex="-1">
        @if (mastodon()) {
          <router-outlet />
        } @else {
          <p class="muted lite-intro">{{ 'lite.mastodonOnly' | transloco }}</p>
        }
      </main>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .lite-shell {
      min-height: 100vh;
      max-width: 640px;
      margin: 0 auto;
      background: var(--col-bg);
      color: var(--text);
    }
    /* Reader controls: all local, no requests. Zoom scales the shared cards too,
       whose own sizes are fixed in px. */
    .lite-shell[data-width='narrow'] {
      max-width: 520px;
    }
    .lite-shell[data-width='wide'] {
      max-width: 820px;
    }
    .lite-shell[data-text='s'] .lite-main {
      zoom: 0.9;
    }
    .lite-shell[data-text='l'] .lite-main {
      zoom: 1.12;
    }
    .lite-shell[data-text='xl'] .lite-main {
      zoom: 1.25;
    }
    .lite-shell[data-contrast='high'] {
      --muted: var(--text);
      --border: color-mix(in srgb, var(--text) 55%, transparent);
    }
    .lite-bar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 16px;
      border-block-end: 1px solid var(--border);
      background: var(--col-bg);
    }
    .lite-brand {
      font-weight: 700;
      color: var(--text);
      text-decoration: none;
    }
    .lite-bar-end {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .lite-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      padding: 8px 16px;
      border-block-end: 1px solid var(--border);
      font-size: 15px;
    }
    .lite-nav a {
      color: var(--text);
      text-decoration: none;
      cursor: pointer;
    }
    .lite-nav a.active {
      font-weight: 700;
      text-decoration: underline;
    }
    .lite-shell .lite-title {
      margin: 0;
      padding: 14px 16px 8px;
      font-size: 1.25rem;
    }
    .lite-shell .lite-subtitle {
      margin: 0;
      padding: 12px 16px 4px;
      font-size: 1rem;
    }
    .lite-shell .muted {
      color: var(--muted);
    }
    .lite-shell .lite-intro {
      margin: 0;
      padding: 0 16px 12px;
    }
    .lite-shell .lite-rows {
      margin: 0;
      padding: 0 16px;
      list-style: none;
    }
    .lite-shell .lite-rows li {
      padding: 10px 0;
      border-block-end: 1px solid var(--border);
    }
    .lite-shell .lite-more {
      display: block;
      margin: 12px auto 24px;
    }
  `,
})
export class LiteShell {
  private readonly lite = inject(LiteMode);
  protected readonly prefs = inject(LitePrefs);
  protected readonly outbox = inject(OutboxSummary);
  private readonly mediaPolicy = inject(MediaPolicy);

  constructor() {
    // While Lite is open, the shared post cards follow its load-control bar.
    effect(() => this.mediaPolicy.override.set(this.prefs.media()));
    inject(DestroyRef).onDestroy(() => this.mediaPolicy.override.set(null));
  }

  /** Screens are held for the visit; only this button reloads the one on display. */
  protected readonly store = inject(LiteStore);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  protected readonly mastodon = computed(() => this.auth.kind() === 'mastodon');
  protected readonly nav = LITE_NAV;

  protected leave(): void {
    this.lite.leave(this.router.url);
  }
}
