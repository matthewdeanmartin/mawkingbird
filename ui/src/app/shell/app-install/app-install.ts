import { Injectable, signal } from '@angular/core';

/** Chrome/Edge's install event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** How this browser installs web apps, which decides what the install UI says. */
export type InstallRoute =
  /** Chrome/Edge handed us a prompt: a real Install button works. */
  | 'prompt'
  /** iPhone/iPad Safari: Share → Add to Home Screen. */
  | 'ios'
  /** Safari on a Mac: File → Add to Dock. */
  | 'mac-safari'
  /** Firefox and others: the browser's own menu, if it can at all. */
  | 'manual';

export function installRouteFor(userAgent: string, hasPrompt: boolean): InstallRoute {
  if (hasPrompt) return 'prompt';
  const ios =
    /iPad|iPhone|iPod/u.test(userAgent) ||
    // iPadOS reports itself as a Mac; touch support gives it away.
    (/Macintosh/u.test(userAgent) &&
      typeof navigator !== 'undefined' &&
      (navigator.maxTouchPoints ?? 0) > 1);
  if (ios) return 'ios';
  if (
    /Macintosh/u.test(userAgent) &&
    /Safari/u.test(userAgent) &&
    !/Chrome|Chromium|Edg|Firefox/u.test(userAgent)
  ) {
    return 'mac-safari';
  }
  return 'manual';
}

/**
 * Installing Mawkingbird as an app (a PWA): opens in its own window and, on
 * Android and desktop Chrome/Edge, appears in the system Share menu.
 *
 * Chrome fires `beforeinstallprompt` once, early in the page's life, so this
 * service is created at startup to catch it; the Settings row and the footer
 * read its state later.
 */
@Injectable({ providedIn: 'root' })
export class AppInstall {
  private deferred: BeforeInstallPromptEvent | null = null;

  /** Running as an installed app right now. */
  readonly installed = signal(false);
  /** Chrome/Edge offered an install prompt we can trigger from a button. */
  readonly canPrompt = signal(false);

  constructor() {
    if (typeof window === 'undefined') return;
    this.installed.set(
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    window.addEventListener('beforeinstallprompt', (event) => {
      // Keep the browser's mini-infobar from appearing on its own; installing
      // is offered only where the reader looks for it (Settings, the footer).
      event.preventDefault();
      this.deferred = event as BeforeInstallPromptEvent;
      this.canPrompt.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canPrompt.set(false);
      this.installed.set(true);
    });
  }

  route(): InstallRoute {
    return installRouteFor(
      typeof navigator === 'undefined' ? '' : navigator.userAgent,
      this.canPrompt(),
    );
  }

  /** Show the browser's install dialog. Resolves true when the reader accepted. */
  async prompt(): Promise<boolean> {
    const event = this.deferred;
    if (!event) return false;
    this.deferred = null;
    this.canPrompt.set(false);
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === 'accepted';
  }
}
