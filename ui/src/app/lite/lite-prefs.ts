import { Injectable, computed, signal } from '@angular/core';
import { MediaOverride, PicturePolicy } from '../platform/network/media-policy';

/**
 * Lite's load-control bar and reader controls, remembered on this device
 * (spec/lite-next-hour.md, Sprint A). Lite only: the full app keeps
 * Settings → data saver.
 *
 * Defaults: entering Lite is itself the signal to save bytes, so pictures wait
 * for a tap from the first screen (no waiting for the connection meter to
 * notice), avatars stay (small, and how people recognise each other) and
 * video/audio players wait for Play.
 */
export const LITE_PREFS_KEY = 'mockingbird_lite_prefs';

export type LiteRefresh = 'manual' | 'stale';
export type LiteTextSize = 's' | 'm' | 'l' | 'xl';
export type LiteWidth = 'narrow' | 'normal' | 'wide';

export interface LitePrefsValue {
  pictures: PicturePolicy;
  avatars: boolean;
  previews: boolean;
  refresh: LiteRefresh;
  textSize: LiteTextSize;
  width: LiteWidth;
  highContrast: boolean;
}

export const LITE_PREFS_DEFAULTS: LitePrefsValue = {
  pictures: 'tap',
  avatars: true,
  previews: false,
  refresh: 'stale',
  textSize: 'm',
  width: 'normal',
  highContrast: false,
};

/** Accept only known values; anything else falls back to the default for that field. */
export function parseLitePrefs(raw: string | null): LitePrefsValue {
  let stored: Partial<Record<keyof LitePrefsValue, unknown>> = {};
  try {
    stored = raw ? (JSON.parse(raw) as typeof stored) : {};
  } catch {
    stored = {};
  }
  const pick = <K extends keyof LitePrefsValue>(key: K, allowed: readonly LitePrefsValue[K][]) =>
    allowed.includes(stored[key] as LitePrefsValue[K])
      ? (stored[key] as LitePrefsValue[K])
      : LITE_PREFS_DEFAULTS[key];
  return {
    pictures: pick('pictures', ['off', 'tap', 'on']),
    avatars: pick('avatars', [true, false]),
    previews: pick('previews', [true, false]),
    refresh: pick('refresh', ['manual', 'stale']),
    textSize: pick('textSize', ['s', 'm', 'l', 'xl']),
    width: pick('width', ['narrow', 'normal', 'wide']),
    highContrast: pick('highContrast', [true, false]),
  };
}

@Injectable({ providedIn: 'root' })
export class LitePrefs {
  readonly value = signal<LitePrefsValue>(parseLitePrefs(read()));

  /** The part of the preferences the shared status card follows. */
  readonly media = computed<MediaOverride>(() => {
    const v = this.value();
    return { pictures: v.pictures, avatars: v.avatars, previews: v.previews };
  });

  set<K extends keyof LitePrefsValue>(key: K, value: LitePrefsValue[K]): void {
    this.value.update((current) => ({ ...current, [key]: value }));
    try {
      localStorage.setItem(LITE_PREFS_KEY, JSON.stringify(this.value()));
    } catch {
      // The choice still applies to this visit.
    }
  }
}

function read(): string | null {
  try {
    return localStorage.getItem(LITE_PREFS_KEY);
  } catch {
    return null;
  }
}
