import { Injectable, computed, inject, signal } from '@angular/core';
import { summarize } from './connection-history';
import { ConnectionMeter } from './connection-meter';
import { isBad } from './connection-quality';

export type DataSaverMode = 'auto' | 'always' | 'never';

export const DATA_SAVER_KEY = 'mockingbird_data_saver';
/**
 * In automatic mode, saving starts as soon as the connection turns bad and
 * stops only once it has been fine for this long, so a connection that comes
 * and goes does not make pictures blink in and out of new posts.
 */
export const DATA_SAVER_HOLD_MS = 3 * 60_000;

function storedMode(): DataSaverMode {
  try {
    const value = localStorage.getItem(DATA_SAVER_KEY);
    return value === 'always' || value === 'never' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Whether the full app should spend fewer bytes right now (Sprint 3 of
 * spec/low-bandwidth-offline.md): pictures in newly shown posts wait for a tap,
 * and background polling slows down.
 *
 * Deliberately a hint that components read when they *start*, not a switch
 * that rewrites what is on screen: a post whose pictures already loaded keeps
 * them when the connection gets worse.
 */
@Injectable({ providedIn: 'root' })
export class DataSaver {
  private readonly meter = inject(ConnectionMeter);
  readonly mode = signal<DataSaverMode>(storedMode());

  /** The connection is bad now, or was within {@link DATA_SAVER_HOLD_MS}. */
  private readonly recentlyBad = computed(() => {
    if (this.meter.bad()) return true;
    const now = Date.now();
    return isBad(summarize(this.meter.historySnapshot(), now - DATA_SAVER_HOLD_MS, now).worst);
  });

  readonly active = computed(() => {
    switch (this.mode()) {
      case 'always':
        return true;
      case 'never':
        return false;
      default:
        return this.recentlyBad() || this.meter.hints().saveData === true;
    }
  });

  private readonly ticks = new Map<string, number>();

  setMode(mode: DataSaverMode): void {
    this.mode.set(mode);
    try {
      if (mode === 'auto') localStorage.removeItem(DATA_SAVER_KEY);
      else localStorage.setItem(DATA_SAVER_KEY, mode);
    } catch {
      // The choice still applies to this page.
    }
  }

  /**
   * Whether a background poll named `key` should run on this tick. Offline:
   * never, it would only fail. Saving data: every other tick. Otherwise always.
   */
  allowBackground(key: string): boolean {
    if (this.meter.verdict() === 'offline') return false;
    if (!this.active()) return true;
    const n = (this.ticks.get(key) ?? 0) + 1;
    this.ticks.set(key, n);
    return n % 2 === 0;
  }
}
