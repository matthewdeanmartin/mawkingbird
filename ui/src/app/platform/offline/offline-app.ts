import { Injectable, inject, isDevMode, signal } from '@angular/core';
import { RUNTIME_POLICY } from '../build/runtime-policy';

/** Present (value "off") when the reader removed the offline copy; absent otherwise. */
export const OFFLINE_APP_KEY = 'mockingbird_offline_app';

/** How long after start-up to register, so the worker never competes with first paint. */
const REGISTER_DELAY_MS = 5_000;

export interface OfflineAppStats {
  /** Saved build files (JavaScript, styles, fonts). */
  files: number;
  /** Whether the app shell itself is saved, i.e. the app can start offline. */
  shell: boolean;
}

/**
 * Registers `public/sw.js`, the offline app shell (spec/low-bandwidth-offline.md,
 * Sprint 4), and lets the Connection page show and remove what it saved.
 *
 * Off in development (`ng serve` rebuilds files under the same names, which a
 * cache-first worker would serve stale) and on Native (its bundle is local).
 * The worker's scope is the base href, so /canary/ and /test/ each get their
 * own worker and their own caches.
 */
@Injectable({ providedIn: 'root' })
export class OfflineApp {
  private readonly policy = inject(RUNTIME_POLICY);

  /** Whether this build and browser can have an offline copy at all. */
  readonly supported =
    this.policy.serviceWorker &&
    !isDevMode() &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator;
  readonly enabled = signal(readEnabled());
  readonly stats = signal<OfflineAppStats | null>(null);

  private started = false;

  /** Called once at start-up; registers after a delay, or cleans up when removed. */
  start(): void {
    if (!this.supported || this.started) return;
    this.started = true;
    if (!this.enabled()) {
      void this.unregister();
      return;
    }
    setTimeout(() => void this.register(), REGISTER_DELAY_MS);
  }

  async refreshStats(): Promise<void> {
    if (!this.supported) return;
    const worker = await this.controllerOrActive();
    if (!worker) {
      this.stats.set(null);
      return;
    }
    const stats = await new Promise<OfflineAppStats | null>((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 3_000);
      channel.port1.onmessage = (event: MessageEvent<OfflineAppStats>) => {
        clearTimeout(timer);
        resolve(event.data);
      };
      worker.postMessage({ type: 'stats' }, [channel.port2]);
    });
    this.stats.set(stats);
  }

  /** Delete the saved copy and stop saving one, until {@link allow} is called. */
  async remove(): Promise<void> {
    writeEnabled(false);
    this.enabled.set(false);
    await this.unregister();
    this.stats.set(null);
  }

  async allow(): Promise<void> {
    writeEnabled(true);
    this.enabled.set(true);
    if (this.supported) await this.register();
  }

  private async register(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker.register(
        new URL('sw.js', document.baseURI).href,
        { scope: new URL('./', document.baseURI).pathname, updateViaCache: 'none' },
      );
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      if (!worker) return;
      const send = (target: ServiceWorker) =>
        target.postMessage({ type: 'save-loaded', urls: loadedSameOriginFiles() });
      if (worker.state === 'activated') {
        send(worker);
      } else {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') send(worker);
        });
      }
    } catch {
      // Private windows and some embedded browsers refuse; the app works without it.
    }
  }

  private async unregister(): Promise<void> {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const scope = new URL('./', document.baseURI).href;
      for (const registration of registrations) {
        if (registration.scope !== scope) continue;
        registration.active?.postMessage({ type: 'remove' });
        await registration.unregister();
      }
      if (typeof caches !== 'undefined') {
        const tag = cacheTag(new URL('./', document.baseURI).pathname);
        for (const key of await caches.keys()) {
          if (key.startsWith(`mawkingbird-${tag}-`)) await caches.delete(key);
        }
      }
    } catch {
      // Nothing registered, or storage unavailable: nothing to remove.
    }
  }

  private async controllerOrActive(): Promise<ServiceWorker | null> {
    if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
    const registration = await navigator.serviceWorker.getRegistration(
      new URL('./', document.baseURI).href,
    );
    return registration?.active ?? null;
  }
}

/** Mirrors `cacheNames` in public/sw.js. */
export function cacheTag(scopePath: string): string {
  return scopePath.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
}

function loadedSameOriginFiles(): string[] {
  try {
    return performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.startsWith(location.origin));
  } catch {
    return [];
  }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(OFFLINE_APP_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(OFFLINE_APP_KEY);
    else localStorage.setItem(OFFLINE_APP_KEY, 'off');
  } catch {
    // The choice still applies to this page.
  }
}
