import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUSE_AD_ROTATE_MS, HouseAdStore } from './house-ad-store';
import { HOUSE_ADS, HOUSE_ADS_SHOWN } from './house-ads';

function store(): HouseAdStore {
  return TestBed.inject(HouseAdStore);
}

/** Ids of the ads currently on screen. */
function showing(): string[] {
  return store()
    .visible()
    .map((ad) => ad.id);
}

describe('HouseAdStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    // A fixed clock so the rotation window is deterministic. Chosen to sit on a
    // period boundary, which makes "advance by exactly one period" mean it.
    vi.setSystemTime(new Date(2026, 6, 29, 12, 0, 0));
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows only two of the inventory at a time', () => {
    expect(HOUSE_ADS.length).toBeGreaterThan(HOUSE_ADS_SHOWN);
    expect(showing()).toHaveLength(HOUSE_ADS_SHOWN);
  });

  it('gives every ad a unique id and a valid kind', () => {
    // Ids key the click tally and the off switch, so a duplicate would silently
    // merge two ads' state. `kind` is optional and means 'house' when omitted.
    const ids = HOUSE_ADS.map((ad) => ad.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ad of HOUSE_ADS) {
      expect(ad.kind ?? 'house').toMatch(/^(house|endorsement)$/);
      expect(ad.url).toMatch(/^https:\/\//);
    }
  });

  it('carries ads for other people, badged as such', () => {
    // Phanpy, Elk, Mastui and friends are endorsements, not our projects.
    expect(HOUSE_ADS.some((ad) => ad.kind === 'endorsement')).toBe(true);
    expect(HOUSE_ADS.some((ad) => (ad.kind ?? 'house') === 'house')).toBe(true);
  });

  it('rotates to a different pair after half an hour', () => {
    const first = showing();

    vi.advanceTimersByTime(HOUSE_AD_ROTATE_MS);

    const second = showing();
    expect(second).not.toEqual(first);
    expect(second).toHaveLength(HOUSE_ADS_SHOWN);
  });

  it('holds the pair steady until the rotation is actually due', () => {
    const first = showing();
    vi.advanceTimersByTime(HOUSE_AD_ROTATE_MS - 1000);
    expect(showing()).toEqual(first);
  });

  it('gives every ad a turn as the rotation walks the inventory', () => {
    const seen = new Set<string>();
    for (let i = 0; i < HOUSE_ADS.length + 1; i++) {
      for (const id of showing()) {
        seen.add(id);
      }
      vi.advanceTimersByTime(HOUSE_AD_ROTATE_MS);
    }
    expect(seen.size).toBe(HOUSE_ADS.length);
  });

  it('shows the same pair to a tab that reloads inside one rotation', () => {
    const first = showing();
    // Rotation is read off the wall clock, not counted from page load, so a
    // fresh instance mid-period must agree rather than reshuffling the rail.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    vi.advanceTimersByTime(60_000);
    expect(showing()).toEqual(first);
  });

  it('shows nothing at all when the master switch is off', () => {
    store().setEnabled(false);
    expect(store().visible()).toEqual([]);
  });

  it('keeps the per-ad switches through a master off and back on', () => {
    const target = HOUSE_ADS[0].id;
    store().setAdEnabled(target, false);
    store().setEnabled(false);
    store().setEnabled(true);

    expect(
      store()
        .rows()
        .find((row) => row.ad.id === target)!.disabled,
    ).toBe(true);
    expect(showing()).not.toContain(target);
  });

  it('refills the slot from the rest of the inventory when one ad is switched off', () => {
    const dropped = showing()[0];
    store().setAdEnabled(dropped, false);

    const after = showing();
    expect(after).not.toContain(dropped);
    // A hole where the ad used to be would be the easy bug here.
    expect(after).toHaveLength(HOUSE_ADS_SHOWN);
  });

  it('persists the master switch and the per-ad switches', () => {
    const target = HOUSE_ADS[1].id;
    store().setAdEnabled(target, false);
    store().setEnabled(false);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(store().enabled()).toBe(false);
    expect(
      store()
        .rows()
        .find((row) => row.ad.id === target)!.disabled,
    ).toBe(true);
  });

  it('turns everything back on in one go', () => {
    store().setAdEnabled(HOUSE_ADS[0].id, false);
    store().setAdEnabled(HOUSE_ADS[1].id, false);
    store().setEnabled(false);

    store().enableAll();

    expect(store().enabled()).toBe(true);
    expect(
      store()
        .rows()
        .every((row) => !row.disabled),
    ).toBe(true);
  });

  describe('dismiss', () => {
    it('hides the ad now and refills the slot', () => {
      const dismissed = showing()[0];
      store().dismiss(dismissed);

      expect(showing()).not.toContain(dismissed);
      expect(showing()).toHaveLength(HOUSE_ADS_SHOWN);
    });

    it('is forgotten on reload — it means "not right now", not "never"', () => {
      const dismissed = showing()[0];
      store().dismiss(dismissed);
      // Nothing is written at all — a dismiss touches no storage.
      expect(localStorage.getItem('mockingbird_house_ads') ?? '').not.toContain(dismissed);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});

      expect(
        store()
          .rows()
          .every((row) => !row.dismissed),
      ).toBe(true);
    });

    it('is cleared by switching that ad back on in Settings', () => {
      const target = showing()[0];
      store().dismiss(target);
      store().setAdEnabled(target, false);
      store().setAdEnabled(target, true);

      // Otherwise the switch says "on" and the ad stays invisible, which reads
      // as a broken toggle.
      expect(
        store()
          .rows()
          .find((row) => row.ad.id === target)!.dismissed,
      ).toBe(false);
    });
  });

  describe('clicks', () => {
    it('counts clicks per ad and remembers when the last one was', () => {
      const target = HOUSE_ADS[0].id;
      store().recordClick(target);
      store().recordClick(target);

      const row = store()
        .rows()
        .find((r) => r.ad.id === target)!;
      expect(row.clicks?.count).toBe(2);
      expect(row.clicks?.lastClickedAt).toBe(new Date(2026, 6, 29, 12, 0, 0).toISOString());
      expect(store().totalClicks()).toBe(2);
    });

    it('leaves un-clicked ads with no tally rather than a zero', () => {
      store().recordClick(HOUSE_ADS[0].id);
      expect(
        store()
          .rows()
          .find((r) => r.ad.id === HOUSE_ADS[1].id)!.clicks,
      ).toBeNull();
    });

    it('survives a reload', () => {
      store().recordClick(HOUSE_ADS[2].id);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      expect(
        store()
          .rows()
          .find((r) => r.ad.id === HOUSE_ADS[2].id)!.clicks?.count,
      ).toBe(1);
    });

    it('can be forgotten', () => {
      store().recordClick(HOUSE_ADS[0].id);
      store().clearClicks();
      expect(store().totalClicks()).toBe(0);
      expect(localStorage.getItem('mockingbird_house_ad_clicks')).toBe('{}');
    });
  });

  describe('stored state that has gone bad', () => {
    it('falls back to ads-on rather than throwing', () => {
      localStorage.setItem('mockingbird_house_ads', 'not json');
      expect(store().enabled()).toBe(true);
      expect(showing()).toHaveLength(HOUSE_ADS_SHOWN);
    });

    it('ignores click entries that are not counts', () => {
      localStorage.setItem(
        'mockingbird_house_ad_clicks',
        JSON.stringify({ 'mastodon-mock': { count: 'lots' }, 'mimb-lite': { count: 2 } }),
      );
      expect(store().totalClicks()).toBe(2);
    });

    it('keeps an off switch for an ad that is not in the inventory right now', () => {
      // An ad pulled from the array and restored later must come back still off.
      localStorage.setItem(
        'mockingbird_house_ads',
        JSON.stringify({ enabled: true, disabled: ['retired-ad'] }),
      );
      store().setAdEnabled(HOUSE_ADS[0].id, false);

      expect(localStorage.getItem('mockingbird_house_ads')).toContain('retired-ad');
    });
  });
});
