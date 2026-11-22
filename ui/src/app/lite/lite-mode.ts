import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { HISTORY_BUCKET_MS, ConnectionHistory } from '../platform/network/connection-history';
import { isBad } from '../platform/network/connection-quality';

/**
 * Lite is one concept (spec/low-bandwidth-offline.md, decision 2): the `/m/`
 * routes. While it is on, any full-app address that has a Lite twin opens as
 * that twin — shared links, links inside posts, the address bar — so a reader
 * who chose Lite stays in Lite without every component knowing about it.
 *
 * Kept free of the Lite pages themselves: this file is in the startup bundle
 * so the redirect works on the very first navigation, and the pages are not.
 */

export const LITE_KEY = 'mockingbird_lite';
export const LITE_OFFER_DISMISSED_KEY = 'mockingbird_lite_offer_dismissed';

/** Sustained means every one of the last this-many complete minutes was bad. */
export const LITE_OFFER_MINUTES = 2;

/** The Lite address for a full-app address, or null when Lite has no such screen. */
export function liteUrlFor(url: string): string | null {
  const [pathPart, query = ''] = splitQuery(url);
  const path = pathPart.replace(/\/+$/, '') || '/';
  const q = query ? `?${query}` : '';
  const seg = path.split('/').filter(Boolean);
  const [first, second, third] = seg;
  switch (first) {
    case 'home':
      return seg.length === 1 ? `/m/home${q}` : null;
    case 'notifications':
      return seg.length === 1 ? `/m/notifications${q}` : null;
    case 'statuses':
      // A thread; not its analytics or other sub-pages.
      return seg.length === 2 ? `/m/statuses/${second}` : null;
    case 'accounts':
      return seg.length >= 2 && seg.length <= 3 ? `/m/${seg.join('/')}` : null;
    case 'search':
      return seg.length === 1 ? `/m/search${q}` : null;
    case 'feeds':
      return second === 'lists' && !third ? '/m/lists' : null;
    case 'lists':
      return seg.length === 1 ? '/m/lists' : seg.length === 2 ? `/m/lists/${second}` : null;
    case 'bookmarks':
      return seg.length === 1 ? '/m/bookmarks' : null;
    case 'conversations':
      return seg.length === 1 ? '/m/conversations' : null;
    case 'tags':
      return seg.length === 2 ? `/m/tags/${second}` : null;
    case 'radio':
      return seg.length === 1 ? '/m/radio' : null;
    case 'videos':
      return seg.length === 1 || second === 'queue' ? '/m/videos' : null;
    default:
      return null;
  }
}

/** The full-app address for a Lite one, for the "Full app" link. */
export function fullUrlFor(liteUrl: string): string {
  const [pathPart, query = ''] = splitQuery(liteUrl);
  const q = query ? `?${query}` : '';
  const seg = pathPart.split('/').filter(Boolean);
  if (seg[0] !== 'm') return liteUrl;
  const [, first, second] = seg;
  switch (first) {
    case undefined:
    case 'compose':
      return '/home';
    case 'lists':
      return second ? `/lists/${second}` : '/feeds/lists';
    case 'videos':
      return '/videos/queue';
    default:
      return `/${seg.slice(1).join('/')}${q}`;
  }
}

function splitQuery(url: string): [string, string] {
  const hash = url.indexOf('#');
  const clean = hash === -1 ? url : url.slice(0, hash);
  const at = clean.indexOf('?');
  return at === -1 ? [clean, ''] : [clean.slice(0, at), clean.slice(at + 1)];
}

export function isLiteUrl(url: string): boolean {
  return url === '/m' || url.startsWith('/m/') || url.startsWith('/m?');
}

/**
 * Whether the connection has been bad for each of the last
 * {@link LITE_OFFER_MINUTES} complete minutes — long enough that offering a
 * lighter app is help, not noise.
 */
export function sustainedBad(history: ConnectionHistory, now: number): boolean {
  const current = Math.floor(now / HISTORY_BUCKET_MS) * HISTORY_BUCKET_MS;
  for (let i = 1; i <= LITE_OFFER_MINUTES; i++) {
    const t = current - i * HISTORY_BUCKET_MS;
    const bucket = history.buckets.find((b) => b.t === t);
    if (!bucket || !isBad(bucket.worst)) return false;
  }
  return true;
}

@Injectable({ providedIn: 'root' })
export class LiteMode {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly on = signal(read(LITE_KEY, () => localStorage) === 'on');
  readonly offerDismissed = signal(read(LITE_OFFER_DISMISSED_KEY, () => sessionStorage) === '1');
  private started = false;

  /** Watch navigation: entering /m/ turns Lite on; while on, full-app twins open in Lite. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const sub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart && this.on() && !isLiteUrl(event.url)) {
        const lite = liteUrlFor(event.url);
        if (lite) void this.router.navigateByUrl(lite, { replaceUrl: true });
      } else if (event instanceof NavigationEnd && isLiteUrl(event.urlAfterRedirects)) {
        this.setOn(true);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  /** The "Full app" link: turn Lite off and open the matching full-app screen. */
  leave(currentUrl: string): void {
    this.setOn(false);
    void this.router.navigateByUrl(fullUrlFor(currentUrl));
  }

  /** Accept the offer (or Settings' "Use Lite"): open the Lite twin of where we are. */
  enter(currentUrl: string): void {
    this.setOn(true);
    void this.router.navigateByUrl(liteUrlFor(currentUrl) ?? '/m/home');
  }

  dismissOffer(): void {
    this.offerDismissed.set(true);
    write(LITE_OFFER_DISMISSED_KEY, '1', () => sessionStorage);
  }

  private setOn(on: boolean): void {
    if (this.on() === on) return;
    this.on.set(on);
    write(LITE_KEY, on ? 'on' : null, () => localStorage);
  }
}

/** Storage is passed as a getter: on the prerender server the global does not exist. */
function read(key: string, storage: () => Storage): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null, storage: () => Storage): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Storage unavailable: the choice still applies to this page.
  }
}
