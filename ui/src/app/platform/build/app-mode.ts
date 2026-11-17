import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Which app the primary nav is serving: the social client, the RSS reader, or
 * video. See spec/top_level_menu.md.
 */
export type AppMode = 'mastodon' | 'blog' | 'rss' | 'video' | 'radio' | 'forum';

/**
 * Also the switcher's order. Blog sits second because the switcher is how
 * people discover it (spec/blog-mode.md): nothing else in the app points there.
 */
export const APP_MODES: readonly AppMode[] = ['mastodon', 'blog', 'rss', 'video', 'radio', 'forum'];

/**
 * Tab-lived, not saved: a reload keeps the menu where it was, a new tab starts
 * in Mastodon. Persisted keys are permanent, and this is not worth one.
 */
const MODE_KEY = 'mockingbird_app_mode';

/**
 * The mode a URL implies, or null when the page is shared between modes and
 * should keep whichever one the reader arrived in.
 *
 * Home is always Mastodon: it is the social timeline, and the owner decision is
 * that pressing Home is also the way back out of RSS or Video.
 */
export function modeForUrl(url: string): AppMode | null {
  const path = url.split(/[?#]/, 1)[0];
  if (
    path === '/radio' ||
    path.startsWith('/radio/') ||
    path === '/listen' ||
    path === '/singles' ||
    path.startsWith('/singles/') ||
    path === '/playlists' ||
    path.startsWith('/playlists/') ||
    path === '/share'
  )
    return 'radio';
  if (path === '/forum' || path.startsWith('/forum/')) return 'forum';
  if (path === '/blog' || path.startsWith('/blog/') || path === '/settings/blog') return 'blog';
  if (path === '/rss' || path.startsWith('/rss/') || path === '/settings/rss') {
    return 'rss';
  }
  if (path === '/videos' || path.startsWith('/videos/')) {
    return 'video';
  }
  if (
    path === '/watch' ||
    path === '/bookmarks' ||
    path.startsWith('/read/') ||
    // Write and Drafts serve Fedi and Blog alike, so they keep the mode you came from.
    path === '/write' ||
    path === '/drafts' ||
    path.startsWith('/statuses/rss:') ||
    path.startsWith('/accounts/rss:') ||
    path === '/settings' ||
    path.startsWith('/settings/')
  ) {
    return null;
  }
  return 'mastodon';
}

function isAppMode(value: unknown): value is AppMode {
  return APP_MODES.includes(value as AppMode);
}

function readStoredMode(): AppMode | null {
  try {
    const value = sessionStorage.getItem(MODE_KEY);
    return isAppMode(value) ? value : null;
  } catch {
    return null;
  }
}

function storeMode(mode: AppMode): void {
  try {
    sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    // The mode still holds for this page load without storage.
  }
}

/** The current app mode, following navigation and remembered for the tab. */
@Injectable({ providedIn: 'root' })
export class AppModeService {
  private readonly router = inject(Router);
  /**
   * Before the first navigation the router reports `/`, which would read as
   * Mastodon and overwrite the tab's mode on a reload of a shared page such
   * as Watch. Only a settled URL gets a say; until then the tab remembers.
   */
  private readonly current = signal<AppMode>(
    (this.router.navigated ? modeForUrl(this.router.url) : null) ?? readStoredMode() ?? 'mastodon',
  );
  readonly mode = this.current.asReadonly();

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const implied = modeForUrl(this.router.url);
        if (implied) {
          this.set(implied);
        }
      });
  }

  set(mode: AppMode): void {
    this.current.set(mode);
    storeMode(mode);
  }
}
