import { computed, Injectable, signal } from '@angular/core';
import { HOUSE_ADS, HOUSE_ADS_SHOWN, HouseAd } from './house-ads';

/**
 * Which ads are on, and which ones the user has clicked.
 *
 * Unscoped on purpose: "don't show me that one" and "I already clicked that" are
 * opinions held by the person at the keyboard, not by a Mastodon persona. Making
 * the alt re-dismiss the same ad would be busywork, and the same reasoning that
 * unscoped the Raindrop token applies here — see `ConnectionScope`.
 */
const SETTINGS_KEY = 'mockingbird_house_ads';
const CLICKS_KEY = 'mockingbird_house_ad_clicks';

/** How long a pair of ads stays on screen before the next pair takes over. */
export const HOUSE_AD_ROTATE_MS = 30 * 60 * 1000;

interface StoredSettings {
  /** The master switch. False means no ads at all, whatever the per-ad state. */
  enabled?: boolean;
  /** Ids switched off one at a time. Unknown ids are kept (see load()). */
  disabled?: string[];
}

export interface HouseAdClicks {
  count: number;
  /** ISO timestamp of the most recent click, for "last clicked" on the Ads page. */
  lastClickedAt: string;
}

/** One inventory entry joined to its live state, for the Settings → Ads list. */
export interface HouseAdRow {
  ad: HouseAd;
  /** Off individually. Independent of the master switch, so it survives it. */
  disabled: boolean;
  /** Hidden by the rail's dismiss button, for this page's lifetime only. */
  dismissed: boolean;
  clicks: HouseAdClicks | null;
  /** True when this ad is one of the pair currently on screen. */
  showing: boolean;
}

@Injectable({ providedIn: 'root' })
export class HouseAdStore {
  /** The master switch, off meaning no house ads anywhere. */
  readonly enabled = signal(true);

  /** Ids switched off individually in Settings. */
  private readonly disabled = signal<readonly string[]>([]);

  /**
   * Ids dismissed with the rail's × button.
   *
   * Deliberately in memory and nowhere else: a dismiss is "not right now", and
   * reloading brings the ad back. Nothing about it appears in Settings, because
   * there would be nothing to undo by the time you got there.
   */
  private readonly dismissed = signal<readonly string[]>([]);

  private readonly clicks = signal<Record<string, HouseAdClicks>>({});

  /**
   * Which rotation we are in, as a count of whole {@link HOUSE_AD_ROTATE_MS}
   * periods since the epoch.
   *
   * Read off the wall clock rather than counted up from page load, which buys
   * two things: every tab in the browser is showing the same pair, and a reload
   * does not reshuffle the rail (a reload is not a new rotation, and rerolling
   * on every navigation would make the rail flicker through the inventory).
   */
  private readonly period = signal(currentPeriod());

  /**
   * The ads eligible to appear: on individually, and not dismissed. Excludes
   * nothing for the master switch — {@link visible} handles that, so turning ads
   * back on does not also need to rebuild this.
   */
  private readonly eligible = computed(() =>
    HOUSE_ADS.filter((ad) => !this.disabled().includes(ad.id) && !this.dismissed().includes(ad.id)),
  );

  /**
   * The (at most two) ads to render, rotating every half hour.
   *
   * The window walks forward by whole pages, so with three ads the pairs are
   * (1,2), (3,1), (2,3), … — everything gets a turn rather than one ad living
   * permanently in slot one. Wrapping by modulo also means dismissing an ad
   * refills the slot from the rest of the inventory instead of leaving a hole.
   */
  readonly visible = computed<HouseAd[]>(() => {
    if (!this.enabled()) {
      return [];
    }
    const pool = this.eligible();
    if (pool.length <= HOUSE_ADS_SHOWN) {
      return pool;
    }
    const start = (this.period() * HOUSE_ADS_SHOWN) % pool.length;
    return Array.from({ length: HOUSE_ADS_SHOWN }, (_, i) => pool[(start + i) % pool.length]);
  });

  /** The whole inventory with its state, for Settings → Ads. */
  readonly rows = computed<HouseAdRow[]>(() => {
    const showing = new Set(this.visible().map((ad) => ad.id));
    const clicks = this.clicks();
    return HOUSE_ADS.map((ad) => ({
      ad,
      disabled: this.disabled().includes(ad.id),
      dismissed: this.dismissed().includes(ad.id),
      clicks: clicks[ad.id] ?? null,
      showing: showing.has(ad.id),
    }));
  });

  /** Total clicks across the inventory, for the summary line. */
  readonly totalClicks = computed(() =>
    Object.values(this.clicks()).reduce((sum, entry) => sum + entry.count, 0),
  );

  constructor() {
    this.load();
    // A root service lives as long as the app, so this interval is never
    // orphaned and there is nothing to tear down. It re-reads the clock rather
    // than incrementing, so a laptop that slept through six periods lands on the
    // right one instead of six behind.
    setInterval(() => this.period.set(currentPeriod()), HOUSE_AD_ROTATE_MS);
  }

  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
    this.save();
  }

  setAdEnabled(id: string, adEnabled: boolean): void {
    this.disabled.update((ids) =>
      adEnabled ? ids.filter((existing) => existing !== id) : [...new Set([...ids, id])],
    );
    // Turning an ad back on in Settings should show it again, so a dismiss from
    // earlier in this page's life must not keep suppressing it.
    if (adEnabled) {
      this.dismissed.update((ids) => ids.filter((existing) => existing !== id));
    }
    this.save();
  }

  /** Switch every ad back on, individually and at the master. */
  enableAll(): void {
    this.enabled.set(true);
    this.disabled.set([]);
    this.dismissed.set([]);
    this.save();
  }

  /** Hide one ad for the rest of this page's life. Not persisted. */
  dismiss(id: string): void {
    this.dismissed.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  /**
   * Record that the user clicked an ad.
   *
   * Local, and local only — there is no server here to report to and no request
   * is made. It exists so the Ads page can answer "which of these did I actually
   * find useful?", which is also the honest justification for showing them.
   */
  recordClick(id: string): void {
    this.clicks.update((clicks) => ({
      ...clicks,
      [id]: {
        count: (clicks[id]?.count ?? 0) + 1,
        lastClickedAt: new Date().toISOString(),
      },
    }));
    this.saveClicks();
  }

  clearClicks(): void {
    this.clicks.set({});
    this.saveClicks();
  }

  private load(): void {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as StoredSettings;
      this.enabled.set(stored.enabled !== false);
      // Ids are NOT filtered against the current inventory. An ad temporarily
      // pulled from the array and put back later must come back still off —
      // silently re-enabling something the user switched off would be rude.
      this.disabled.set(Array.isArray(stored.disabled) ? stored.disabled.filter(isId) : []);
    } catch {
      // Corrupt or unavailable storage: ads on, none suppressed.
    }
    try {
      const stored = JSON.parse(localStorage.getItem(CLICKS_KEY) ?? '{}') as Record<
        string,
        Partial<HouseAdClicks>
      >;
      const clicks: Record<string, HouseAdClicks> = {};
      for (const [id, entry] of Object.entries(stored)) {
        if (typeof entry?.count === 'number' && entry.count > 0) {
          clicks[id] = {
            count: entry.count,
            lastClickedAt: typeof entry.lastClickedAt === 'string' ? entry.lastClickedAt : '',
          };
        }
      }
      this.clicks.set(clicks);
    } catch {
      // A lost click tally costs nothing; start over at zero.
    }
  }

  private save(): void {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ enabled: this.enabled(), disabled: this.disabled() }),
      );
    } catch {
      // Storage full or blocked: the choice still applies for this page.
    }
  }

  private saveClicks(): void {
    try {
      localStorage.setItem(CLICKS_KEY, JSON.stringify(this.clicks()));
    } catch {
      // See save().
    }
  }
}

function currentPeriod(): number {
  return Math.floor(Date.now() / HOUSE_AD_ROTATE_MS);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
