import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { Auth } from '../platform/session/auth';
import { ConnectionChip } from '../shell/connection-chip/connection-chip';
import { LiteMode } from './lite-mode';
import { LiteStore } from './lite-store';

// i18n lite.brand: Mawkingbird Lite
// i18n lite.fullApp: Full app
// i18n lite.refresh: Refresh
// i18n lite.refreshing: Loading…
// i18n lite.nav.label: Lite
// i18n lite.nav.home: Home
// i18n lite.nav.notifications: Notifications
// i18n lite.nav.search: Search
// i18n lite.nav.write: Write
// i18n lite.nav.more: More
// i18n lite.nav.lists: Lists
// i18n lite.nav.bookmarks: Bookmarks
// i18n lite.nav.conversations: Direct messages
// i18n lite.nav.radio: Radio
// i18n lite.nav.videos: Videos
// i18n lite.mastodonOnly: Lite works with a signed-in Mastodon account for now. Your other accounts work in the full app.

/**
 * The `/m/` shell (spec/low-bandwidth-offline.md, Sprint 6): no rails, no
 * widgets, no big menus, nothing that polls. Every screen is held in memory
 * for the visit (LiteStore); the top bar's Refresh is the only reload. Every screen inside is a thin
 * page around the full app's own building blocks (the status card, the
 * composer, the API client, the offline read cache), so Lite gets their
 * improvements without inheriting the full pages' extra requests.
 *
 * The offline banner, connection meter and Outbox live in the app root and so
 * work here unchanged.
 */
@Component({
  selector: 'app-lite-shell',
  imports: [ConnectionChip, MbButton, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="lite-shell">
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
        <a routerLink="/m/home" routerLinkActive="active">{{ 'lite.nav.home' | transloco }}</a>
        <a routerLink="/m/notifications" routerLinkActive="active">{{
          'lite.nav.notifications' | transloco
        }}</a>
        <a routerLink="/m/search" routerLinkActive="active">{{ 'lite.nav.search' | transloco }}</a>
        <a routerLink="/m/compose" routerLinkActive="active">{{ 'lite.nav.write' | transloco }}</a>
        <details class="lite-more-menu" #moreMenu>
          <summary>{{ 'lite.nav.more' | transloco }}</summary>
          <div class="lite-menu">
            <a routerLink="/m/lists">{{ 'lite.nav.lists' | transloco }}</a>
            <a routerLink="/m/bookmarks">{{ 'lite.nav.bookmarks' | transloco }}</a>
            <a routerLink="/m/conversations">{{ 'lite.nav.conversations' | transloco }}</a>
            <a routerLink="/m/radio">{{ 'lite.nav.radio' | transloco }}</a>
            <a routerLink="/m/videos">{{ 'lite.nav.videos' | transloco }}</a>
          </div>
        </details>
      </nav>
      <main class="lite-main" id="main" tabindex="-1">
        @if (mastodon()) {
          <router-outlet />
        } @else {
          <p class="muted lite-intro">{{ 'lite.mastodonOnly' | transloco }}</p>
        }
      </main>
    </div>
  `,
  styles: `
    .lite-shell {
      min-height: 100vh;
      max-width: 640px;
      margin: 0 auto;
      background: var(--col-bg);
      color: var(--text);
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
      font-weight: 800;
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
    .lite-nav a,
    .lite-nav summary {
      color: var(--text);
      text-decoration: none;
      cursor: pointer;
    }
    .lite-nav a.active {
      font-weight: 700;
      text-decoration: underline;
    }
    .lite-more-menu {
      position: relative;
    }
    .lite-menu {
      position: absolute;
      inset-inline-end: 0;
      z-index: 20;
      display: grid;
      min-width: 180px;
      padding: 6px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--col-bg);
    }
    .lite-menu a {
      padding: 8px 10px;
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
  /** Screens are held for the visit; only this button reloads the one on display. */
  protected readonly store = inject(LiteStore);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  protected readonly mastodon = computed(() => this.auth.kind() === 'mastodon');

  private readonly moreMenu = viewChild<ElementRef<HTMLDetailsElement>>('moreMenu');

  constructor() {
    // Close the More menu once one of its links has taken the reader somewhere.
    const sub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.moreMenu()?.nativeElement.removeAttribute('open');
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected leave(): void {
    this.lite.leave(this.router.url);
  }
}
