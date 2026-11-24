import { Injectable, computed, inject, signal } from '@angular/core';
import { ConnectionMeter } from './connection-meter';

export type DataSaverMode = 'auto' | 'always' | 'never';

export const DATA_SAVER_KEY = 'mockingbird_data_saver';

function storedMode(): DataSaverMode {
  try {
    const value = localStorage.getItem(DATA_SAVER_KEY);
    return value === 'always' || value === 'never' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Whether the full app should spend fewer bytes: pictures in newly shown posts
 * wait for a tap, and background polling slows down.
 *
 * Only ever because the reader asked, here or with their device's own data
 * saver. Measuring a slow minute is not asking (owner decision, 2026-11-23): a
 * bad connection may offer Lite, but never changes the app by itself.
 */
@Injectable({ providedIn: 'root' })
export class DataSaver {
  private readonly meter = inject(ConnectionMeter);
  readonly mode = signal<DataSaverMode>(storedMode());

  readonly active = computed(() => {
    const mode = this.mode();
    return mode === 'auto' ? this.meter.hints().saveData === true : mode === 'always';
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
