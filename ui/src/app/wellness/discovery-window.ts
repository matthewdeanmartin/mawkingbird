import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Wellness } from './wellness';
import { normalizeUntil, WindowLength, windowEnd } from './discovery-window-model';

/**
 * Per device, not synced: a window is a moment ("I'm browsing now"), not a
 * setting. Syncing it would open discovery on the phone in your pocket.
 */
export const DISCOVERY_WINDOW_KEY = 'mockingbird_discovery_window';

/** How often the open/closed state is re-read, so a window can close on its own. */
const TICK_MS = 15_000;

/**
 * Whether discovery is open right now, and the one-tap way to open it.
 *
 * Open means either Wellness doesn't use windows, or a window is running.
 * Closing never interrupts: guards check on navigation only, so a window that
 * ends while you are reading leaves the page alone (see DiscoveryBanner).
 */
@Injectable({ providedIn: 'root' })
export class DiscoveryWindow {
  private wellness = inject(Wellness);
  private readonly until = signal(this.read());
  private readonly now = signal(Date.now());

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
    const storage = (event: StorageEvent): void => {
      if (event.key === DISCOVERY_WINDOW_KEY) this.until.set(this.read());
    };
    window.addEventListener('storage', storage);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      window.removeEventListener('storage', storage);
    });
  }

  /** The clock this service ticks, for countdowns. */
  readonly clock = this.now.asReadonly();
  /** Windows are in use (the Wellness switch). */
  readonly enforced = computed(() => this.wellness.flags().discoveryWindows);
  /** A window is running. */
  readonly running = computed(() => this.until() > this.now());
  /** Discovery may be entered. */
  readonly open = computed(() => !this.enforced() || this.running());
  /** When the running window ends, or null. */
  readonly endsAt = computed(() => (this.running() ? this.until() : null));

  /** One tap: open a window of this length, starting now. */
  openFor(length: WindowLength): void {
    const now = Date.now();
    this.now.set(now);
    this.write(windowEnd(length, now));
  }

  /** End the window early. */
  close(): void {
    this.now.set(Date.now());
    this.write(0);
  }

  /** Read the clock now: guards call this so a just-expired window is seen as closed. */
  isOpenNow(): boolean {
    this.now.set(Date.now());
    return this.open();
  }

  private write(until: number): void {
    this.until.set(until);
    try {
      localStorage.setItem(DISCOVERY_WINDOW_KEY, JSON.stringify(until));
    } catch {
      // Blocked storage: the window still runs in this tab.
    }
  }

  private read(): number {
    try {
      return normalizeUntil(JSON.parse(localStorage.getItem(DISCOVERY_WINDOW_KEY) ?? '0'));
    } catch {
      return 0;
    }
  }
}
